import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, full = false) {
  await page.goto('/');
  await page.evaluate((f) => {
    localStorage.clear();
    localStorage.setItem('gol.lang', 'pt');
    localStorage.setItem('gol.sound', '0');
    if (f) localStorage.setItem('gol.unlocked.v1', '1');
  }, full);
  await page.reload();
}

async function start(page: Page, mode: string, role: string) {
  await page.click('[data-go=play]');
  await page.click(`[data-mode=${mode}]`);
  await page.click(`[data-role=${role}]`);
  await page.click('[data-go=start]');
}

async function swipe(page: Page, dx: number) {
  const vp = page.viewportSize()!;
  const x = vp.width / 2, y = vp.height * 0.85;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(x + (dx * i) / 8, y - i * 35); await page.waitForTimeout(20); }
  await page.mouse.up();
}

const OUTCOME = /GOL!|DEFENDEU!|NA TRAVE!|PRA FORA!|POR CIMA!|NA BARREIRA!/;
const marks = '#hud .line:first-child .dot.g, #hud .line:first-child .dot.m';

test('versão do download: pênalti como batedor com um time só; o resto pede a versão completa', async ({ page }) => {
  await open(page);
  await expect(page.locator('h1')).toContainText('GOL DE');
  await page.click('[data-go=play]');
  await expect(page.locator('[data-mode=free]')).toContainText('🔒');
  await page.click('[data-mode=free]');
  await expect(page.locator('.unlock')).toContainText('Versão completa');
  await page.click('[data-go=back]');
  await page.click('[data-mode=penalty]');
  await expect(page.locator('[data-role=keeper]')).toContainText('🔒');
  await page.click('[data-role=kicker]');
  await expect(page.locator('.team.on')).toContainText('Tubarões');
  await expect(page.locator('.team.locked')).toHaveCount(11);
  await expect(page.locator('[data-weather]')).toHaveCount(4);
  await expect(page.locator('[data-crowd]')).toHaveCount(3);
  await expect(page.locator('.sub')).toContainText('Faça 3 gols');
});

test('pênalti como batedor: o chute conta no placar batedor x goleiro', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await start(page, 'penalty', 'kicker');
  await expect(page.locator('#hud .line')).toHaveCount(2);
  await expect(page.locator('#hint')).toContainText('Sua vez de bater');
  await swipe(page, 40);
  await expect(page.locator('#call b')).toHaveText(OUTCOME, { timeout: 20_000 });
  await expect(page.locator(marks)).toHaveCount(1, { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('compra da versão completa passa pela trava dos pais e libera o goleiro', async ({ page }) => {
  await open(page);
  await page.click('[data-go=full]');
  await page.click('[data-go=buy]');
  const text = await page.locator('.modal p').first().innerText();
  const [a, b] = text.match(/(\d+) × (\d+)/)!.slice(1).map(Number);
  await page.click(`.modal [data-a="${a * b}"]`);
  await page.click('[data-go=ok]');
  await expect(page.locator('[data-go=full]')).toHaveCount(0);
  await expect(page.locator('[data-go=player]')).not.toContainText('🔒');
});

test('como goleiro (versão completa), com chuva e torcida pouca', async ({ page }) => {
  await open(page, true);
  await page.click('[data-go=play]');
  await page.click('[data-mode=penalty]');
  await page.click('[data-role=keeper]');
  await page.click('[data-weather=rain]');
  await page.click('[data-crowd=few]');
  await expect(page.locator('[data-cam]')).toHaveCount(2);
  await page.click('[data-cam=kicker]');
  expect(await page.evaluate(() => localStorage.getItem('gol.keeperCam'))).toBe('kicker');
  await page.click('[data-kind=nation]');
  await page.click('[data-team=BR]');
  await expect(page.locator('.sub')).toContainText('Pegue 3');
  await page.click('[data-go=start]');
  await expect(page.locator('#hint')).toContainText('Agora defenda');
  const vp = page.viewportSize()!;
  await page.waitForTimeout(2700);
  const goal = await page.evaluate(() => (window as unknown as { __gol: { pitch: { screenOf(x: number, y: number, z: number): { x: number; y: number } } } }).__gol.pitch.screenOf(1.5, 1, 0));
  await page.mouse.click(goal.x, goal.y);
  await expect(page.locator('#call b')).toHaveText(OUTCOME, { timeout: 45_000 });
  await expect(page.locator('#hud .line').nth(1)).toContainText('🧤');
  await expect(page.locator('#hud .line').nth(1)).toContainText('Brasil');
});

test('falta (versão completa): cinco cobranças até o resultado', async ({ page }) => {
  test.setTimeout(420_000);
  await open(page, true);
  await start(page, 'free', 'kicker');
  for (let i = 0; i < 5; i++) {
    await expect(page.locator('#hint')).toBeVisible({ timeout: 60_000 });
    await swipe(page, 10);
    await expect(page.locator(marks)).toHaveCount(i + 1, { timeout: 60_000 });
  }
  await expect(page.locator('.result')).toContainText('de 5', { timeout: 30_000 });
  await page.click('[data-go=menu]');
  await expect(page.locator('h1')).toBeVisible();
});

test('Meu craque: escolhe cabelo, número e nome e salva', async ({ page }) => {
  await open(page, true);
  await page.click('[data-go=player]');
  await page.click('[data-style=mohawk]');
  await page.click('[data-n="1"]');
  await page.fill('#pname', 'Arial');
  await page.click('[data-go=save]');
  const look = await page.evaluate(() => JSON.parse(localStorage.getItem('gol.look')!));
  expect(look).toMatchObject({ style: 'mohawk', number: 11, name: 'Arial' });
});

test('Copa na versão do download: disputa alternando bater e defender', async ({ page }) => {
  await open(page);
  await page.click('[data-go=play]');
  await page.click('[data-mode=cup]');
  await expect(page.locator('.sub')).toContainText('Você bate e defende');
  await page.click('[data-go=start]');
  await expect(page.locator('#hint')).toContainText('Sua vez de bater', { timeout: 20_000 });
  await swipe(page, 20);
  await expect(page.locator('#hint')).toContainText('Agora defenda', { timeout: 30_000 });
  await expect(page.locator('#hud .line').nth(1)).toContainText('⚽');
});

test('narração: escolhe narrador, narradora ou desligada', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-voice]')).toHaveCount(3);
  await page.click('[data-voice=female]');
  await expect(page.locator('[data-voice=female]')).toHaveClass(/on/);
  expect(await page.evaluate(() => localStorage.getItem('gol.voice'))).toBe('female');
});

test('Torcida e música: escolhe o ritmo e as cores do time do coração', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.click('[data-go=fans]');
  await expect(page.locator('[data-music]')).toHaveCount(4);
  await page.click('[data-music=charanga]');
  await page.click('[data-h0="#111111"]');
  await page.click('[data-h1="#ffffff"]');
  await expect(page.locator('.flag')).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem('gol.music'), localStorage.getItem('gol.heart')])).toEqual(['charanga', '["#111111","#ffffff"]']);
  await page.click('[data-heart=none]');
  await expect(page.locator('.flag')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('narração gravada: escolher a narradora toca o áudio dela no idioma do jogo', async ({ page }) => {
  const clips: string[] = [];
  page.on('response', (r) => { if (r.url().includes('/voice/') && r.ok()) clips.push(r.url().split('/voice/')[1]); });
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('gol.lang', 'pt'); });
  await page.reload();
  await page.click('[data-voice=female]');
  await expect.poll(() => clips.some((c) => /^pt\/female\/goal-\d\.mp3$/.test(c)), { timeout: 10_000 }).toBe(true);
  // ao escolher, as outras falas da narradora já são carregadas
  await expect.poll(() => clips.filter((c) => c.startsWith('pt/female/')).length, { timeout: 10_000 }).toBeGreaterThan(20);
});

