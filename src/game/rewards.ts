/* Prêmios das figurinhas (uniformes e estádios) e os eventos "Pênaltis da Copa".
 * Funções puras: o main.ts guarda as escolhas e desenha as telas.
 */
import type { Kit } from './teams';

/** Uniformes especiais: cada um libera com um número de figurinhas (espalhados pelo álbum de 100). Valem para qualquer time. */
export const KITS: { id: string; e: string; need: number; kit: Kit }[] = [
  { id: 'gold', e: '🥇', need: 3, kit: { shirt: '#f5c518', shorts: '#1b1b1b', socks: '#f5c518', keeper: '#7b1fa2' } },
  { id: 'stripes', e: '🍬', need: 10, kit: { shirt: '#ffffff', shorts: '#e53935', socks: '#ffffff', stripe: '#e53935', keeper: '#1e88e5' } },
  { id: 'galaxy', e: '🌌', need: 20, kit: { shirt: '#1a1a5e', shorts: '#0d0d30', socks: '#1a1a5e', stripe: '#8e7cff', keeper: '#ffd400' } },
  { id: 'neon', e: '💚', need: 35, kit: { shirt: '#39ff14', shorts: '#111111', socks: '#39ff14', keeper: '#ff00c8' } },
  { id: 'melon', e: '🍉', need: 50, kit: { shirt: '#ff5a6e', shorts: '#2e7d32', socks: '#2e7d32', keeper: '#ffd400' } },
  { id: 'fire', e: '🔥', need: 70, kit: { shirt: '#ff3d00', shorts: '#111111', socks: '#ff3d00', stripe: '#ffd400', keeper: '#00b0ff' } },
];

export interface Stadium { id: string; e: string; need: number; seatA: string; seatB: string; ground: string }

/** Estádios: muda a cor das arquibancadas e do chão em volta do gramado. O primeiro é o de sempre. */
export const STADIUMS: Stadium[] = [
  { id: 'classic', e: '🏟️', need: 0, seatA: '#8a96a3', seatB: '#5b6672', ground: '#3a8a35' },
  { id: 'beach', e: '🏖️', need: 6, seatA: '#ffd54f', seatB: '#4fc3f7', ground: '#e8d29a' },
  { id: 'forest', e: '🌳', need: 15, seatA: '#66bb6a', seatB: '#2e7d32', ground: '#2f6b2a' },
  { id: 'neon', e: '🌃', need: 30, seatA: '#ab47bc', seatB: '#311b92', ground: '#1b3d1a' },
  { id: 'golden', e: '🏆', need: 90, seatA: '#ffca28', seatB: '#c49000', ground: '#3a8a35' },
];

/** Estilo "bolinha" (bonecos redondos): liberado com figurinhas; depois sai em 1 de cada 4 partidas. */
export const ROUND = { e: '⚪', need: 25, chance: 0.25 };
export const roundUnlocked = (stickers: number) => stickers >= ROUND.need;

export const kitUnlocked = (id: string, stickers: number) => (KITS.find((k) => k.id === id)?.need ?? 99) <= stickers;
export const stadiumUnlocked = (id: string, stickers: number) => (STADIUMS.find((s) => s.id === id)?.need ?? 99) <= stickers;
export const findStadium = (id: string) => STADIUMS.find((s) => s.id === id) ?? STADIUMS[0];
/** Uniforme especial escolhido, se ainda estiver liberado. */
export function specialKit(id: string, stickers: number): Kit | undefined {
  const k = KITS.find((x) => x.id === id);
  return k && k.need <= stickers ? k.kit : undefined;
}
/** Próximo prêmio a liberar (para mostrar "faltam N figurinhas"). */
export function nextReward(stickers: number): { e: string; left: number } | undefined {
  const all = [...KITS, ...STADIUMS, ROUND].filter((r) => r.need > stickers).sort((a, b) => a.need - b.need);
  return all.length ? { e: all[0].e, left: all[0].need - stickers } : undefined;
}

/** Eventos "Pênaltis da Copa": aparecem na tela inicial só entre as datas (inclusive). */
export interface CupEvent { id: string; from: string; to: string; womens?: boolean }
export const EVENTS: CupEvent[] = [
  { id: 'finals2026', from: '2026-11-14', to: '2026-12-13' }, // temporada das finais
  { id: 'summer2027', from: '2027-01-10', to: '2027-02-07' }, // férias de verão
  { id: 'womens2027', from: '2027-06-20', to: '2027-07-25', womens: true }, // Copa do Mundo feminina, no Brasil
  { id: 'finals2027', from: '2027-11-13', to: '2027-12-12' },
  { id: 'cup2030', from: '2030-06-08', to: '2030-07-21' },
];

/** Evento ativo no dia (AAAA-MM-DD), se houver. */
export function eventFor(day: string): CupEvent | undefined {
  return EVENTS.find((e) => day >= e.from && day <= e.to);
}

/** Placar do evento: gols, vitórias e a melhor sequência de vitórias seguidas. */
export interface EventScore { id: string; goals: number; wins: number; played: number; streak: number; best: number }
export const emptyScore = (id: string): EventScore => ({ id, goals: 0, wins: 0, played: 0, streak: 0, best: 0 });

export function addMatch(s: EventScore, goals: number, won: boolean): EventScore {
  const streak = won ? s.streak + 1 : 0;
  return { ...s, goals: s.goals + goals, wins: s.wins + (won ? 1 : 0), played: s.played + 1, streak, best: Math.max(s.best, streak) };
}

/** Chaveamento do torneio de 4: semifinais 1×2 e 3×4, depois a final entre os vencedores. */
export function bracket(semi1: number | null, semi2: number | null): [number, number][] {
  const out: [number, number][] = [[0, 1], [2, 3]];
  if (semi1 !== null && semi2 !== null) out.push([semi1, semi2]);
  return out;
}
