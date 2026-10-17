/* Álbum de figurinhas (conquistas) e desafios do dia.
 * O jogo avisa o que aconteceu (event); aqui se conta, libera figurinhas e completa desafios.
 * Funções puras sobre um estado em JSON, guardado pelo main.ts.
 * São 100 figurinhas: as 18 primeiras (também viram conquistas no Game Center), 54 metas
 * progressivas (10, 25, 100… gols, defesas etc.) e uma vitória com cada um dos 28 times.
 */
import { CLUBS, NATIONS } from './teams';

export type Ev =
  | { t: 'goal'; corner: boolean; ground: boolean; curve: boolean; free: boolean; weather: string }
  | { t: 'save' }
  | { t: 'concede' }
  | { t: 'post' }
  | { t: 'miss' }
  | { t: 'match'; won: boolean; perfect: boolean; role: 'kicker' | 'keeper'; team?: string }
  | { t: 'cup'; diff: string; team?: string }
  | { t: 'twoPlayers' };

/** As 18 figurinhas da primeira versão (são também as conquistas do Game Center). */
export const BASE_STICKERS = [
  { id: 'first_goal', e: '⚽' }, { id: 'corner', e: '🎯' }, { id: 'ground', e: '🐍' }, { id: 'curve', e: '🌀' },
  { id: 'free_goal', e: '🧱' }, { id: 'first_save', e: '🧤' }, { id: 'three_saves', e: '🦸' }, { id: 'post', e: '🔔' },
  { id: 'perfect_kick', e: '💯' }, { id: 'perfect_keep', e: '🛡️' }, { id: 'cup', e: '🏆' }, { id: 'cup_hard', e: '👑' },
  { id: 'rain', e: '🌧️' }, { id: 'snow', e: '❄️' }, { id: 'night', e: '🌙' }, { id: 'two_players', e: '👫' },
  { id: 'daily', e: '📅' }, { id: 'fifty', e: '🔥' },
] as const;
type BaseId = (typeof BASE_STICKERS)[number]['id'];

/** Contadores para as metas progressivas. */
export type CounterKey =
  | 'goals' | 'saves' | 'corner' | 'ground' | 'curve' | 'free' | 'post' | 'wins' | 'keeperWins' | 'perfect'
  | 'cups' | 'hardCups' | 'rain' | 'snow' | 'night' | 'duos' | 'dailies' | 'goalStreak' | 'saveStreak';
/** Metas: cada número vira uma figurinha (ex.: 10, 25 e 100 gols). */
export const TIERS: { k: CounterKey; e: string; ns: number[] }[] = [
  { k: 'goals', e: '⚽', ns: [10, 25, 100, 250, 500, 1000] },
  { k: 'saves', e: '🧤', ns: [10, 25, 50, 100, 250] },
  { k: 'corner', e: '🎯', ns: [10, 25, 50, 100] },
  { k: 'ground', e: '🐍', ns: [10, 25, 50] },
  { k: 'curve', e: '🌀', ns: [10, 25, 50] },
  { k: 'free', e: '🧱', ns: [10, 25, 50, 100] },
  { k: 'post', e: '🔔', ns: [5, 10, 25] },
  { k: 'wins', e: '🏅', ns: [1, 5, 10, 25, 50, 100] },
  { k: 'keeperWins', e: '🥅', ns: [1, 10] },
  { k: 'perfect', e: '💯', ns: [3, 10] },
  { k: 'cups', e: '🏆', ns: [3, 10] },
  { k: 'hardCups', e: '👑', ns: [3] },
  { k: 'rain', e: '🌧️', ns: [10] },
  { k: 'snow', e: '❄️', ns: [10] },
  { k: 'night', e: '🌙', ns: [10] },
  { k: 'duos', e: '👫', ns: [5, 25] },
  { k: 'dailies', e: '📅', ns: [3, 7, 14, 30] },
  { k: 'goalStreak', e: '🔥', ns: [3, 5, 10] },
  { k: 'saveStreak', e: '🛡️', ns: [5] },
];

export interface Sticker { id: string; e: string; base?: boolean; k?: CounterKey; n?: number; team?: string }
const TEAMS = [...NATIONS, ...CLUBS];
/** Todas as figurinhas do álbum, na ordem em que aparecem. */
export const STICKERS: Sticker[] = [
  ...BASE_STICKERS.map((x) => ({ id: x.id, e: x.e, base: true })),
  ...TIERS.flatMap((tr) => tr.ns.map((n) => ({ id: `${tr.k}_${n}`, e: tr.e, k: tr.k, n }))),
  ...TEAMS.map((tm) => ({ id: `team_${tm.id}`, e: tm.badge, team: tm.id })),
];
export type StickerId = string;
export const findSticker = (id: string) => STICKERS.find((x) => x.id === id);

/** Modelos de desafio do dia: o que conta e quantas vezes. `full` = precisa da versão completa. */
export const CHALLENGES = [
  { id: 'c_corner', need: 2 }, { id: 'c_ground', need: 1 }, { id: 'c_curve', need: 1 }, { id: 'c_goals', need: 5 },
  { id: 'c_saves', need: 3, full: true }, { id: 'c_free', need: 1, full: true }, { id: 'c_win', need: 1 }, { id: 'c_post', need: 1 },
] as const;
export type ChallengeId = (typeof CHALLENGES)[number]['id'];

