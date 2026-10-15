/* Física simplificada do chute e decisões da máquina (goleiro e batedor).
 * Coordenadas em metros: o gol fica em z = 0, centrado em x = 0; y é a altura.
 * A bola sai de (sx, 0, sz) e cruza a linha do gol em (tx, ty). O efeito (bend) e a
 * subida (loft) entortam o caminho no meio, sem mudar onde a bola chega.
 */

export const GOAL_W = 7.32;
export const GOAL_H = 2.44;
export const HALF = GOAL_W / 2;
export const BALL_R = 0.11;
export const POST_R = 0.06;
export const PENALTY_Z = 11;
export const WALL_DIST = 9.15;
export const WALL_H = 1.85;
export const WALL_JUMP = 0.35;
export const PLAYER_W = 0.5;

export type Kind = 'penalty' | 'free';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Outcome = 'goal' | 'save' | 'post' | 'wide' | 'over' | 'wall';

export interface Shot {
  sx: number; sz: number; // onde está a bola
  tx: number; ty: number; // onde ela cruza a linha do gol
  speed: number; // m/s
  bend: number; // desvio lateral máximo no meio do caminho (m)
  loft: number; // subida extra no meio do caminho (m)
}

export interface Wall { x: number; z: number; count: number; jumps: boolean }

