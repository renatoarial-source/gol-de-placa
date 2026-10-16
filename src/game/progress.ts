/* Álbum de figurinhas (conquistas) e desafios do dia.
 * O jogo avisa o que aconteceu (event); aqui se conta, libera figurinhas e completa desafios.
 * Funções puras sobre um estado em JSON, guardado pelo main.ts.
 */

export type Ev =
  | { t: 'goal'; corner: boolean; ground: boolean; curve: boolean; free: boolean; weather: string }
  | { t: 'save' }
  | { t: 'concede' }
  | { t: 'post' }
  | { t: 'miss' }
  | { t: 'match'; won: boolean; perfect: boolean; role: 'kicker' | 'keeper' }
  | { t: 'cup'; diff: string }
  | { t: 'twoPlayers' };

export const STICKERS = [
  { id: 'first_goal', e: '⚽' }, { id: 'corner', e: '🎯' }, { id: 'ground', e: '🐍' }, { id: 'curve', e: '🌀' },
  { id: 'free_goal', e: '🧱' }, { id: 'first_save', e: '🧤' }, { id: 'three_saves', e: '🦸' }, { id: 'post', e: '🔔' },
  { id: 'perfect_kick', e: '💯' }, { id: 'perfect_keep', e: '🛡️' }, { id: 'cup', e: '🏆' }, { id: 'cup_hard', e: '👑' },
  { id: 'rain', e: '🌧️' }, { id: 'snow', e: '❄️' }, { id: 'night', e: '🌙' }, { id: 'two_players', e: '👫' },
  { id: 'daily', e: '📅' }, { id: 'fifty', e: '🔥' },
] as const;
export type StickerId = (typeof STICKERS)[number]['id'];

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
  day: string; // AAAA-MM-DD dos desafios atuais
  daily: { id: ChallengeId; n: number }[];
}

export const emptyState = (): State => ({ stickers: [], goals: 0, saveStreak: 0, day: '', daily: [] });

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
  const s: State = { ...prev, stickers: [...prev.stickers], daily: prev.daily.map((d) => ({ ...d })) };
  const got: StickerId[] = [];
  const give = (id: StickerId) => { if (!s.stickers.includes(id)) { s.stickers.push(id); got.push(id); } };
  const bump = (id: ChallengeId) => { for (const d of s.daily) if (d.id === id) d.n++; };
  const before = prev.daily.map((d) => d.n >= needOf(d.id));

  if (ev.t === 'goal') {
    s.goals++;
    give('first_goal');
    if (ev.corner) { give('corner'); bump('c_corner'); }
    if (ev.ground) { give('ground'); bump('c_ground'); }
    if (ev.curve) { give('curve'); bump('c_curve'); }
    if (ev.free) { give('free_goal'); bump('c_free'); }
    if (ev.weather === 'rain') give('rain');
    if (ev.weather === 'snow') give('snow');
    if (ev.weather === 'night') give('night');
    if (s.goals >= 50) give('fifty');
    bump('c_goals');
  } else if (ev.t === 'save') {
    s.saveStreak++;
    give('first_save');
    if (s.saveStreak >= 3) give('three_saves');
    bump('c_saves');
  } else if (ev.t === 'concede') {
    s.saveStreak = 0;
  } else if (ev.t === 'post') {
    give('post');
    bump('c_post');
  } else if (ev.t === 'match') {
    if (ev.won) bump('c_win');
    if (ev.perfect) give(ev.role === 'kicker' ? 'perfect_kick' : 'perfect_keep');
  } else if (ev.t === 'cup') {
    give('cup');
    bump('c_win');
    if (ev.diff === 'hard') give('cup_hard');
  } else if (ev.t === 'twoPlayers') {
    give('two_players');
  }

  const done = s.daily.filter((d, i) => !before[i] && d.n >= needOf(d.id)).map((d) => d.id);
  if (s.daily.length && s.daily.every((d) => d.n >= needOf(d.id))) give('daily');
  return { s, stickers: got, done };
}
