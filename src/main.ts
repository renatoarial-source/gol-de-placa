/* Gol de Placa: menus e fluxo das partidas.
 * Em cada partida a criança é só batedor OU só goleiro: um duelo de 5 cobranças contra a máquina.
 */
import './style.css';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { LANGS, detectLang, fmt, uiText, type CallKey, type Lang, type UiKey } from './game/i18n';
import { allTeams, findTeam, teamName, type Team } from './game/teams';
import {
  GOAL_H, GROUND_SHOT, HALF, PENALTY_Z, aimResult, cpuKeeperTarget, cpuSaves, cpuShot, flightTime, freeKickSpot, isTopCorner, placeWall,
  playerSaves, shootoutWinner, shotFromSwipe, wallHit,
  type Difficulty, type Kind, type Outcome, type Shootout, type Wall,
} from './game/physics';
import { BOOT_COLORS, CELEBRATIONS, HAIR_COLORS, HAIR_STYLES, Pitch, SKIN_COLORS, type Celebration, type Crowd, type Look, type Weather } from './game/scene';
import { STICKERS, apply as applyProgress, emptyState, ensureDay, needOf, type Ev, type State as ProgressState } from './game/progress';
import { FREE_TEAM, store as shop } from './game/store';
import * as audio from './game/audio';
import { onMatchFinished } from './game/rating';
import { MUSIC_STYLES, music, type MusicStyle } from './game/music';

// ---------- preferências ----------
const store = {
  get(k: string, d: string) { try { return localStorage.getItem('gol.' + k) ?? d; } catch { return d; } },
  set(k: string, v: string) { try { localStorage.setItem('gol.' + k, v); } catch { /* sem armazenamento */ } },
};
let lang = store.get('lang', detectLang()) as Lang;
if (!(lang in LANGS)) lang = 'pt';
let sound = store.get('sound', '1') === '1';
let voice = store.get('voice', store.get('narration', '1') === '0' ? 'off' : 'male') as audio.Voice;
let diff = store.get('diff', 'easy') as Difficulty;
let weather = store.get('weather', 'day') as Weather;
let crowd = store.get('crowd', 'full') as Crowd;
let keeperCam = store.get('keeperCam', 'goal') as 'goal' | 'kicker';
let musicStyle = store.get('music', 'batucada') as MusicStyle;
/** Cores do time do coração (só cores, sem nome de clube), ou null. */
const HEART_COLORS = ['#111111', '#ffffff', '#d50000', '#0d47a1', '#1b8a3a', '#ffd400', '#7b1f2e', '#ff6d00', '#6a1b9a', '#64b5f6'];
let heart: [string, string] | null = (() => { try { const h = JSON.parse(store.get('heart', 'null')); return Array.isArray(h) ? h as [string, string] : null; } catch { return null; } })();
music.setStyle(musicStyle);
// narração gravada: carrega as falas do idioma/voz e abaixa a música quando o narrador fala
audio.whenAudioReady(() => audio.preloadVoice(lang));
audio.onSpeak((secs) => music.duck(secs));
let teamKind = store.get('teamKind', 'club') as 'nation' | 'club';
let myTeam: Team = findTeam(store.get('team', FREE_TEAM));
const DEFAULT_LOOK: Look & { cel: Celebration } = { skin: 1, hair: 0, style: 'short', boots: 2, number: 10, name: '', cel: 'jump' };
let look: Look & { cel: Celebration } = (() => { try { return { ...DEFAULT_LOOK, ...JSON.parse(store.get('look', '{}')) }; } catch { return DEFAULT_LOOK; } })();
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
/** Registra um acontecimento: guarda, mostra figurinhas novas e desafios completados. */
function track(ev: Ev) {
  freshProgress();
  const r = applyProgress(progress, ev);
  progress = r.s;
  store.set('progress', JSON.stringify(progress));
  for (const id of r.done) toast('📅', t('dailyDone'), t(('ch_' + id) as UiKey, { n: needOf(id) }));
  for (const id of r.stickers) toast(STICKERS.find((x) => x.id === id)!.e, t('newSticker'), t(('st_' + id) as UiKey));
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
  const teams = [myTeam.kit.shirt, opp?.kit.shirt ?? '#ffffff'];
  return {
    weather, crowd,
    colors: heart ? [...heart, ...heart, ...heart, ...teams] : teams,
    flag: heart ?? [myTeam.kit.shirt, myTeam.kit.shorts] as [string, string],
  };
}

/** Sem a versão completa, só o time do download e o boneco padrão. */
const unlocked = () => shop.isUnlocked();
const myLook = () => (unlocked() ? look : undefined);
function enforceFree() {
  if (!unlocked()) { myTeam = findTeam(FREE_TEAM); teamKind = 'club'; }
}

