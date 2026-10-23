/* Gol de Placa: menus e fluxo das partidas.
 * Em cada partida a criança é só batedor OU só goleiro: um duelo de 5 cobranças contra a máquina.
 */
import './style.css';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { NARR, NARR_ORDER, isNarrLang, type NarrLang } from './game/narration';
import { LANGS, detectLang, fmt, uiText, type CallKey, type Lang, type UiKey } from './game/i18n';
import { allTeams, findTeam, teamName, type Team } from './game/teams';
import {
  GOAL_H, GROUND_SHOT, HALF, PENALTY_Z, aimResult, cpuKeeperTarget, cpuSaves, cpuShot, flightTime, freeKickSpot, isTopCorner, placeWall,
  playerSaves, shootoutWinner, shotFromSwipe, wallHit,
  type Difficulty, type Kind, type Outcome, type Shootout, type Wall,
} from './game/physics';
import { BOOT_COLORS, BUILDS, type Build, CELEBRATIONS, HAIR_COLORS, HAIR_STYLES, Pitch, SKIN_COLORS, type Celebration, type Crowd, type Look, type Weather } from './game/scene';
import { STICKERS, apply as applyProgress, emptyState, ensureDay, findSticker, needOf, type Ev, type State as ProgressState, type Sticker } from './game/progress';
import { FREE_TEAM, store as shop } from './game/store';
import * as audio from './game/audio';
import { onMatchFinished } from './game/rating';
import * as gc from './game/gamecenter';
import { MUSIC_STYLES, music, type MusicStyle } from './game/music';
import {
  KITS, ROUND, STADIUMS, addMatch, roundUnlocked, bracket, emptyScore, eventFor, findStadium, kitUnlocked, nextReward, specialKit, stadiumUnlocked,
  type CupEvent, type EventScore,
} from './game/rewards';
import { NATIONS } from './game/teams';

// ---------- preferências ----------
const store = {
  get(k: string, d: string) { try { return localStorage.getItem('gol.' + k) ?? d; } catch { return d; } },
  set(k: string, v: string) { try { localStorage.setItem('gol.' + k, v); } catch { /* sem armazenamento */ } },
};
let lang = store.get('lang', detectLang()) as Lang;
if (!(lang in LANGS)) lang = 'pt';
let sound = store.get('sound', '1') === '1';
/** Idioma do narrador: 'auto' = o mesmo do jogo. */
let narrPick = store.get('narrLang', 'auto');
if (narrPick !== 'auto' && !isNarrLang(narrPick)) narrPick = 'auto';
const nl = (): NarrLang => (narrPick === 'auto' ? lang : narrPick as NarrLang);
let voice = store.get('voice', store.get('narration', '1') === '0' ? 'off' : 'male') as audio.Voice;
let diff = store.get('diff', 'easy') as Difficulty;
let weatherPick = store.get('weather', 'random') as Weather | 'random';
let weather: Weather = weatherPick === 'random' ? 'day' : weatherPick;
const WEATHERS: Weather[] = ['day', 'night', 'rain', 'snow'];
/** No clima aleatório, cada partida sorteia o seu. */
function rollWeather() { rollBuild(); rollStyle(); rollWeather0(); }
/** Estilo "bolinha": depois de liberado no álbum, 1 de cada 4 partidas é com todo mundo redondo. */
function rollStyle() { pitch.round = roundUnlocked(progress.stickers.length) && Math.random() < ROUND.chance; }
function rollWeather0() { weather = seasonWeather ?? (weatherPick === 'random' ? WEATHERS[Math.floor(Math.random() * WEATHERS.length)] : weatherPick); }
/** No evento de Halloween é sempre noite; no de Natal, sempre neve. */
let seasonWeather: Weather | null = null;
let crowd = store.get('crowd', 'full') as Crowd;
let keeperCam = store.get('keeperCam', 'goal') as 'goal' | 'kicker';
/** Ritmo escolhido; 'misto' sorteia um ritmo diferente a cada chute. */
type MusicPick = MusicStyle | 'misto';
const MUSIC_PICKS: MusicPick[] = [...MUSIC_STYLES.filter((m) => m !== 'off'), 'misto', 'off'];
let musicStyle = store.get('music', 'estadio') as MusicPick;
const playableStyles = MUSIC_STYLES.filter((m) => m !== 'off');
const randomStyle = (): MusicStyle => {
  const opts = playableStyles.filter((m) => m !== music.style());
  return opts[Math.floor(Math.random() * opts.length)];
};
/** No som misto, cada cobrança toca um ritmo sorteado. */
function mixMusic() { if (musicStyle === 'misto') music.setStyle(randomStyle()); }
/** Cores do time do coração (só cores, sem nome de clube), ou null. */
const HEART_COLORS = ['#111111', '#ffffff', '#d50000', '#0d47a1', '#1b8a3a', '#ffd400', '#7b1f2e', '#ff6d00', '#6a1b9a', '#64b5f6'];
let heart: [string, string] | null = (() => { try { const h = JSON.parse(store.get('heart', 'null')); return Array.isArray(h) ? h as [string, string] : null; } catch { return null; } })();
music.setStyle(musicStyle === 'misto' ? randomStyle() : musicStyle);
// narração gravada: carrega as falas do idioma/voz e abaixa a música quando o narrador fala
audio.whenAudioReady(() => audio.preloadVoice(nl()));
audio.onSpeak((secs) => music.duck(secs));
let teamKind = store.get('teamKind', 'club') as 'nation' | 'club';
let myTeam: Team = findTeam(store.get('team', FREE_TEAM));
/** Comemoração escolhida no Meu craque: uma fixa ou 'random' (uma diferente a cada gol). */
type CelChoice = Celebration | 'random';
/** Corpo escolhido: um fixo ou 'random' (um diferente a cada partida). */
type BuildChoice = Build | 'random';
type MyLook = Omit<Look, 'build'> & { cel: CelChoice; build?: BuildChoice };
const DEFAULT_LOOK: MyLook = { skin: 1, hair: 0, style: 'short', boots: 2, number: 10, name: '', cel: 'random', build: 'normal' };
let look: MyLook = (() => { try { return { ...DEFAULT_LOOK, ...JSON.parse(store.get('look', '{}')) }; } catch { return DEFAULT_LOOK; } })();
audio.setSound(sound);
audio.setNarration(voice);

const t = (k: UiKey, vars?: Record<string, string | number>) => fmt(uiText(lang, k), vars);
const $ = (id: string) => document.getElementById(id)!;
const ui = $('ui');
const hud = $('hud');
const hint = $('hint');
const callEl = $('call');
const touch = $('touch');
const trail = $('trail') as HTMLCanvasElement;
const pitch = new Pitch($('pitch') as HTMLCanvasElement);
pitch.keeperCam = keeperCam;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const native = Capacitor.isNativePlatform();
const rng = Math.random;
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- figurinhas e desafios do dia ----------
const today = () => new Date().toLocaleDateString('en-CA');
let progress: ProgressState = (() => { try { return { ...emptyState(), ...JSON.parse(store.get('progress', '{}')) }; } catch { return emptyState(); } })();
function freshProgress() { progress = ensureDay(progress, today(), unlocked()); }

// ---------- prêmios das figurinhas: uniformes e estádios ----------
let kitPick = store.get('kit', '');
let stadiumPick = store.get('stadium', 'classic');
/** Seleção do evento "Pênaltis da Copa" (só durante a partida do evento). */
let eventTeam: Team | null = null;
const me = () => eventTeam ?? myTeam;
/** Uniforme de quem joga: o da seleção no evento; senão o especial escolhido ou o do time. */
const myKit = () => (eventTeam ? eventTeam.kit : specialKit(kitPick, progress.stickers.length) ?? myTeam.kit);
function applyStadium() {
  const s = findStadium(stadiumUnlocked(stadiumPick, progress.stickers.length) ? stadiumPick : 'classic');
  pitch.setStadium(s);
}
/** Registra um acontecimento: guarda, mostra figurinhas novas e desafios completados. */
/** Nome da figurinha no idioma: as 18 primeiras têm nome próprio; as metas e os times usam modelos. */
function stickerName(st: Sticker): string {
  if (st.base) return t(('st_' + st.id) as UiKey);
  if (st.team) return t('sk_team', { team: teamName(findTeam(st.team), lang) });
  const single = st.n === 1 && (st.k === 'wins' || st.k === 'keeperWins');
  return t((single ? `sk_${st.k}_1` : `sk_${st.k}`) as UiKey, { n: st.n ?? 0 });
}
function track(ev: Ev) {
  freshProgress();
  const r = applyProgress(progress, ev);
  progress = r.s;
  store.set('progress', JSON.stringify(progress));
  for (const id of r.done) toast('📅', t('dailyDone'), t(('ch_' + id) as UiKey, { n: needOf(id) }));
  if (r.stickers.length && progress.stickers.length >= ROUND.need && progress.stickers.length - r.stickers.length < ROUND.need)
    toast(ROUND.e, t('roundUnlocked'), t('roundInfo'));
  for (const id of r.stickers) { const st = findSticker(id); if (st) toast(st.e, t('newSticker'), stickerName(st)); }
  // só as 18 primeiras são conquistas no Game Center
  gc.report(r.stickers.filter((id) => findSticker(id)?.base), ev.t === 'goal' ? progress.goals : undefined);
}
let toastY = 0;
function toast(icon: string, title: string, text: string) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.style.setProperty('--d', `${toastY * 0.6}s`);
  toastY++;
  d.innerHTML = `<span class="ti">${icon}</span><span><b>${esc(title)}</b>${esc(text)}</span>`;
  document.body.appendChild(d);
  setTimeout(() => audio.chime(), toastY * 600 - 600);
  setTimeout(() => { d.remove(); toastY = Math.max(0, toastY - 1); }, 3600 + toastY * 600);
}

