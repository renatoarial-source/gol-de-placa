// Grava vídeos curtos verticais (1080x1920, H.264 + AAC) do Gol de Placa para TikTok / Reels / Shorts.
// Uso: npm run build && npx vite preview --port 4193 &   depois   BASE_URL=http://localhost:4193 node store/videos.mjs
// Variáveis: ONLY=1-golaco (só os vídeos que começam assim), CHROMIUM_PATH=..., OUT=pasta de saída (padrão store/videos)
//
// Como grava, sem engasgos mesmo com o WebGL lento (swiftshader):
//  - o relógio da página é virtual (performance.now, setTimeout, setInterval, requestAnimationFrame e as
//    animações CSS): o script avança 1/30 s, a cena desenha um quadro e o script tira a foto. Cada quadro
//    do vídeo é exatamente 1/30 s do jogo, por mais que o navegador demore para desenhar.
//  - o áudio do jogo (apito, chute, rede, torcida, batucada e o narrador gravado) é "gravado" trocando o
//    AudioContext por um OfflineAudioContext cujo relógio é o mesmo relógio virtual; no fim, ele é
//    renderizado e vira a trilha do vídeo, sincronizada quadro a quadro.
//  - Math.random tem semente: cada tomada é reproduzível; se o lance não sair como o roteiro pede
//    (gol, defesa), tenta a próxima semente.
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || 'http://localhost:4193';
const OUT = process.env.OUT || path.join(DIR, 'videos');
const FPS = 30;
const FRAME = 1000 / FPS;
const VP = { width: 360, height: 640 }; // x3 = 1080 x 1920
const ICON = 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, 'graphics', 'icon-512.png')).toString('base64');

// ---------- relógio virtual, sorteio com semente e áudio offline (roda antes do jogo) ----------
function virtualTime({ seed, audioSecs }) {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  let rafs = new Map();
  const realTimeout = window.setTimeout.bind(window);
  const flush = () => new Promise((r) => realTimeout(r, 0));
  performance.now = () => now;
  window.setTimeout = (fn, ms = 0, ...a) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, +ms || 0), fn, a, iv: 0 }); return id; };
  window.setInterval = (fn, ms = 0, ...a) => { const id = ++seq; const iv = Math.max(4, +ms || 0); timers.set(id, { at: now + iv, fn, a, iv }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = ++seq; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { rafs.delete(id); };

  // sorteio reproduzível (mulberry32)
  let s = seed >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  // animações e transições CSS andam no mesmo relógio
  const stepAnims = (dt) => {
    for (const an of document.getAnimations()) {
      if (an.__v === undefined) { an.pause(); an.__v = Number(an.currentTime) || 0; }
      an.__v += dt;
      try { an.currentTime = an.__v; } catch { /* acabou */ }
    }
  };

  // áudio: tudo que o jogo tocar vai para um OfflineAudioContext no relógio virtual
  const SR = 44100;
  let vac = null;
  class VirtualAudio extends OfflineAudioContext {
    constructor() { super(2, Math.ceil(SR * audioSecs), SR); vac = this; }
    get currentTime() { return now / 1000; }
    get state() { return 'running'; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  // o jogo dá start()/stop() sem horário ("agora"): no áudio offline, "agora" é o relógio virtual
  // (AudioBufferSourceNode tem o próprio start, com offset e duração)
  const clips = [];
  for (const S of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
    const start0 = S.start, stop0 = S.stop;
    S.start = function (when = 0, ...a) {
      const d = this.buffer?.duration ?? 0;
      if (d > 0.6 && d < 2.95 && Math.abs(d - 2) > 1e-6 && !this.loop) clips.push(`${(now / 1000).toFixed(2)}s:${d.toFixed(2)}`); // falas do narrador
      return start0.call(this, Math.max(when, now / 1000), ...a);
    };
    S.stop = function (when = 0) { return stop0.call(this, Math.max(when, now / 1000)); };
  }
  window.AudioContext = VirtualAudio;
  window.webkitAudioContext = VirtualAudio;
  // sem voz do sistema (a narração gravada é a que vale)
  try { Object.defineProperty(window, 'speechSynthesis', { value: undefined }); } catch { /* ok */ }

  window.__vt = {
    now: () => now,
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at || (t.at === next[1].at && id < next[0]))) next = [id, t];
        if (!next) break;
        const [id, t] = next;
        now = Math.max(now, t.at);
        if (t.iv) t.at += t.iv; else timers.delete(id);
        try { if (typeof t.fn === 'function') t.fn(...t.a); } catch (e) { console.error(e); }
        await flush();
      }
      now = end;
      const cbs = [...rafs.values()];
      rafs = new Map();
      for (const fn of cbs) { try { fn(now); } catch (e) { console.error(e); } }
      stepAnims(ms);
      await flush();
    },
    /** Toca uma fala gravada do narrador (public/voice) no instante atual. */
    async say(file, gain = 1.2) {
      if (!vac) return;
      const buf = await vac.decodeAudioData(await (await fetch(file)).arrayBuffer());
      const src = vac.createBufferSource();
      src.buffer = buf;
      const g = vac.createGain();
      g.gain.value = gain;
      src.connect(g).connect(vac.destination);
      src.start(now / 1000);
    },
    hasAudio: () => !!vac,
    clips: () => clips.join(' '),
    /** Renderiza o áudio e devolve um WAV 16 bits em base64. */
    async render() {
      if (!vac) return null;
      const buf = await vac.startRendering();
      const n = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(1)];
      const out = new DataView(new ArrayBuffer(44 + n * 4));
      const str = (o, x) => { for (let i = 0; i < x.length; i++) out.setUint8(o + i, x.charCodeAt(i)); };
      str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
      out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, SR, true);
      out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
      for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < 2; c++, o += 2) out.setInt16(o, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true);
      const bytes = new Uint8Array(out.buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
  };
}

