/* Sons sintetizados na hora (sem arquivos): apito, chute, rede, trave, torcida.
 * E a narração, falada pela voz do próprio aparelho no idioma escolhido.
 */
import { LANGS, type CallKey, type Lang } from './i18n';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let crowdGain: GainNode | null = null;
let enabled = true;

function noiseBuffer(c: AudioContext, secs: number, brown = false): AudioBuffer {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * secs), c.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}

/** Precisa de um toque do usuário antes (regra dos navegadores). */
export function initAudio() {
  if (ctx) { void ctx.resume(); return; }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = enabled ? 0.9 : 0;
  master.connect(ctx.destination);
  // murmúrio da torcida, sempre ligado bem baixinho
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 4, true);
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'bandpass'; lp.frequency.value = 700; lp.Q.value = 0.6;
  crowdGain = ctx.createGain();
  crowdGain.gain.value = 0.18;
  src.connect(lp).connect(crowdGain).connect(master);
  src.start();
}

export function setSound(on: boolean) {
  enabled = on;
  if (master && ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
  if (!on) stopTalking();
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export function whistle() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  for (const [start, len] of [[0, 0.12], [0.18, 0.45]]) {
    const o = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 2900;
    lfo.frequency.value = 38; lg.gain.value = 140;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0, t + start);
    g.gain.linearRampToValueAtTime(0.16, t + start + 0.02);
    g.gain.setValueAtTime(0.16, t + start + len - 0.04);
    g.gain.linearRampToValueAtTime(0, t + start + len);
    o.connect(g).connect(master);
    o.start(t + start); lfo.start(t + start);
    o.stop(t + start + len + 0.05); lfo.stop(t + start + len + 0.05);
  }
}

export function kick() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  env(g, t, 0.9, 0.003, 0.16);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 0.2);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.08);
  const ng = ctx.createGain();
  env(ng, t, 0.25, 0.001, 0.05);
  n.connect(ng).connect(master);
  n.start(t);
}

export function net() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.5);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 2500;
  const g = ctx.createGain();
  env(g, t, 0.35, 0.01, 0.4);
  n.connect(f).connect(g).connect(master);
  n.start(t);
}

export function post() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  for (const [f, v] of [[880, 0.3], [1960, 0.18], [3100, 0.08]]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    env(g, t, v, 0.002, 0.9);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 1);
  }
}

/** Torcida: 'cheer' no gol, 'ohh' no quase, 'clap' na defesa. */
export function crowd(kind: 'cheer' | 'ohh' | 'clap') {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 3);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = kind === 'ohh' ? 420 : 900;
  f.Q.value = kind === 'ohh' ? 2 : 0.7;
  if (kind === 'ohh') f.frequency.exponentialRampToValueAtTime(250, t + 1.4);
  const g = ctx.createGain();
  const peak = kind === 'cheer' ? 0.7 : kind === 'ohh' ? 0.5 : 0.35;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + (kind === 'cheer' ? 0.25 : 0.15));
  g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'cheer' ? 2.8 : 1.6));
  n.connect(f).connect(g).connect(master);
  n.start(t);
  if (kind === 'clap') {
    // palmas: estalos curtos
    for (let i = 0; i < 14; i++) {
      const c = ctx.createBufferSource();
      c.buffer = noiseBuffer(ctx, 0.03);
      const cg = ctx.createGain();
      const at = t + 0.1 + i * 0.09 + Math.random() * 0.04;
      env(cg, at, 0.12, 0.001, 0.03);
      c.connect(cg).connect(master);
      c.start(at);
    }
  }
}

// ---------- narração ----------

let narrate = true;
export function setNarration(on: boolean) { narrate = on; if (!on) stopTalking(); }

function stopTalking() {
  try { window.speechSynthesis?.cancel(); } catch { /* sem voz */ }
}

/** Fala uma frase da narração e devolve o texto (também mostrado na tela). */
export function call(lang: Lang, key: CallKey): string {
  const lines = LANGS[lang].calls[key];
  const text = lines[Math.floor(Math.random() * lines.length)];
  if (narrate && enabled && 'speechSynthesis' in window) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = LANGS[lang].voice;
      const v = speechSynthesis.getVoices().find((x) => x.lang.replace('_', '-').startsWith(u.lang.slice(0, 2)));
      if (v) u.voice = v;
      u.rate = key === 'goal' || key === 'corner' || key === 'champion' ? 1.15 : 1.05;
      u.pitch = key === 'goal' || key === 'corner' ? 1.25 : 1.05;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* sem voz */ }
  }
  return text;
}