/** Clima, torcida e as cores das arquibancadas (time do coração, se escolhido). */
function atmo(opp?: Team) {
  audio.setCrowdSize(crowd);
  audio.setRain(weather === 'rain');
  const teams = [myKit().shirt, opp?.kit.shirt ?? '#ffffff'];
  // na época especial a torcida se veste no clima: laranja, roxo e preto; ou vermelho, verde e dourado
  const fest = pitch.season === 'halloween' ? ['#ff7a00', '#7b1fa2', '#111111'] : pitch.season === 'natal' ? ['#d50000', '#1b8a3a', '#ffd400', '#ffffff'] : [];
  return {
    weather, crowd,
    colors: [...(heart ? [...heart, ...heart, ...heart, ...teams] : teams), ...fest, ...fest],
    flag: heart ?? [myKit().shirt, myKit().shorts] as [string, string],
  };
}

/** Sem a versão completa, só o time do download e o boneco padrão. */
const unlocked = () => shop.isUnlocked();
/** No corpo aleatório, cada partida sorteia um tipo (fica o mesmo a partida inteira). */
let matchBuild: Build = BUILDS[Math.floor(Math.random() * BUILDS.length)];
const rollBuild = () => { matchBuild = BUILDS[Math.floor(Math.random() * BUILDS.length)]; };
const resolveLook = (l: MyLook): Look => ({ ...l, build: l.build === 'random' ? matchBuild : l.build });
const myLook = () => (unlocked() ? resolveLook(look) : undefined);
let lastCel: Celebration | null = null;
/** Comemoração do próximo gol: a escolhida ou, no aleatório, uma diferente da última. */
function celFor(c: CelChoice): Celebration {
  if (c !== 'random') return c;
  const pool = CELEBRATIONS.filter((x) => x !== lastCel);
  lastCel = pool[Math.floor(rng() * pool.length)];
  return lastCel;
}
/** Futebol masculino ou feminino: vale para todos em campo, em todas as modalidades. */
function womensSeg() {
  return `<div class="seg"><button data-womens="0" class="${look.female ? '' : 'on'}">${t('mens')}</button><button data-womens="1" class="${look.female ? 'on' : ''}">${t('womens')}</button></div>`;
}
function onWomens(again: () => void) {
  on('[data-womens]', (el) => {
    const w = el.dataset.womens === '1';
    if (w === !!look.female) return;
    // penteado combinando com a escolha (dá para trocar depois no Meu craque)
    if (w && (look.style === 'short' || look.style === 'mohawk' || look.style === 'bald')) look.style = 'ponytail';
    if (!w && (look.style === 'ponytail' || look.style === 'buns')) look.style = 'short';
    look = { ...look, female: w };
    store.set('look', JSON.stringify(look));
    pitch.womens = w;
    again();
  });
}
pitch.womens = !!look.female;
function enforceFree() {
  if (!unlocked()) { myTeam = findTeam(FREE_TEAM); teamKind = 'club'; }
}

document.documentElement.lang = LANGS[lang].voice;
enforceFree();
// a tela de abertura sorteia o clima a cada vez que o jogo abre (as partidas seguem a escolha do Clima)
weather = WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
pitch.setAtmosphere(atmo());
applyStadium();
pitch.setup({ sx: 0, sz: PENALTY_Z, view: 'kick', kickerKit: myKit(), keeperKit: findTeam('lions').kit, wall: null, seed: 1, look: myLook() });

// Cada partida tem um número; ao sair para o menu, as esperas antigas são abandonadas.
let run = 0;
class Quit extends Error {}
const guard = (id: number) => { if (id !== run) throw new Quit(); };
const quiet = (p: Promise<unknown>) => p.catch((e) => { if (!(e instanceof Quit)) throw e; });

// ---------- vibração: um padrão para cada lance (dá para desligar na tela inicial) ----------
let vibe = store.get('vibe', '1') === '1';
const HS = { L: ImpactStyle.Light, M: ImpactStyle.Medium, H: ImpactStyle.Heavy };
type Buzz = 'kick' | 'goal' | 'save' | 'post' | 'miss' | 'wall' | 'conceded' | 'dive' | 'win' | 'tap';
/** [força, em quantos ms] — o gol "treme" junto com a torcida; a trave dá um tranco e um tremidinho. */
const BUZZ: Record<Buzz, [keyof typeof HS, number][]> = {
  kick: [['M', 0]],
  goal: [['H', 0], ['H', 110], ['M', 240], ['L', 380], ['M', 560], ['L', 700], ['H', 900], ['L', 1060], ['M', 1240], ['L', 1420], ['L', 1600]],
  save: [['H', 0], ['M', 110], ['L', 240], ['M', 420], ['L', 560]],
  post: [['H', 0], ['L', 70], ['L', 140], ['L', 210], ['L', 280]],
  miss: [['L', 0], ['L', 160]],
  wall: [['M', 0], ['L', 90]],
  conceded: [['M', 0], ['L', 200]],
  dive: [['M', 0]],
  win: [['H', 0], ['M', 150], ['H', 300], ['M', 450], ['H', 650], ['L', 850], ['H', 1100]],
  tap: [['L', 0]],
};
function buzz(kind: Buzz) {
  if (!native || !vibe) return;
  for (const [st, at] of BUZZ[kind]) setTimeout(() => void Haptics.impact({ style: HS[st] }).catch(() => {}), at);
}
const kickFx = () => { audio.kick(); buzz('kick'); };

function show(html: string, full = true) {
  ui.innerHTML = `<div class="screen${full ? ' full' : ''}">${html}</div>`;
  ui.classList.remove('hidden');
}
const hideUi = () => { ui.innerHTML = ''; };
const on = (sel: string, fn: (el: HTMLElement) => void) =>
  ui.querySelectorAll<HTMLElement>(sel).forEach((el) => el.addEventListener('click', () => { audio.initAudio(); fn(el); }));
const lock = (locked: boolean) => (locked ? ' <span class="lock">🔒</span>' : '');

// ---------- telas ----------

function dailyCard(): string {
  freshProgress();
  const rows = progress.daily.map((d) => {
    const need = needOf(d.id);
    const ok = d.n >= need;
    return `<li class="${ok ? 'ok' : ''}"><span>${ok ? '✅' : '⬜'}</span><span>${t(('ch_' + d.id) as UiKey, { n: need })}</span><b>${Math.min(d.n, need)}/${need}</b></li>`;
  }).join('');
  return `<div class="card daily"><b>${t('daily')}</b><ul>${rows}</ul></div>`;
}

