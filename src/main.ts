/* Gol de Placa: menus e fluxo das partidas (pênalti, falta, disputa e copa). */
import './style.css';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { LANGS, detectLang, fmt, type CallKey, type Lang, type UiKey } from './game/i18n';
import { allTeams, findTeam, teamName, type Team } from './game/teams';
import {
  PENALTY_Z, aimResult, cpuKeeperTarget, cpuSaves, cpuShot, flightTime, freeKickSpot, isTopCorner, placeWall,
  playerSaves, shootoutWinner, shotFromSwipe, wallHit,
  type Difficulty, type Kind, type Outcome, type Shootout, type Wall,
} from './game/physics';
import { Pitch } from './game/scene';
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
let teamKind = store.get('teamKind', 'nation') as 'nation' | 'club';
let myTeam: Team = findTeam(store.get('team', 'BR'));
audio.setSound(sound);
audio.setNarration(narration);

const t = (k: UiKey, vars?: Record<string, string | number>) => fmt(LANGS[lang].ui[k], vars);
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

document.documentElement.lang = LANGS[lang].voice;
pitch.setup({ sx: 0, sz: PENALTY_Z, view: 'kick', kickerKit: myTeam.kit, keeperKit: findTeam('AR').kit, wall: null, seed: 1 });

// Cada partida tem um número; ao sair para o menu, as esperas antigas são abandonadas.
let run = 0;
class Quit extends Error {}
const guard = (id: number) => { if (id !== run) throw new Quit(); };

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

// ---------- telas ----------

