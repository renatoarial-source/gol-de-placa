/* Sons do jogo: gravações reais (torcida do Maracanã e do Mineirão, apito, chute, rede, chuva; ver public/sfx/LEIA-ME.txt)
 * e, se uma gravação não carregar, a versão sintetizada na hora.
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
  void loadCrowd(ctx, master);
  if (rainOn) startRain(); // começou a chover antes do primeiro toque liberar o som
  for (const fn of onReady) fn(ctx, master);
}

// ---------- torcida gravada (Pixabay Content License; ver public/sfx/LEIA-ME.txt) ----------

const SFX = {
  fundo: './sfx/torcida-maracana.mp3',
  cheer: ['./sfx/torcida-gol.mp3', './sfx/torcida-gol2.mp3', './sfx/torcida-gol3.mp3', './sfx/torcida-gol4.mp3'],
  ohh: ['./sfx/torcida-uhh.mp3', './sfx/torcida-uhh2.mp3', './sfx/torcida-uhh3.mp3'],
  clap: ['./sfx/torcida-aplauso.mp3'],
  // torcedores gritando gol na arquibancada (misturados à torcida, não competem com o narrador)
  grito: ['./sfx/torcedor-gooool.mp3', './sfx/torcedor-gol-gol.mp3'],
};
/** Efeitos gravados do lance e as músicas de estádio (usadas pelo music.ts). */
export const REC = {
  apito: './sfx/apito.mp3', chute: './sfx/chute.mp3', rede: './sfx/rede.mp3', chuva: './sfx/chuva.mp3',
  bateria: './sfx/bateria.mp3', vuvuzelas: './sfx/vuvuzelas.mp3',
  cantos: ['./sfx/canto1.mp3', './sfx/canto2.mp3', './sfx/canto3.mp3'],
};
/** Gravação já carregada (ou undefined enquanto carrega / se falhar). */
export const recorded = (url: string): AudioBuffer | undefined => sfx.get(url);
/** Toca uma gravação uma vez; devolve false se ela ainda não carregou. */
function playRec(url: string, vol: number, rate = 1, delay = 0): boolean {
  const b = sfx.get(url);
  if (!ctx || !master || !b) return false;
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol;
  s.connect(g).connect(master);
  s.start(ctx.currentTime + delay);
  return true;
}
const sfx = new Map<string, AudioBuffer>();
let crowdBed: GainNode | null = null;
let crowdSize = 1; // lotado 1, média 0.6, pouca 0.3

async function loadCrowd(c: AudioContext, out: GainNode) {
  const get = async (url: string) => {
    try {
      const r = await fetch(url);
      if (r.ok) sfx.set(url, await c.decodeAudioData(await r.arrayBuffer()));
    } catch { /* fica com a torcida sintetizada */ }
  };
  await Promise.all([SFX.fundo, ...SFX.cheer, ...SFX.ohh, ...SFX.clap, ...SFX.grito, REC.apito, REC.chute, REC.rede, REC.chuva].map(get));
  if (rainOn && !rainRec) { stopRain(); startRain(); } // a chuva gravada chegou: troca a sintetizada
  // as músicas de estádio são maiores: carregam depois, sem atrasar o resto
  void Promise.all([REC.bateria, REC.vuvuzelas, ...REC.cantos].map(get));
  const bed = sfx.get(SFX.fundo);
  if (!bed || !crowdGain) return;
  // torcida de fundo gravada, em loop; o murmúrio sintetizado sai de cena
  const s = c.createBufferSource();
  s.buffer = bed; s.loop = true;
  crowdBed = c.createGain();
  crowdBed.gain.setValueAtTime(0, c.currentTime);
  crowdBed.gain.linearRampToValueAtTime(0.55 * crowdSize, c.currentTime + 1.5);
  s.connect(crowdBed).connect(out);
  s.start();
  crowdGain.gain.setTargetAtTime(0, c.currentTime, 0.5);
}