function album() {
  show(`
    <h2>${t('album')}</h2>
    <p class="sub">${t('albumCount', { n: progress.stickers.length, t: STICKERS.length })}</p>
    <div class="album">${STICKERS.map((st) => {
      const has = progress.stickers.includes(st.id);
      return `<div class="sticker${has ? ' has' : ''}"><span class="se">${has ? st.e : '❔'}</span><span class="sn">${stickerName(st)}</span></div>`;
    }).join('')}</div>
    ${rewardsCard()}
    ${gc.available ? '<button class="btn alt" data-go="gc">🏆 Game Center</button>' : ''}
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  on('[data-go=gc]', () => void gc.open());
  on('[data-kit]', (el) => {
    const id = el.dataset.kit!;
    if (id && !kitUnlocked(id, progress.stickers.length)) return;
    kitPick = id; store.set('kit', kitPick); album();
  });
  on('[data-stadium]', (el) => {
    const id = el.dataset.stadium!;
    if (!stadiumUnlocked(id, progress.stickers.length)) return;
    stadiumPick = id; store.set('stadium', stadiumPick); applyStadium(); album();
  });
  on('[data-go=back]', home);
}

/** Uniformes e estádios que as figurinhas liberam. */
function rewardsCard(): string {
  const n = progress.stickers.length;
  const nx = nextReward(n);
  const kitBtn = (id: string, e: string, need: number, shirt: string, shorts: string) => {
    const open = need <= n;
    return `<button class="reward${kitPick === id ? ' on' : ''}${open ? '' : ' locked'}" data-kit="${id}">
      <span class="kit" style="background:${shirt};box-shadow:inset 0 -4px 0 ${shorts}"></span>
      <span class="n">${e} ${t(('kit_' + (id || 'team')) as UiKey)}</span>${open ? '' : `<span class="need">🔒 ${need}</span>`}</button>`;
  };
  return `<div class="card rewards">
    <b>${t('rewardsTitle')}</b>
    ${nx ? `<p class="sub">${t('nextReward', { n: nx.left, e: nx.e })}</p>` : ''}
    <b>${t('kits')}</b>
    <div class="rewardgrid">${kitBtn('', '🛡️', 0, myTeam.kit.shirt, myTeam.kit.shorts)}${KITS.map((k) => kitBtn(k.id, k.e, k.need, k.kit.shirt, k.kit.shorts)).join('')}</div>
    <div class="round-row${roundUnlocked(n) ? '' : ' locked'}"><span class="round-kit"></span><span><b>${ROUND.e} ${t('roundStyle')}</b><small>${roundUnlocked(n) ? t('roundInfo') : `🔒 ${t('roundNeed', { n: ROUND.need })}`}</small></span></div>
    <b>${t('stadiums')}</b>
    <div class="rewardgrid">${STADIUMS.map((s) => {
      const open = s.need <= n;
      return `<button class="reward${stadiumPick === s.id ? ' on' : ''}${open ? '' : ' locked'}" data-stadium="${s.id}">
        <span class="kit" style="background:linear-gradient(${s.seatA} 50%, ${s.seatB} 50%);box-shadow:inset 0 -4px 0 ${s.ground}"></span>
        <span class="n">${s.e} ${t(('sd_' + s.id) as UiKey)}</span>${open ? '' : `<span class="need">🔒 ${s.need}</span>`}</button>`;
    }).join('')}</div>
  </div>`;
}

function home() {
  run++;
  pitch.crowdTension(false);
  pitch.round = false; // a tela inicial é sempre de bloquinhos
  music.setIntensity(0.35);
  eventTeam = null;
  pitch.womens = !!look.female;
  enforceFree();
  hud.classList.add('hidden'); hint.classList.add('hidden'); callEl.classList.add('hidden'); touch.classList.add('hidden');
  pitch.setup({ sx: 0, sz: PENALTY_Z, view: 'kick', kickerKit: myKit(), keeperKit: findTeam('lions').kit, wall: null, seed: 1, look: myLook() });
  pitch.titleDuo(true, myKit(), myLook());
  const ev = eventFor(today());
  // Halloween e Natal: enfeites ao lado do gol e chapéu nos jogadores durante toda a época
  pitch.season = ev?.theme ?? null;
  seasonWeather = null;
  const langs = (Object.keys(LANGS) as Lang[]).map((l) => `<option value="${l}"${l === lang ? ' selected' : ''}>${LANGS[l].name}</option>`).join('');
  show(`
    <div class="logo"><span class="ball">⚽</span><h1>GOL DE<br>PLACA</h1><p>${t('tagline')}</p>${roundUnlocked(progress.stickers.length) ? '' : `<p class="round-tease">${ROUND.e} ${t('roundStyle')}: 🔒 ${t('roundNeed', { n: ROUND.need })}</p>`}</div>
    <button class="btn big" data-go="play">${t('play')}</button>
    <div class="row">
      <button class="btn alt" data-go="player">${t('myPlayer')}${lock(!unlocked())}</button>
      <button class="btn alt" data-go="fans">${t('fanTitle')}</button>
    </div>
    ${ev ? `<button class="mode event" data-go="event"><b>${evTitle(ev)}</b><span>${t('eventDesc')}</span></button>` : ''}
    <button class="btn alt" data-go="album">${t('album')} · ${progress.stickers.length}/${STICKERS.length}</button>
    ${dailyCard()}
    ${unlocked() ? '' : `<button class="btn gold" data-go="full">${t('fullVersion')}</button>`}
    <div class="card">
      <label class="set">🌐 ${t('language')} <select id="lang">${langs}</select></label>
      <label class="set">${t('sound')} <button class="toggle${sound ? ' on' : ''}" data-tg="sound">${sound ? 'ON' : 'OFF'}</button></label>
      ${native ? `<label class="set">${t('vibration')} <button class="toggle${vibe ? ' on' : ''}" data-vibe>${vibe ? 'ON' : 'OFF'}</button></label>` : ''}
      <b class="set-title">${t('narration')}</b>
      <div class="seg">${(['male', 'female', 'off'] as audio.Voice[]).map((v) =>
        `<button data-voice="${v}" class="${v === voice ? 'on' : ''}">${t(v === 'male' ? 'voiceMale' : v === 'female' ? 'voiceFemale' : 'voiceOff')}</button>`).join('')}</div>
      ${voice === 'off' ? '' : `<label class="set">${t('narrLang')} <select id="narrLang"><option value="auto"${narrPick === 'auto' ? ' selected' : ''}>${t('narrSame')}</option>${NARR_ORDER.map((n) => `<option value="${n}"${n === narrPick ? ' selected' : ''}>${NARR[n].name}</option>`).join('')}</select></label>`}
    </div>
    <button class="promo" data-go="promo"><span class="e">🙈</span><span><b>${t('promoTitle')}</b><span>${t('promoText')}</span></span></button>
  `);
  on('[data-go=play]', modes);
  on('[data-go=player]', () => (unlocked() ? builder() : unlock(home)));
  on('[data-go=fans]', fans);
  on('[data-go=album]', album);
  on('[data-go=event]', () => ev && eventScreen(ev));
  on('[data-go=full]', () => unlock(home));
  on('[data-go=promo]', () => parentGate(() => window.open(Capacitor.getPlatform() === 'android' ? ESCONDE.android : ESCONDE.ios, '_blank')));
  on('[data-vibe]', () => { vibe = !vibe; store.set('vibe', vibe ? '1' : '0'); buzz('goal'); home(); });
  on('[data-tg]', () => { sound = !sound; store.set('sound', sound ? '1' : '0'); audio.setSound(sound); home(); });
  on('[data-voice]', (el) => {
    voice = el.dataset.voice as audio.Voice;
    store.set('voice', voice);
    audio.setNarration(voice);
    audio.preloadVoice(nl());
    audio.call(nl(), 'goal'); // amostra da voz escolhida
    home();
  });
  document.getElementById('narrLang')?.addEventListener('change', (e) => {
    narrPick = (e.target as HTMLSelectElement).value;
    store.set('narrLang', narrPick);
    audio.preloadVoice(nl());
    audio.call(nl(), 'goal'); // amostra do narrador escolhido
  });
  ($('lang') as HTMLSelectElement).addEventListener('change', (e) => {
    lang = (e.target as HTMLSelectElement).value as Lang;
    store.set('lang', lang);
    audio.preloadVoice(nl());
    document.documentElement.lang = LANGS[lang].voice;
    home();
  });
}

type Mode = 'penalty' | 'free' | 'cup';
type Role = 'kicker' | 'keeper';

function modes() {
  show(`
    <h2>${t('modeTitle')}</h2>
    ${(['penalty', 'free', 'cup'] as Mode[]).map((m) =>
      `<button class="mode" data-mode="${m}"><b>${t(m)}${lock(m === 'free' && !unlocked())}</b><span>${t((m + 'Desc') as UiKey)}</span></button>`).join('')}
    <button class="mode" data-go="duo"><b>${t('twoPlayers')}${lock(!unlocked())}</b><span>${t('twoPlayersDesc')}</span></button>
    <button class="mode" data-go="tour"><b>${t('tournament')}${lock(!unlocked())}</b><span>${t('tournamentDesc')}</span></button>
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  on('[data-go=back]', home);
  on('[data-go=duo]', () => (unlocked() ? duoSetup() : unlock(modes)));
  on('[data-go=tour]', () => (unlocked() ? tourSetup() : unlock(modes)));
  on('[data-mode]', (el) => {
    const m = el.dataset.mode as Mode;
    if (m === 'free' && !unlocked()) unlock(modes);
    else if (m === 'cup') match(m, 'kicker'); // na Copa a criança bate e defende, alternando
    else role(m);
  });
}

function role(m: Mode) {
  show(`
    <h2>${t(m)}</h2>
    <p class="sub">${t('roleTitle')}</p>
    <button class="btn big" data-role="kicker">${t('kicker')}</button>
    <button class="btn big${unlocked() ? '' : ' dim'}" data-role="keeper">${t('keeper')}${lock(!unlocked())}</button>
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  on('[data-go=back]', modes);
  on('[data-role]', (el) => {
    const r = el.dataset.role as Role;
    if (r === 'keeper' && !unlocked()) unlock(() => role(m)); else match(m, r);
  });
}

/** Time, dificuldade, clima e torcida. */
function match(m: Mode, r: Role) {
  enforceFree();
  const full = unlocked();
  const list = allTeams(teamKind);
  if (full && myTeam.kind !== teamKind) myTeam = list[0];
  const seg = <T extends string>(name: string, opts: [T, UiKey][], cur: T, cls = '') =>
    `<div class="seg${cls}">${opts.map(([v, k]) => `<button data-${name}="${v}" class="${v === cur ? 'on' : ''}">${t(k)}</button>`).join('')}</div>`;
  show(`
    <h2>${t('teamTitle')}</h2>
    ${womensSeg()}
    <div class="seg">
      <button data-kind="nation" class="${teamKind === 'nation' ? 'on' : ''}">${t('nations')}${lock(!full)}</button>
      <button data-kind="club" class="${teamKind === 'club' ? 'on' : ''}">${t('clubs')}</button>
    </div>
    <div class="teams">${list.map((x) => {
      const locked = !full && x.id !== FREE_TEAM;
      return `<button class="team${x.id === myTeam.id ? ' on' : ''}${locked ? ' locked' : ''}" data-team="${x.id}">
        <span class="b">${x.badge}</span><span class="kit" style="background:${x.kit.shirt};box-shadow:inset 0 -3px 0 ${x.kit.shorts}"></span>
        <span class="n">${teamName(x, lang)}</span>${locked ? '<span class="lk">🔒</span>' : ''}</button>`;
    }).join('')}
    </div>
    <div class="card">
      <b>${t('difficulty')}</b>${seg<Difficulty>('diff', [['easy', 'easy'], ['medium', 'medium'], ['hard', 'hard']], diff)}
      <b>${t('weather')}</b>${seg<Weather | 'random'>('weather', [['day', 'day'], ['night', 'night'], ['rain', 'rain'], ['snow', 'snow'], ['random', 'randomWeather']], weatherPick, ' wrap')}
      <b>${t('crowd')}</b>${seg<Crowd>('crowd', [['full', 'crowdFull'], ['half', 'crowdHalf'], ['few', 'crowdFew']], crowd)}
      ${r === 'keeper' || m === 'cup' ? `<b>${t('keeperCam')}</b>${seg<'goal' | 'kicker'>('cam', [['goal', 'camGoal'], ['kicker', 'camKicker']], keeperCam)}` : ''}
    </div>
    <p class="sub">${t(m === 'cup' ? 'cupInfo' : r === 'kicker' ? 'duelKick' : 'duelKeep')}</p>
    <button class="btn big" data-go="start">${t('start')}</button>
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  const again = () => match(m, r);
  onWomens(again);
  on('[data-kind]', (el) => {
    if (!full) { if (el.dataset.kind === 'nation') unlock(again); return; }
    teamKind = el.dataset.kind as 'nation' | 'club'; store.set('teamKind', teamKind); again();
  });
  on('[data-team]', (el) => {
    if (!full && el.dataset.team !== FREE_TEAM) { unlock(again); return; }
    myTeam = findTeam(el.dataset.team!); store.set('team', myTeam.id); again();
  });
  on('[data-diff]', (el) => { diff = el.dataset.diff as Difficulty; store.set('diff', diff); again(); });
  on('[data-weather]', (el) => {
    weatherPick = el.dataset.weather as Weather | 'random';
    if (weatherPick !== 'random') weather = weatherPick;
    store.set('weather', weatherPick); again();
  });
  on('[data-crowd]', (el) => { crowd = el.dataset.crowd as Crowd; store.set('crowd', crowd); again(); });
  on('[data-cam]', (el) => { keeperCam = el.dataset.cam as 'goal' | 'kicker'; pitch.keeperCam = keeperCam; store.set('keeperCam', keeperCam); again(); });
  on('[data-go=back]', () => (m === 'cup' ? modes() : role(m)));
  on('[data-go=start]', () => {
    hideUi();
    const id = ++run;
    void quiet(m === 'cup' ? cup(id) : single(id, m, r));
  });
}

function pickOpponent(exclude: string[] = []): Team {
  const list = allTeams(teamKind).filter((x) => x.id !== myTeam.id && !exclude.includes(x.id));
  return list[Math.floor(rng() * list.length)];
}

// ---------- placar: batedor x goleiro ----------

interface Row { team: Team; icon: string; marks: boolean[]; label?: string }
function board(rows: Row[], slots = Math.max(5, ...rows.map((r) => r.marks.length))) {
  hud.classList.remove('hidden');
  hud.innerHTML = `<button class="quit" aria-label="${t('menu')}">✕</button><div class="board">${rows.map((r) => {
    const dots = Array.from({ length: slots }, (_, i) => `<span class="dot${r.marks[i] === true ? ' g' : r.marks[i] === false ? ' m' : ''}"></span>`).join('');
    return `<div class="line"><span class="t">${r.team.badge}</span><span class="ic">${r.icon}</span><span class="nm">${esc(r.label ?? teamName(r.team, lang))}</span><span class="dots">${dots}</span><span class="sc">${r.marks.filter(Boolean).length}</span></div>`;
  }).join('')}</div>`;
  hud.querySelector('.quit')!.addEventListener('click', home);
}

function showCall(outcome: Outcome, good: boolean, key: CallKey) {
  const said = audio.call(nl(), key);
  callEl.innerHTML = `<b class="${good ? '' : 'bad'}">${t(outcome)}</b><span>${said}</span>`;
  callEl.classList.remove('hidden');
}

function showHint(title: string, text: string) {
  hint.innerHTML = `<b>${title}</b>${text}`;
  hint.classList.remove('hidden');
}

// ---------- cobranças ----------

/** Desenha o rastro do dedo e devolve o gesto quando o jogador solta. */
function waitSwipe(id: number): Promise<{ points: { x: number; y: number }[]; ms: number }> {
  touch.classList.remove('hidden');
  const g = trail.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  trail.width = innerWidth * dpr; trail.height = innerHeight * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return new Promise((resolve) => {
    let pts: { x: number; y: number }[] = [];
    let t0 = 0;
    let down = false;
    const draw = () => {
      g.clearRect(0, 0, innerWidth, innerHeight);
      if (pts.length < 2) return;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,212,0,.85)'; g.lineWidth = 10;
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
    };
    const downH = (e: PointerEvent) => { audio.initAudio(); down = true; pts = [{ x: e.clientX, y: e.clientY }]; t0 = performance.now(); touch.setPointerCapture?.(e.pointerId); };
    const moveH = (e: PointerEvent) => { if (!down) return; pts.push({ x: e.clientX, y: e.clientY }); draw(); };
    const upH = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      pts.push({ x: e.clientX, y: e.clientY });
      const ms = performance.now() - t0;
      if (id !== run) { cleanup(); return; }
      cleanup();
      setTimeout(() => g.clearRect(0, 0, innerWidth, innerHeight), 500);
      resolve({ points: pts, ms });
    };
    const cleanup = () => {
      touch.removeEventListener('pointerdown', downH);
      touch.removeEventListener('pointermove', moveH);
      touch.removeEventListener('pointerup', upH);
      touch.classList.add('hidden');
    };
    touch.addEventListener('pointerdown', downH);
    touch.addEventListener('pointermove', moveH);
    touch.addEventListener('pointerup', upH);
  });
}

