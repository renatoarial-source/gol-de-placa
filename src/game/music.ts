/* Música da torcida, toda sintetizada na hora (sem gravações e sem músicas de terceiros):
 * batucada de arquibancada, charanga com uma melodia original e palmas com o coro "ô, ô, ô".
 * A intensidade sobe antes da cobrança e explode no gol.
 */
import { whenAudioReady } from './audio';

export type MusicStyle = 'batucada' | 'charanga' | 'palmas' | 'off';
export const MUSIC_STYLES: MusicStyle[] = ['batucada', 'charanga', 'palmas', 'off'];

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let style: MusicStyle = 'batucada';
let level = 0.4; // 0 = calma, 1 = estádio pegando fogo
let boostUntil = 0;
let timer: number | null = null;
let step = 0;
let nextTime = 0;
let noise: AudioBuffer | null = null;

const BPM: Record<Exclude<MusicStyle, 'off'>, number> = { batucada: 126, charanga: 112, palmas: 100 };

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(t: number, f0: number, f1: number, vol: number, decay: number, type: OscillatorType = 'sine') {
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.6);
  env(g, t, vol, 0.004, decay);
  o.connect(g).connect(out!);
  o.start(t); o.stop(t + decay + 0.05);
}

function hiss(t: number, type: BiquadFilterType, freq: number, vol: number, decay: number, q = 0.7) {
  const n = ctx!.createBufferSource();
  n.buffer = noise;
  const f = ctx!.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx!.createGain();
  env(g, t, vol, 0.002, decay);
  n.connect(f).connect(g).connect(out!);
  n.start(t, Math.random() * 1.5); n.stop(t + decay + 0.05);
}

// ---------- instrumentos ----------
const surdo = (t: number, f: number, v: number) => tone(t, f * 1.6, f, v, 0.55);
const caixa = (t: number, v: number) => { hiss(t, 'highpass', 1800, v, 0.09); tone(t, 240, 180, v * 0.25, 0.05, 'triangle'); };
const repique = (t: number, v: number) => { tone(t, 380, 300, v, 0.13); hiss(t, 'bandpass', 3000, v * 0.4, 0.03); };
const chocalho = (t: number, v: number) => hiss(t, 'bandpass', 6500, v, 0.05, 1.2);
const tamborim = (t: number, v: number) => tone(t, 980, 860, v, 0.06, 'triangle');
const bumbo = (t: number, v: number) => tone(t, 120, 45, v, 0.3);
const prato = (t: number, v: number) => hiss(t, 'highpass', 6000, v, 0.9);
function palma(t: number, v: number) {
  for (let i = 0; i < 3; i++) hiss(t + i * 0.011, 'bandpass', 1300, v * (i === 2 ? 1 : 0.6), 0.06, 1.5);
}

/** Metais: duas ondas dente-de-serra levemente desafinadas com filtro que "abre" no ataque. */
function metal(t: number, freq: number, dur: number, v: number) {
  const f = ctx!.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(500, t);
  f.frequency.linearRampToValueAtTime(2600, t + 0.05);
  f.frequency.exponentialRampToValueAtTime(1100, t + dur);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.03);
  g.gain.setValueAtTime(v * 0.8, t + dur * 0.8);
  g.gain.linearRampToValueAtTime(0, t + dur);
  f.connect(g).connect(out!);
  for (const d of [1, 1.006]) {
    const o = ctx!.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = freq * d;
    o.connect(f); o.start(t); o.stop(t + dur + 0.02);
  }
}

function tuba(t: number, freq: number, dur: number, v: number) {
  const o = ctx!.createOscillator();
  const f = ctx!.createBiquadFilter();
  const g = ctx!.createGain();
  o.type = 'square'; o.frequency.value = freq;
  f.type = 'lowpass'; f.frequency.value = 420;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.02);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(f).connect(g).connect(out!);
  o.start(t); o.stop(t + dur + 0.02);
}

/** Coro da torcida ("ô"): vozes desafinadas passando por filtros na região da vogal "o". */
function coro(t: number, freqs: number[], dur: number, v: number) {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.08);
  g.gain.setValueAtTime(v, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  for (const [fq, q] of [[480, 4], [850, 5]]) {
    const f = ctx!.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = q;
    f.connect(g);
    for (const base of freqs) for (const d of [0.993, 1, 1.008]) {
      const o = ctx!.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = base * d;
      o.connect(f); o.start(t); o.stop(t + dur + 0.02);
    }
  }
  g.connect(out!);
}

const N = (name: string) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name)!;
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'] + (m[2] ? 1 : 0);
  return 440 * Math.pow(2, (semis - 9) / 12 + (Number(m[3]) - 4));
};