function home() {
  run++;
  hud.classList.add('hidden'); hint.classList.add('hidden'); callEl.classList.add('hidden'); touch.classList.add('hidden');
  const langs = (Object.keys(LANGS) as Lang[]).map((l) => `<option value="${l}"${l === lang ? ' selected' : ''}>${LANGS[l].name}</option>`).join('');
  show(`
    <div class="logo"><span class="ball">⚽</span><h1>GOL DE<br>PLACA</h1><p>${t('tagline')}</p></div>
    <button class="btn big" data-go="play">${t('play')}</button>
    <div class="card">
      <label class="set">🌐 ${t('language')} <select id="lang">${langs}</select></label>
      <label class="set">${t('sound')} <button class="toggle${sound ? ' on' : ''}" data-tg="sound">${sound ? 'ON' : 'OFF'}</button></label>
      <label class="set">${t('narration')} <button class="toggle${narration ? ' on' : ''}" data-tg="narration">${narration ? 'ON' : 'OFF'}</button></label>
    </div>
    <button class="promo" data-go="promo"><span class="e">🙈</span><span><b>${t('promoTitle')}</b><span>${t('promoText')}</span></span></button>
  `);
  on('[data-go=play]', modes);
  on('[data-go=promo]', parentGate);
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

type Mode = 'penalty' | 'free' | 'shootout' | 'cup';

function modes() {
  show(`
    <h2>${t('modeTitle')}</h2>
    ${(['penalty', 'free', 'shootout', 'cup'] as Mode[]).map((m) =>
      `<button class="mode" data-mode="${m}"><b>${t(m)}</b><span>${t((m + 'Desc') as UiKey)}</span></button>`).join('')}
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  on('[data-go=back]', home);
  on('[data-mode]', (el) => {
    const m = el.dataset.mode as Mode;
    if (m === 'penalty' || m === 'free') role(m); else teams(m, 'kicker');
  });
}

function role(m: 'penalty' | 'free') {
  show(`
    <h2>${t(m)}</h2>
    <p style="text-align:center;margin:0;font-weight:700">${t('roleTitle')}</p>
    <button class="btn big" data-role="kicker">${t('kicker')}</button>
    <button class="btn big" data-role="keeper">${t('keeper')}</button>
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  on('[data-go=back]', modes);
  on('[data-role]', (el) => teams(m, el.dataset.role as 'kicker' | 'keeper'));
}

function teams(m: Mode, r: 'kicker' | 'keeper') {
  const list = allTeams(teamKind);
  if (myTeam.kind !== teamKind) myTeam = list[0];
  show(`
    <h2>${t('teamTitle')}</h2>
    <div class="seg">
      <button data-kind="nation" class="${teamKind === 'nation' ? 'on' : ''}">${t('nations')}</button>
      <button data-kind="club" class="${teamKind === 'club' ? 'on' : ''}">${t('clubs')}</button>
    </div>
    <div class="teams">${list.map((x) => `
      <button class="team${x.id === myTeam.id ? ' on' : ''}" data-team="${x.id}">
        <span class="b">${x.badge}</span><span class="kit" style="background:${x.kit.shirt};box-shadow:inset 0 -3px 0 ${x.kit.shorts}"></span>
        <span class="n">${teamName(x, lang)}</span></button>`).join('')}
    </div>
    <div class="card"><b style="text-align:center">${t('difficulty')}</b>
      <div class="seg">${(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => `<button data-diff="${d}" class="${d === diff ? 'on' : ''}">${t(d)}</button>`).join('')}</div>
    </div>
    <button class="btn big" data-go="start">${t('start')}</button>
    <button class="btn alt" data-go="back">${t('back')}</button>
  `);
  on('[data-kind]', (el) => { teamKind = el.dataset.kind as 'nation' | 'club'; store.set('teamKind', teamKind); teams(m, r); });
  on('[data-team]', (el) => { myTeam = findTeam(el.dataset.team!); store.set('team', myTeam.id); teams(m, r); });
  on('[data-diff]', (el) => { diff = el.dataset.diff as Difficulty; store.set('diff', diff); teams(m, r); });
  on('[data-go=back]', () => (m === 'penalty' || m === 'free' ? role(m) : modes()));
  on('[data-go=start]', () => {
    hideUi();
    const id = ++run;
    const go = m === 'cup' ? cup(id) : m === 'shootout' ? shootout(id, pickOpponent()).then((w) => shootoutEnd(id, w)) : training(id, m, r);
    go.catch((e) => { if (!(e instanceof Quit)) throw e; });
  });
}

function pickOpponent(exclude: string[] = []): Team {
  const list = allTeams(teamKind).filter((x) => x.id !== myTeam.id && !exclude.includes(x.id));
  return list[Math.floor(rng() * list.length)];
}

// ---------- placar ----------

interface Row { team: Team; marks: (boolean | null)[]; total?: number }
function board(rows: Row[], slots = 5) {
  hud.classList.remove('hidden');
  hud.innerHTML = `<button class="quit" aria-label="${t('menu')}">✕</button><div class="board">${rows.map((r) => {
    const n = Math.max(slots, r.marks.length);
    const dots = Array.from({ length: n }, (_, i) => `<span class="dot${r.marks[i] === true ? ' g' : r.marks[i] === false ? ' m' : ''}"></span>`).join('');
    const score = r.marks.filter(Boolean).length;
    return `<div class="line"><span class="t">${r.team.badge}</span><span class="nm">${teamName(r.team, lang)}</span><span class="dots">${dots}</span><span class="sc">${score}</span></div>`;
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
  pitch.setup({ sx, sz, view: 'kick', kickerKit: myTeam.kit, keeperKit: opp.kit, wall, seed: Math.floor(rng() * 100) });
  showHint(t('yourKick'), firstKick ? t('howKick') : '');
  audio.whistle();
  let shot = null;
  while (!shot) {
    const sw = await waitSwipe(id);
    guard(id);
    shot = shotFromSwipe({ ...sw, screenH: innerHeight }, sx, sz, kind);
  }
  firstKick = false;
  hint.classList.add('hidden');
  const aim = aimResult(shot, wall);
  const keeperAt = cpuKeeperTarget(shot, kind, diff, rng);
  const s = shot;
  const outcome = await pitch.play({
    shot: s, runUp: 0.35, wallU: wallHit(s, wall), cpuKeeper: keeperAt,
    decide: () => (aim !== 'target' ? aim : cpuSaves(s, keeperAt, diff) ? 'save' : 'goal'),
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
  pitch.setup({ sx, sz, view: 'keep', kickerKit: opp.kit, keeperKit: myTeam.kit, wall, seed: Math.floor(rng() * 100) });
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
  const onTap = (e: PointerEvent) => {
    if (!t0 || tap) return;
    const p = pitch.goalPointAt(e.clientX, e.clientY);
    if (!p) return;
    const at = (performance.now() - t0) / 1000;
    tap = { ...p, t: at };
    pitch.keeperDive(p.x, p.y, Math.max(0.12, Math.min(0.35, T - at)));
  };
  touch.classList.remove('hidden');
  touch.addEventListener('pointerdown', onTap);
  try {
    const outcome = await pitch.play({
      shot, runUp: 0.9, wallU: wallHit(shot, wall), cpuKeeper: null,
      decide: () => {
        const aim = aimResult(shot, wall);
        return aim !== 'target' ? aim : playerSaves(shot, tap, diff, kind) ? 'save' : 'goal';
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

// ---------- modos ----------

async function training(id: number, kind: Kind, r: 'kicker' | 'keeper') {
  const opp = pickOpponent();
  const marks: (boolean | null)[] = [];
  for (let i = 0; i < 5; i++) {
    board([{ team: myTeam, marks }]);
    const { sx, sz, wall } = spotFor(kind);
    const ok = r === 'kicker' ? await myKick(id, kind, sx, sz, wall, opp) : !(await myKeep(id, kind, sx, sz, wall, opp));
    marks.push(ok);
  }
  board([{ team: myTeam, marks }]);
  const n = marks.filter(Boolean).length;
  const stars = n >= 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
  if (stars === 3) confetti();
  audio.call(lang, n >= 3 ? 'win' : 'lose');
  show(`
    <div class="result card">
      <div class="big">${r === 'kicker' ? '⚽' : '🧤'}</div>
      <h2>${t(n >= 3 ? 'win' : 'lose')}</h2>
      <div class="score">${t('trainingResult', { n, t: 5 })} ${t(r === 'kicker' ? 'goals' : 'saves')}</div>
      <div class="stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
    </div>
    <button class="btn big" data-go="again">${t('again')}</button>
    <button class="btn alt" data-go="menu">${t('menu')}</button>
  `, false);
  on('[data-go=again]', () => { hideUi(); const nid = ++run; training(nid, kind, r).catch((e) => { if (!(e instanceof Quit)) throw e; }); });
  on('[data-go=menu]', home);
}

/** Disputa de pênaltis: o jogador bate e defende, alternando. Devolve true se venceu. */
async function shootout(id: number, opp: Team, title?: string): Promise<boolean> {
  const so: Shootout = { a: [], b: [] };
  let sudden = false;
  if (title) { showCall('goal', true, 'ready'); callEl.innerHTML = `<b>${title}</b><span>${myTeam.badge} × ${opp.badge}</span>`; await sleep(1800); guard(id); callEl.classList.add('hidden'); }
  for (;;) {
    board([{ team: myTeam, marks: so.a }, { team: opp, marks: so.b }]);
    so.a.push(await myKick(id, 'penalty', 0, PENALTY_Z, null, opp));
    board([{ team: myTeam, marks: so.a }, { team: opp, marks: so.b }]);
    let w = shootoutWinner(so);
    if (w) return w === 'a';
    so.b.push(await myKeep(id, 'penalty', 0, PENALTY_Z, null, opp));
    board([{ team: myTeam, marks: so.a }, { team: opp, marks: so.b }]);
    w = shootoutWinner(so);
    if (w) return w === 'a';
    if (!sudden && so.a.length >= 5) {
      sudden = true;
      callEl.innerHTML = `<b>${t('sudden')}</b><span>${audio.call(lang, 'sudden')}</span>`;
      callEl.classList.remove('hidden');
      await sleep(1800); guard(id);
      callEl.classList.add('hidden');
    }
  }
}

function shootoutEnd(id: number, won: boolean) {
  guard(id);
  if (won) confetti();
  audio.call(lang, won ? 'win' : 'lose');
  show(`
    <div class="result card"><div class="big">${won ? '🎉' : '😢'}</div><h2>${t(won ? 'win' : 'lose')}</h2></div>
    <button class="btn big" data-go="again">${t('again')}</button>
    <button class="btn alt" data-go="menu">${t('menu')}</button>
  `, false);
  on('[data-go=again]', () => { hideUi(); const nid = ++run; shootout(nid, pickOpponent()).then((w) => shootoutEnd(nid, w)).catch((e) => { if (!(e instanceof Quit)) throw e; }); });
  on('[data-go=menu]', home);
}

async function cup(id: number) {
  const used: string[] = [];
  const rounds: UiKey[] = ['quarter', 'semi', 'final'];
  for (let i = 0; i < rounds.length; i++) {
    const opp = pickOpponent(used);
    used.push(opp.id);
    const won = await shootout(id, opp, t(rounds[i]));
    guard(id);
    if (!won) {
      audio.call(lang, 'lose');
      show(`
        <div class="result card"><div class="big">😢</div><h2>${t('eliminated')}</h2><div class="score">${t(rounds[i])}</div></div>
        <button class="btn big" data-go="again">${t('again')}</button>
        <button class="btn alt" data-go="menu">${t('menu')}</button>
      `, false);
      on('[data-go=again]', () => { hideUi(); const nid = ++run; cup(nid).catch((e) => { if (!(e instanceof Quit)) throw e; }); });
      on('[data-go=menu]', home);
      return;
    }
    if (i < rounds.length - 1) {
      await new Promise<void>((next) => {
        show(`
          <div class="result card"><div class="big">🎉</div><h2>${t('win')}</h2><div class="score">${myTeam.badge} → ${t(rounds[i + 1])}</div></div>
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
    <div class="result card"><div class="big">🏆</div><h2>${t('champion')}</h2><div class="score">${myTeam.badge} ${teamName(myTeam, lang)}</div></div>
    <button class="btn big" data-go="again">${t('again')}</button>
    <button class="btn alt" data-go="menu">${t('menu')}</button>
  `, false);
  on('[data-go=again]', () => { hideUi(); const nid = ++run; cup(nid).catch((e) => { if (!(e instanceof Quit)) throw e; }); });
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

// ---------- propaganda do Esconde-Esconde (com trava para adultos) ----------

const ESCONDE = {
  ios: 'https://apps.apple.com/app/id6819893974',
  android: 'https://play.google.com/store/apps/details?id=com.arial.escondeesconde',
};

function parentGate() {
  const a = 6 + Math.floor(rng() * 4);
  const b = 6 + Math.floor(rng() * 4);
  const right = a * b;
  const opts = [right, right + a, right - b].sort(() => rng() - 0.5);
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="card"><h2>🔒 ${t('gateTitle')}</h2><p>${t('gateText', { a, b })}</p>
    <div class="answers">${opts.map((o) => `<button class="btn alt" data-a="${o}">${o}</button>`).join('')}</div>
    <p class="msg" style="min-height:1.3em;margin:0;color:var(--red)"></p>
    <button class="btn alt" data-x>${t('cancel')}</button></div>`;
  document.body.appendChild(m);
  m.querySelector('[data-x]')!.addEventListener('click', () => m.remove());
  m.querySelectorAll<HTMLElement>('[data-a]').forEach((el) => el.addEventListener('click', () => {
    if (Number(el.dataset.a) !== right) { m.querySelector('.msg')!.textContent = t('wrong'); setTimeout(() => m.remove(), 900); return; }
    m.remove();
    window.open(Capacitor.getPlatform() === 'android' ? ESCONDE.android : ESCONDE.ios, '_blank');
  }));
}

home();

// ganchos para os testes automáticos
(window as unknown as { __gol: object }).__gol = { pitch, home };