test('tutorial: na primeira cobrança aparece a mãozinha, que some ao chutar e não volta', async ({ page }) => {
  await open(page);
  await start(page, 'penalty', 'kicker');
  await expect(page.locator('.hand.swipe')).toHaveCount(1);
  await swipe(page, 30);
  await expect(page.locator('.hand')).toHaveCount(0);
  await expect(page.locator(marks)).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('#hint')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.hand')).toHaveCount(0);
});

test('primeiro gol dá figurinha e conta no desafio do dia; o álbum mostra', async ({ page }) => {
  await open(page);
  await page.evaluate(() => localStorage.setItem('gol.tutKick', '1'));
  await expect(page.locator('.daily li')).toHaveCount(3);
  await page.click('[data-go=album]');
  await expect(page.locator('.sticker')).toHaveCount(18);
  await expect(page.locator('.sticker.has')).toHaveCount(0);
  await page.click('[data-go=back]');
  await start(page, 'penalty', 'kicker');
  // várias tentativas até sair um gol (o goleiro às vezes defende)
  for (let i = 0; i < 5; i++) {
    await expect(page.locator('#hint')).toBeVisible({ timeout: 40_000 });
    const target = await page.evaluate((side) => (window as unknown as { __gol: { pitch: { screenOf(x: number, y: number, z: number): { x: number; y: number } } } }).__gol.pitch.screenOf(side, 0.5, 0), i % 2 ? 3.1 : -3.1);
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height * 0.9);
    await page.mouse.down();
    for (let k = 1; k <= 8; k++) { await page.mouse.move(vp.width / 2 + (target.x - vp.width / 2) * k / 8, vp.height * 0.9 + (target.y - vp.height * 0.9) * k / 8); await page.waitForTimeout(15); }
    await page.mouse.up();
    await expect(page.locator(marks)).toHaveCount(i + 1, { timeout: 40_000 });
    if (await page.locator('#hud .line:first-child .dot.g').count()) break;
  }
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('gol.progress')!));
  expect(p.stickers).toContain('first_goal');
  expect(p.goals).toBeGreaterThan(0);
});