// ---------- visual dos vídeos: legendas, toques e cartão final ----------
const OVERLAY = `
  #hint { display: none !important; }
  #vcap { position: fixed; left: 12px; right: 12px; top: 92px; z-index: 99999; pointer-events: none;
    font: 900 25px/1.22 -apple-system, "Segoe UI", Roboto, sans-serif; color: #fff; text-align: center;
    text-shadow: 0 2px 6px rgba(0,0,0,.85); }
  #vcap span { display: inline-block; background: rgba(0,0,0,.6); border-radius: 14px; padding: 5px 14px; margin: 3px 0; }
  #vcap.big { top: 50%; font-size: 34px; }
  #vcap.bottom { top: auto; bottom: 150px; }
  #vcap.mid { top: 192px; }
  #vcap.big span { background: #ffd400; color: #12245a; text-shadow: none; }
  #vcap.pop span { animation: vpop .35s ease-out both; }
  @keyframes vpop { from { transform: scale(.4); opacity: 0; } 70% { transform: scale(1.12); opacity: 1; } to { transform: scale(1); } }
  .vtap { position: fixed; z-index: 99999; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
    background: rgba(255,255,255,.55); border: 3px solid #fff; pointer-events: none; animation: vtap .6s ease-out forwards; }
  @keyframes vtap { from { transform: scale(.5); opacity: 1; } to { transform: scale(1.7); opacity: 0; } }
  #vbadge { position: fixed; right: 12px; top: 92px; z-index: 99998; pointer-events: none; background: #e8261c; color: #fff;
    font: 900 15px/1 -apple-system, "Segoe UI", Roboto, sans-serif; padding: 7px 11px; border-radius: 10px; transform: rotate(4deg);
    box-shadow: 0 3px 10px rgba(0,0,0,.4); letter-spacing: .5px; }
  #vend { position: fixed; inset: 0; z-index: 100000; display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: radial-gradient(circle at 50% 30%, #2f8a3c, #145a24 55%, #0b2e14); color: #fff; text-align: center;
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif; opacity: 0; transition: opacity .45s; }
  #vend::before { content: ''; position: absolute; inset: 0; opacity: .12;
    background: repeating-linear-gradient(90deg, #fff 0 34px, transparent 34px 68px); }
  #vend > * { position: relative; }
  #vend img { width: 132px; height: 132px; border-radius: 30px; box-shadow: 0 8px 24px rgba(0,0,0,.45); animation: vin .6s .1s ease-out both; }
  #vend h1 { font-size: 40px; margin: 16px 0 2px; letter-spacing: 1px; font-weight: 900; text-shadow: 0 4px 0 #0b2e14; animation: vin .6s .2s ease-out both; }
  #vend .soon { margin-top: 14px; background: #ffd400; color: #12245a; padding: 10px 22px; border-radius: 14px; font-weight: 900;
    font-size: 25px; transform: rotate(-3deg); box-shadow: 0 5px 0 #b38f00; animation: vin .6s .35s ease-out both, vpulse .8s 1s ease-in-out infinite alternate; }
  #vend .soon small { display: block; font-size: 16px; font-weight: 800; margin-top: 2px; }
  #vend p { font-size: 18px; font-weight: 700; margin: 22px 26px 0; line-height: 1.3; animation: vin .6s .5s ease-out both; }
  #vend p.follow { margin-top: 14px; font-size: 19px; } #vend p.follow b { color: #ffd400; }
  #vend .bio { margin-top: 14px; background: #fff; color: #145a24; padding: 10px 20px; border-radius: 999px; font-weight: 900; font-size: 16px;
    animation: vin .6s .65s ease-out both; }
  @keyframes vin { from { transform: translateY(24px) scale(.9); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes vpulse { from { transform: rotate(-3deg) scale(1); } to { transform: rotate(-3deg) scale(1.07); } }
`;