// tutorial com a mãozinha: só nas primeiras vezes
let tutKick = store.get('tutKick', '0') !== '1';
let tutKeep = store.get('tutKeep', '0') !== '1';

/** Mãozinha animada: arrasta de `from` até `to` (chute) ou toca em `from` (defesa). */
function hand(from: { x: number; y: number }, to?: { x: number; y: number }): () => void {
  const h = document.createElement('div');
  h.className = `hand${to ? ' swipe' : ' tap'}`;
  h.textContent = '👆';
  h.style.setProperty('--x0', `${from.x}px`); h.style.setProperty('--y0', `${from.y}px`);
  h.style.setProperty('--x1', `${(to ?? from).x}px`); h.style.setProperty('--y1', `${(to ?? from).y}px`);
  document.body.appendChild(h);
  return () => h.remove();
}

function react(outcome: Outcome, kickerIsMe: boolean, top: boolean) {
  const good = (outcome === 'goal') === kickerIsMe;
  const key: CallKey = outcome === 'goal' ? (top ? 'corner' : 'goal') : outcome;
  showCall(outcome, good, key);
  music.setIntensity(0.45);
  if (outcome === 'goal') { audio.net(); audio.crowd('cheer'); music.burst(); }
  else if (outcome === 'save') audio.crowd('clap');
  else if (outcome === 'post') { audio.post(); audio.crowd('ohh'); }
  else audio.crowd('ohh');
  // a torcida faz festa quando dá certo para a criança e lamenta quando não dá
  pitch.crowdReact(good ? 'party' : 'ohh');
  if (good && outcome === 'save') music.burst();
  buzz(outcome === 'goal' ? (kickerIsMe ? 'goal' : 'conceded') : outcome === 'save' ? (kickerIsMe ? 'miss' : 'save')
    : outcome === 'post' ? 'post' : outcome === 'wall' ? 'wall' : 'miss');
}

/** No 2 jogadores, o goleiro escolhe antes onde vai pular (o batedor não vê). */
interface Duo { kicker: Team; keeper: Team; keeperAt: { x: number; y: number } }

/** O jogador bate. Devolve se foi gol. Com `duo`, o goleiro é a outra criança. */
async function myKick(id: number, kind: Kind, sx: number, sz: number, wall: Wall | null, opp: Team, duo?: Duo): Promise<boolean> {
  mixMusic();
  const kickerKit = duo?.kicker.kit ?? myKit();
  pitch.setup({ sx, sz, view: 'kick', kickerKit, keeperKit: (duo?.keeper ?? opp).kit, wall, seed: Math.floor(rng() * 100), look: duo ? undefined : myLook() });
  // quem não escolheu comemoração (ou joga sem a versão completa / no 2 jogadores) ganha uma diferente a cada gol
  pitch.kickerCelebration = celFor(!duo && unlocked() ? look.cel : 'random');
  showHint(t('yourKick'), tutKick ? t('tutKick') : '');
  pitch.crowdTension(true);
  const unhand = tutKick ? hand(pitch.screenOf(sx, 0.1, sz), pitch.screenOf(HALF - 0.6, GOAL_H - 0.5, 0)) : () => {};
  music.setIntensity(0.75);
  audio.whistle();
  let shot = null;
  try {
    while (!shot) {
      const sw = await waitSwipe(id);
      guard(id);
      // a bola vai para o ponto do gol onde o dedo terminou o gesto
      const end = sw.points[sw.points.length - 1];
      const aim = pitch.goalPointAt(end.x, end.y) ?? { x: 0, y: 5 };
      shot = shotFromSwipe({ ...sw, screenH: innerHeight }, sx, sz, kind, aim);
    }
  } finally { unhand(); }
  if (tutKick) { tutKick = false; store.set('tutKick', '1'); }
  hint.classList.add('hidden');
  const aim = aimResult(shot, wall);
  const s = shot;
  // goleiro: a máquina lê o chute; no 2 jogadores, vai onde a outra criança escolheu
  const keeperAt = duo ? duo.keeperAt : cpuKeeperTarget(s, kind, diff, rng);
  const saves = aim === 'target' && cpuSaves(s, keeperAt, duo ? 'medium' : diff);
  const play = {
    // quando defende, o goleiro vai na bola; quando não, pula onde tinha lido
    shot: s, runUp: 0.35, wallU: wallHit(s, wall), cpuKeeper: saves ? { x: s.tx, y: s.ty } : keeperAt,
    decide: (): Outcome => (aim !== 'target' ? aim : saves ? 'save' : 'goal'),
  };
  const outcome = await pitch.play({ ...play, onKick: kickFx });
  guard(id);
  const top = isTopCorner(s);
  react(outcome, true, top);
  if (outcome === 'goal') track({ t: 'goal', corner: top, ground: s.ty <= GROUND_SHOT, curve: Math.abs(s.bend) > 0.8, free: kind === 'free', weather });
  else if (outcome === 'post') track({ t: 'post' });
  else track({ t: 'miss' });
  await sleep(1700);
  guard(id);
  callEl.classList.add('hidden');
  // golaço: replay em câmera lenta, de lado
  if (outcome === 'goal' && (top || Math.abs(s.bend) > 0.8 || kind === 'free')) {
    callEl.innerHTML = `<b class="replay">⏪ ${t('replay')}</b>`;
    callEl.classList.remove('hidden');
    music.setIntensity(0.3);
    await pitch.replay(play);
    guard(id);
    callEl.classList.add('hidden');
  }
  return outcome === 'goal';
}

