/* Sons sintetizados na hora (sem arquivos): apito, chute, rede, trave, torcida.
 * E a narração, falada pela voz do próprio aparelho no idioma escolhido.
 */
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
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
  unlockVoice();
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
  for (const fn of onReady) fn(ctx, master);
}

const onReady: ((c: AudioContext, out: GainNode) => void)[] = [];
/** Quem precisa do áudio (música, narração) pluga aqui; roda quando o primeiro toque libera o som. */
export function whenAudioReady(fn: (c: AudioContext, out: GainNode) => void) {
  onReady.push(fn);
  if (ctx && master) fn(ctx, master);
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

export type Voice = 'off' | 'male' | 'female';
let voiceMode: Voice = 'male';
export function setNarration(v: Voice) { voiceMode = v; if (v === 'off') stopTalking(); }

const synth = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);
function stopTalking() {
  try { synth()?.cancel(); } catch { /* sem voz */ }
  if (Capacitor.isNativePlatform()) void TextToSpeech.stop().catch(() => {});
}

// Nomes de vozes conhecidas (Apple, Google, Microsoft) para escolher narrador ou narradora.
const MALE = /\b(daniel|alex|fred|aaron|arthur|gordon|lee|oliver|rishi|tom|felipe|rafael|ricardo|antonio|jorge|juan|diego|carlos|pablo|markus|martin|yannick|thomas|nicolas|luca|cosimo|li-mu|otoya|hattori|reed|eddy|grandpa|rocko|male|homem|masculin)/i;
const FEMALE = /\b(samantha|victoria|karen|moira|tessa|fiona|allison|ava|susan|zoe|serena|luciana|joana|fernanda|francisca|heloisa|raquel|monica|mónica|paulina|marisol|anna|petra|helena|amelie|amélie|audrey|aurelie|marie|alice|federica|paola|elsa|tingting|ting-ting|meijia|sinji|yu-shu|kyoko|o-ren|sayaka|flo|sandy|shelley|grandma|female|mulher|feminin)/i;

// No app (iPhone/Android) a voz vem do sistema pelo plugin nativo; no navegador, da Web Speech API.
const native = Capacitor.isNativePlatform();
interface V { name: string; lang: string; index: number; web?: SpeechSynthesisVoice }
let voices: V[] = [];
let onVoicesFn: () => void = () => {};
/** Avisa quando a lista de vozes do aparelho chega (ela vem com atraso). */
export function onVoices(fn: () => void) { onVoicesFn = fn; }
function loadVoices() {
  if (native) {
    void TextToSpeech.getSupportedVoices().then(({ voices: list }) => {
      voices = list.map((v, index) => ({ name: v.name, lang: v.lang, index }));
      onVoicesFn();
    }).catch(() => {});
    return;
  }
  const before = voices.length;
  try { voices = (synth()?.getVoices() ?? []).map((v, index) => ({ name: v.name, lang: v.lang, index, web: v })); } catch { voices = []; }
  if (voices.length !== before) onVoicesFn();
}
loadVoices();
if (!native && synth()) synth()!.addEventListener?.('voiceschanged', loadVoices);

/** Melhor voz para o idioma e o gênero. Se o aparelho não tiver uma do gênero pedido, usa outra
 * voz do idioma com o tom mudado (real = false). */
function pickVoice(lang: string, want: 'male' | 'female'): { voice?: V; pitch: number; rate: number; real: boolean } {
  if (!voices.length) loadVoices();
  const norm = (v: V) => v.lang.replace('_', '-').toLowerCase();
  const exact = voices.filter((v) => norm(v) === lang.toLowerCase());
  const same = exact.length ? exact : voices.filter((v) => norm(v).startsWith(lang.slice(0, 2).toLowerCase()));
  const re = want === 'male' ? MALE : FEMALE;
  const other = want === 'male' ? FEMALE : MALE;
  const rate = want === 'male' ? 0.96 : 1.06;
  const hit = same.find((v) => re.test(v.name));
  if (hit) return { voice: hit, pitch: 1, rate, real: true };
  const v = same.find((x) => !other.test(x.name)) ?? same[0];
  const otherGender = v ? other.test(v.name) : false;
  return { voice: v, pitch: want === 'male' ? (otherGender ? 0.6 : 0.8) : otherGender ? 1.4 : 1.2, rate, real: false };
}