class Take {
  constructor(page, dir) { this.page = page; this.dir = dir; this.rec = false; this.segs = []; this.n = 0; }
  /** Avança um quadro; se estiver gravando, fotografa. */
  async frame() {
    await this.page.evaluate((ms) => window.__vt.advance(ms), FRAME);
    if (this.rec) {
      await this.page.screenshot({ path: path.join(this.dir, `f${String(this.n).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
      this.n++;
    }
  }
  async wait(ms) { for (let t = 0; t < ms - 1; t += FRAME) await this.frame(); }
  /** Avança até a condição (avaliada na página) valer. */
  async until(fn, arg, maxMs = 20000) {
    for (let t = 0; t < maxMs; t += FRAME) {
      if (await this.page.evaluate(fn, arg)) return true;
      await this.frame();
    }
    throw new Error('tempo esgotado esperando: ' + fn.toString().slice(0, 80));
  }
  async start() { if (this.rec || this.dry) return; this.rec = true; this.segs.push({ t0: await this.now(), f0: this.n }); }
  async stop() { if (!this.rec) return; this.rec = false; const s = this.segs[this.segs.length - 1]; s.t1 = s.t0 + (this.n - s.f0) * FRAME; }
  now() { return this.page.evaluate(() => window.__vt.now()); }
  caption(text, cls = '') {
    return this.page.evaluate(([t, c]) => {
      let el = document.getElementById('vcap');
      if (!el) { el = document.createElement('div'); el.id = 'vcap'; document.body.appendChild(el); }
      el.className = c;
      el.innerHTML = t ? t.split('<br>').map((l) => `<span>${l}</span>`).join('<br>') : '';
    }, [text, cls]);
  }
  badge(text) {
    return this.page.evaluate((t) => {
      let el = document.getElementById('vbadge');
      if (!el) { el = document.createElement('div'); el.id = 'vbadge'; document.body.appendChild(el); }
      el.textContent = t; el.style.display = t ? '' : 'none';
    }, text);
  }
  say(who, key) { return this.page.evaluate((f) => window.__vt.say(f), `./voice/pt/${who}/${key}.mp3`); }
  /** Toque com a bolinha branca de indicação. */
  async tapAt(x, y, delay = 150) {
    await this.page.evaluate(([x, y]) => {
      const d = document.createElement('div'); d.className = 'vtap'; d.style.left = x + 'px'; d.style.top = y + 'px';
      document.body.appendChild(d); setTimeout(() => d.remove(), 700);
    }, [x, y]);
    if (delay) await this.wait(delay);
    await this.page.mouse.click(x, y);
    await this.frame();
  }
  async tap(sel) {
    const b = await this.page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, sel);
    if (!b) throw new Error('não achei ' + sel);
    await this.page.evaluate(([x, y]) => {
      const d = document.createElement('div'); d.className = 'vtap'; d.style.left = x + 'px'; d.style.top = y + 'px';
      document.body.appendChild(d); setTimeout(() => d.remove(), 700);
    }, [b.x, b.y]);
    await this.wait(150);
    await this.page.mouse.click(b.x, b.y);
    // a tela se redesenha ao tocar (e volta para o topo): mantém o botão onde estava, sem pulos
    await this.page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel);
    await this.frame();
  }
  /** Gesto de chute até o ponto (x, y) do gol, com "barriga" lateral (curva). */
  async swipeTo(x, y, { belly = 0.08, steps = 8 } = {}) {
    const end = await this.page.evaluate(([gx, gy]) => window.__gol.pitch.screenOf(gx, gy, 0), [x, y]);
    const sx = VP.width / 2, sy = VP.height * 0.88;
    await this.page.mouse.move(sx, sy);
    await this.page.mouse.down();
    await this.frame();
    for (let k = 1; k <= steps; k++) {
      await this.page.mouse.move(sx + (end.x - sx) * k / steps + Math.sin(k / steps * Math.PI) * VP.width * belly, sy + (end.y - sy) * k / steps);
      await this.page.evaluate((ms) => window.__vt.advance(ms), FRAME / 2);
      if (k % 2 === 0) await this.frameShot();
    }
    await this.page.mouse.up();
    await this.frame();
  }
  /** Foto sem avançar o relógio (o gesto já avançou). */
  async frameShot() {
    if (!this.rec) return;
    await this.page.screenshot({ path: path.join(this.dir, `f${String(this.n).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    this.n++;
  }
  /** Cartão final: em breve na App Store. */
  async endCard(line) {
    await this.caption('');
    await this.badge('');
    await this.page.evaluate(([icon, l]) => {
      const e = document.createElement('div'); e.id = 'vend';
      e.innerHTML = `<img src="${icon}" alt=""><h1>⚽ Gol de Placa</h1>
        <div class="soon">EM BREVE<small>na App Store</small></div>
        <p>${l}</p>
        <p class="follow">Siga <b>@arial.gamer</b> para saber quando sair 🔔</p>
        <div class="bio">👆 link na bio · arialgamer.github.io</div>`;
      document.body.appendChild(e);
      requestAnimationFrame(() => { e.style.opacity = '1'; });
    }, [ICON, line]);
    await this.wait(3600);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Abre o jogo num contexto novo, com relógio virtual e preferências prontas. */
async function openGame(browser, dir, seed, prefs = {}, audioSecs = 70) {
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [página]', e.message));
  // primeiro grava as preferências (sem relógio virtual), depois recarrega com ele
  await page.goto(BASE);
  await page.evaluate((x) => {
    localStorage.clear();
    const set = { lang: 'pt', 'unlocked.v1': '1', sound: '1', voice: 'male', music: 'batucada', tutKick: '1', tutKeep: '1', diff: 'easy', ...x };
    for (const [k, v] of Object.entries(set)) localStorage.setItem('gol.' + k, v);
  }, prefs);
  await page.addInitScript(virtualTime, { seed, audioSecs });
  await page.reload();
  await page.waitForFunction(() => window.__gol && window.__vt);
  await page.addStyleTag({ content: OVERLAY });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const take = new Take(page, dir);
  // deixa o jogo assentar e as texturas subirem
  await take.wait(600);
  await sleep(300);
  return { ctx, page, take };
}

/** Do menu até a vez da criança (fora da gravação, ou gravando se `rec`). */
async function startMatch(take, mode, role) {
  await take.tap('[data-go=play]');
  await take.wait(250);
  await take.tap(`[data-mode=${mode}]`);
  await take.wait(250);
  if (role) { await take.tap(`[data-role=${role}]`); await take.wait(250); }
  await take.tap('[data-go=start]');
  await take.until(() => !document.getElementById('hint').classList.contains('hidden'), null, 15000);
  await take.wait(500);
}
const callText = (page) => page.evaluate(() => (document.querySelector('#call:not(.hidden) b')?.textContent ?? ''));
const waitCall = (take) => take.until(() => !!document.querySelector('#call:not(.hidden) b'), null, 15000);

// ---------- roteiros ----------
// Cada vídeo é uma lista de tomadas; cada tomada devolve true se o lance saiu como o roteiro pede.
const LOOK = (cel, extra = {}) => JSON.stringify({ skin: 2, hair: 0, style: 'curly', boots: 3, number: 10, name: 'CRAQUE', cel, ...extra });
const BR = { team: 'BR', teamKind: 'nation', heart: '["#ffd400","#1f4fc4"]' };
const isGoal = async (take) => { await waitCall(take); return /GOL/.test(await callText(take.page)); };
const spot = (take) => take.page.evaluate(() => ({ ...window.__gol.pitch.lastSetup }));

/** Replay do jogo: corre rápido até o chute e deixa a bola bem lenta até a rede. */
async function slowReplay(take, caption, from = 0.2) {
  await take.until(() => !!document.querySelector('#call b.replay'), null, 6000);
  await take.caption(caption, 'pop');
  await take.page.evaluate(() => { window.__gol.pitch.timeScale = 1.4; });
  await take.until((f) => window.__gol.pitch.ballMoving() && window.__gol.pitch.ballProgress() > f, from, 8000);
  await take.page.evaluate(() => { window.__gol.pitch.timeScale = 0.3; });
  await take.until(() => window.__gol.pitch.ballProgress() > 0.995, null, 12000);
  await take.wait(1000);
}

/** Pênalti contra a máquina: espera a vez, legenda, chuta no ponto e diz se foi gol. */
async function penaltyGoal(take, x, y, { hook, lead = 1500, belly = 0.05 } = {}) {
  await startMatch(take, 'penalty', 'kicker');
  if (hook) await take.caption(hook);
  await take.start();
  await take.wait(lead);
  await take.swipeTo(x, y, { belly });
  await take.caption('');
  return isGoal(take);
}

/** Como goleiro: no ensaio (dry) descobre onde a bola entra; gravando, pula lá em câmera lenta. */
async function keeperSave(take, { hook, slow = 0.55, onKick } = {}) {
  await startMatch(take, 'penalty', 'keeper');
  if (hook) await take.caption(hook);
  await take.start();
  await take.until(() => window.__gol.pitch.ballMoving(), null, 15000);
  if (take.dry) {
    await take.until(() => window.__gol.pitch.ball.position.z < 0.4 || !!document.querySelector('#call:not(.hidden) b'), null, 8000);
    take.data.target = await take.page.evaluate(() => { const p = window.__gol.pitch.ball.position; return { x: p.x, y: p.y - 0.08 }; });
    const t = await callText(take.page) || (await waitCall(take), await callText(take.page));
    return /GOL/.test(t); // só serve um chute que ia entrar
  }
  if (onKick) await onKick();
  await take.wait(70);
  const pt = await take.page.evaluate(([x, y]) => window.__gol.pitch.screenOf(x, y, 0), [take.data.target.x, take.data.target.y]);
  await take.tapAt(pt.x, pt.y, 0);
  await take.page.evaluate((k) => { window.__gol.pitch.timeScale = k; }, slow);
  await waitCall(take);
  await take.page.evaluate(() => { window.__gol.pitch.timeScale = 1; });
  return /DEFENDEU/.test(await callText(take.page));
}

/** Falta: mira o ângulo do lado de fora da barreira, com curva. */
async function freeKickGoal(take, { hook, lead = 1500 } = {}) {
  await startMatch(take, 'free', 'kicker');
  const s = await spot(take);
  const side = take.seed % 2 ? 1 : -1; // cada semente tenta um canto
  if (hook) await take.caption(hook);
  await take.start();
  await take.wait(lead);
  await take.swipeTo(side * 3.2, 2.15, { belly: -side * 0.16, steps: 10 });
  await take.caption('Por cima da barreira… 🌀', 'pop');
  take.data.sx = s.sx;
  return isGoal(take);
}

const VIDEOS = {
  '1-golaco-no-angulo': [{
    seed: 7, dry: true,
    prefs: { ...BR, weather: 'day', crowd: 'full', look: LOOK('plane'), voice: 'male' },
    async run(take) {
      if (!await penaltyGoal(take, 3.15, 2.15, { hook: 'Pênalti… e eu vou<br>mirar no ÂNGULO 🎯', lead: 1600 })) return false;
      if (take.dry) return true;
      await take.caption('GOLAÇO<br>NO ÂNGULO! 🔥', 'big pop');
      await take.wait(1600);
      await take.caption('');
      await slowReplay(take, 'Olha de novo,<br>em câmera lenta 🐢');
      await take.endCard('Pênaltis e faltas para a criançada,<br>com bonecos de blocos ⚽');
      return true;
    },
  }],

  '2-voce-e-o-goleiro': [{
    seed: 21, dry: true,
    prefs: { ...BR, weather: 'night', crowd: 'full', keeperCam: 'kicker', voice: 'female' },
    async run(take) {
      const ok = await keeperSave(take, {
        hook: 'Agora VOCÊ<br>é o goleiro! 🧤',
        onKick: () => take.caption('Toca no canto…<br>e VOA! 🦸', 'pop'),
      });
      if (!ok) return false;
      if (take.dry) return true;
      await take.caption('QUE DEFESA! 🧤🔥', 'big pop');
      await take.wait(1700);
      await take.caption('Pênalti de noite,<br>com os refletores 🌙', 'pop');
      await take.wait(1500);
      await take.endCard('Bata os pênaltis ou<br>defenda como goleiro 🧤');
      return true;
    },
  }],

  '3-falta-na-neve': [{
    seed: 3, dry: true,
    prefs: { ...BR, weather: 'snow', crowd: 'full', look: LOOK('knee'), voice: 'male', diff: 'easy' },
    async run(take) {
      if (!await freeKickGoal(take, { hook: 'Falta perigosa…<br>NA NEVE ❄️', lead: 1500 })) return false;
      if (take.dry) return true;
      await take.caption('GOL DE FALTA! 🥶🔥', 'big pop');
      await take.wait(1600);
      await take.caption('');
      await slowReplay(take, 'Repara na CURVA 🌀', 0.6);
      await take.endCard('Faltas com barreira e curva,<br>na chuva, na neve e de noite');
      return true;
    },
  }],

  '4-monte-seu-craque': [{
    seed: 5,
    prefs: { team: 'BR', teamKind: 'nation', look: LOOK('jump', { skin: 1, style: 'short', hair: 0, boots: 2, number: 9 }), voice: 'female',
      progress: JSON.stringify({ stickers: ['first_goal', 'corner', 'ground', 'curve', 'free_goal', 'first_save', 'post', 'rain', 'snow', 'night'], goals: 30, saveStreak: 0, day: '', daily: [] }) },
    async run(take) {
      await take.caption('Monte o SEU craque ⚽', 'bottom pop');
      await take.start();
      await take.wait(700);
      await take.tap('[data-go=player]');
      await take.wait(500);
      await take.caption('Cabelo… 💇', 'mid pop');
      for (const st of ['mohawk', 'long', 'curly']) { await take.tap(`[data-style=${st}]`); await take.wait(280); }
      await take.tap('[data-hair="2"]');
      await take.wait(300);
      await take.caption('Chuteira e número 👟', 'mid pop');
      await take.tap('[data-boots="4"]');
      await take.wait(250);
      for (let i = 0; i < 2; i++) { await take.tap('[data-n="1"]'); await take.wait(120); }
      await take.wait(300);
      await take.caption('E a COMEMORAÇÃO! 🎉', 'mid pop');
      for (const [cel, txt] of [['plane', 'Aviãozinho ✈️'], ['flip', 'Cambalhota 🤸'], ['dance', 'Dancinha 💃']]) {
        await take.tap(`[data-cel=${cel}]`);
        await take.caption(txt, 'mid pop');
        if (cel === 'plane') await take.say('female', 'goal-1');
        await take.wait(cel === 'dance' ? 1500 : 1800);
      }
      await take.caption('');
      await take.tap('[data-go=save]');
      await take.wait(400);
      await take.caption('Complete o álbum<br>de figurinhas 📒', 'bottom pop');
      await take.tap('[data-go=album]');
      await take.wait(2400);
      await take.endCard('Monte seu craque e<br>complete o álbum 📒');
      return true;
    },
  }],

  '5-em-breve': [
    {
      seed: 11, dry: true,
      prefs: { ...BR, weather: 'day', crowd: 'full', look: LOOK('flip'), voice: 'male' },
      async run(take) {
        if (!await penaltyGoal(take, -3.1, 2.1, { hook: 'VEM AÍ ⚽<br>Gol de Placa', lead: 1300 })) return false;
        if (take.dry) return true;
        await take.caption('Torcida animada! 🥁🎉', 'big pop');
        await take.wait(1700);
        await take.stop();
        return true;
      },
    },
    {
      seed: 12,
      prefs: { ...BR, weather: 'day', crowd: 'full', voice: 'off' },
      async run(take) {
        await startMatch(take, 'penalty', 'kicker');
        const colors = ['#ffd400', '#1f4fc4', '#ffd400', '#1f4fc4', '#ffd400', '#1f4fc4', '#ffd400', '#ffffff'];
        await take.start();
        for (const [w, txt] of [['day', 'De dia ☀️'], ['night', 'De noite 🌙'], ['rain', 'Na chuva 🌧️'], ['snow', 'Na neve ❄️']]) {
          await take.page.evaluate(([w, c]) => window.__gol.pitch.setAtmosphere({ weather: w, crowd: 'full', colors: c, flag: ['#ffd400', '#1f4fc4'] }), [w, colors]);
          await take.caption(txt, 'big pop');
          await take.wait(850);
        }
        await take.stop();
        return true;
      },
    },
    {
      seed: 13, dry: true,
      prefs: { ...BR, weather: 'rain', crowd: 'full', keeperCam: 'kicker', voice: 'female' },
      async run(take) {
        if (!await keeperSave(take, { hook: 'Seja o goleiro 🧤', slow: 0.55 })) return false;
        if (take.dry) return true;
        await take.caption('QUE DEFESA! 🧤', 'big pop');
        await take.wait(1100);
        await take.stop();
        return true;
      },
    },
    {
      seed: 14,
      prefs: { team: 'BR', teamKind: 'nation', weather: 'night', crowd: 'full', voice: 'off' },
      async run(take) {
        await take.tap('[data-go=play]');
        await take.wait(200);
        await take.tap('[data-mode=penalty]');
        await take.wait(200);
        await take.tap('[data-role=kicker]');
        await take.wait(300);
        await take.caption('Seleções 🌎', 'bottom pop');
        await take.start();
        await take.wait(1300);
        await take.tap('[data-kind=club]');
        await take.caption('e times divertidos 🦈🦁🐉', 'bottom pop');
        await take.wait(1500);
        await take.endCard('Pênaltis e faltas para a criançada 🧒⚽');
        return true;
      },
    },
  ],
};

// ---------- montagem ----------
function ff(args) { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }); }

async function attempt(browser, dir, spec, seed, dry, data) {
  const { ctx, page, take } = await openGame(browser, dir, seed, spec.prefs, spec.audioSecs ?? 70);
  take.dry = dry; take.seed = seed; take.data = data;
  let ok = false;
  try { ok = await spec.run(take); } catch (e) { console.log(`  semente ${seed}${dry ? ' (ensaio)' : ''} falhou:`, e.message); await page.screenshot({ path: path.join(dir, '..', 'erro.png') }).catch(() => {}); }
  await take.stop();
  let wav = null;
  if (ok && !dry) {
    console.log('    narrador:', await page.evaluate(() => window.__vt.clips()));
    const b64 = await page.evaluate(() => window.__vt.render());
    if (b64) { wav = path.join(dir, 'audio.wav'); fs.writeFileSync(wav, Buffer.from(b64, 'base64')); }
  }
  await ctx.close();
  return { ok, take, wav };
}

async function recordTake(browser, name, i, spec) {
  const dir = path.join(OUT, 'raw', name, `take${i}`);
  for (let k = 0; k < 14; k++) {
    const seed = (spec.seed ?? 7) + k * 101;
    const data = {};
    // ensaio sem fotos (mais rápido): só grava a semente que dá o lance
    if (spec.dry && !(await attempt(browser, dir, spec, seed, true, data)).ok) { console.log(`  ${name}/${i}: semente ${seed} não deu o lance`); continue; }
    const r = await attempt(browser, dir, spec, seed, false, data);
    if (!r.ok) { console.log(`  ${name}/${i}: semente ${seed} não deu o lance (gravando)`); continue; }
    console.log(`  ${name}/${i}: semente ${seed}, ${r.take.n} quadros (${(r.take.n / FPS).toFixed(1)} s)`);
    return { dir, frames: r.take.n, segs: r.take.segs, wav: r.wav };
  }
  throw new Error(`${name}: nenhuma semente deu o lance da tomada ${i}`);
}

async function build(name, takes) {
  const work = path.join(OUT, 'raw', name);
  // vídeo: todos os quadros em sequência
  const list = [];
  for (const tk of takes) for (let f = 0; f < tk.frames; f++) list.push(path.join(tk.dir, `f${String(f).padStart(5, '0')}.jpg`));
  const seq = path.join(work, 'seq');
  fs.rmSync(seq, { recursive: true, force: true });
  fs.mkdirSync(seq, { recursive: true });
  list.forEach((f, i) => fs.linkSync(f, path.join(seq, `${String(i).padStart(5, '0')}.jpg`)));
  const dur = list.length / FPS;
  // áudio: os trechos gravados de cada tomada, na ordem
  const parts = [];
  for (const tk of takes) for (const s of tk.segs) parts.push({ wav: tk.wav, t0: s.t0 / 1000, d: (s.t1 - s.t0) / 1000 });
  const ins = [], filt = [];
  parts.forEach((p, k) => {
    ins.push('-i', p.wav);
    filt.push(`[${k}:a]atrim=start=${p.t0.toFixed(4)}:duration=${p.d.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=0.04,afade=t=out:st=${Math.max(0, p.d - 0.05).toFixed(4)}:d=0.05[a${k}]`);
  });
  filt.push(`${parts.map((_, k) => `[a${k}]`).join('')}concat=n=${parts.length}:v=0:a=1,acompressor=threshold=-14dB:ratio=3:attack=5:release=120,loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=in:d=0.15,afade=t=out:st=${(dur - 0.8).toFixed(3)}:d=0.8[aout]`);
  const audio = path.join(work, 'audio.m4a');
  ff([...ins, '-filter_complex', filt.join(';'), '-map', '[aout]', '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', '-t', dur.toFixed(3), audio]);
  fs.mkdirSync(OUT, { recursive: true });
  const mp4 = path.join(OUT, `${name}.mp4`);
  ff(['-framerate', String(FPS), '-i', path.join(seq, '%05d.jpg'), '-i', audio, '-map', '0:v', '-map', '1:a',
    '-vf', 'scale=1080:1920:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-profile:v', 'high',
    '-maxrate', '5M', '-bufsize', '10M', '-r', String(FPS), '-c:a', 'copy', '-shortest', '-movflags', '+faststart', mp4]);
  return { mp4, dur };
}

const launch = {
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
};
const browser = await chromium.launch(launch);
for (const [name, video] of Object.entries(VIDEOS)) {
  if (process.env.ONLY && !process.env.ONLY.split(',').some((o) => name.startsWith(o))) continue;
  console.log(name);
  const t0 = Date.now();
  const takes = [];
  for (const [i, spec] of video.entries()) takes.push(await recordTake(browser, name, i, spec));
  const { mp4, dur } = await build(name, takes);
  console.log(`${name} ok → ${mp4} (${dur.toFixed(1)} s, ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}
await browser.close();
