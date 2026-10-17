import { describe, expect, it } from 'vitest';
import { STICKERS, apply, dailyFor, emptyState, ensureDay, type Ev } from '../src/game/progress';
import { LANGS } from '../src/game/i18n';

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
    expect(apply(emptyState(), { t: 'cup', diff: 'hard' }).stickers).toEqual(['cup', 'cup_hard', 'wins_1']) // a Copa também conta como vitória;
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

describe('álbum com 100 figurinhas', () => {
  it('tem exatamente 100, sem repetir, e as 18 primeiras continuam as mesmas', () => {
    expect(STICKERS).toHaveLength(100);
    expect(new Set(STICKERS.map((x) => x.id)).size).toBe(100);
    expect(STICKERS.filter((x) => x.base)).toHaveLength(18);
    expect(STICKERS.filter((x) => x.team)).toHaveLength(28);
  });
  it('todas têm nome nos 8 idiomas', () => {
    for (const l of Object.keys(LANGS) as (keyof typeof LANGS)[]) {
      const ui = LANGS[l].ui as Record<string, string>;
      for (const st of STICKERS) {
        const key = st.base ? `st_${st.id}` : st.team ? 'sk_team' : st.n === 1 && (st.k === 'wins' || st.k === 'keeperWins') ? `sk_${st.k}_1` : `sk_${st.k}`;
        expect(ui[key], `${l} ${key}`).toBeTruthy();
      }
    }
  });
  it('metas: 10 gols, 3 gols seguidos (zera no erro) e vitória com o time', () => {
    let s = emptyState();
    const g = goal();
    for (let i = 0; i < 2; i++) s = apply(s, g).s;
    s = apply(s, { t: 'miss' }).s;
    let r = apply(s, g);
    expect(r.s.goalRun).toBe(1);
    s = r.s;
    for (let i = 0; i < 2; i++) s = apply(s, g).s;
    expect(s.stickers).toContain('goalStreak_3');
    for (let i = 0; i < 5; i++) s = apply(s, g).s;
    expect(s.goals).toBe(10);
    expect(s.stickers).toContain('goals_10');
    r = apply(s, { t: 'match', won: true, perfect: false, role: 'kicker', team: 'BR' });
    expect(r.stickers).toEqual(expect.arrayContaining(['team_BR', 'wins_1']));
  });
  it('estado antigo (sem contadores) continua funcionando', () => {
    const old = { stickers: ['first_goal'], goals: 60, saveStreak: 0, day: '', daily: [] } as unknown as ReturnType<typeof emptyState>;
    const r = apply(old, { t: 'save' });
    expect(r.s.c.saves).toBe(1);
    expect(r.s.stickers).toContain('goals_25'); // os 60 gols antigos já valem as metas
  });
});
