/* Música da torcida, toda sintetizada na hora (sem gravações e sem músicas de terceiros):
 * batucada de arquibancada, charanga com uma melodia original, palmas com o coro "ô, ô, ô",
 * o coro "olé, olé", cornetas de estádio e um pagode de arquibancada.
 * A intensidade sobe antes da cobrança e explode no gol.
 */
import { REC, recorded, whenAudioReady } from './audio';

export type MusicStyle = 'estadio' | 'batucada' | 'charanga' | 'palmas' | 'ole' | 'corneta' | 'pagode' | 'off';
export const MUSIC_STYLES: MusicStyle[] = ['estadio', 'batucada', 'charanga', 'palmas', 'ole', 'corneta', 'pagode', 'off'];

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let style: MusicStyle = 'batucada';
let level = 0.4; // 0 = calma, 1 = estádio pegando fogo
let boostUntil = 0;
let timer: number | null = null;
let step = 0;
let nextTime = 0;
let noise: AudioBuffer | null = null;

const BPM: Record<Exclude<MusicStyle, 'off'>, number> = { estadio: 120, batucada: 126, charanga: 112, palmas: 100, ole: 104, corneta: 120, pagode: 98 };

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
/** Palmas da arquibancada: muita gente batendo junto, cada uma um pouco fora do tempo e num tom. */
function palma(t: number, v: number) {
  for (let i = 0; i < 7; i++) {
    const dt = Math.random() * 0.03;
    hiss(t + dt, 'bandpass', 1000 + Math.random() * 1400, v * (0.5 + Math.random() * 0.5), 0.05 + Math.random() * 0.04, 0.9);
  }
  hiss(t, 'highpass', 2500, v * 0.35, 0.04); // o "estalo" de cima
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
  // vibrato lento e um pouco diferente em cada voz: soa como muita gente cantando, não como um teclado
  const lfo = ctx!.createOscillator();
  const lfoAmt = ctx!.createGain();
  lfo.frequency.value = 5.2; lfoAmt.gain.value = 6;
  lfo.connect(lfoAmt); lfo.start(t); lfo.stop(t + dur + 0.02);
  // formantes da vogal "ô" (mais abertos que antes, para a voz passar e ser ouvida)
  for (const [fq, q, amp] of [[450, 1.6, 1], [800, 2, 0.7], [2600, 3, 0.15]]) {
    const f = ctx!.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = q;
    const fg = ctx!.createGain();
    fg.gain.value = amp;
    f.connect(fg).connect(g);
    for (const base of freqs) for (const d of [0.985, 0.996, 1, 1.007, 1.016]) {
      const o = ctx!.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = base * d;
      lfoAmt.connect(o.frequency);
      o.connect(f); o.start(t + Math.random() * 0.04); o.stop(t + dur + 0.02);
    }
  }
  // respiração/"ar" da multidão junto com o canto
  const n = ctx!.createBufferSource();
  n.buffer = noise;
  const nf = ctx!.createBiquadFilter();
  nf.type = 'bandpass'; nf.frequency.value = 700; nf.Q.value = 0.8;
  const ng = ctx!.createGain();
  ng.gain.value = 0.25;
  n.connect(nf).connect(ng).connect(g);
  n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.02);
  g.connect(out!);
}