// ---------- chuva: um chiado baixinho de fundo enquanto chove ----------
let rainSrc: AudioBufferSourceNode | null = null;
let rainGain: GainNode | null = null;
let rainOn = false;
let rainTimer: number | null = null;
let rainRec = false;
function startRain() {
  if (!ctx || !master || rainSrc) return;
  const c = ctx;
  const rec = sfx.get(REC.chuva);
  if (rec) {
    // chuva gravada de verdade, em loop, baixinha por baixo da torcida
    rainRec = true;
    rainSrc = c.createBufferSource();
    rainSrc.buffer = rec;
    rainSrc.loop = true;
    rainGain = c.createGain();
    rainGain.gain.setValueAtTime(0, c.currentTime);
    rainGain.gain.linearRampToValueAtTime(0.45, c.currentTime + 1.5);
    rainSrc.connect(rainGain).connect(master);
    rainSrc.start();
    return;
  }
  rainRec = false;
  rainSrc = c.createBufferSource();
  rainSrc.buffer = noiseBuffer(c, 4);
  rainSrc.loop = true;
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
  rainGain = c.createGain();
  rainGain.gain.setValueAtTime(0, c.currentTime);
  rainGain.gain.linearRampToValueAtTime(0.07, c.currentTime + 1.5);
  rainSrc.connect(hp).connect(lp).connect(rainGain).connect(master);
  rainSrc.start();
  // de vez em quando, gotas mais grossas pingando
  rainTimer = window.setInterval(() => {
    if (!ctx || !master || !rainGain) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const at = t + Math.random() * 0.3;
      o.frequency.setValueAtTime(1800 + Math.random() * 1500, at);
      o.frequency.exponentialRampToValueAtTime(600, at + 0.04);
      env(g, at, 0.012, 0.001, 0.05);
      o.connect(g).connect(master);
      o.start(at); o.stop(at + 0.08);
    }
  }, 700);
}
function stopRain() {
  if (rainTimer !== null) { clearInterval(rainTimer); rainTimer = null; }
  if (!ctx || !rainSrc || !rainGain) return;
  const s = rainSrc;
  rainGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  setTimeout(() => { try { s.stop(); } catch { /* já parou */ } }, 2000);
  rainSrc = null; rainGain = null;
}
/** Chuva no campo: liga ou desliga o som de chuva (baixinho, por baixo da torcida). */
export function setRain(on: boolean) {
  rainOn = on;
  if (on) startRain(); else stopRain();
}

/** Tamanho da torcida (lotado, média, pouca): muda o volume do fundo e das reações. */
export function setCrowdSize(size: 'full' | 'half' | 'few') {
  crowdSize = size === 'full' ? 1 : size === 'half' ? 0.6 : 0.3;
  if (ctx && crowdBed) crowdBed.gain.setTargetAtTime(0.55 * crowdSize, ctx.currentTime, 0.4);
}

/** Toca uma reação gravada; devolve false se ainda não carregou (aí usa a sintetizada). */
function crowdClip(kind: 'cheer' | 'ohh' | 'clap'): boolean {
  if (!ctx || !master) return false;
  // no gol, às vezes um torcedor perto grita "goooool" junto com a torcida
  if (kind === 'cheer' && Math.random() < 0.6) {
    const g = SFX.grito[Math.floor(Math.random() * SFX.grito.length)];
    playRec(g, 0.55 * (0.5 + 0.5 * crowdSize), 0.97 + Math.random() * 0.06, 0.35 + Math.random() * 0.3);
  }
  const list = SFX[kind].map((u) => sfx.get(u)).filter((b): b is AudioBuffer => !!b);
  if (!list.length) return false;
  const s = ctx.createBufferSource();
  s.buffer = list[Math.floor(Math.random() * list.length)];
  s.playbackRate.value = 0.96 + Math.random() * 0.08; // cada reação um pouco diferente
  const g = ctx.createGain();
  g.gain.value = (kind === 'cheer' ? 1 : kind === 'ohh' ? 0.85 : 0.75) * (0.45 + 0.55 * crowdSize);
  s.connect(g).connect(master);
  s.start();
  // no gol, a torcida de fundo cresce junto e volta devagar
  if (kind === 'cheer' && crowdBed) {
    const t = ctx.currentTime;
    crowdBed.gain.cancelScheduledValues(t);
    crowdBed.gain.setValueAtTime(crowdBed.gain.value, t);
    crowdBed.gain.linearRampToValueAtTime(0.9 * crowdSize, t + 0.3);
    crowdBed.gain.setTargetAtTime(0.55 * crowdSize, t + 2.5, 1.2);
  }
  return true;
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
  if (playRec(REC.apito, 0.8)) return;
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
  if (playRec(REC.chute, 1, 0.95 + Math.random() * 0.1)) return;
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
  if (playRec(REC.rede, 0.9)) return;
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

/** Sininho das figurinhas e dos desafios completados. */
export function chime() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  [1046.5, 1318.5, 1568].forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    env(g, t + i * 0.09, 0.22, 0.005, 0.5);
    o.connect(g).connect(master!);
    o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.6);
  });
}

/** Torcida: 'cheer' no gol, 'ohh' no quase, 'clap' na defesa. */
export function crowd(kind: 'cheer' | 'ohh' | 'clap') {
  if (!ctx || !master) return;
  if (crowdClip(kind)) return;
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
/** Última fala de cada lance, para a próxima ser diferente (ex.: "Que defesa!" e depois "Que goleiro!"). */
const lastCall = new Map<string, number>();
export function call(lang: Lang, key: CallKey): string {
  const lines = LANGS[lang].calls[key];
  const prev = lastCall.get(key) ?? -1;
  let i = Math.floor(Math.random() * lines.length);
  if (lines.length > 1 && i === prev) i = (i + 1 + Math.floor(Math.random() * (lines.length - 1))) % lines.length;
  lastCall.set(key, i);
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
