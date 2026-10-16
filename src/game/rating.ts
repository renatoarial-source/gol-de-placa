// Pedido de avaliação na loja (App Store / Google Play).
// Só no app nativo, depois de uma partida boa, a partir da 2ª partida,
// no máximo 3 vezes e com 60 dias entre um pedido e outro. A loja ainda decide se mostra.
import { Capacitor } from '@capacitor/core';
import { InAppReview } from '@capacitor-community/in-app-review';

const ASKED_KEY = 'gol.rateAsked';
const MATCHES_KEY = 'gol.matches';
const GAP = 60 * 24 * 3600 * 1000;

export function shouldAskRating(asked: number[], now: number, matches: number, happy: boolean): boolean {
  if (!happy || matches < 2 || asked.length >= 3) return false;
  return !asked.length || now - asked[asked.length - 1] >= GAP;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sem armazenamento: só não pede
  }
}

/** Chamar no fim de cada partida. `happy`: a criança venceu, ou foi uma partida entre amigos. */
export function onMatchFinished(happy: boolean): void {
  const matches = Number(read(MATCHES_KEY, 0)) + 1;
  write(MATCHES_KEY, matches);
  if (!Capacitor.isNativePlatform()) return;
  const asked = read<number[]>(ASKED_KEY, []);
  const list = Array.isArray(asked) ? asked : [];
  const now = Date.now();
  if (!shouldAskRating(list, now, matches, happy)) return;
  write(ASKED_KEY, [...list, now]);
  window.setTimeout(() => {
    InAppReview.requestReview().catch(() => undefined);
  }, 1800);
}