/** Qual voz está sendo usada (mostrada embaixo da escolha de narração). */
export function voiceInfo(lang: Lang): { name: string; real: boolean } | null {
  if (voiceMode === 'off') return null;
  const p = pickVoice(LANGS[lang].voice, voiceMode);
  return { name: p.voice?.name.replace(/\s*\(.*\)$/, '') ?? '', real: p.real };
}

/** O iPhone só deixa falar depois de um toque: na primeira interação, "fala" algo mudo. */
let unlocked = false;
export function unlockVoice() {
  if (unlocked || native) return;
  const s = synth();
  if (!s) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    s.speak(u);
    unlocked = true;
  } catch { /* sem voz */ }
}

// ---------- narração gravada (vozes neurais geradas e guardadas no app: public/voice) ----------

const clips = new Map<string, Promise<AudioBuffer | null>>();
let speaking: AudioBufferSourceNode | null = null;
let onSpeakFn: (secs: number) => void = () => {};
/** Avisa quando o narrador começa a falar (para abaixar a música). */
export function onSpeak(fn: (secs: number) => void) { onSpeakFn = fn; }

function clipUrl(lang: Lang, v: 'male' | 'female', key: string, i: number) {
  return `./voice/${lang}/${v}/${key}-${i}.mp3`;
}
function loadClip(url: string): Promise<AudioBuffer | null> {
  if (!clips.has(url)) {
    clips.set(url, (async () => {
      if (!ctx) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch { return null; }
    })());
  }
  return clips.get(url)!;
}
/** Carrega antes todas as falas do idioma e da voz escolhidos. */
export function preloadVoice(lang: Lang) {
  if (!ctx || voiceMode === 'off') return;
  for (const [key, lines] of Object.entries(LANGS[lang].calls)) lines.forEach((_, i) => void loadClip(clipUrl(lang, voiceMode as 'male', key, i)));
}

function playClip(buf: AudioBuffer) {
  if (!ctx || !master) return;
  try { speaking?.stop(); } catch { /* já parou */ }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 1.15;
  src.connect(g).connect(master);
  src.start();
  speaking = src;
  onSpeakFn(buf.duration);
}

/** Voz do sistema (reserva, se o áudio gravado não carregar). */
function speakSystem(lang: Lang, key: CallKey, text: string) {
  const code = LANGS[lang].voice;
  const { voice, pitch, rate } = pickVoice(code, voiceMode as 'male');
  const hype = key === 'goal' || key === 'corner' || key === 'champion';
  const p = Math.min(2, pitch * (hype ? 1.1 : 1));
  const r = rate * (hype ? 1.1 : 1);
  if (native) {
    void TextToSpeech.stop().catch(() => {}).then(() =>
      TextToSpeech.speak({ text, lang: code, rate: r, pitch: p, volume: 1, voice: voice?.index, category: 'playback' })).catch(() => {});
    return;
  }
  const s = synth();
  if (!s) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = code;
    if (voice?.web) u.voice = voice.web;
    u.rate = r;
    u.pitch = p;
    u.volume = 1;
    const busy = s.speaking || s.pending;
    if (busy) s.cancel();
    s.resume();
    if (busy) setTimeout(() => s.speak(u), 80); else s.speak(u);
  } catch { /* sem voz */ }
}

/** Fala uma frase da narração e devolve o texto (também mostrado na tela). */
export function call(lang: Lang, key: CallKey): string {
  const lines = LANGS[lang].calls[key];
  const i = Math.floor(Math.random() * lines.length);
  const text = lines[i];
  if (voiceMode === 'off' || !enabled) return text;
  const asked = performance.now();
  const v = voiceMode;
  void (ctx ? loadClip(clipUrl(lang, v, key, i)) : Promise.resolve(null)).then((buf) => {
    if (voiceMode !== v) return;
    if (buf) { if (performance.now() - asked < 700) playClip(buf); } // atrasada demais: deixa passar
    else speakSystem(lang, key, text);
  });
  return text;
}