/** A máquina bate e o jogador defende tocando no gol. Devolve se a máquina fez gol. */
async function myKeep(id: number, kind: Kind, sx: number, sz: number, wall: Wall | null, opp: Team): Promise<boolean> {
  mixMusic();
  pitch.setup({ sx, sz, view: 'keep', kickerKit: opp.kit, keeperKit: myKit(), wall, seed: Math.floor(rng() * 100), look: myLook() });
  pitch.kickerCelebration = CELEBRATIONS[Math.floor(rng() * CELEBRATIONS.length)];
  showHint(t('yourKeep'), tutKeep ? t('tutKeep') : '');
  pitch.crowdTension(true);
  const unhand = tutKeep ? hand(pitch.screenOf(-(HALF - 0.8), 1.2, 0)) : () => {};
  music.setIntensity(0.75);
  await sleep(tutKeep ? 2200 : 900);
  guard(id);
  audio.call(nl(), 'ready');
  await sleep(700);
  guard(id);
  audio.whistle();
  const shot = cpuShot(sx, sz, kind, diff, wall, rng);
  const T = flightTime(shot);
  let t0 = 0;
  let tap: { x: number; y: number; t: number } | null = null;
  let saved: boolean | null = null;
  const onTap = (e: PointerEvent) => {
    if (!t0 || tap) return;
    const p = pitch.goalPointAt(e.clientX, e.clientY);
    if (!p) return;
    unhand();
    const at = (performance.now() - t0) / 1000;
    tap = { ...p, t: at };
    // pulou no lugar certo e a tempo: as luvas vão na bola; senão, vai onde a criança tocou
    saved = aimResult(shot, wall) === 'target' && playerSaves(shot, tap, diff, kind);
    const to = saved ? { x: shot.tx, y: shot.ty } : p;
    pitch.keeperDive(to.x, to.y, Math.max(0.12, T - at));
    buzz('dive');
  };
  touch.classList.remove('hidden');
  touch.addEventListener('pointerdown', onTap);
  try {
    const outcome = await pitch.play({
      shot, runUp: 0.9, wallU: wallHit(shot, wall), cpuKeeper: null,
      decide: () => {
        const aim = aimResult(shot, wall);
        return aim !== 'target' ? aim : (saved ?? playerSaves(shot, tap, diff, kind)) ? 'save' : 'goal';
      },
      onKick: kickFx,
      onFlightStart: (now) => { t0 = now; },
    });
    guard(id);
    unhand();
    if (tutKeep) { tutKeep = false; store.set('tutKeep', '1'); }
    hint.classList.add('hidden');
    react(outcome, false, isTopCorner(shot));
    track(outcome === 'goal' ? { t: 'concede' } : outcome === 'save' ? { t: 'save' } : { t: 'miss' });
    await sleep(1700);
    guard(id);
    callEl.classList.add('hidden');
    return outcome === 'goal';
  } finally {
    unhand();
    touch.removeEventListener('pointerdown', onTap);
    touch.classList.add('hidden');
  }
}

function spotFor(kind: Kind) {
  if (kind === 'penalty') return { sx: 0, sz: PENALTY_Z, wall: null as Wall | null };
  const { sx, sz } = freeKickSpot(rng);
  return { sx, sz, wall: placeWall(sx, sz, diff) };
}

// ---------- duelo: 5 cobranças, a criança é só batedor ou só goleiro ----------

/** Devolve quantas cobranças a criança venceu (gols como batedor, defesas como goleiro). */
async function duel(id: number, kind: Kind, r: Role, opp: Team): Promise<number> {
  rollWeather();
  pitch.setAtmosphere(atmo(opp));
  const mine: boolean[] = [];
  const draw = () => {
    const theirs = mine.map((x) => !x);
    board(r === 'kicker'
      ? [{ team: myTeam, icon: '⚽', marks: mine }, { team: opp, icon: '🧤', marks: theirs }]
      : [{ team: opp, icon: '⚽', marks: theirs }, { team: myTeam, icon: '🧤', marks: mine }]);
  };
  for (let i = 0; i < 5; i++) {
    draw();
    const { sx, sz, wall } = spotFor(kind);
    mine.push(r === 'kicker' ? await myKick(id, kind, sx, sz, wall, opp) : !(await myKeep(id, kind, sx, sz, wall, opp)));
  }
  draw();
  return mine.filter(Boolean).length;
}

function resultCard(icon: string, title: UiKey, score: string, extra = '') {
  return `<div class="result card"><div class="big">${icon}</div><h2>${t(title)}</h2><div class="score">${score}</div>${extra}</div>`;
}