/** Corneta de estádio: som rasgado e meio desafinado, com a "subidinha" do sopro no começo. */
function corneta(t: number, freq: number, dur: number, v: number) {
  const f = ctx!.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 1500; f.Q.value = 3;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.04);
  g.gain.setValueAtTime(v * 0.85, t + dur * 0.85);
  g.gain.linearRampToValueAtTime(0, t + dur);
  f.connect(g).connect(out!);
  for (const [type, d] of [['sawtooth', 1], ['square', 1.012]] as const) {
    const o = ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq * 0.92 * d, t);
    o.frequency.linearRampToValueAtTime(freq * d, t + 0.08);
    o.connect(f); o.start(t); o.stop(t + dur + 0.02);
  }
}
/** Pandeiro: platinelas (chiado curto) e, no tempo forte, a pele. */
const pandeiro = (t: number, v: number, pele = false) => {
  hiss(t, 'bandpass', 7500, v, 0.06, 2);
  if (pele) tone(t, 190, 140, v * 1.4, 0.09);
};
const tanta = (t: number, v: number) => tone(t, 110, 70, v, 0.35);
/** Cavaquinho: acorde "rasgado" (as cordas uma logo depois da outra), bem curtinho. */
function cavaco(t: number, notes: number[], v: number) {
  notes.forEach((fq, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'triangle'; o.frequency.value = fq;
    env(g, t + i * 0.012, v, 0.003, 0.16);
    o.connect(g).connect(out!);
    o.start(t + i * 0.012); o.stop(t + 0.3);
  });
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
// "o-lé, o-lé, o-lé, o-lé... o-lé, o-lé": [passo no compasso, notas, duração em semicolcheias], 2 compassos
const OLE: [number, string[], number][][] = [
  [[0, ['C4', 'G4'], 2], [2, ['E4', 'C5'], 2], [4, ['C4', 'G4'], 2], [6, ['E4', 'C5'], 2], [8, ['C4', 'G4'], 2], [10, ['E4', 'C5'], 2], [12, ['C4', 'G4'], 2], [14, ['E4', 'C5'], 2]],
  [[0, ['D4', 'A4'], 2], [2, ['F4', 'D5'], 4], [8, ['C4', 'G4'], 2], [10, ['E4', 'C5'], 5]],
];
// acordes do pagode (cavaquinho), um por compasso
const CAVACO = [['G4', 'B4', 'D5', 'E5'], ['A4', 'C5', 'E5', 'G5'], ['A4', 'D5', 'F#5', 'C6'], ['G4', 'B4', 'D5', 'G5']];

// ---------- gravações de estádio de verdade ----------
/** Laços gravados tocando agora (bateria no "Estádio de verdade", vuvuzelas nas "Cornetas"). */
let loops: { src: AudioBufferSourceNode; gain: GainNode; url: string }[] = [];
let nextChant = 0;
const LOOP_FOR: Partial<Record<MusicStyle, [string, number][]>> = {
  estadio: [[REC.bateria, 1.25]],
  corneta: [[REC.vuvuzelas, 0.55]],
};
function stopLoops() {
  if (!ctx) { loops = []; return; }
  for (const l of loops) {
    l.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    const s = l.src;
    setTimeout(() => { try { s.stop(); } catch { /* já parou */ } }, 1500);
  }
  loops = [];
}
/** Liga os laços do estilo (se as gravações já carregaram; senão tenta de novo no próximo passo). */
function ensureLoops() {
  if (!ctx || !out) return;
  for (const [url, vol] of LOOP_FOR[style] ?? []) {
    if (loops.some((l) => l.url === url)) continue;
    const b = recorded(url);
    if (!b) continue;
    const src = ctx.createBufferSource();
    src.buffer = b; src.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 1.2);
    src.connect(gain).connect(out);
    src.start(ctx.currentTime, Math.random() * b.duration * 0.8);
    loops.push({ src, gain, url });
  }
}
/** No "Estádio de verdade", de tempos em tempos a torcida puxa um canto por cima da bateria. */
function chant(t: number) {
  if (!ctx || !out || t < nextChant) return;
  const ready = REC.cantos.map((u) => recorded(u)).filter((b): b is AudioBuffer => !!b);
  if (!ready.length) return;
  const b = ready[Math.floor(Math.random() * ready.length)];
  const src = ctx.createBufferSource();
  src.buffer = b;
  const g = ctx.createGain();
  const len = Math.min(b.duration, 14);
  const off = Math.random() * Math.max(0, b.duration - len);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(1.1, t + 1);
  g.gain.setValueAtTime(1.1, t + len - 1.5);
  g.gain.linearRampToValueAtTime(0, t + len);
  src.connect(g).connect(out);
  src.start(t, off, len);
  nextChant = t + len + 6 + Math.random() * 10;
}