test('2 jogadores (versão completa): o goleiro escolhe escondido e o outro bate', async ({ page }) => {
  await open(page, true);
  await page.evaluate(() => localStorage.setItem('gol.tutKick', '1'));
  await page.click('[data-go=play]');
  await page.click('[data-go=duo]');
  await page.fill('#p1', 'Ana');
  await page.fill('#p2', 'Beto');
  await page.click('[data-go=start]');
  await expect(page.locator('.result')).toContainText('Beto, você é o goleiro');
  await page.click('[data-go=ok]');
  const vp = page.viewportSize()!;
  await page.waitForTimeout(500);
  const pt = await page.evaluate(() => (window as unknown as { __gol: { pitch: { screenOf(x: number, y: number, z: number): { x: number; y: number } } } }).__gol.pitch.screenOf(-2, 1, 0));
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator('.result')).toContainText('Ana bater');
  await page.click('[data-go=ok]');
  await swipe(page, 40);
  await expect(page.locator('#hud .line').first()).toContainText('Ana');
  await expect(page.locator('#hud .line:first-child .dot.g, #hud .line:first-child .dot.m')).toHaveCount(1, { timeout: 40_000 });
  await expect(page.locator('.result')).toContainText('Ana, você é o goleiro', { timeout: 40_000 });
  void vp;
});

test('2 jogadores: cada um escolhe o time, entre seleções ou clubes', async ({ page }) => {
  await open(page, true);
  await page.click('[data-go=play]');
  await page.click('[data-go=duo]');
  await page.click('[data-kind=nation]');
  await expect(page.locator('[data-kind=nation]')).toHaveClass(/on/);
  // jogador 1: escolhe uma seleção que não é a atual
  await page.click('[data-pick="1"]');
  const t1 = page.locator('[data-duoteam]:not(.on)').nth(2);
  const id1 = await t1.getAttribute('data-duoteam');
  const badge1 = (await t1.locator('.b').textContent())!;
  await t1.click();
  await expect(page.locator(`[data-duoteam="${id1}"]`)).toHaveClass(/on/);
  await expect(page.locator('.row b').first()).toContainText(badge1);
  // jogador 2: a lista não oferece o time do jogador 1
  await page.click('[data-pick="2"]');
  await expect(page.locator(`[data-duoteam="${id1}"]`)).toHaveCount(0);
  const t2 = page.locator('[data-duoteam]:not(.on)').first();
  const badge2 = (await t2.locator('.b').textContent())!;
  await t2.click();
  await expect(page.locator('.row b').nth(1)).toContainText(badge2);
  // a escolha fica guardada
  await page.click('[data-go=back]');
  await page.click('[data-go=duo]');
  await expect(page.locator('.row b').first()).toContainText(badge1);
  await expect(page.locator('.row b').nth(1)).toContainText(badge2);
});

test('clima aleatório: fica escolhido e cada partida sorteia dia, noite, chuva ou neve', async ({ page }) => {
  await open(page, true);
  await page.click('[data-go=play]');
  await page.click('[data-mode=penalty]');
  await page.click('[data-role=kicker]');
  await page.click('[data-weather=random]');
  await expect(page.locator('[data-weather=random]')).toHaveClass(/on/);
  expect(await page.evaluate(() => localStorage.getItem('gol.weather'))).toBe('random');
  await page.click('[data-go=start]');
  const w = await page.evaluate(() => (window as unknown as { __gol: { pitch: { weather: string } } }).__gol.pitch.weather);
  expect(['day', 'night', 'rain', 'snow']).toContain(w);
});

test('Meu craque: escolhe a comemoração', async ({ page }) => {
  await open(page, true);
  await page.click('[data-go=player]');
  await expect(page.locator('[data-cel]')).toHaveCount(6);
  await page.click('[data-cel=flip]');
  await page.click('[data-go=save]');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gol.look')!).cel)).toBe('flip');
});

test('propaganda do Esconde-Esconde só abre com a conta certa', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { (window as unknown as { opened: string[] }).opened = []; window.open = ((u: string) => { (window as unknown as { opened: string[] }).opened.push(u); return null; }) as typeof window.open; });
  await page.click('[data-go=promo]');
  const text = await page.locator('.modal p').first().innerText();
  const [a, b] = text.match(/(\d+) × (\d+)/)!.slice(1).map(Number);
  await page.click(`.modal [data-a="${a * b + a}"]`);
  await expect(page.locator('.modal .msg')).toHaveText('Resposta errada');
  await expect(page.locator('.modal')).toHaveCount(0, { timeout: 3000 });
  expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([]);
  await page.click('[data-go=promo]');
  const t2 = await page.locator('.modal p').first().innerText();
  const [c, d] = t2.match(/(\d+) × (\d+)/)!.slice(1).map(Number);
  await page.click(`.modal [data-a="${c * d}"]`);
  expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual(['https://apps.apple.com/app/id6819893974']);
});
