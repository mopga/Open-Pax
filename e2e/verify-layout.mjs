/**
 * Быстрая верификация layout-фикса: resume сейва → клики по нижним элементам
 * правой панели (Playwright scroll-into-view) → body не должен скроллиться,
 * HUD и карта остаются на месте.
 */
import { chromium } from 'playwright';
import path from 'node:path';

const SHOTS = path.resolve(process.cwd(), '..', 'docs', 'e2e');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('dialog', async (d) => { await d.accept(); });
page.on('pageerror', (e) => console.log(`[pageerror] ${String(e).slice(0, 200)}`));

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.landing-cta', { timeout: 15000 });

  // Секция «Продолжить игру»: ждём карточку сейва и жмём «Играть»
  const playBtn = page.locator('button:has-text("Играть")').first();
  await playBtn.waitFor({ timeout: 15000 });
  await playBtn.click();
  console.log('[verify] resume save clicked');
  await page.waitForSelector('.game-wrapper', { timeout: 60000 });
  await page.waitForTimeout(4000);

  // Кликаем элемент в самом низу правой панели — Playwright проскроллит к нему
  await page.click('.btn-edit-prompt');
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.click('.prompt-editor-overlay').catch(() => {});
  await page.waitForTimeout(800);

  const m = await page.evaluate(() => {
    const hud = document.querySelector('.hud-bar, [class*="hud-"]');
    const map = document.querySelector('.game-map');
    const r = (el) => el ? el.getBoundingClientRect() : null;
    return {
      scrollY: window.scrollY,
      bodyH: document.body.scrollHeight,
      winH: window.innerHeight,
      hud: r(hud),
      map: r(map),
    };
  });
  console.log('[verify] metrics:', JSON.stringify(m));

  const ok = m.scrollY === 0 && m.hud && m.hud.top >= 0 && m.hud.top < 60 && m.map && m.map.height > 400;
  await page.screenshot({ path: path.join(SHOTS, '16-verify-layout.png') });
  console.log(ok ? '[verify] LAYOUT OK' : '[verify] LAYOUT BROKEN');
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.error(`[verify] FAILED: ${e}`);
  await page.screenshot({ path: path.join(SHOTS, '16-verify-layout-fail.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