// melodia original da charanga, em colcheias (4 compassos); '-' segura a nota anterior
const MELODY = ['E5', 'G5', 'C6', 'G5', 'E5', 'G5', 'C6', '-', 'F5', 'A5', 'C6', 'A5', 'F5', 'A5', 'C6', '-',
  'G5', 'B5', 'D6', 'B5', 'G5', 'F5', 'E5', 'D5', 'C5', 'E5', 'G5', 'C6', '-', '-', '', ''];
const ROOTS = ['C2', 'F2', 'G2', 'C2'];

/** Toca o passo (semicolcheia) `s` no tempo `t`. */
function play(s: number, t: number, dur16: number) {
  const st = s % 16;
  const bar = Math.floor(s / 16);
  const hot = level >= 0.7 || t < boostUntil;
  const v = 0.55 + 0.45 * Math.min(1, level);
  if (style === 'batucada') {
    if (st === 4 || st === 12) surdo(t, 55, 0.9 * v);
    if (st === 0 || st === 8) surdo(t, 72, 0.45 * v);
    caixa(t, ([3, 7, 11, 15].includes(st) ? 0.32 : 0.12) * v);
    chocalho(t, (st % 4 === 2 ? 0.14 : 0.07) * v);
    if ([0, 3, 6, 8, 10, 13].includes(st)) tamborim(t, 0.12 * v);
    if (hot && bar % 2 === 1 && st >= 12) repique(t, 0.3 * v); // chamada do repique
    if (hot && st === 0 && bar % 4 === 0) prato(t, 0.12);
  } else if (style === 'charanga') {
    if (st === 0 || st === 8) bumbo(t, 0.7 * v);
    if (st === 4 || st === 12) caixa(t, 0.22 * v);
    if (st === 0 && bar % 2 === 0) prato(t, 0.08 * v);
    const root = N(ROOTS[bar % 4]);
    if (st % 4 === 0) tuba(t, st % 8 === 0 ? root : root * 1.5, dur16 * 3.6, 0.22 * v);
    if (st % 2 === 0) {
      const i = (bar % 4) * 8 + st / 2;
      const note = MELODY[i];
      if (note && note !== '-') {
        let len = 1;
        while (MELODY[i + len] === '-') len++;
        metal(t, N(note), dur16 * 2 * len * 0.92, (hot ? 0.13 : 0.09) * v);
      }
    }
  } else if (style === 'palmas') {
    if ([0, 6, 12].includes(st)) palma(t, 0.35 * v); // palmas 3-3-2
    if (st === 0 || st === 8) bumbo(t, 0.5 * v);
    if (hot && st % 4 === 2) caixa(t, 0.12 * v);
    // "ô, ô, ô ... ôôô"
    if (bar % 2 === 0 && [0, 4, 8].includes(st)) coro(t, [N('C4'), N('G4')], dur16 * 3, 0.07 * v);
    if (bar % 2 === 1 && [0, 2, 4].includes(st)) coro(t, [N('D4'), N('A4')], dur16 * 1.6, 0.07 * v);
    if (bar % 2 === 1 && st === 6) coro(t, [N('C4'), N('G4'), N('E4')], dur16 * 6, 0.08 * v);
  }
}

function tick() {
  if (!ctx || style === 'off') return;
  const dur16 = 60 / BPM[style] / 4;
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + 0.15) {
    play(step, nextTime, dur16);
    step++;
    nextTime += dur16;
  }
}

function start() {
  if (timer !== null || !ctx || style === 'off') return;
  step = 0;
  nextTime = ctx.currentTime + 0.05;
  timer = window.setInterval(tick, 25);
}
function stop() {
  if (timer !== null) { clearInterval(timer); timer = null; }
}

whenAudioReady((c, master) => {
  ctx = c;
  out = c.createGain();
  out.gain.value = 0.32;
  out.connect(master);
  noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  start();
});

export const music = {
  style: () => style,
  setStyle(s: MusicStyle) {
    style = s;
    stop();
    start();
  },
  /** 0 = calma (menus), ~0.7 = tensão antes da cobrança, 1 = festa. */
  setIntensity(x: number) {
    level = x;
    if (ctx && out) out.gain.setTargetAtTime(0.22 + 0.2 * Math.min(1, x), ctx.currentTime, 0.4);
  },
  /** Explosão de gol: prato, viradas e volume lá em cima por alguns segundos. */
  burst() {
    if (!ctx || !out || style === 'off') return;
    const t = ctx.currentTime;
    boostUntil = t + 3.5;
    prato(t + 0.02, 0.3);
    for (let i = 0; i < 8; i++) caixa(t + i * 0.06, 0.25 + i * 0.03);
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.linearRampToValueAtTime(0.5, t + 0.2);
    out.gain.setTargetAtTime(0.22 + 0.2 * Math.min(1, level), t + 3, 0.6);
  },
};
