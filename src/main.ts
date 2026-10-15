/* Gol de Placa: menus e fluxo das partidas.
 * Em cada partida a criança é só batedor OU só goleiro: um duelo de 5 cobranças contra a máquina.
 */
import './style.css';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { LANGS, detectLang, fmt, uiText, type CallKey, type Lang, type UiKey } from './game/i18n';
import { allTeams, findTeam, teamName, type Team } from './game/teams';
import {
  PENALTY_Z, aimResult, cpuKeeperTarget, cpuSaves, cpuShot, flightTime, freeKickSpot, isTopCorner, placeWall,
  playerSaves, shotFromSwipe, wallHit,
  type Difficulty, type Kind, type Outcome, type Wall,
} from './game/physics';
import { BOOT_COLORS, HAIR_COLORS, HAIR_STYLES, Pitch, SKIN_COLORS, type Crowd, type Look, type Weather } from './game/scene';
import { FREE_TEAM, store as shop } from './game/store';
import * as audio from './game/audio';

// ---------- preferências ----------
const store = {
  get(k: string, d: string) { try { return localStorage.getItem('gol.' + k) ?? d; } catch { return d; } },
  set(k: string, v: string) { try { localStorage.setItem('gol.' + k, v); } catch { /* sem armazenamento */ } },
};
let lang = store.get('lang', detectLang()) as Lang;
if (!(lang in LANGS)) lang = 'pt';
let sound = store.get('sound', '1') === '1';
let narration = store.get('narration', '1') === '1';
let diff = store.get('diff', 'easy') as Difficulty;
let weather = store.get('weather', 'day') as Weather;
let crowd = store.get('crowd', 'full') as Crowd;
let teamKind = store.get('teamKind', 'club') as 'nation' | 'club';
let myTeam: Team = findTeam(store.get('team', FREE_TEAM));
const DEFAULT_LOOK: Look = { skin: 1, hair: 0, style: 'short', boots: 2, number: 10, name: '' };
let look: Look = (() => { try { return { ...DEFAULT_LOOK, ...JSON.parse(store.get('look', '{}')) }; } catch { return DEFAULT_LOOK; } })();
audio.setSound(sound);
audio.setNarration(narration);

const t = (k: UiKey, vars?: Record<string, string | number>) => fmt(uiText(lang, k), vars);
const $ = (id: string) => document.getElementById(id)!;
const ui = $('ui');
const hud = $('hud');
const hint = $('hint');
const callEl = $('call');
const touch = $('touch');
const trail = $('trail') as HTMLCanvasElement;
const pitch = new Pitch($('pitch') as HTMLCanvasElement);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const native = Capacitor.isNativePlatform();
const rng = Math.random;
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Sem a versão completa, só o time do download e o boneco padrão. */
const unlocked = () => shop.isUnlocked();
const myLook = () => (unlocked() ? look : undefined);
function enforceFree() {
  if (!unlocked()) { myTeam = findTeam(FREE_TEAM); teamKind = 'club'; }
}

document.documentElement.lang = LANGS[lang].voice;
enforceFree();
pitch.setAtmosphere({ weather, crowd, colors: [myTeam.kit.shirt, '#ffffff'] });
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

