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
  await page.click('[data-kind=nation]');
  await page.click('[data-team=BR]');
  await expect(page.locator('.sub')).toContainText('Pegue 3');
  await page.click('[data-go=start]');
  await expect(page.locator('#hint')).toContainText('Agora defenda');
  const vp = page.viewportSize()!;
  await page.waitForTimeout(2700);
  await page.mouse.click(vp.width / 2, vp.height * 0.3);
  await expect(page.locator('#call b')).toHaveText(OUTCOME, { timeout: 20_000 });
  await expect(page.locator('#hud .line').nth(1)).toContainText('🧤');
  await expect(page.locator('#hud .line').nth(1)).toContainText('Brasil');
});

test('falta (versão completa): cinco cobranças até o resultado', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, true);
  await start(page, 'free', 'kicker');
  for (let i = 0; i < 5; i++) {
    await expect(page.locator('#hint')).toBeVisible({ timeout: 30_000 });
    await swipe(page, 10);
    await expect(page.locator(marks)).toHaveCount(i + 1, { timeout: 30_000 });
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