/** Toca o passo (semicolcheia) `s` no tempo `t`. */
function play(s: number, t: number, dur16: number) {
  const st = s % 16;
  const bar = Math.floor(s / 16);
  const hot = level >= 0.7 || t < boostUntil;
  const v = 0.55 + 0.45 * Math.min(1, level);
  if (style === 'estadio') {
    // tudo gravado: a bateria fica em laço; no calor do jogo entram cantos e o surdo marca mais forte
    if (st === 0) { ensureLoops(); chant(t + (hot ? 0 : 2)); }
    if (hot && (st === 4 || st === 12)) surdo(t, 55, 0.35 * v);
  } else if (style === 'batucada') {
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
    if ([0, 6, 12].includes(st)) palma(t, 0.9 * v); // palmas 3-3-2
    if (st === 0 || st === 8) bumbo(t, 0.5 * v);
    if (hot && st % 4 === 2) caixa(t, 0.12 * v);
    // "ô, ô, ô ... ôôô"
    if (bar % 2 === 0 && [0, 4, 8].includes(st)) coro(t, [N('C4'), N('G4')], dur16 * 3, 0.12 * v);
    if (bar % 2 === 1 && [0, 2, 4].includes(st)) coro(t, [N('D4'), N('A4')], dur16 * 1.6, 0.12 * v);
    if (bar % 2 === 1 && st === 6) coro(t, [N('C4'), N('G4'), N('E4')], dur16 * 6, 0.11 * v);
  } else if (style === 'ole') {
    // o estádio inteiro cantando "olé", com palmas no contratempo e o bumbo marcando
    if (st === 0 || st === 8) bumbo(t, 0.55 * v);
    if (st === 4 || st === 12) palma(t, 0.7 * v);
    if (hot && st % 2 === 1) chocalho(t, 0.08 * v);
    for (const [at, notes, len] of OLE[bar % 2]) if (at === st) coro(t, notes.map(N), dur16 * len * 0.95, 0.13 * v);
  } else if (style === 'corneta') {
    if (st === 0) ensureLoops();
    // cornetas: umas compridas e outras curtinhas, cada uma num tom um pouco diferente (ninguém combina)
    if (st === 0 || st === 8 || st === 11) bumbo(t, 0.6 * v);
    if (st === 4 || st === 12) caixa(t, 0.25 * v);
    const b = 233.08 * (1 + ((bar * 7) % 5) * 0.012);
    if (st === 0) corneta(t, b, dur16 * 5, 0.07 * v);
    if (st === 8 || st === 10) corneta(t, b * 1.03, dur16 * 1.4, 0.06 * v);
    if (st === 12) corneta(t, b * 0.98, dur16 * 3.5, 0.07 * v);
    if (hot && st % 4 === 2) corneta(t, b * (1.2 + Math.random() * 0.1), dur16 * 1.2, 0.05 * v);
  } else if (style === 'pagode') {
    // pagode de arquibancada: pandeiro, tantã, cavaquinho e o coro "lá-iá" quando esquenta
    pandeiro(t, ([2, 6, 10, 14].includes(st) ? 0.16 : 0.07) * v, st === 0 || st === 8);
    if ([0, 6, 8, 14].includes(st)) tanta(t, 0.55 * v);
    if (st === 3 || st === 11) tamborim(t, 0.1 * v);
    if ([2, 5, 10, 13].includes(st)) cavaco(t, CAVACO[bar % 4].map(N), 0.07 * v);
    if (hot && bar % 2 === 0 && (st === 0 || st === 4)) coro(t, [N('G4'), N('D5')], dur16 * 3, 0.1 * v);
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
  stopLoops();
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
  /** Abaixa a música enquanto o narrador fala. */
  duck(secs: number) {
    if (!ctx || !out) return;
    const t = ctx.currentTime;
    const normal = t < boostUntil ? 0.5 : 0.22 + 0.2 * Math.min(1, level);
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.linearRampToValueAtTime(normal * 0.45, t + 0.1);
    out.gain.setTargetAtTime(normal, t + secs, 0.3);
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