export interface State {
  stickers: string[];
  goals: number;
  saveStreak: number;
  /** contadores das metas (o de gols é o `goals`) */
  c: Partial<Record<CounterKey, number>>;
  /** gols seguidos como batedor (zera no erro) */
  goalRun: number;
  day: string; // AAAA-MM-DD dos desafios atuais
  daily: { id: ChallengeId; n: number }[];
}

export const emptyState = (): State => ({ stickers: [], goals: 0, saveStreak: 0, c: {}, goalRun: 0, day: '', daily: [] });

/** Três desafios do dia, sorteados pela data (iguais o dia todo). Sem a versão completa, só os possíveis. */
export function dailyFor(day: string, full: boolean): ChallengeId[] {
  let h = 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pool: ChallengeId[] = CHALLENGES.filter((c) => full || !('full' in c)).map((c) => c.id);
  const out: ChallengeId[] = [];
  while (out.length < 3 && pool.length) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

/** Garante que os desafios são os de hoje. */
export function ensureDay(s: State, day: string, full: boolean): State {
  if (s.day === day && s.daily.length) return s;
  return { ...s, day, daily: dailyFor(day, full).map((id) => ({ id, n: 0 })) };
}

export const needOf = (id: ChallengeId) => CHALLENGES.find((c) => c.id === id)!.need;

/** Aplica um acontecimento. Devolve o novo estado, figurinhas novas e desafios recém-completados. */
export function apply(prev: State, ev: Ev): { s: State; stickers: StickerId[]; done: ChallengeId[] } {
  const s: State = { ...emptyState(), ...prev, stickers: [...prev.stickers], c: { ...prev.c }, daily: prev.daily.map((d) => ({ ...d })) };
  const got: StickerId[] = [];
  const give = (id: BaseId | string) => { if (!s.stickers.includes(id)) { s.stickers.push(id); got.push(id); } };
  const add = (k: CounterKey, n = 1) => { s.c[k] = (s.c[k] ?? 0) + n; };
  const best = (k: CounterKey, v: number) => { if (v > (s.c[k] ?? 0)) s.c[k] = v; };
  const allDone = (d: State['daily']) => d.length > 0 && d.every((x) => x.n >= needOf(x.id));
  const wasAllDone = allDone(prev.daily);
  const bump = (id: ChallengeId) => { for (const d of s.daily) if (d.id === id) d.n++; };
  const before = prev.daily.map((d) => d.n >= needOf(d.id));

  if (ev.t === 'goal') {
    s.goals++;
    s.goalRun++;
    best('goalStreak', s.goalRun);
    give('first_goal');
    if (ev.corner) { give('corner'); bump('c_corner'); add('corner'); }
    if (ev.ground) { give('ground'); bump('c_ground'); add('ground'); }
    if (ev.curve) { give('curve'); bump('c_curve'); add('curve'); }
    if (ev.free) { give('free_goal'); bump('c_free'); add('free'); }
    if (ev.weather === 'rain') { give('rain'); add('rain'); }
    if (ev.weather === 'snow') { give('snow'); add('snow'); }
    if (ev.weather === 'night') { give('night'); add('night'); }
    if (s.goals >= 50) give('fifty');
    bump('c_goals');
  } else if (ev.t === 'save') {
    s.saveStreak++;
    best('saveStreak', s.saveStreak);
    add('saves');
    give('first_save');
    if (s.saveStreak >= 3) give('three_saves');
    bump('c_saves');
  } else if (ev.t === 'concede') {
    s.saveStreak = 0;
  } else if (ev.t === 'post') {
    s.goalRun = 0;
    give('post');
    bump('c_post');
    add('post');
  } else if (ev.t === 'miss') {
    s.goalRun = 0;
  } else if (ev.t === 'match') {
    if (ev.won) {
      bump('c_win');
      add('wins');
      if (ev.role === 'keeper') add('keeperWins');
      if (ev.team) give(`team_${ev.team}`);
    }
    if (ev.perfect) { give(ev.role === 'kicker' ? 'perfect_kick' : 'perfect_keep'); add('perfect'); }
  } else if (ev.t === 'cup') {
    give('cup');
    bump('c_win');
    add('cups');
    add('wins');
    if (ev.team) give(`team_${ev.team}`);
    if (ev.diff === 'hard') { give('cup_hard'); add('hardCups'); }
  } else if (ev.t === 'twoPlayers') {
    give('two_players');
    add('duos');
  }

  const done = s.daily.filter((d, i) => !before[i] && d.n >= needOf(d.id)).map((d) => d.id);
  if (allDone(s.daily)) {
    give('daily');
    if (!wasAllDone) add('dailies');
  }
  // metas progressivas alcançadas
  s.c.goals = s.goals;
  for (const tr of TIERS) for (const n of tr.ns) if ((s.c[tr.k] ?? 0) >= n) give(`${tr.k}_${n}`);
  return { s, stickers: got, done };
}
