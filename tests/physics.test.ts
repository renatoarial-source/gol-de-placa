import { describe, expect, it } from 'vitest';
import {
  BALL_R, HALF, PENALTY_Z, aimResult, apex, ballAt, cpuKeeperTarget, flightTime, isTopCorner, velocityAt, cpuSaves, cpuShot, placeWall, playerSaves,
  seeded, shootoutWinner, shotFromSwipe, wallHit, type Shot,
} from '../src/game/physics';

const H = 800;
const swipe = (dx: number, dy: number, ms: number, bow = 0) => ({
  points: [{ x: 200, y: 700 }, { x: 200 + dx / 2 + bow, y: 700 + dy / 2 }, { x: 200 + dx, y: 700 + dy }],
  ms, screenH: H,
});

describe('chute pelo gesto', () => {
  const up = swipe(0, -300, 250);
  it('a bola chega exatamente onde o dedo mirou, inclusive no ângulo', () => {
    const s = shotFromSwipe(up, 0, PENALTY_Z, 'penalty', { x: 3.3, y: 2.2 })!;
    const end = ballAt(s, 1);
    expect(end.x).toBeCloseTo(3.3, 5);
    expect(end.y).toBeCloseTo(2.2, 5);
    expect(end.z).toBeCloseTo(0, 5);
    expect(aimResult(s, null)).toBe('target');
    expect(isTopCorner(s)).toBe(true);
  });
  it('dedo abaixo do gol = rasteiro: a bola vai rolando pela grama o caminho todo', () => {
    const s = shotFromSwipe(up, 0, PENALTY_Z, 'penalty', { x: -2, y: -0.4 })!;
    for (let u = 0; u <= 1; u += 0.1) expect(ballAt(s, u).y).toBeCloseTo(BALL_R, 5);
    expect(aimResult(s, null)).toBe('target');
  });
  it('chute alto faz parábola: sobe e desce com a gravidade', () => {
    const s = shotFromSwipe(swipe(0, -300, 400), 0, PENALTY_Z, 'penalty', { x: 0, y: 1.2 })!;
    expect(apex(s)).toBeGreaterThan(1.2);
    const T = flightTime(s);
    const v1 = velocityAt(s, 0).y, v2 = velocityAt(s, T).y;
    expect(v1 - v2).toBeCloseTo(9.81 * T, 3);
  });
  it('mirar ao lado da trave sai pela lateral; acima do travessão vai por cima; na linha da trave bate nela', () => {
    expect(aimResult(shotFromSwipe(up, 0, PENALTY_Z, 'penalty', { x: 4.6, y: 1 })!, null)).toBe('wide');
    expect(aimResult(shotFromSwipe(up, 0, PENALTY_Z, 'penalty', { x: 1, y: 3.1 })!, null)).toBe('over');
    expect(aimResult(shotFromSwipe(up, 0, PENALTY_Z, 'penalty', { x: HALF, y: 1 })!, null)).toBe('post');
  });
  it('gesto rápido chuta mais forte', () => {
    const slow = shotFromSwipe(swipe(0, -300, 600), 0, PENALTY_Z, 'penalty', { x: 1, y: 1 })!;
    const fast = shotFromSwipe(swipe(0, -300, 120), 0, PENALTY_Z, 'penalty', { x: 1, y: 1 })!;
    expect(fast.speed).toBeGreaterThan(slow.speed + 5);
  });
  it('toque curto ou para baixo não é chute', () => {
    expect(shotFromSwipe(swipe(0, -20, 100), 0, PENALTY_Z, 'penalty', { x: 0, y: 1 })).toBeNull();
    expect(shotFromSwipe(swipe(0, 300, 100), 0, PENALTY_Z, 'penalty', { x: 0, y: 1 })).toBeNull();
  });
  it('dedo em curva dá efeito: a bola faz curva no meio e chega onde mirou', () => {
    const s = shotFromSwipe(swipe(0, -300, 250, 80), 6, 20, 'free', { x: -2, y: 1.5 })!;
    expect(Math.abs(s.bend)).toBeGreaterThan(0.5);
    const mid = ballAt(s, 0.5);
    expect(Math.abs(mid.x - (6 + -2) / 2)).toBeCloseTo(Math.abs(s.bend), 1);
    expect(ballAt(s, 1).x).toBeCloseTo(-2, 5);
  });
});

