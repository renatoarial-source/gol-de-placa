import { describe, expect, it } from 'vitest';
import {
  GOAL_H, HALF, PENALTY_Z, aimResult, ballAt, cpuKeeperTarget, cpuSaves, cpuShot, placeWall, playerSaves,
  seeded, shootoutWinner, shotFromSwipe, wallHit, type Shot,
} from '../src/game/physics';

const H = 800;
const swipe = (dx: number, dy: number, ms: number, bow = 0) => ({
  points: [{ x: 200, y: 700 }, { x: 200 + dx / 2 + bow, y: 700 + dy / 2 }, { x: 200 + dx, y: 700 + dy }],
  ms, screenH: H,
});

describe('chute pelo gesto', () => {
  it('gesto reto e médio vai no meio do gol, rasteiro a meia altura', () => {
    const s = shotFromSwipe(swipe(0, -300, 250), 0, PENALTY_Z, 'penalty')!;
    expect(Math.abs(s.tx)).toBeLessThan(0.01);
    expect(s.ty).toBeGreaterThan(0.2);
    expect(s.ty).toBeLessThan(GOAL_H);
    expect(aimResult(s, null)).toBe('target');
  });
  it('gesto para a direita vai para a direita; muito inclinado sai pela lateral', () => {
    const r = shotFromSwipe(swipe(120, -300, 250), 0, PENALTY_Z, 'penalty')!;
    expect(r.tx).toBeGreaterThan(1.5);
    const w = shotFromSwipe(swipe(300, -300, 250), 0, PENALTY_Z, 'penalty')!;
    expect(aimResult(w, null)).toBe('wide');
  });
  it('gesto muito rápido isola por cima', () => {
    const s = shotFromSwipe(swipe(0, -500, 80), 0, PENALTY_Z, 'penalty')!;
    expect(aimResult(s, null)).toBe('over');
  });
  it('toque curto ou para baixo não é chute', () => {
    expect(shotFromSwipe(swipe(0, -20, 100), 0, PENALTY_Z, 'penalty')).toBeNull();
    expect(shotFromSwipe(swipe(0, 300, 100), 0, PENALTY_Z, 'penalty')).toBeNull();
  });
  it('dedo em curva dá efeito, mas a bola chega onde mirou', () => {
    const s = shotFromSwipe(swipe(0, -300, 250, 80), 6, 20, 'free')!;
    expect(Math.abs(s.bend)).toBeGreaterThan(0.5);
    const end = ballAt(s, 1);
    expect(end.x).toBeCloseTo(s.tx, 5);
    expect(end.z).toBeCloseTo(0, 5);
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
    const low: Shot = { sx: 0, sz: 20, tx: w.x * 20 / (20 - w.z), ty: 0.3, speed: 22, bend: 0, loft: 0.2 };
    expect(wallHit(low, w)).not.toBeNull();
    const high: Shot = { ...low, tx: 2.5, ty: 2.1, loft: 1 + 0.5 * 2.1 };
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
      const s: Shot = { sx: 0, sz: PENALTY_Z, tx: (rng() * 2 - 1) * (HALF - 0.4), ty: 0.3 + rng() * 1.8, speed: 20, bend: 0, loft: 0.2 };
      if (cpuSaves(s, cpuKeeperTarget(s, 'penalty', 'medium', rng), 'medium')) saves++;
    }
    expect(saves).toBeGreaterThan(30);
    expect(saves).toBeLessThan(200);
  });
  it('jogador goleiro: pular no lugar certo a tempo defende; atrasado ou longe, não', () => {
    const s: Shot = { sx: 0, sz: PENALTY_Z, tx: 2.5, ty: 1, speed: 12, bend: 0, loft: 0.2 };
    expect(playerSaves(s, { x: 2.4, y: 1.1, t: 0.2 }, 'easy', 'penalty')).toBe(true);
    expect(playerSaves(s, { x: -2.4, y: 1.1, t: 0.2 }, 'easy', 'penalty')).toBe(false);
    expect(playerSaves(s, { x: 2.4, y: 1.1, t: 5 }, 'easy', 'penalty')).toBe(false);
  });
});

describe('disputa de pênaltis', () => {
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
