import { describe, expect, it } from 'vitest';
import { apply, dailyFor, emptyState, ensureDay, type Ev } from '../src/game/progress';

const goal = (o: Partial<Extract<Ev, { t: 'goal' }>> = {}): Ev => ({ t: 'goal', corner: false, ground: false, curve: false, free: false, weather: 'day', ...o });

describe('figurinhas', () => {
  it('primeiro gol e gol no ângulo dão figurinha uma vez só', () => {
    let r = apply(emptyState(), goal({ corner: true }));
    expect(r.stickers).toEqual(['first_goal', 'corner']);
    r = apply(r.s, goal({ corner: true }));
    expect(r.stickers).toEqual([]);
  });
  it('3 defesas seguidas; tomar gol zera a sequência', () => {
    let s = emptyState();
    s = apply(s, { t: 'save' }).s;
    s = apply(s, { t: 'save' }).s;
    s = apply(s, { t: 'concede' }).s;
    s = apply(s, { t: 'save' }).s;
    expect(s.stickers).not.toContain('three_saves');
    s = apply(s, { t: 'save' }).s;
    expect(apply(s, { t: 'save' }).stickers).toEqual(['three_saves']);
  });
  it('clima e copa no difícil', () => {
    expect(apply(emptyState(), goal({ weather: 'snow' })).stickers).toContain('snow');
    expect(apply(emptyState(), { t: 'cup', diff: 'hard' }).stickers).toEqual(['cup', 'cup_hard']);
  });
});

describe('desafios do dia', () => {
  it('são 3, sempre os mesmos no mesmo dia, e sem a versão completa não pedem falta nem defesa', () => {
    expect(dailyFor('2026-10-16', true)).toEqual(dailyFor('2026-10-16', true));
    expect(dailyFor('2026-10-16', true)).toHaveLength(3);
    for (let d = 1; d <= 28; d++) {
      const ids = dailyFor(`2026-11-${String(d).padStart(2, '0')}`, false);
      expect(ids).not.toContain('c_free');
      expect(ids).not.toContain('c_saves');
    }
  });
  it('conta o progresso, avisa quando completa e dá a figurinha do dia ao completar os 3', () => {
    let s = ensureDay(emptyState(), '2026-10-16', true);
    s = { ...s, daily: [{ id: 'c_ground', n: 0 }, { id: 'c_post', n: 0 }, { id: 'c_corner', n: 0 }] };
    let r = apply(s, goal({ ground: true }));
    expect(r.done).toEqual(['c_ground']);
    r = apply(r.s, { t: 'post' });
    r = apply(r.s, goal({ corner: true }));
    expect(r.done).toEqual([]);
    r = apply(r.s, goal({ corner: true }));
    expect(r.done).toEqual(['c_corner']);
    expect(r.stickers).toContain('daily');
  });
  it('no dia seguinte vêm desafios novos', () => {
    const a = ensureDay(emptyState(), '2026-10-16', true);
    expect(ensureDay(a, '2026-10-16', true)).toBe(a);
    expect(ensureDay(a, '2026-10-17', true).day).toBe('2026-10-17');
  });
});
