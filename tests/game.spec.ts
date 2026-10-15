import { expect, test, type Page } from '@playwright/test';

async function start(page: Page, mode: string, role?: string) {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('gol.lang', 'pt'); localStorage.setItem('gol.sound', '0'); });
  await page.reload();
  await page.click('[data-go=play]');
  await page.click(`[data-mode=${mode}]`);
  if (role) await page.click(`[data-role=${role}]`);
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

test('menu em português, com seleções e times', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gol.lang', 'pt'));
  await page.reload();
  await expect(page.locator('h1')).toContainText('GOL DE');
  await page.click('[data-go=play]');
  await page.click('[data-mode=penalty]');
  await expect(page.locator('[data-role=keeper]')).toContainText('Goleiro');
  await page.click('[data-role=kicker]');
  await expect(page.locator('.team')).toHaveCount(16);
  await expect(page.locator('[data-team=BR]')).toContainText('Brasil');
  await page.click('[data-kind=club]');
  await expect(page.locator('.team')).toHaveCount(12);
  await expect(page.locator('[data-team=sharks]')).toContainText('Tubarões');
});

test('pênalti como batedor: o chute conta no placar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 'penalty', 'kicker');
  await expect(page.locator('#hint')).toContainText('Sua vez de bater');
  await swipe(page, 40);
  await expect(page.locator('#call b')).toHaveText(/GOL!|DEFENDEU!|NA TRAVE!|PRA FORA!|POR CIMA!/, { timeout: 20_000 });
  await expect(page.locator('#hud .dot.g, #hud .dot.m')).toHaveCount(1, { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('pênalti como goleiro: a máquina bate e o toque no gol faz o goleiro pular', async ({ page }) => {
  await start(page, 'penalty', 'keeper');
  await expect(page.locator('#hint')).toContainText('Agora defenda');
  const vp = page.viewportSize()!;
  await page.waitForTimeout(2700);
  await page.mouse.click(vp.width / 2, vp.height * 0.3);
  await expect(page.locator('#call b')).toHaveText(/GOL!|DEFENDEU!|NA TRAVE!|PRA FORA!|POR CIMA!/, { timeout: 20_000 });
  await expect(page.locator('#hud .dot.g, #hud .dot.m')).toHaveCount(1, { timeout: 20_000 });
});

test('falta tem barreira e cinco cobranças até o resultado', async ({ page }) => {
  test.setTimeout(240_000);
  await start(page, 'free', 'kicker');
  for (let i = 0; i < 5; i++) {
    await expect(page.locator('#hint')).toBeVisible({ timeout: 30_000 });
    await swipe(page, 10);
    await expect(page.locator('#hud .dot.g, #hud .dot.m')).toHaveCount(i + 1, { timeout: 30_000 });
  }
  await expect(page.locator('.result')).toContainText('de 5', { timeout: 10_000 });
  await page.click('[data-go=menu]');
  await expect(page.locator('h1')).toBeVisible();
});

test('propaganda do Esconde-Esconde só abre com a conta certa', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.setItem('gol.lang', 'pt'); (window as unknown as { opened: string[] }).opened = []; });
  await page.reload();
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