async function single(id: number, m: 'penalty' | 'free', r: Role) {
  const opp = pickOpponent();
  const n = await duel(id, m, r, opp);
  guard(id);
  const won = n >= 3;
  track({ t: 'match', won, perfect: n === 5, role: r, team: myTeam.id });
  onMatchFinished(won);
  if (won) confetti();
  audio.call(nl(), won ? 'win' : 'lose');
  const stars = n >= 5 ? 3 : n >= 4 ? 2 : n >= 3 ? 1 : 0;
  show(`
    ${resultCard(r === 'kicker' ? '⚽' : '🧤', won ? 'win' : 'lose', `${myTeam.badge} ${n} × ${5 - n} ${opp.badge}`,
      `<div class="sub">${t('trainingResult', { n, t: 5 })} ${t(r === 'kicker' ? 'goals' : 'saves')}</div><div class="stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>`)}
    <button class="btn big" data-go="again">${t('again')}</button>
    <button class="btn alt" data-go="menu">${t('menu')}</button>
  `, false);
  on('[data-go=again]', () => { hideUi(); const nid = ++run; void quiet(single(nid, m, r)); });
  on('[data-go=menu]', home);
}

/** Disputa de pênaltis da Copa: a criança bate pelo time dela e defende as cobranças da máquina,
 * alternando. 5 para cada lado e, se empatar, morte súbita. Devolve [venceu, gols dela, gols da máquina]. */
async function shootout(id: number, opp: Team): Promise<[boolean, number, number]> {
  rollWeather();
  pitch.setAtmosphere(atmo(opp));
  const so: Shootout = { a: [], b: [] };
  const draw = () => board([{ team: me(), icon: '⚽', marks: so.a }, { team: opp, icon: '⚽', marks: so.b }]);
  const score = (w: 'a' | 'b'): [boolean, number, number] => [w === 'a', so.a.filter(Boolean).length, so.b.filter(Boolean).length];
  let sudden = false;
  for (;;) {
    draw();
    so.a.push(await myKick(id, 'penalty', 0, PENALTY_Z, null, opp));
    draw();
    let w = shootoutWinner(so);
    if (w) return score(w);
    so.b.push(await myKeep(id, 'penalty', 0, PENALTY_Z, null, opp));
    draw();
    w = shootoutWinner(so);
    if (w) return score(w);
    if (!sudden && so.a.length >= 5) {
      sudden = true;
      callEl.innerHTML = `<b>${t('sudden')}</b><span>${audio.call(nl(), 'sudden')}</span>`;
      callEl.classList.remove('hidden');
      await sleep(1800); guard(id);
      callEl.classList.add('hidden');
    }
  }
}

async function cup(id: number) {
  const used: string[] = [];
  const rounds: UiKey[] = ['quarter', 'semi', 'final'];
  for (let i = 0; i < rounds.length; i++) {
    const opp = pickOpponent(used);
    used.push(opp.id);
    callEl.innerHTML = `<b>${t(rounds[i])}</b><span>${myTeam.badge} × ${opp.badge}</span>`;
    callEl.classList.remove('hidden');
    await sleep(1800); guard(id);
    callEl.classList.add('hidden');
    const [won, ga, gb] = await shootout(id, opp);
    if (won) track({ t: 'match', won, perfect: false, role: 'kicker', team: myTeam.id });
    guard(id);
    const score = `${myTeam.badge} ${ga} × ${gb} ${opp.badge}`;
    if (!won) {
      audio.call(nl(), 'lose');
      show(`
        ${resultCard('😢', 'eliminated', score, `<div class="sub">${t(rounds[i])}</div>`)}
        <button class="btn big" data-go="again">${t('again')}</button>
        <button class="btn alt" data-go="menu">${t('menu')}</button>
      `, false);
      on('[data-go=again]', () => { hideUi(); const nid = ++run; void quiet(cup(nid)); });
      on('[data-go=menu]', home);
      return;
    }
    if (i < rounds.length - 1) {
      audio.call(nl(), 'win');
      await new Promise<void>((next) => {
        show(`
          ${resultCard('🎉', 'win', score, `<div class="sub">→ ${t(rounds[i + 1])}</div>`)}
          <button class="btn big" data-go="next">${t('next')}</button>
          <button class="btn alt" data-go="menu">${t('menu')}</button>
        `, false);
        on('[data-go=next]', () => { hideUi(); next(); });
        on('[data-go=menu]', home);
      });
      guard(id);
    }
  }
  confetti();
  audio.call(nl(), 'champion');
  track({ t: 'cup', diff, team: myTeam.id });
  onMatchFinished(true);
  show(`
    ${resultCard('🏆', 'champion', `${myTeam.badge} ${teamName(myTeam, lang)}`)}
    <button class="btn big" data-go="again">${t('again')}</button>
    <button class="btn alt" data-go="menu">${t('menu')}</button>
  `, false);
  on('[data-go=again]', () => { hideUi(); const nid = ++run; void quiet(cup(nid)); });
  on('[data-go=menu]', home);
}

function confetti() {
  buzz('win');
  const bits = ['⚽', '🎉', '⭐', '🏆', '🎊'];
  for (let i = 0; i < 26; i++) {
    const d = document.createElement('div');
    d.className = 'confetti';
    d.textContent = bits[i % bits.length];
    d.style.left = `${Math.random() * 100}vw`;
    d.style.animationDuration = `${2 + Math.random() * 2}s`;
    d.style.animationDelay = `${Math.random() * 0.8}s`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 5000);
  }
}

// ---------- 2 jogadores no mesmo celular ----------

let duoNames: [string, string] = [store.get('p1', ''), store.get('p2', '')];
let duoTeam1: Team = findTeam(store.get('team1', myTeam.id));
let duoTeam2: Team = findTeam(store.get('team2', 'lions'));
let duoPick: 1 | 2 = 1; // de qual jogador é a lista de times aberta

function duoSetup() {
  const list = allTeams(teamKind);
  if (duoTeam1.kind !== teamKind) duoTeam1 = list.find((x) => x.id === myTeam.id) ?? list[0];
  if (duoTeam2.id === duoTeam1.id || duoTeam2.kind !== teamKind) duoTeam2 = list.find((x) => x.id !== duoTeam1.id)!;
  const [mine, other] = duoPick === 1 ? [duoTeam1, duoTeam2] : [duoTeam2, duoTeam1];
  show(`
    <h2>${t('twoPlayers')}</h2>
    ${womensSeg()}
    <div class="card">
      <div class="row">
        <div><b>${duoTeam1.badge} ${t('p1')}</b><input id="p1" maxlength="12" value="${esc(duoNames[0])}" placeholder="${t('p1')}" autocomplete="off"></div>
        <div><b>${duoTeam2.badge} ${t('p2')}</b><input id="p2" maxlength="12" value="${esc(duoNames[1])}" placeholder="${t('p2')}" autocomplete="off"></div>
      </div>
      <div class="seg">
        <button data-kind="nation" class="${teamKind === 'nation' ? 'on' : ''}">${t('nations')}</button>
        <button data-kind="club" class="${teamKind === 'club' ? 'on' : ''}">${t('clubs')}</button>
      </div>
      <div class="seg">${([1, 2] as const).map((n) => `<button data-pick="${n}" class="${n === duoPick ? 'on' : ''}">${t(n === 1 ? 'p1team' : 'p2team')}</button>`).join('')}</div>
      <div class="teams">${list.filter((x) => x.id !== other.id).map((x) => `
        <button class="team${x.id === mine.id ? ' on' : ''}" data-duoteam="${x.id}"><span class="b">${x.badge}</span><span class="n">${teamName(x, lang)}</span></button>`).join('')}</div>
    </div>
    <p class="sub">${t('twoPlayersDesc')}</p>
    <button class="btn big" data-go="start">${t('start')}</button>
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  const names = () => {
    duoNames = [($('p1') as HTMLInputElement).value.trim(), ($('p2') as HTMLInputElement).value.trim()];
    store.set('p1', duoNames[0]); store.set('p2', duoNames[1]);
  };
  onWomens(() => { names(); duoSetup(); });
  on('[data-kind]', (el) => { names(); teamKind = el.dataset.kind as 'nation' | 'club'; store.set('teamKind', teamKind); duoSetup(); });
  on('[data-pick]', (el) => { names(); duoPick = el.dataset.pick === '2' ? 2 : 1; duoSetup(); });
  on('[data-duoteam]', (el) => {
    names();
    const team = findTeam(el.dataset.duoteam!);
    if (duoPick === 1) { duoTeam1 = team; store.set('team1', team.id); } else { duoTeam2 = team; store.set('team2', team.id); }
    duoSetup();
  });
  on('[data-go=back]', () => { names(); modes(); });
  on('[data-go=start]', () => {
    names();
    hideUi();
    const id = ++run;
    void quiet(duoMatch(id));
  });
}

/** Tela cheia que esconde o jogo enquanto o celular passa de mão. */
function cover(title: string, sub: string): Promise<void> {
  return new Promise((ok) => {
    show(`<div class="result card"><div class="big">📱</div><h2>${esc(title)}</h2><p class="sub">${esc(sub)}</p></div>
      <button class="btn big" data-go="ok">${t('ready')}</button>`);
    on('[data-go=ok]', () => { hideUi(); ok(); });
  });
}

/** O goleiro toca no gol para escolher onde vai pular. */
function pickDive(id: number): Promise<{ x: number; y: number }> {
  touch.classList.remove('hidden');
  return new Promise((resolve) => {
    const onTap = (e: PointerEvent) => {
      const p = pitch.goalPointAt(e.clientX, e.clientY);
      if (!p || id !== run) return;
      touch.removeEventListener('pointerdown', onTap);
      touch.classList.add('hidden');
      audio.chime();
      resolve(p);
    };
    touch.addEventListener('pointerdown', onTap);
  });
}

interface DuoPlayer { name: string; team: Team }

/** Uma disputa de pênaltis entre duas crianças, passando o celular. Devolve quem venceu e o placar. */
async function duoGame(id: number, players: [DuoPlayer, DuoPlayer]): Promise<{ winner: 0 | 1; a: number; b: number }> {
  rollWeather();
  pitch.setAtmosphere(atmo(players[1].team));
  const so: Shootout = { a: [], b: [] };
  const draw = () => board([
    { team: players[0].team, icon: '⚽', marks: so.a, label: players[0].name },
    { team: players[1].team, icon: '⚽', marks: so.b, label: players[1].name },
  ]);
  let winner: 'a' | 'b' | null = null;
  for (let turn = 0; !winner; turn++) {
    const k = turn % 2; // 0: jogador 1 bate; 1: jogador 2 bate
    const kicker = players[k], keeper = players[1 - k];
    draw();
    // 1) o goleiro escolhe escondido onde vai pular
    await cover(t('pickKeep', { name: keeper.name }), t('pickKeepSub'));
    guard(id);
    pitch.setup({ sx: 0, sz: PENALTY_Z, view: 'kick', kickerKit: kicker.team.kit, keeperKit: keeper.team.kit, wall: null, seed: turn });
    showHint(t('pickKeep', { name: keeper.name }), t('pickKeepSub'));
    const at = await pickDive(id);
    guard(id);
    hint.classList.add('hidden');
    // 2) passa o celular para o batedor
    await cover(t('passKick', { name: kicker.name }), '');
    guard(id);
    const goal = await myKick(id, 'penalty', 0, PENALTY_Z, null, keeper.team, { kicker: kicker.team, keeper: keeper.team, keeperAt: at });
    (k === 0 ? so.a : so.b).push(goal);
    if (so.a.length === so.b.length) winner = shootoutWinner(so);
    else if (so.a.length <= 5) winner = shootoutWinner(so); // pode acabar antes das 5
  }
  draw();
  return { winner: winner === 'a' ? 0 : 1, a: so.a.filter(Boolean).length, b: so.b.filter(Boolean).length };
}

async function duoMatch(id: number) {
  const players: [DuoPlayer, DuoPlayer] = [
    { name: duoNames[0] || t('p1'), team: duoTeam1 },
    { name: duoNames[1] || t('p2'), team: duoTeam2 },
  ];
  const r = await duoGame(id, players);
  guard(id);
  track({ t: 'twoPlayers' });
  onMatchFinished(true);
  const champ = players[r.winner];
  confetti();
  audio.call(nl(), 'champion');
  show(`
    ${resultCard('🏆', 'win', `${players[0].team.badge} ${r.a} × ${r.b} ${players[1].team.badge}`, `<h2>${esc(t('winnerIs', { name: champ.name }))}</h2>`)}
    <button class="btn big" data-go="again">${t('again')}</button>
    <button class="btn alt" data-go="menu">${t('menu')}</button>
  `, false);
  on('[data-go=again]', () => { hideUi(); const nid = ++run; void quiet(duoMatch(nid)); });
  on('[data-go=menu]', home);
}

// ---------- torneio de amigos: mata-mata de 4 no mesmo celular ----------

let tourNames: string[] = [0, 1, 2, 3].map((i) => store.get('tp' + (i + 1), ''));
let tourShift = Number(store.get('tourShift', '0')) || 0;
const tourTeams = () => {
  const list = allTeams(teamKind);
  return [0, 1, 2, 3].map((i) => list[(tourShift + i * 3) % list.length]);
};
const tourName = (i: number) => tourNames[i] || t(('p' + (i + 1)) as UiKey);

function tourSetup() {
  const teams = tourTeams();
  show(`
    <h2>${t('tournament')}</h2>
    ${womensSeg()}
    <div class="card">
      <div class="tourgrid">${[0, 1, 2, 3].map((i) => `
        <div><b>${teams[i].badge} ${t(('p' + (i + 1)) as UiKey)}</b><input id="tp${i}" maxlength="12" value="${esc(tourNames[i])}" placeholder="${t(('p' + (i + 1)) as UiKey)}" autocomplete="off"></div>`).join('')}</div>
      <div class="seg">
        <button data-kind="nation" class="${teamKind === 'nation' ? 'on' : ''}">${t('nations')}</button>
        <button data-kind="club" class="${teamKind === 'club' ? 'on' : ''}">${t('clubs')}</button>
      </div>
      <button class="btn alt" data-go="shuffle">${t('shuffleTeams')}</button>
    </div>
    <p class="sub">${t('tournamentInfo')}</p>
    <button class="btn big" data-go="start">${t('start')}</button>
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  const names = () => {
    tourNames = [0, 1, 2, 3].map((i) => ($('tp' + i) as HTMLInputElement).value.trim());
    tourNames.forEach((n, i) => store.set('tp' + (i + 1), n));
  };
  onWomens(() => { names(); tourSetup(); });
  on('[data-kind]', (el) => { names(); teamKind = el.dataset.kind as 'nation' | 'club'; store.set('teamKind', teamKind); tourSetup(); });
  on('[data-go=shuffle]', () => { names(); tourShift = (tourShift + 1 + Math.floor(rng() * 5)) % 60; store.set('tourShift', String(tourShift)); tourSetup(); });
  on('[data-go=back]', () => { names(); modes(); });
  on('[data-go=start]', () => { names(); const id = ++run; void quiet(tournament(id)); });
}

/** Tela do chaveamento: mostra os jogos e quem já passou. */
function bracketScreen(players: DuoPlayer[], games: [number, number][], won: (number | null)[], next: number): Promise<void> {
  const row = (g: [number, number], i: number) => {
    const label = i === 2 ? t('final') : t(i === 0 ? 'semi1' : 'semi2');
    const p = (k: number) => `<span class="${won[i] === k ? 'w' : won[i] !== null ? 'l' : ''}">${players[k].team.badge} ${esc(players[k].name)}</span>`;
    return `<li class="${i === next ? 'now' : ''}"><small>${label}</small>${p(g[0])}<i>×</i>${p(g[1])}</li>`;
  };
  return new Promise((ok) => {
    show(`
      <h2>${t('tournament')}</h2>
      <ul class="bracket card">${games.map(row).join('')}${games.length < 3 ? `<li><small>${t('final')}</small><span>?</span><i>×</i><span>?</span></li>` : ''}</ul>
      <p class="sub">${esc(t('tourNext', { a: players[games[next][0]].name, b: players[games[next][1]].name }))}</p>
      <button class="btn big" data-go="next">${t('start')}</button>
      <button class="btn alt" data-go="menu">${t('menu')}</button>
    `);
    on('[data-go=next]', () => { hideUi(); ok(); });
    on('[data-go=menu]', home);
  });
}

async function tournament(id: number) {
  const teams = tourTeams();
  const players: DuoPlayer[] = [0, 1, 2, 3].map((i) => ({ name: tourName(i), team: teams[i] }));
  const won: (number | null)[] = [null, null, null];
  for (let g = 0; g < 3; g++) {
    const games = bracket(won[0], won[1]);
    await bracketScreen(players, games, won, g);
    guard(id);
    const [x, y] = games[g];
    const r = await duoGame(id, [players[x], players[y]]);
    guard(id);
    won[g] = r.winner === 0 ? x : y;
    if (g < 2) {
      audio.call(nl(), 'win');
      await new Promise<void>((next) => {
        show(`
          ${resultCard('🎉', 'win', `${players[x].team.badge} ${r.a} × ${r.b} ${players[y].team.badge}`, `<h2>${esc(t('winnerIs', { name: players[won[g]!].name }))}</h2>`)}
          <button class="btn big" data-go="next">${t('next')}</button>
          <button class="btn alt" data-go="menu">${t('menu')}</button>
        `, false);
        on('[data-go=next]', () => { hideUi(); next(); });
        on('[data-go=menu]', home);
      });
      guard(id);
    }
  }
  track({ t: 'twoPlayers' });
  onMatchFinished(true);
  const champ = players[won[2]!];
  confetti();
  audio.call(nl(), 'champion');
  show(`
    ${resultCard('🏆', 'champion', `${champ.team.badge} ${esc(champ.name)}`, `<h2>${esc(t('tourChamp', { name: champ.name }))}</h2>`)}
    <button class="btn big" data-go="again">${t('again')}</button>
    <button class="btn alt" data-go="menu">${t('menu')}</button>
  `, false);
  on('[data-go=again]', () => { const nid = ++run; void quiet(tournament(nid)); });
  on('[data-go=menu]', home);
}

// ---------- evento "Pênaltis da Copa" (só nas datas especiais) ----------

const readScore = (ev: CupEvent): EventScore => {
  try {
    const s = JSON.parse(store.get('event', 'null')) as EventScore | null;
    return s && s.id === ev.id ? { ...emptyScore(ev.id), ...s } : emptyScore(ev.id);
  } catch { return emptyScore(ev.id); }
};
let eventPick = store.get('eventTeam', 'BR');

/** Nome do evento: Pênaltis da Copa, de Halloween ou de Natal. */
const evTitle = (ev: CupEvent) => t(ev.theme === 'halloween' ? 'ev_halloween' : ev.theme === 'natal' ? 'ev_natal' : 'eventTitle');

function eventScreen(ev: CupEvent) {
  const sc = readScore(ev);
  const until = new Date(ev.to + 'T12:00:00').toLocaleDateString(LANGS[lang].voice, { day: 'numeric', month: 'long' });
  show(`
    <h2>${evTitle(ev)}</h2>
    <p class="sub">${t('eventUntil', { d: until })}</p>
    <div class="card event-score">
      <b>${t('eventScore')}</b>
      <div class="nums"><span><b>${sc.goals}</b>${t('goals')}</span><span><b>${sc.wins}</b>${t('eventWins')}</span><span><b>${sc.best}</b>${t('eventBest')}</span></div>
    </div>
    <p class="sub">${t('eventPick')}</p>
    <div class="teams">${NATIONS.map((x) => `<button class="team${x.id === eventPick ? ' on' : ''}" data-eteam="${x.id}"><span class="b">${x.badge}</span><span class="n">${teamName(x, lang)}</span></button>`).join('')}</div>
    <p class="sub">${t('eventInfo')}</p>
    <button class="btn big" data-go="start">${t('start')}</button>
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  on('[data-eteam]', (el) => { eventPick = el.dataset.eteam!; store.set('eventTeam', eventPick); eventScreen(ev); });
  on('[data-go=back]', home);
  on('[data-go=start]', () => { hideUi(); const id = ++run; void quiet(eventMatch(id, ev)); });
}

async function eventMatch(id: number, ev: CupEvent) {
  eventTeam = findTeam(eventPick);
  if (eventTeam.kind !== 'nation') eventTeam = NATIONS[0];
  if (ev.womens) pitch.womens = true;
  const opp = NATIONS.filter((x) => x.id !== eventTeam!.id)[Math.floor(rng() * (NATIONS.length - 1))];
  pitch.season = ev.theme ?? null;
  seasonWeather = ev.theme === 'halloween' ? 'night' : ev.theme === 'natal' ? 'snow' : null;
  callEl.innerHTML = `<b>${evTitle(ev)}</b><span>${eventTeam.badge} × ${opp.badge}</span>`;
  callEl.classList.remove('hidden');
  await sleep(1800); guard(id);
  callEl.classList.add('hidden');
  const [won, ga, gb] = await shootout(id, opp);
  guard(id);
  const sc = addMatch(readScore(ev), ga, won);
  store.set('event', JSON.stringify(sc));
  track({ t: 'match', won, perfect: false, role: 'kicker', team: eventTeam?.id });
  onMatchFinished(won);
  if (won) confetti();
  audio.call(nl(), won ? 'win' : 'lose');
  show(`
    ${resultCard(won ? '🏆' : '😢', won ? 'win' : 'lose', `${eventTeam.badge} ${ga} × ${gb} ${opp.badge}`,
      `<div class="sub">${t('eventScore')}: ${sc.goals} ${t('goals')} · ${sc.wins} ${t('eventWins')}${sc.streak > 1 ? ` · 🔥 ${sc.streak}` : ''}</div>`)}
    <button class="btn big" data-go="again">${t('again')}</button>
    <button class="btn alt" data-go="menu">${t('menu')}</button>
  `, false);
  on('[data-go=again]', () => { hideUi(); const nid = ++run; void quiet(eventMatch(nid, ev)); });
  on('[data-go=menu]', home);
}

// ---------- Torcida e música ----------

function fans() {
  const swatches = (which: 0 | 1) =>
    `<div class="swatches">${HEART_COLORS.map((c) => `<button class="sw${heart?.[which] === c ? ' on' : ''}" data-h${which}="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>`;
  show(`
    <h2>${t('fanTitle')}</h2>
    <div class="card">
      <b>${t('music')}</b>
      <div class="seg wrap">${MUSIC_PICKS.map((m) => `<button data-music="${m}" class="${m === musicStyle ? 'on' : ''}">${t(('mus_' + m) as UiKey)}</button>`).join('')}</div>
    </div>
    <div class="card">
      <b>${t('heart')}</b>
      <button class="toggle${heart ? '' : ' on'}" data-heart="none">${t('heartNone')}</button>
      <b>${t('heart1')}</b>${swatches(0)}
      <b>${t('heart2')}</b>${swatches(1)}
      ${heart ? `<div class="flag" style="--a:${heart[0]};--b:${heart[1]}"></div>` : ''}
      <p class="voice-note">${t('heartInfo')}</p>
    </div>
    <p class="voice-note credits">🎧 ${t('soundCredits')}: Félix Blume, _vk (Maracanã), dacarpe, Bruna32U, AxelTheCocker02, neilraouf, Kinoton,
      soundrecorder7, Imp_sounds, bittermelonheart (CC0) · Pablo-F, luminadii, gusvelasco, Quistard, juskiddink, polmdx (CC BY 3.0/4.0)</p>
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  on('[data-music]', (el) => {
    musicStyle = el.dataset.music as MusicPick;
    store.set('music', musicStyle);
    music.setStyle(musicStyle === 'misto' ? randomStyle() : musicStyle);
    fans();
  });
  const pick = (i: 0 | 1, c: string) => {
    const h: [string, string] = heart ? [...heart] as [string, string] : ['#111111', '#ffffff'];
    h[i] = c;
    heart = h;
    store.set('heart', JSON.stringify(heart));
    pitch.setAtmosphere(atmo());
    fans();
  };
  on('[data-h0]', (el) => pick(0, el.dataset.h0!));
  on('[data-h1]', (el) => pick(1, el.dataset.h1!));
  on('[data-heart]', () => { heart = null; store.set('heart', 'null'); pitch.setAtmosphere(atmo()); fans(); });
  on('[data-go=back]', home);
}

// ---------- Meu craque ----------

function builder() {
  run++;
  hud.classList.add('hidden');
  const draft = { ...look };
  const keeperPreview = false;
  const refresh = () => pitch.showcase(resolveLook(draft), myKit(), keeperPreview);
  const swatches = (key: 'skin' | 'hair' | 'boots', colors: string[]) =>
    `<div class="swatches">${colors.map((c, i) => `<button class="sw${draft[key] === i ? ' on' : ''}" data-${key}="${i}" style="background:${c}" aria-label="${i + 1}"></button>`).join('')}</div>`;
  const render = () => {
    // redesenhar não pode jogar a tela para o topo a cada toque
    const keepY = ui.querySelector('.screen')?.scrollTop ?? 0;
    show(`
      <h2>${t('myPlayer')}</h2>
      <div class="builder card">
        <b>${t('playerKind')}</b><div class="seg"><button data-kind2="boy" class="${draft.female ? '' : 'on'}">${t('kind_boy')}</button><button data-kind2="girl" class="${draft.female ? 'on' : ''}">${t('kind_girl')}</button></div>
        <b>${t('skin')}</b>${swatches('skin', SKIN_COLORS)}
        <b>${t('hairStyle')}</b><div class="seg wrap">${HAIR_STYLES.map((h) => `<button data-style="${h}" class="${draft.style === h ? 'on' : ''}">${t(('hs_' + h) as UiKey)}</button>`).join('')}</div>
        <b>${t('hairColor')}</b>${swatches('hair', HAIR_COLORS)}
        <b>${t('boots')}</b>${swatches('boots', BOOT_COLORS)}
        <b>${t('body')}</b><div class="seg wrap">${[...BUILDS, 'random' as const].map((b) => `<button data-build="${b}" class="${(draft.build ?? 'normal') === b ? 'on' : ''}">${t(('body_' + b) as UiKey)}</button>`).join('')}</div>
        <b>${t('celebration')}</b><div class="seg wrap">${[...CELEBRATIONS, 'random' as const].map((c) => `<button data-cel="${c}" class="${draft.cel === c ? 'on' : ''}">${t(('cel_' + c) as UiKey)}</button>`).join('')}</div>
        <div class="row">
          <div><b>${t('number')}</b><input id="pnum" class="numin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${draft.number}" autocomplete="off" aria-label="${t('number')}"></div>
          <div><b>${t('playerName')}</b><input id="pname" maxlength="10" value="${esc(draft.name)}" autocomplete="off"></div>
        </div>
      </div>
      <button class="btn big" data-go="save">${t('saveLook')}</button>
      <button class="btn alt" data-go="back">${t('back')}</button>
    `, false);
    const screen = ui.querySelector('.screen')!;
    screen.classList.add('bottom');
    screen.scrollTop = keepY;
    on('[data-skin]', (el) => { draft.skin = Number(el.dataset.skin); render(); });
    on('[data-hair]', (el) => { draft.hair = Number(el.dataset.hair); render(); });
    on('[data-boots]', (el) => { draft.boots = Number(el.dataset.boots); render(); pitch.showBoots(); });
    on('[data-style]', (el) => { draft.style = el.dataset.style as Look['style']; render(); });
    // jogadora: troca o rosto e, se o cabelo for curto, já sugere um rabo de cavalo (dá para trocar depois)
    on('[data-kind2]', (el) => {
      const girl = el.dataset.kind2 === 'girl';
      if (girl && !draft.female && (draft.style === 'short' || draft.style === 'mohawk' || draft.style === 'bald')) draft.style = 'ponytail';
      if (!girl && draft.female && (draft.style === 'ponytail' || draft.style === 'buns')) draft.style = 'short';
      draft.female = girl;
      render();
    });
    // escolher a comemoração mostra ela no boneco da vitrine
    on('[data-cel]', (el) => { draft.cel = el.dataset.cel as CelChoice; render(); pitch.kickerCelebration = celFor(draft.cel); pitch.celebrateShowcase(); });
    // aleatório: a vitrine mostra um tipo sorteado a cada toque (no jogo, um por partida)
    on('[data-build]', (el) => { draft.build = el.dataset.build as BuildChoice; if (draft.build === 'random') rollBuild(); render(); });
    // número da camisa: a criança digita (1 a 99), sem redesenhar a tela
    const num = $('pnum') as HTMLInputElement;
    const readNum = () => {
      const n = Number(num.value.replace(/\D/g, ''));
      if (n >= 1 && n <= 99) { draft.number = n; return true; }
      return false;
    };
    num.addEventListener('focus', () => num.select());
    num.addEventListener('input', () => {
      num.value = num.value.replace(/\D/g, '').slice(0, 2);
      if (readNum()) refresh();
    });
    num.addEventListener('blur', () => { if (!readNum()) num.value = String(draft.number); });
    const input = $('pname') as HTMLInputElement;
    input.addEventListener('change', () => { draft.name = input.value.trim().slice(0, 10); refresh(); });
    on('[data-go=save]', () => {
      draft.name = input.value.trim().slice(0, 10);
      readNum();
      look = draft;
      store.set('look', JSON.stringify(look));
      pitch.womens = !!look.female;
      home();
    });
    on('[data-go=back]', home);
    refresh();
  };
  render();
}

// ---------- versão completa (compra protegida pela trava dos pais) ----------

function unlock(back: () => void, msg = '') {
  const price = shop.price();
  show(`
    <div class="card unlock">
      <h2>${t('unlockTitle')}</h2>
      <p>${t('unlockText')}</p>
      <ul>${(['unlock1', 'unlock2', 'unlock3', 'unlock4'] as UiKey[]).map((k) => `<li>${t(k)}</li>`).join('')}</ul>
      <p class="msg">${esc(msg)}</p>
    </div>
    <button class="btn big gold" data-go="buy">${t('unlockBuy')}${price ? ` · ${esc(price)}` : ''}</button>
    <button class="btn alt" data-go="restore">${t('unlockRestore')}</button>
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  on('[data-go=back]', back);
  on('[data-go=buy]', () => parentGate(async () => {
    busy(true);
    const r = await shop.buy();
    if (r === 'ok') { confetti(); unlockedNow(back); } else unlock(back, r === 'error' ? `${t('purchaseFail')}${shop.lastError() ? ` (${shop.lastError()})` : ''}` : '');
  }));
  on('[data-go=restore]', () => parentGate(async () => {
    busy(true);
    if (await shop.restore()) unlockedNow(back); else unlock(back, t('restoreNone'));
  }));
}
function busy(on: boolean) { ui.querySelectorAll<HTMLButtonElement>('.btn').forEach((b) => { b.disabled = on; }); }
function unlockedNow(back: () => void) {
  show(`${resultCard('⭐', 'unlocked', '')}<button class="btn big" data-go="ok">OK</button>`);
  on('[data-go=ok]', back);
}

// ---------- trava para adultos (compras e links para fora do jogo) ----------

const ESCONDE = {
  ios: 'https://apps.apple.com/app/id6819893974',
  android: 'https://play.google.com/store/apps/details?id=com.arial.escondeesconde',
};

function parentGate(ok: () => void) {
  const a = 6 + Math.floor(rng() * 4);
  const b = 6 + Math.floor(rng() * 4);
  const right = a * b;
  const opts = [right, right + a, right - b].sort(() => rng() - 0.5);
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="card"><h2>🔒 ${t('gateTitle')}</h2><p>${t('gateText', { a, b })}</p>
    <div class="answers">${opts.map((o) => `<button class="btn alt" data-a="${o}">${o}</button>`).join('')}</div>
    <p class="msg"></p>
    <button class="btn alt" data-x>${t('cancel')}</button></div>`;
  document.body.appendChild(m);
  m.querySelector('[data-x]')!.addEventListener('click', () => m.remove());
  m.querySelectorAll<HTMLElement>('[data-a]').forEach((el) => el.addEventListener('click', () => {
    if (Number(el.dataset.a) !== right) { m.querySelector('.msg')!.textContent = t('wrong'); setTimeout(() => m.remove(), 1500); return; }
    m.remove();
    ok();
  }));
}

// compra restaurada ao abrir o app: atualiza a tela inicial (sem interromper uma partida)
shop.onChange(() => { if (ui.querySelector('.logo')) home(); });
void shop.init();
void gc.start(progress.stickers.filter((id) => findSticker(id)?.base), progress.goals);
home();

// ganchos para os testes automáticos
(window as unknown as { __gol: object }).__gol = { pitch, home };