function home() {
  run++;
  enforceFree();
  hud.classList.add('hidden'); hint.classList.add('hidden'); callEl.classList.add('hidden'); touch.classList.add('hidden');
  pitch.setup({ sx: 0, sz: PENALTY_Z, view: 'kick', kickerKit: myTeam.kit, keeperKit: findTeam('lions').kit, wall: null, seed: 1, look: myLook() });
  const langs = (Object.keys(LANGS) as Lang[]).map((l) => `<option value="${l}"${l === lang ? ' selected' : ''}>${LANGS[l].name}</option>`).join('');
  show(`
    <div class="logo"><span class="ball">⚽</span><h1>GOL DE<br>PLACA</h1><p>${t('tagline')}</p></div>
    <button class="btn big" data-go="play">${t('play')}</button>
    <button class="btn alt" data-go="player">${t('myPlayer')}${lock(!unlocked())}</button>
    ${unlocked() ? '' : `<button class="btn gold" data-go="full">${t('fullVersion')}</button>`}
    <div class="card">
      <label class="set">🌐 ${t('language')} <select id="lang">${langs}</select></label>
      <label class="set">${t('sound')} <button class="toggle${sound ? ' on' : ''}" data-tg="sound">${sound ? 'ON' : 'OFF'}</button></label>
      <label class="set">${t('narration')} <button class="toggle${narration ? ' on' : ''}" data-tg="narration">${narration ? 'ON' : 'OFF'}</button></label>
    </div>
    <button class="promo" data-go="promo"><span class="e">🙈</span><span><b>${t('promoTitle')}</b><span>${t('promoText')}</span></span></button>
  `);
  on('[data-go=play]', modes);
  on('[data-go=player]', () => (unlocked() ? builder() : unlock(home)));
  on('[data-go=full]', () => unlock(home));
  on('[data-go=promo]', () => parentGate(() => window.open(Capacitor.getPlatform() === 'android' ? ESCONDE.android : ESCONDE.ios, '_blank')));
  on('[data-tg]', (el) => {
    if (el.dataset.tg === 'sound') { sound = !sound; store.set('sound', sound ? '1' : '0'); audio.setSound(sound); }
    else { narration = !narration; store.set('narration', narration ? '1' : '0'); audio.setNarration(narration); }
    home();
  });
  ($('lang') as HTMLSelectElement).addEventListener('change', (e) => {
    lang = (e.target as HTMLSelectElement).value as Lang;
    store.set('lang', lang);
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
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  on('[data-go=back]', home);
  on('[data-mode]', (el) => {
    const m = el.dataset.mode as Mode;
    if (m === 'free' && !unlocked()) unlock(modes); else role(m);
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
    </div>
    <p class="sub">${t(r === 'kicker' ? 'duelKick' : 'duelKeep')}</p>
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
  on('[data-go=back]', () => role(m));
  on('[data-go=start]', () => {
    hideUi();
    const id = ++run;
    void quiet(m === 'cup' ? cup(id, r) : single(id, m, r));
  });
}

function pickOpponent(exclude: string[] = []): Team {
  const list = allTeams(teamKind).filter((x) => x.id !== myTeam.id && !exclude.includes(x.id));
  return list[Math.floor(rng() * list.length)];
}

// ---------- placar: batedor x goleiro ----------

interface Row { team: Team; icon: string; marks: boolean[] }
function board(rows: Row[], slots = 5) {
  hud.classList.remove('hidden');
  hud.innerHTML = `<button class="quit" aria-label="${t('menu')}">✕</button><div class="board">${rows.map((r) => {
    const dots = Array.from({ length: slots }, (_, i) => `<span class="dot${r.marks[i] === true ? ' g' : r.marks[i] === false ? ' m' : ''}"></span>`).join('');
    return `<div class="line"><span class="t">${r.team.badge}</span><span class="ic">${r.icon}</span><span class="nm">${teamName(r.team, lang)}</span><span class="dots">${dots}</span><span class="sc">${r.marks.filter(Boolean).length}</span></div>`;
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

let firstKick = true;
let firstKeep = true;

function react(outcome: Outcome, kickerIsMe: boolean, top: boolean) {
  const good = (outcome === 'goal') === kickerIsMe;
  const key: CallKey = outcome === 'goal' ? (top ? 'corner' : 'goal') : outcome;
  showCall(outcome, good, key);
  if (outcome === 'goal') { audio.net(); audio.crowd('cheer'); }
  else if (outcome === 'save') audio.crowd('clap');
  else if (outcome === 'post') { audio.post(); audio.crowd('ohh'); }
  else audio.crowd('ohh');
  haptic(outcome === 'goal' || outcome === 'save');
}

/** O jogador bate. Devolve se foi gol. */
async function myKick(id: number, kind: Kind, sx: number, sz: number, wall: Wall | null, opp: Team): Promise<boolean> {
  pitch.setup({ sx, sz, view: 'kick', kickerKit: myTeam.kit, keeperKit: opp.kit, wall, seed: Math.floor(rng() * 100), look: myLook() });
  showHint(t('yourKick'), firstKick ? t('howKick') : '');
  audio.whistle();
  let shot = null;
  while (!shot) {
    const sw = await waitSwipe(id);
    guard(id);
    // a bola vai para o ponto do gol onde o dedo terminou o gesto
    const end = sw.points[sw.points.length - 1];
    const aim = pitch.goalPointAt(end.x, end.y) ?? { x: 0, y: 5 };
    shot = shotFromSwipe({ ...sw, screenH: innerHeight }, sx, sz, kind, aim);
  }
  firstKick = false;
  hint.classList.add('hidden');
  const aim = aimResult(shot, wall);
  const keeperAt = cpuKeeperTarget(shot, kind, diff, rng);
  const s = shot;
  const saves = aim === 'target' && cpuSaves(s, keeperAt, diff);
  const outcome = await pitch.play({
    // quando defende, o goleiro vai na bola; quando não, pula onde tinha lido
    shot: s, runUp: 0.35, wallU: wallHit(s, wall), cpuKeeper: saves ? { x: s.tx, y: s.ty } : keeperAt,
    decide: () => (aim !== 'target' ? aim : saves ? 'save' : 'goal'),
    onKick: audio.kick,
  });
  guard(id);
  react(outcome, true, isTopCorner(s));
  await sleep(1700);
  guard(id);
  callEl.classList.add('hidden');
  return outcome === 'goal';
}

/** A máquina bate e o jogador defende tocando no gol. Devolve se a máquina fez gol. */
async function myKeep(id: number, kind: Kind, sx: number, sz: number, wall: Wall | null, opp: Team): Promise<boolean> {
  pitch.setup({ sx, sz, view: 'keep', kickerKit: opp.kit, keeperKit: myTeam.kit, wall, seed: Math.floor(rng() * 100), look: myLook() });
  showHint(t('yourKeep'), firstKeep ? t('howKeep') : '');
  firstKeep = false;
  await sleep(900);
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
    hint.classList.add('hidden');
    react(outcome, false, isTopCorner(shot));
    await sleep(1700);
    guard(id);
    callEl.classList.add('hidden');
    return outcome === 'goal';
  } finally {
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
  pitch.setAtmosphere({ weather, crowd, colors: [myTeam.kit.shirt, opp.kit.shirt] });
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

async function cup(id: number, r: Role) {
  const used: string[] = [];
  const rounds: UiKey[] = ['quarter', 'semi', 'final'];
  for (let i = 0; i < rounds.length; i++) {
    const opp = pickOpponent(used);
    used.push(opp.id);
    callEl.innerHTML = `<b>${t(rounds[i])}</b><span>${myTeam.badge} × ${opp.badge}</span>`;
    callEl.classList.remove('hidden');
    await sleep(1800); guard(id);
    callEl.classList.add('hidden');
    const n = await duel(id, 'penalty', r, opp);
    guard(id);
    if (n < 3) {
      audio.call(lang, 'lose');
      show(`
        ${resultCard('😢', 'eliminated', `${myTeam.badge} ${n} × ${5 - n} ${opp.badge}`, `<div class="sub">${t(rounds[i])}</div>`)}
        <button class="btn big" data-go="again">${t('again')}</button>
        <button class="btn alt" data-go="menu">${t('menu')}</button>
      `, false);
      on('[data-go=again]', () => { hideUi(); const nid = ++run; void quiet(cup(nid, r)); });
      on('[data-go=menu]', home);
      return;
    }
    if (i < rounds.length - 1) {
      audio.call(lang, 'win');
      await new Promise<void>((next) => {
        show(`
          ${resultCard('🎉', 'win', `${myTeam.badge} ${n} × ${5 - n} ${opp.badge}`, `<div class="sub">→ ${t(rounds[i + 1])}</div>`)}
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
  show(`
    ${resultCard('🏆', 'champion', `${myTeam.badge} ${teamName(myTeam, lang)}`)}
    <button class="btn big" data-go="again">${t('again')}</button>
    <button class="btn alt" data-go="menu">${t('menu')}</button>
  `, false);
  on('[data-go=again]', () => { hideUi(); const nid = ++run; void quiet(cup(nid, r)); });
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

// ---------- Meu craque ----------

function builder() {
  run++;
  hud.classList.add('hidden');
  const draft: Look = { ...look };
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
