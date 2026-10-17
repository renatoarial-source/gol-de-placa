// Game Center (só no iPhone): as figurinhas do álbum viram conquistas e o total de gols vira ranking.
// No Android e no navegador, tudo aqui é ignorado.
import { Capacitor, registerPlugin } from '@capacitor/core';

interface GameCenterPlugin {
  signIn(): Promise<{ authenticated: boolean }>;
  reportAchievements(o: { ids: string[]; banner?: boolean }): Promise<void>;
  submitScore(o: { leaderboard: string; score: number }): Promise<void>;
  show(o: { view?: 'dashboard' | 'leaderboards' | 'achievements' }): Promise<{ shown: boolean }>;
}

const GC = registerPlugin<GameCenterPlugin>('GameCenter');
export const available = Capacitor.getPlatform() === 'ios';
/** Identificadores cadastrados no App Store Connect (store/gamecenter.mjs). */
export const achievementId = (sticker: string) => `com.arial.goldeplaca.${sticker}`;
export const GOALS_BOARD = 'com.arial.goldeplaca.goals';

let ready = false;

/** Entra no Game Center e sincroniza o que o jogador já tem (figurinhas e gols). */
export async function start(stickers: string[], goals: number): Promise<void> {
  if (!available) return;
  try {
    ready = (await GC.signIn()).authenticated;
    if (!ready) return;
    // Sem aviso na tela: são conquistas antigas, só para o Game Center ficar igual ao álbum.
    if (stickers.length) await GC.reportAchievements({ ids: stickers.map(achievementId), banner: false });
    if (goals > 0) await GC.submitScore({ leaderboard: GOALS_BOARD, score: goals });
  } catch {
    // sem Game Center (sem internet, jogador recusou): o jogo segue normal
  }
}

/** Figurinhas novas e total de gols depois de cada lance. */
export function report(stickers: string[], goals: number | undefined): void {
  if (!ready) return;
  if (stickers.length) GC.reportAchievements({ ids: stickers.map(achievementId) }).catch(() => {});
  if (goals !== undefined) GC.submitScore({ leaderboard: GOALS_BOARD, score: goals }).catch(() => {});
}

/** Abre o painel do Game Center. Devolve false se o jogador não estiver conectado. */
export async function open(view: 'dashboard' | 'leaderboards' | 'achievements' = 'dashboard'): Promise<boolean> {
  if (!available) return false;
  try {
    if (!ready) ready = (await GC.signIn()).authenticated;
    return ready && (await GC.show({ view })).shown;
  } catch {
    return false;
  }
}
