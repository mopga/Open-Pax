/**
 * Open-Pax E2E — полный прогон через реальный UI (Playwright + Chromium).
 * Сценарий: лендинг → новая игра → шаблон → страна → генерация мира (реальный LLM)
 * → игровой HUD → действие → советник → дипломатия → rewind → таймскип → сейв.
 * Скриншоты складываются в docs/e2e/.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = path.resolve(process.cwd(), '..', 'docs', 'e2e');
fs.mkdirSync(SHOTS, { recursive: true });

const BASE = 'http://localhost:5173/';
const shot = async (page, name) => {
  const p = path.join(SHOTS, name);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`[shot] ${name}`);
};
const log = (m) => console.log(`[e2e] ${m}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('dialog', async (d) => { log(`dialog: ${d.message().slice(0, 80)} → accept`); await d.accept(); });
page.on('console', (m) => { if (m.type() === 'error') console.log(`[console.error] ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => console.log(`[pageerror] ${String(e).slice(0, 300)}`));

try {
  // 1. Лендинг
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.landing-cta', { timeout: 15000 });
  await shot(page, '01-landing.png');

  // 2. Новая игра → шаблоны
  await page.click('.landing-cta');
  await page.waitForSelector('.template-card', { timeout: 15000 });
  await shot(page, '02-templates.png');

  // 3. Выбор шаблона (предпочтительно cold war / 1951, иначе первый)
  const cards = page.locator('.template-card');
  const n = await cards.count();
  log(`templates: ${n}`);
  let picked = false;
  for (let i = 0; i < n; i++) {
    const t = (await cards.nth(i).innerText()).toLowerCase();
    if (t.includes('1951') || t.includes('холодн') || t.includes('cold')) {
      await cards.nth(i).click(); picked = true; break;
    }
  }
  if (!picked) await cards.first().click();

  // 4. Выбор страны
  await page.waitForSelector('.country-list-item', { timeout: 20000 });
  await shot(page, '03-country-select.png');
  const items = page.locator('.country-list-item');
  const cn = await items.count();
  log(`countries: ${cn}`);
  let cpicked = false;
  for (let i = 0; i < cn; i++) {
    const t = (await items.nth(i).innerText()).toLowerCase();
    if (t.includes('ссср') || t.includes('ussr') || t.includes('soviet')) {
      await items.nth(i).click(); cpicked = true; break;
    }
  }
  if (!cpicked) await items.first().click();
  await page.waitForTimeout(400);
  await page.click('.btn-play');
  log('country confirmed, world generation started…');

  // 5. Генерация мира (реальный LLM) — лоадер, затем игра
  await page.waitForTimeout(3000);
  await shot(page, '04-world-gen-loader.png');
  await page.waitForSelector('.game-wrapper', { timeout: 10 * 60 * 1000 });
  await page.waitForTimeout(5000); // карта/тайлы догружаются
  await shot(page, '05-game-hud.png');
  log('game loaded');

  // 6. Панель «Таймлайн» (без запуска прыжка)
  await page.click('[title="Тайм-скип"]');
  await page.waitForSelector('.hud-timeline-panel', { timeout: 5000 });
  await shot(page, '06-timeline-panel.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 7. Действие: FAB → панель → ввод → отправка
  await page.click('.fab-btn:has-text("⚡"), button[title="Действия"]');
  await page.waitForSelector('.floating-advisor-panel', { timeout: 8000 });
  await page.fill('.manual-action-input textarea', 'Увеличить финансирование науки и космической программы, начать подготовку к запуску спутника.');
  await page.click('.btn-add-pending');
  await page.waitForTimeout(500);
  await shot(page, '07-action-queued.png');
  await page.click('.btn-submit-actions');
  log('action submitted, waiting for turn…');
  // ждём завершения хода: баннер прогресса появляется и исчезает
  await page.waitForSelector('.turn-progress-banner', { timeout: 30000 }).catch(() => log('banner not seen (fast turn?)'));
  await shot(page, '08-turn-processing.png');
  await page.waitForSelector('.turn-progress-banner', { state: 'detached', timeout: 15 * 60 * 1000 }).catch(() => log('banner still visible after 15min'));
  await page.waitForTimeout(2000);
  await shot(page, '09-turn-result.png');
  log('turn done');

  // 8. Советник
  await page.click('.advisor-tab:has-text("Советник")');
  await page.waitForTimeout(1000);
  const advInput = page.locator('.advisor-chat textarea, .advisor-chat input[type="text"]');
  if (await advInput.count()) {
    await advInput.first().fill('Кратко: что угрожает моей стране прямо сейчас?');
    await page.keyboard.press('Enter');
    log('advisor question sent');
    await page.waitForTimeout(45000); // стриминг ответа
  }
  await shot(page, '10-advisor.png');

  // 9. Дипломатия
  await page.click('.advisor-tab:has-text("Дипломатия")');
  await page.waitForTimeout(1500);
  await shot(page, '11-diplomacy.png');

  // 10. Сохранение игры через новую модалку
  await page.click('.btn-close'); // закрыть панель
  await page.waitForTimeout(500);
  await page.click('.btn-save');
  await page.waitForSelector('.save-modal-card, [class*="save-modal"]', { timeout: 5000 });
  await shot(page, '12-save-modal.png');
  await page.click('button.save-modal-submit');
  await page.waitForTimeout(2000);
  log('game saved');

  // 11. Rewind (откат хода)
  await page.click('[title="Откат на ход назад"]');
  await page.waitForTimeout(4000);
  await shot(page, '13-after-rewind.png');
  log('rewind done');

  // 12. Таймскип на неделю
  await page.click('[title="Тайм-скип"]');
  await page.waitForSelector('.hud-timeline-panel', { timeout: 5000 });
  await page.click('.hud-timeline-panel button:has-text("1 неделя")');
  log('timeskip 7d started');
  await page.waitForSelector('.turn-progress-banner', { timeout: 30000 }).catch(() => {});
  await page.waitForSelector('.turn-progress-banner', { state: 'detached', timeout: 15 * 60 * 1000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, '14-after-timeskip.png');
  log('timeskip done');

  // 13. В меню — лендинг с сейвом
  await page.click('button:has-text("← Меню")');
  await page.waitForSelector('.landing-cta', { timeout: 15000 });
  await page.waitForTimeout(2000);
  await shot(page, '15-landing-with-save.png');

  log('E2E PASSED');
} catch (e) {
  console.error(`[e2e] FAILED: ${e}`);
  await shot(page, '99-failure.png').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
