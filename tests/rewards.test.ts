import { describe, expect, it } from 'vitest';
import { KITS, STADIUMS, addMatch, bracket, emptyScore, eventFor, nextReward, specialKit, stadiumUnlocked } from '../src/game/rewards';

describe('prêmios das figurinhas', () => {
  it('uniforme só vale depois de juntar as figurinhas', () => {
    expect(specialKit('gold', 2)).toBeUndefined();
    expect(specialKit('gold', 3)).toEqual(KITS[0].kit);
    expect(specialKit('nada', 18)).toBeUndefined();
  });
  it('estádio clássico sempre liberado; o de ouro pede 90', () => {
    expect(stadiumUnlocked('classic', 0)).toBe(true);
    expect(stadiumUnlocked('golden', 89)).toBe(false);
    expect(stadiumUnlocked('golden', 90)).toBe(true);
  });
  it('próximo prêmio e todos liberados com o álbum completo', () => {
    expect(nextReward(0)).toEqual({ e: '🥇', left: 3 });
    expect(nextReward(100)).toBeUndefined();
    // prêmios espalhados pelo álbum de 100: o último pede 90
    expect(Math.max(...KITS.map((k) => k.need), ...STADIUMS.map((s) => s.need))).toBe(90);
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

describe('estilo bolinha', () => {
  it('libera com 25 figurinhas e sai em 1 de cada 4 partidas', async () => {
    const { ROUND, roundUnlocked } = await import('../src/game/rewards');
    expect(roundUnlocked(ROUND.need - 1)).toBe(false);
    expect(roundUnlocked(ROUND.need)).toBe(true);
    expect(ROUND.chance).toBe(0.25);
  });
});
