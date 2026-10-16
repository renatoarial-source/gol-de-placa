// Gera as capturas de tela das lojas a partir do jogo no navegador.
// Uso: npm run build && npx vite preview --port 4173 &  depois  node store/screenshots.mjs
// Variáveis: STORES=play,appstore,ipad  LANGS=pt,en,...  CHROMIUM_PATH=...
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || 'http://localhost:4173';
const SIZES = {
  play: { width: 360, height: 640, deviceScaleFactor: 3 }, // 1080 x 1920
  appstore: { width: 430, height: 932, deviceScaleFactor: 3 }, // 1290 x 2796 (iPhone 6.7")
  ipad: { width: 1032, height: 1376, deviceScaleFactor: 2 }, // 2064 x 2752 (iPad 13")
};
const LANGS = (process.env.LANGS || 'pt,en,es,de,fr,it,zh,ja').split(',');
const STORES = (process.env.STORES || 'play,appstore').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(page, lang, extra = {}) {
  await page.goto(BASE);
  await page.evaluate(([l, x]) => {
    localStorage.clear();
    const set = { lang: l, 'unlocked.v1': '1', sound: '0', tutKick: '1', tutKeep: '1', diff: 'easy', ...x };
    for (const [k, v] of Object.entries(set)) localStorage.setItem('gol.' + k, v);
  }, [lang, extra]);
  await page.reload();
  await sleep(900);
}

/** Abre uma partida (modo, papel) e espera a vez da criança. */
async function startMatch(page, mode, role) {
  await page.click('[data-go=play]');
  await page.click(`[data-mode=${mode}]`);
  if (role) await page.click(`[data-role=${role}]`);
  await page.click('[data-go=start]');
  await page.waitForSelector('#hint:not(.hidden)', { timeout: 120000 });
  await sleep(600);
}

/** Chuta mirando um ponto do gol e fotografa a bola no ar. */
async function kickTo(page, x, y, at) {
  const vp = page.viewportSize();
  const end = await page.evaluate(([gx, gy]) => window.__gol.pitch.screenOf(gx, gy, 0), [x, y]);
  const sx = vp.width / 2, sy = vp.height * 0.88;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) { await page.mouse.move(sx + (end.x - sx) * k / 8 + Math.sin(k / 8 * Math.PI) * vp.width * 0.08, sy + (end.y - sy) * k / 8); await sleep(18); }
  await page.mouse.up();
  // fotografa quando a bola já fez parte do caminho (independe da velocidade da máquina)
  await page.waitForFunction((p) => window.__gol.pitch.ballProgress() > p, at, { timeout: 120000, polling: 16 });
}

const launch = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) };
const browser = await chromium.launch(launch);
for (const [store, vp] of Object.entries(SIZES)) {
  if (!STORES.includes(store)) continue;
  for (const lang of LANGS) {
    const dir = join(HERE, 'screenshots', store, lang);
    mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: true, hasTouch: true });
    const shot = (n) => page.screenshot({ path: join(dir, `${n}.png`) });
    // telas grandes demoram mais para desenhar aqui: as esperas crescem junto
    const slow = store === 'ipad' ? 2.6 : 1;
    const hideHud = () => page.evaluate(() => { document.getElementById('hint').classList.add('hidden'); });

    // 1) cobrança no ângulo, de dia, estádio lotado
    await open(page, lang, { team: 'BR', teamKind: 'nation', weather: 'day', crowd: 'full', heart: '["#ffd400","#1f4fc4"]' });
    await startMatch(page, 'penalty', 'kicker');
    await hideHud();
    await kickTo(page, 3.1, 2.1, 0.62);
    await shot('1-angulo');

    // 2) goleiro mergulhando, à noite com refletores
    await open(page, lang, { team: 'AR', teamKind: 'nation', weather: 'night', crowd: 'full', keeperCam: 'kicker' });
    await startMatch(page, 'penalty', 'keeper');
    // espera o chute sair, toca no canto e fotografa o mergulho
    await page.waitForFunction(() => window.__gol.pitch.ballMoving(), null, { timeout: 120000 });
    const pt = await page.evaluate(() => window.__gol.pitch.screenOf(-2.4, 1.3, 0));
    await page.mouse.click(pt.x, pt.y);
    await sleep(320 * slow);
    await hideHud();
    await shot('2-goleiro-noite');

    // 3) falta com barreira e curva, na neve
    await open(page, lang, { team: 'sharks', teamKind: 'club', weather: 'snow', crowd: 'half' });
    await startMatch(page, 'free', 'kicker');
    await hideHud();
    await kickTo(page, -2.8, 2.0, 0.3); // antes da barreira (que fica a ~45% do caminho)
    await shot('3-falta-neve');

    // 4) menu com desafios do dia
    await open(page, lang, { progress: JSON.stringify({ stickers: ['first_goal', 'corner', 'rain', 'first_save', 'post', 'night'], goals: 12, saveStreak: 0, day: '', daily: [] }) });
    await shot('4-menu');

    // 5) Meu craque
    await open(page, lang, { team: 'BR', teamKind: 'nation', look: JSON.stringify({ skin: 3, hair: 0, style: 'curly', boots: 3, number: 10, name: 'Arial', cel: 'plane' }) });
    await page.click('[data-go=player]');
    await sleep(1500);
    await shot('5-meu-craque');

    // 6) álbum de figurinhas
    await open(page, lang, { progress: JSON.stringify({ stickers: ['first_goal', 'corner', 'ground', 'curve', 'free_goal', 'first_save', 'three_saves', 'post', 'cup', 'rain', 'snow', 'night'], goals: 30, saveStreak: 0, day: '', daily: [] }) });
    await page.click('[data-go=album]');
    await sleep(400);
    await shot('6-figurinhas');

    // 7) times e seleções, chuva
    await open(page, lang, { teamKind: 'nation', team: 'BR', weather: 'rain' });
    await page.click('[data-go=play]');
    await page.click('[data-mode=penalty]');
    await page.click('[data-role=kicker]');
    await sleep(500);
    await shot('7-times');

    await page.close();
    console.log(store, lang, 'ok');
  }
}
await browser.close();