describe('barreira', () => {
  it('fica a 9,15 m da bola, do lado da trave mais próxima', () => {
    const w = placeWall(6, 20, 'medium');
    expect(Math.hypot(w.x - 6, w.z - 20)).toBeCloseTo(9.15, 1);
    expect(w.x).toBeGreaterThan(0);
  });
  it('chute rasteiro na direção da barreira bate nela; por cima passa', () => {
    const w = placeWall(0, 20, 'easy');
    const low: Shot = { sx: 0, sz: 20, tx: w.x * 20 / (20 - w.z), ty: BALL_R, speed: 22, bend: 0 };
    expect(wallHit(low, w)).not.toBeNull();
    const high: Shot = { ...low, tx: 2.5, ty: 2.1 };
    expect(wallHit(high, w)).toBeNull();
  });
});

describe('máquina', () => {
  it('o chute da máquina no fácil quase sempre vai no gol e dá tempo de pular', () => {
    const rng = seeded(7);
    let on = 0;
    for (let i = 0; i < 200; i++) {
      const s = cpuShot(0, PENALTY_Z, 'penalty', 'easy', null, rng);
      if (aimResult(s, null) === 'target') on++;
      expect(Math.hypot(s.tx, s.sz) / s.speed).toBeGreaterThan(0.75);
    }
    expect(on).toBeGreaterThan(150);
  });
  it('goleiro da máquina defende às vezes, não sempre', () => {
    const rng = seeded(3);
    let saves = 0;
    for (let i = 0; i < 300; i++) {
      const s: Shot = { sx: 0, sz: PENALTY_Z, tx: (rng() * 2 - 1) * (HALF - 0.4), ty: 0.3 + rng() * 1.8, speed: 20, bend: 0 };
      if (cpuSaves(s, cpuKeeperTarget(s, 'penalty', 'medium', rng), 'medium')) saves++;
    }
    expect(saves).toBeGreaterThan(30);
    expect(saves).toBeLessThan(200);
  });
  it('jogador goleiro: pular no lugar certo a tempo defende; atrasado ou longe, não', () => {
    const s: Shot = { sx: 0, sz: PENALTY_Z, tx: 2.5, ty: 1, speed: 12, bend: 0 };
    expect(playerSaves(s, { x: 2.4, y: 1.1, t: 0.2 }, 'easy', 'penalty')).toBe(true);
    expect(playerSaves(s, { x: -2.4, y: 1.1, t: 0.2 }, 'easy', 'penalty')).toBe(false);
    expect(playerSaves(s, { x: 2.4, y: 1.1, t: 5 }, 'easy', 'penalty')).toBe(false);
  });
});

import { LANGS } from '../src/game/i18n';
describe('traduções', () => {
  it('os 8 idiomas têm os mesmos textos e falas', () => {
    const keys = (o: object) => Object.keys(o).sort().join(',');
    for (const l of Object.values(LANGS)) {
      expect(keys(l.ui)).toBe(keys(LANGS.pt.ui));
      expect(keys(l.calls)).toBe(keys(LANGS.pt.calls));
    }
  });
});

describe('disputa de pênaltis da Copa', () => {
  it('termina antes quando não dá mais para alcançar', () => {
    expect(shootoutWinner({ a: [true, true, true], b: [false, false, false] })).toBe('a');
    expect(shootoutWinner({ a: [true, true], b: [false, false] })).toBeNull();
  });
  it('empate em 5 vai para morte súbita', () => {
    const five = [true, false, true, false, true];
    expect(shootoutWinner({ a: five, b: five })).toBeNull();
    expect(shootoutWinner({ a: [...five, true], b: [...five] })).toBeNull();
    expect(shootoutWinner({ a: [...five, true], b: [...five, false] })).toBe('a');
  });
});