document.documentElement.lang = LANGS[lang].voice;
enforceFree();
pitch.setAtmosphere(atmo());
pitch.setup({ sx: 0, sz: PENALTY_Z, view: 'kick', kickerKit: myTeam.kit, keeperKit: findTeam('lions').kit, wall: null, seed: 1, look: myLook() });

// Cada partida tem um número; ao sair para o menu, as esperas antigas são abandonadas.
let run = 0;
class Quit extends Error {}
const guard = (id: number) => { if (id !== run) throw new Quit(); };
const quiet = (p: Promise<unknown>) => p.catch((e) => { if (!(e instanceof Quit)) throw e; });

function haptic(strong: boolean) {
  if (native) void Haptics.impact({ style: strong ? ImpactStyle.Heavy : ImpactStyle.Light }).catch(() => {});
}

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
      return `<div class="sticker${has ? ' has' : ''}"><span class="se">${has ? st.e : '❔'}</span><span class="sn">${t(('st_' + st.id) as UiKey)}</span></div>`;
    }).join('')}</div>
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  on('[data-go=back]', home);
}

function home() {
  run++;
  music.setIntensity(0.35);
  enforceFree();
  hud.classList.add('hidden'); hint.classList.add('hidden'); callEl.classList.add('hidden'); touch.classList.add('hidden');
  pitch.setup({ sx: 0, sz: PENALTY_Z, view: 'kick', kickerKit: myTeam.kit, keeperKit: findTeam('lions').kit, wall: null, seed: 1, look: myLook() });
  const langs = (Object.keys(LANGS) as Lang[]).map((l) => `<option value="${l}"${l === lang ? ' selected' : ''}>${LANGS[l].name}</option>`).join('');
  show(`
    <div class="logo"><span class="ball">⚽</span><h1>GOL DE<br>PLACA</h1><p>${t('tagline')}</p></div>
    <button class="btn big" data-go="play">${t('play')}</button>
    <div class="row">
      <button class="btn alt" data-go="player">${t('myPlayer')}${lock(!unlocked())}</button>
      <button class="btn alt" data-go="fans">${t('fanTitle')}</button>
    </div>
    <button class="btn alt" data-go="album">${t('album')} · ${progress.stickers.length}/${STICKERS.length}</button>
    ${dailyCard()}
    ${unlocked() ? '' : `<button class="btn gold" data-go="full">${t('fullVersion')}</button>`}
    <div class="card">
      <label class="set">🌐 ${t('language')} <select id="lang">${langs}</select></label>
      <label class="set">${t('sound')} <button class="toggle${sound ? ' on' : ''}" data-tg="sound">${sound ? 'ON' : 'OFF'}</button></label>
      <b class="set-title">${t('narration')}</b>
      <div class="seg">${(['male', 'female', 'off'] as audio.Voice[]).map((v) =>
        `<button data-voice="${v}" class="${v === voice ? 'on' : ''}">${t(v === 'male' ? 'voiceMale' : v === 'female' ? 'voiceFemale' : 'voiceOff')}</button>`).join('')}</div>
    </div>
    <button class="promo" data-go="promo"><span class="e">🙈</span><span><b>${t('promoTitle')}</b><span>${t('promoText')}</span></span></button>
  `);
  on('[data-go=play]', modes);
  on('[data-go=player]', () => (unlocked() ? builder() : unlock(home)));
  on('[data-go=fans]', fans);
  on('[data-go=album]', album);
  on('[data-go=full]', () => unlock(home));
  on('[data-go=promo]', () => parentGate(() => window.open(Capacitor.getPlatform() === 'android' ? ESCONDE.android : ESCONDE.ios, '_blank')));
  on('[data-tg]', () => { sound = !sound; store.set('sound', sound ? '1' : '0'); audio.setSound(sound); home(); });
  on('[data-voice]', (el) => {
    voice = el.dataset.voice as audio.Voice;
    store.set('voice', voice);
    audio.setNarration(voice);
    audio.preloadVoice(lang);
    audio.call(lang, 'goal'); // amostra da voz escolhida
    home();
  });
  ($('lang') as HTMLSelectElement).addEventListener('change', (e) => {
    lang = (e.target as HTMLSelectElement).value as Lang;
    store.set('lang', lang);
    audio.preloadVoice(lang);
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
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  on('[data-go=back]', home);
  on('[data-go=duo]', () => (unlocked() ? duoSetup() : unlock(modes)));
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
  const seg = <T extends string>(name: string, opts: [T, UiKey][], cur: T) =>
    `<div class="seg">${opts.map(([v, k]) => `<button data-${name}="${v}" class="${v === cur ? 'on' : ''}">${t(k)}</button>`).join('')}</div>`;
  show(`
    <h2>${t('teamTitle')}</h2>
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
      <b>${t('weather')}</b>${seg<Weather>('weather', [['day', 'day'], ['night', 'night'], ['rain', 'rain'], ['snow', 'snow']], weather)}
      <b>${t('crowd')}</b>${seg<Crowd>('crowd', [['full', 'crowdFull'], ['half', 'crowdHalf'], ['few', 'crowdFew']], crowd)}
      ${r === 'keeper' || m === 'cup' ? `<b>${t('keeperCam')}</b>${seg<'goal' | 'kicker'>('cam', [['goal', 'camGoal'], ['kicker', 'camKicker']], keeperCam)}` : ''}
    </div>
    <p class="sub">${t(m === 'cup' ? 'cupInfo' : r === 'kicker' ? 'duelKick' : 'duelKeep')}</p>
    <button class="btn big" data-go="start">${t('start')}</button>
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  const again = () => match(m, r);
  on('[data-kind]', (el) => {
    if (!full) { if (el.dataset.kind === 'nation') unlock(again); return; }
    teamKind = el.dataset.kind as 'nation' | 'club'; store.set('teamKind', teamKind); again();
  });
  on('[data-team]', (el) => {
    if (!full && el.dataset.team !== FREE_TEAM) { unlock(again); return; }
    myTeam = findTeam(el.dataset.team!); store.set('team', myTeam.id); again();
  });
  on('[data-diff]', (el) => { diff = el.dataset.diff as Difficulty; store.set('diff', diff); again(); });
  on('[data-weather]', (el) => { weather = el.dataset.weather as Weather; store.set('weather', weather); again(); });
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
  const said = audio.call(lang, key);
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
  haptic(outcome === 'goal' || outcome === 'save');
}

/** No 2 jogadores, o goleiro escolhe antes onde vai pular (o batedor não vê). */
interface Duo { kicker: Team; keeper: Team; keeperAt: { x: number; y: number } }

/** O jogador bate. Devolve se foi gol. Com `duo`, o goleiro é a outra criança. */
async function myKick(id: number, kind: Kind, sx: number, sz: number, wall: Wall | null, opp: Team, duo?: Duo): Promise<boolean> {
  const kicker = duo?.kicker ?? myTeam;
  pitch.setup({ sx, sz, view: 'kick', kickerKit: kicker.kit, keeperKit: (duo?.keeper ?? opp).kit, wall, seed: Math.floor(rng() * 100), look: duo ? undefined : myLook() });
  pitch.kickerCelebration = !duo && unlocked() ? look.cel : 'jump';
  showHint(t('yourKick'), tutKick ? t('tutKick') : '');
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
  const outcome = await pitch.play({ ...play, onKick: audio.kick });
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
  pitch.setup({ sx, sz, view: 'keep', kickerKit: opp.kit, keeperKit: myTeam.kit, wall, seed: Math.floor(rng() * 100), look: myLook() });
  pitch.kickerCelebration = CELEBRATIONS[Math.floor(rng() * CELEBRATIONS.length)];
  showHint(t('yourKeep'), tutKeep ? t('tutKeep') : '');
  const unhand = tutKeep ? hand(pitch.screenOf(-(HALF - 0.8), 1.2, 0)) : () => {};
  music.setIntensity(0.75);
  await sleep(tutKeep ? 2200 : 900);
  guard(id);
  audio.call(lang, 'ready');
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
      onKick: audio.kick,
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
  track({ t: 'match', won, perfect: n === 5, role: r });
  onMatchFinished(won);
  if (won) confetti();
  audio.call(lang, won ? 'win' : 'lose');
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
  pitch.setAtmosphere(atmo(opp));
  const so: Shootout = { a: [], b: [] };
  const draw = () => board([{ team: myTeam, icon: '⚽', marks: so.a }, { team: opp, icon: '⚽', marks: so.b }]);
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
      callEl.innerHTML = `<b>${t('sudden')}</b><span>${audio.call(lang, 'sudden')}</span>`;
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
    if (won) track({ t: 'match', won, perfect: false, role: 'kicker' });
    guard(id);
    const score = `${myTeam.badge} ${ga} × ${gb} ${opp.badge}`;
    if (!won) {
      audio.call(lang, 'lose');
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
      audio.call(lang, 'win');
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
  audio.call(lang, 'champion');
  track({ t: 'cup', diff });
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

async function duoMatch(id: number) {
  const players = [
    { name: duoNames[0] || t('p1'), team: duoTeam1 },
    { name: duoNames[1] || t('p2'), team: duoTeam2 },
  ];
  pitch.setAtmosphere(atmo(duoTeam2));
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
  track({ t: 'twoPlayers' });
  onMatchFinished(true);
  const champ = players[winner === 'a' ? 0 : 1];
  confetti();
  audio.call(lang, 'champion');
  show(`
    ${resultCard('🏆', 'win', `${players[0].team.badge} ${so.a.filter(Boolean).length} × ${so.b.filter(Boolean).length} ${players[1].team.badge}`, `<h2>${esc(t('winnerIs', { name: champ.name }))}</h2>`)}
    <button class="btn big" data-go="again">${t('again')}</button>
    <button class="btn alt" data-go="menu">${t('menu')}</button>
  `, false);
  on('[data-go=again]', () => { hideUi(); const nid = ++run; void quiet(duoMatch(nid)); });
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
      <div class="seg wrap">${MUSIC_STYLES.map((m) => `<button data-music="${m}" class="${m === musicStyle ? 'on' : ''}">${t(('mus_' + m) as UiKey)}</button>`).join('')}</div>
    </div>
    <div class="card">
      <b>${t('heart')}</b>
      <button class="toggle${heart ? '' : ' on'}" data-heart="none">${t('heartNone')}</button>
      <b>${t('heart1')}</b>${swatches(0)}
      <b>${t('heart2')}</b>${swatches(1)}
      ${heart ? `<div class="flag" style="--a:${heart[0]};--b:${heart[1]}"></div>` : ''}
      <p class="voice-note">${t('heartInfo')}</p>
    </div>
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  on('[data-music]', (el) => {
    musicStyle = el.dataset.music as MusicStyle;
    store.set('music', musicStyle);
    music.setStyle(musicStyle);
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
  const refresh = () => pitch.showcase(draft, myTeam.kit, keeperPreview);
  const swatches = (key: 'skin' | 'hair' | 'boots', colors: string[]) =>
    `<div class="swatches">${colors.map((c, i) => `<button class="sw${draft[key] === i ? ' on' : ''}" data-${key}="${i}" style="background:${c}" aria-label="${i + 1}"></button>`).join('')}</div>`;
  const render = () => {
    show(`
      <h2>${t('myPlayer')}</h2>
      <div class="builder card">
        <b>${t('skin')}</b>${swatches('skin', SKIN_COLORS)}
        <b>${t('hairStyle')}</b><div class="seg wrap">${HAIR_STYLES.map((h) => `<button data-style="${h}" class="${draft.style === h ? 'on' : ''}">${t(('hs_' + h) as UiKey)}</button>`).join('')}</div>
        <b>${t('hairColor')}</b>${swatches('hair', HAIR_COLORS)}
        <b>${t('boots')}</b>${swatches('boots', BOOT_COLORS)}
        <b>${t('celebration')}</b><div class="seg wrap">${CELEBRATIONS.map((c) => `<button data-cel="${c}" class="${draft.cel === c ? 'on' : ''}">${t(('cel_' + c) as UiKey)}</button>`).join('')}</div>
        <div class="row">
          <div><b>${t('number')}</b><div class="num"><button data-n="-1">−</button><span>${draft.number}</span><button data-n="1">+</button></div></div>
          <div><b>${t('playerName')}</b><input id="pname" maxlength="10" value="${esc(draft.name)}" autocomplete="off"></div>
        </div>
      </div>
      <button class="btn big" data-go="save">${t('saveLook')}</button>
      <button class="btn alt" data-go="back">${t('back')}</button>
    `, false);
    ui.querySelector('.screen')!.classList.add('bottom');
    on('[data-skin]', (el) => { draft.skin = Number(el.dataset.skin); render(); });
    on('[data-hair]', (el) => { draft.hair = Number(el.dataset.hair); render(); });
    on('[data-boots]', (el) => { draft.boots = Number(el.dataset.boots); render(); });
    on('[data-style]', (el) => { draft.style = el.dataset.style as Look['style']; render(); });
    // escolher a comemoração mostra ela no boneco da vitrine
    on('[data-cel]', (el) => { draft.cel = el.dataset.cel as Celebration; render(); pitch.kickerCelebration = draft.cel; pitch.celebrateShowcase(); });
    on('[data-n]', (el) => { draft.number = ((draft.number - 1 + Number(el.dataset.n) + 99) % 99) + 1; render(); });
    const input = $('pname') as HTMLInputElement;
    input.addEventListener('change', () => { draft.name = input.value.trim().slice(0, 10); refresh(); });
    on('[data-go=save]', () => {
      draft.name = input.value.trim().slice(0, 10);
      look = draft;
      store.set('look', JSON.stringify(look));
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
    if (Number(el.dataset.a) !== right) { m.querySelector('.msg')!.textContent = t('wrong'); setTimeout(() => m.remove(), 900); return; }
    m.remove();
    ok();
  }));
}

// compra restaurada ao abrir o app: atualiza a tela inicial (sem interromper uma partida)
shop.onChange(() => { if (ui.querySelector('.logo')) home(); });
void shop.init();
home();

// ganchos para os testes automáticos
(window as unknown as { __gol: object }).__gol = { pitch, home };