export interface Vec3 { x: number; y: number; z: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function ballAt(s: Shot, u: number): Vec3 {
  const k = Math.sin(Math.PI * clamp(u, 0, 1));
  return {
    x: s.sx + (s.tx - s.sx) * u + s.bend * k,
    y: BALL_R + (s.ty - BALL_R) * u + s.loft * k,
    z: s.sz * (1 - u),
  };
}

export function distance(s: Shot): number {
  return Math.hypot(s.tx - s.sx, s.sz);
}

export function flightTime(s: Shot): number {
  return distance(s) / s.speed;
}

/** Onde está a barreira: entre a bola e a trave mais próxima, a 9,15 m da bola. */
export function placeWall(sx: number, sz: number, diff: Difficulty): Wall {
  // mira num ponto perto da trave mais próxima e fica a 9,15 m da bola nessa direção
  const ax = (sx >= 0 ? 1 : -1) * (HALF - 1.1);
  const d = Math.hypot(ax - sx, sz);
  const count = sz > 24 || Math.abs(sx) > 7 ? 3 : diff === 'hard' ? 5 : 4;
  return { x: sx + ((ax - sx) / d) * WALL_DIST, z: sz - (sz / d) * WALL_DIST, count, jumps: diff !== 'easy' };
}

/** Em que ponto do caminho (0..1) a bola bate na barreira, ou null se passa. */
export function wallHit(s: Shot, w: Wall | null): number | null {
  if (!w) return null;
  const u = 1 - w.z / s.sz;
  if (u <= 0 || u >= 1) return null;
  const p = ballAt(s, u);
  const half = (w.count * PLAYER_W) / 2 + BALL_R;
  const top = WALL_H + (w.jumps ? WALL_JUMP : 0) + BALL_R;
  return Math.abs(p.x - w.x) < half && p.y < top ? u : null;
}

/** Resultado sem contar o goleiro: barreira, trave, fora, por cima ou "no alvo". */
export function aimResult(s: Shot, w: Wall | null): Outcome | 'target' {
  if (wallHit(s, w) !== null) return 'wall';
  const ax = Math.abs(s.tx);
  if (s.ty > GOAL_H + POST_R + BALL_R) return 'over';
  if (ax > HALF + POST_R + BALL_R) return 'wide';
  if (ax > HALF - BALL_R) return 'post';
  if (s.ty > GOAL_H - BALL_R) return 'post'; // travessão
  return 'target';
}

/** Gol no ângulo: perto da trave e do travessão. */
export function isTopCorner(s: Shot): boolean {
  return Math.abs(s.tx) > HALF - 0.9 && s.ty > GOAL_H - 0.7;
}

// ---------- chute do jogador (deslizar o dedo) ----------

export interface Swipe {
  points: { x: number; y: number }[]; // em pixels, na ordem do toque
  ms: number; // duração
  screenH: number;
}

/** Transforma o gesto em chute. Retorna null se não foi um chute (gesto curto ou para baixo). */
export function shotFromSwipe(sw: Swipe, sx: number, sz: number, kind: Kind): Shot | null {
  const p0 = sw.points[0];
  const p1 = sw.points[sw.points.length - 1];
  if (!p0 || !p1) return null;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (dy > -sw.screenH * 0.06 || len < sw.screenH * 0.08) return null;

  // direção: o ângulo do gesto em relação à vertical, somado à direção do gol
  const angle = Math.atan2(dx, -dy);
  const base = Math.atan2(-sx, sz);
  const tx = sx + Math.tan(clamp(base + angle * 0.8, -1.2, 1.2)) * sz;

  // força: rapidez do gesto em "alturas de tela por segundo"
  const vn = (len / sw.screenH) / (Math.max(sw.ms, 60) / 1000);
  const ty = clamp(0.15 + (vn - 0.8) * 0.75, BALL_R, 4);
  const speed = clamp(14 + vn * 3.2, 14, kind === 'free' ? 30 : 28);

  // efeito: quanto o dedo "barrigou" para um dos lados
  let dev = 0;
  for (const p of sw.points) {
    const d = ((p.x - p0.x) * dy - (p.y - p0.y) * dx) / (len || 1);
    if (Math.abs(d) > Math.abs(dev)) dev = d;
  }
  const maxBend = kind === 'free' ? 3 : 1;
  const bend = clamp((-dev / sw.screenH) * 10, -maxBend, maxBend);
  const loft = kind === 'free' ? 1 + 0.5 * ty : 0.12 + 0.1 * ty;
  return { sx, sz, tx, ty, speed, bend, loft };
}

// ---------- máquina ----------

export type Rng = () => number;

const READ: Record<Difficulty, number> = { easy: 0.25, medium: 0.4, hard: 0.55 };
const REACH: Record<Difficulty, number> = { easy: 0.85, medium: 1.0, hard: 1.15 };

/** Para onde o goleiro da máquina pula. */
export function cpuKeeperTarget(s: Shot, kind: Kind, diff: Difficulty, rng: Rng): { x: number; y: number } {
  const read = READ[diff] * (kind === 'free' ? 0.8 : 1);
  if (rng() < read) return { x: clamp(s.tx + (rng() - 0.5) * 0.8, -HALF, HALF), y: clamp(s.ty + (rng() - 0.5) * 0.6, 0.2, GOAL_H) };
  const side = rng() < 0.18 ? 0 : rng() < 0.5 ? -1 : 1;
  return { x: side * (1.2 + rng() * 2.2), y: 0.3 + rng() * 1.7 };
}

/** O goleiro da máquina alcança a bola? */
export function cpuSaves(s: Shot, k: { x: number; y: number }, diff: Difficulty): boolean {
  let reach = REACH[diff] * clamp(1.3 - (s.speed - 16) / 30, 0.75, 1.3);
  if (isTopCorner(s)) reach *= 0.7;
  return Math.hypot(s.tx - k.x, s.ty - k.y) < reach;
}

const KICK_SPEED: Record<Difficulty, [number, number]> = { easy: [11, 13], medium: [15, 18], hard: [19, 23] };
const MISS: Record<Difficulty, number> = { easy: 0.15, medium: 0.1, hard: 0.06 };

/** Chute da máquina (quando o jogador é o goleiro). */
export function cpuShot(sx: number, sz: number, kind: Kind, diff: Difficulty, wall: Wall | null, rng: Rng): Shot {
  const [lo, hi] = KICK_SPEED[diff];
  const speed = (lo + rng() * (hi - lo)) * (kind === 'free' ? 1.35 : 1);
  const make = (): Shot => {
    const ty = 0.25 + rng() * 1.95;
    return {
      sx, sz, speed,
      tx: (rng() * 2 - 1) * (HALF - 0.35),
      ty,
      bend: kind === 'free' ? (rng() * 2 - 1) * 2.6 : (rng() * 2 - 1) * 0.5,
      loft: kind === 'free' ? 1 + 0.5 * ty : 0.12 + 0.1 * ty,
    };
  };
  if (rng() < MISS[diff]) {
    const s = make();
    if (rng() < 0.5) s.tx = Math.sign(s.tx || 1) * (HALF + 0.4 + rng() * 0.8);
    else s.ty = GOAL_H + 0.3 + rng() * 0.6;
    return s;
  }
  for (let i = 0; i < 40; i++) {
    const s = make();
    if (aimResult(s, wall) === 'target') return s;
  }
  return make();
}

/** O jogador (goleiro) pegou? Ele toca onde quer pular; precisa ser antes da bola chegar. */
export function playerSaves(s: Shot, tap: { x: number; y: number; t: number } | null, diff: Difficulty, kind: Kind): boolean {
  const T = flightTime(s);
  const reach = (diff === 'easy' ? 1.3 : diff === 'medium' ? 1.1 : 0.95) * (kind === 'free' ? 1.1 : 1);
  if (!tap || tap.t > T) return Math.hypot(s.tx, s.ty - 1) < 0.8; // ficou parado no meio
  // quanto mais cedo pular, mais longe chega; muito em cima da hora, alcança menos
  const late = clamp((T - tap.t) / T, 0, 1);
  return Math.hypot(s.tx - tap.x, s.ty - tap.y) < reach * (0.75 + 0.35 * late);
}

/** Posição de uma falta: fora da área, de 18 a 25 m. */
export function freeKickSpot(rng: Rng): { sx: number; sz: number } {
  const sz = 18 + rng() * 7;
  const sx = (rng() * 2 - 1) * 9;
  return { sx, sz };
}

/** Gerador pseudo-aleatório com semente (para testes reproduzíveis). */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
