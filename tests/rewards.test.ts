import { describe, expect, it } from 'vitest';
import { KITS, STADIUMS, addMatch, bracket, emptyScore, eventFor, nextReward, specialKit, stadiumUnlocked } from '../src/game/rewards';

describe('prêmios das figurinhas', () => {
  it('uniforme só vale depois de juntar as figurinhas', () => {
    expect(specialKit('gold', 1)).toBeUndefined();
    expect(specialKit('gold', 2)).toEqual(KITS[0].kit);
    expect(specialKit('nada', 18)).toBeUndefined();
  });
  it('estádio clássico sempre liberado; o de ouro pede 16', () => {
    expect(stadiumUnlocked('classic', 0)).toBe(true);
    expect(stadiumUnlocked('golden', 15)).toBe(false);
    expect(stadiumUnlocked('golden', 16)).toBe(true);
  });
  it('próximo prêmio e todos liberados com o álbum completo', () => {
    expect(nextReward(0)).toEqual({ e: '🥇', left: 2 });
    expect(nextReward(18)).toBeUndefined();
    expect(Math.max(...KITS.map((k) => k.need), ...STADIUMS.map((s) => s.need))).toBeLessThanOrEqual(18);
  });
});

describe('evento Pênaltis da Copa', () => {
  it('só aparece entre as datas', () => {
    expect(eventFor('2026-11-13')).toBeUndefined();
    expect(eventFor('2026-11-14')?.id).toBe('finals2026');
    expect(eventFor('2026-12-13')?.id).toBe('finals2026');
    expect(eventFor('2027-07-01')?.womens).toBe(true);
  });
  it('placar da vez soma gols, vitórias e o recorde de seguidas', () => {
    let s = emptyScore('x');
    s = addMatch(s, 4, true);
    s = addMatch(s, 3, true);
    s = addMatch(s, 1, false);
    expect(s).toMatchObject({ goals: 8, wins: 2, played: 3, streak: 0, best: 2 });
  });
});

describe('torneio de 4', () => {
  it('semifinais 1×2 e 3×4; a final entre os vencedores', () => {
    expect(bracket(null, null)).toEqual([[0, 1], [2, 3]]);
    expect(bracket(1, 2)).toEqual([[0, 1], [2, 3], [1, 2]]);
  });
});
