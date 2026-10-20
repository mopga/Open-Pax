/**
 * Open-Pax E2E — полный прогон через реальный UI (Playwright + Chromium) на настоящей модели.
 * Сценарий: лендинг → новая игра → пресет «Холодная война» → выбор СССР (каталог всех
 * государств) → мир из пресета без LLM → игровой HUD и карта → приказ и ход → советник →
 * сейв → откат → тайм-скип → меню → загрузка сейва.
 *
 * Проверки (провал любой → exit 1):
 *   - мир собирается быстро (без вызовов модели), каталог государств полный;
 *   - карта: все регионы окрашены, есть подписи государств, камера на своей стране;
 *   - нет легаси-интерфейса (дипломатия, статы населения/казны/армии, фазы «генерации мира»);
 *   - ход прошёл: номер хода и дата сдвинулись, в истории есть события;
 *   - откат возвращает ход, дату и владельцев регионов;
 *   - сейв загружается с лендинга вместе с историей ходов;
 *   - нет ошибок страницы (pageerror).
 * Скриншоты — в docs/e2e/. Нужен запущенный frontend (vite, :5173) и backend с подключённой моделью.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = path.resolve(process.cwd(), '..', 'docs', 'e2e');
fs.mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.E2E_BASE || 'http://localhost:5173/';
const TURN_TIMEOUT = 15 * 60 * 1000;
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
  console.log(`[shot] ${name}`);
};
const log = (m) => console.log(`[e2e] ${new Date().toISOString().slice(11, 19)} ${m}`);
const failures = [];
const check = (ok, what) => {
  if (ok) log(`OK   ${what}`);
  else { log(`FAIL ${what}`); failures.push(what); }
};

// E2E_CHROMIUM — путь к уже установленному Chromium, если версия Playwright ждёт другую сборку
const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const pageErrors = [];
page.on('dialog', async (d) => { log(`dialog: ${d.message().slice(0, 80)} → accept`); await d.accept(); });
page.on('console', (m) => { if (m.type() === 'error') console.log(`[console.error] ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => { pageErrors.push(String(e)); console.log(`[pageerror] ${String(e).slice(0, 300)}`); });

let gameId = null;
page.on('response', async (r) => {
  if (r.request().method() === 'POST' && /\/api\/games$/.test(new URL(r.url()).pathname)) {
    try { gameId = (await r.json()).game_id; } catch { /* не JSON */ }
  }
});

/** Состояние игры с сервера: ход, дата, владельцы регионов */
const fetchGame = () => page.evaluate(async (id) => {
  const g = await fetch(`/api/games/${id}`).then(r => r.json());
  return {
    turn: g.currentTurn,
    date: g.currentDate,
    owners: Object.fromEntries(g.world.regions.map(r => [r.id, r.owner])),
    polities: g.world.polities.length,
  };
}, gameId);

/** Состояние карты MapLibre (dev-хук window.__openPaxMap) */
const mapState = () => page.evaluate(() => {
  const m = window.__openPaxMap;
  if (!m || !m.getSource('regions')) return null;
  const feats = m.querySourceFeatures('regions');
  const ids = [...new Set(feats.map(f => f.id ?? f.properties.id))];
  const colored = ids.filter(id => m.getFeatureState({ source: 'regions', id })?.color).length;
  const labels = m.getSource('polity-labels')?._data?.features?.length
    ?? m.querySourceFeatures('polity-labels').length;
  const c = m.getCenter();
  return { regions: ids.length, colored, labels, zoom: m.getZoom(), lng: c.lng, lat: c.lat };
});

/** Ждём, пока карта станет видимой (заливки владельцев легли) */
const waitMapReady = async () => {
  await page.waitForFunction(() => {
    const m = window.__openPaxMap;
    const el = m?.getContainer();
    return !!el && getComputedStyle(el).opacity === '1' && m.loaded();
  }, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
};

const LEGACY_TEXT = ['Дипломатия', 'Нет союзников', 'Население', 'Казна', 'Военная мощь', 'Генерация политий', 'Балансировка сил', '👥', '💰', '⚔️'];
const legacyOnPage = async () => {
  const text = await page.locator('body').innerText();
  return LEGACY_TEXT.filter(t => text.includes(t));
};

/** Ждём завершения хода: баннер прогресса появляется и исчезает */
const waitTurn = async () => {
  await page.waitForSelector('.turn-progress-banner', { timeout: 30000 }).catch(() => log('banner not seen (fast turn?)'));
  await page.waitForSelector('.turn-progress-banner', { state: 'detached', timeout: TURN_TIMEOUT });
  await page.waitForTimeout(2000);
};

try {
  // 1. Лендинг
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.landing-cta', { timeout: 15000 });
  await shot(page, '01-landing.png');

  // 2. Новая игра → пресеты
  await page.click('.landing-cta');
  await page.waitForSelector('.template-card', { timeout: 15000 });
  await shot(page, '02-templates.png');

  // 3. Пресет «Холодная война»
  const cards = page.locator('.template-card');
  const n = await cards.count();
  let picked = false;
  for (let i = 0; i < n; i++) {
    const t = (await cards.nth(i).innerText()).toLowerCase();
    if (t.includes('1951') || t.includes('cold')) { await cards.nth(i).click(); picked = true; break; }
  }
  check(picked, 'пресет «Холодная война» в каталоге');

  // 4. Выбор государства: каталог всех государств, СССР среди рекомендуемых
  await page.waitForSelector('.country-list-item', { timeout: 20000 });
  await page.waitForSelector('.world-select-map path.world-country', { timeout: 20000 });
  await shot(page, '03-country-select.png');
  const total = await page.locator('.country-list-item').count();
  check(total > 150, `каталог государств полный (${total})`);
  const headings = await page.locator('.country-list-heading').allInnerTexts();
  check(headings.some(h => /рекомендуемые/i.test(h)) && headings.some(h => /все государства/i.test(h)), 'разделы «Рекомендуемые» и «Все государства»');
  const ussr = page.locator('.country-list-item', { hasText: 'СССР' });
  check(await ussr.count() === 1, 'СССР есть в списке');
  check(await page.locator('.country-list-item', { hasText: 'Украина' }).count() === 0, 'республики СССР не показаны отдельно');
  await ussr.click();
  const tStart = Date.now();
  await page.click('.btn-play');

  // 5. Мир из пресета — без модели, за секунды
  await page.waitForSelector('.game-wrapper', { timeout: 60000 });
  const genMs = Date.now() - tStart;
  check(genMs < 15000, `мир создан за ${(genMs / 1000).toFixed(1)} с`);
  await waitMapReady();
  await shot(page, '05-game-hud.png');
  check(!!gameId, `игра создана (${gameId})`);

  const map0 = await mapState();
  log(`map: ${JSON.stringify(map0)}`);
  check(map0 && map0.regions > 500, 'регионы на карте');
  check(map0 && map0.colored >= map0.regions * 0.98, `регионы окрашены по владельцам (${map0?.colored}/${map0?.regions})`);
  check(map0 && map0.labels >= 10, `подписи государств (${map0?.labels})`);
  check(map0 && map0.lng > 30 && map0.lng < 150 && map0.lat > 35 && map0.lat < 80 && map0.zoom >= 1.3, 'камера на СССР');
  const legacy0 = await legacyOnPage();
  check(legacy0.length === 0, `нет легаси в интерфейсе${legacy0.length ? ': ' + legacy0.join(', ') : ''}`);
  check(await page.locator('text=СССР').count() > 0, 'панель «Ваша страна»: СССР');
  const game0 = await fetchGame();
  check(game0.turn === 1 && game0.date === '1951-01-01', `старт: ход ${game0.turn}, дата ${game0.date}`);

  // 6. Панель «Таймлайн» (без запуска прыжка)
  await page.click('.hud-timeline-toggle');
  await page.waitForSelector('.hud-timeline-panel', { timeout: 5000 });
  await shot(page, '06-timeline-panel.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 7. Приказ → ход на месяц
  await page.click('button[title="Действия"]');
  await page.waitForSelector('.floating-advisor-panel', { timeout: 8000 });
  await page.fill('.manual-action-input textarea', 'Ускорить атомный проект и подготовку к запуску искусственного спутника Земли; усилить группировку войск в ГДР.');
  await page.click('.btn-add-pending');
  await page.waitForTimeout(500);
  await shot(page, '07-action-queued.png');
  // «Выбрать период» открывает панель таймлайна: ход стартует выбором периода
  await page.click('.btn-submit-actions');
  await page.waitForSelector('.hud-timeline-panel', { timeout: 5000 });
  const tTurn = Date.now();
  await page.click('.hud-timeline-panel button:has-text("1 месяц")');
  log('action submitted with 1 month period, waiting for turn…');
  await page.waitForSelector('.turn-progress-banner', { timeout: 30000 }).catch(() => log('banner not seen (fast turn?)'));
  await page.waitForTimeout(5000);
  await shot(page, '08-turn-processing.png');
  await page.waitForSelector('.turn-progress-banner', { state: 'detached', timeout: TURN_TIMEOUT });
  await page.waitForTimeout(3000);
  log(`turn took ${((Date.now() - tTurn) / 1000).toFixed(0)} s`);
  await shot(page, '09-turn-result.png');

  const game1 = await fetchGame();
  check(game1.turn === 2, `ход продвинулся (${game1.turn})`);
  check(game1.date > game0.date, `дата продвинулась (${game1.date})`);
  const events = await page.locator('.history-event-card, .history-item').count();
  check(events > 0, `события хода в истории (${events})`);
  const changed = Object.keys(game1.owners).filter(id => game1.owners[id] !== game0.owners[id]);
  log(`регионов сменило владельца: ${changed.length}, государств: ${game0.polities} → ${game1.polities}`);
  const map1 = await mapState();
  check(map1 && map1.colored >= map1.regions * 0.98, 'карта после хода окрашена');
  const legacy1 = await legacyOnPage();
  check(legacy1.length === 0, `нет легаси после хода${legacy1.length ? ': ' + legacy1.join(', ') : ''}`);

  // 8. Советник
  if (!(await page.locator('.floating-advisor-panel').count())) {
    await page.click('button[title="Действия"]');
    await page.waitForSelector('.floating-advisor-panel', { timeout: 8000 });
  }
  await page.click('.advisor-tab:has-text("Советник")');
  await page.waitForSelector('.advisor-chat textarea', { timeout: 8000 });
  const bubblesBefore = await page.locator('.advisor-bubble.assistant').count();
  await page.fill('.advisor-chat textarea', 'Кратко: что угрожает моей стране прямо сейчас?');
  await page.click('.btn-chat-send');
  log('advisor question sent');
  await page.waitForFunction((before) => {
    const list = document.querySelectorAll('.advisor-bubble.assistant');
    return list.length > before && !document.querySelector('.stream-cursor') && (list[list.length - 1].textContent || '').trim().length > 20;
  }, bubblesBefore, { timeout: 5 * 60 * 1000 }).then(() => check(true, 'советник ответил'), () => check(false, 'советник ответил'));
  await shot(page, '10-advisor.png');

  // 9. Сохранение
  await page.click('.floating-advisor-panel .btn-close');
  await page.waitForTimeout(500);
  await page.click('.btn-save');
  await page.waitForSelector('.save-modal-card, [class*="save-modal"]', { timeout: 5000 });
  await shot(page, '12-save-modal.png');
  await page.click('button.save-modal-submit');
  await page.waitForTimeout(2000);
  log('game saved');

  // 10. Откат: ход, дата и владельцы — как до хода
  await page.click('[title="Откат на ход назад"]');
  await page.waitForTimeout(4000);
  await shot(page, '13-after-rewind.png');
  const game2 = await fetchGame();
  check(game2.turn === 1 && game2.date === game0.date, `откат: ход ${game2.turn}, дата ${game2.date}`);
  const notRestored = Object.keys(game0.owners).filter(id => game2.owners[id] !== game0.owners[id]);
  check(notRestored.length === 0, `откат вернул владельцев регионов (расхождений: ${notRestored.length})`);

  // 11. Тайм-скип на неделю без приказов
  await page.click('.hud-timeline-toggle');
  await page.waitForSelector('.hud-timeline-panel', { timeout: 5000 });
  await page.click('.hud-timeline-panel button:has-text("1 неделя")');
  log('timeskip 7d started');
  await waitTurn();
  await shot(page, '14-after-timeskip.png');
  const game3 = await fetchGame();
  check(game3.turn === 2 && game3.date > game0.date, `тайм-скип: ход ${game3.turn}, дата ${game3.date}`);

  // 12. В меню → лендинг с сейвом → загрузка сейва
  await page.click('button:has-text("← Меню")');
  await page.waitForSelector('.landing-save-play', { timeout: 15000 });
  await page.waitForTimeout(1000);
  await shot(page, '15-landing-with-save.png');
  await page.locator('.landing-save-play').first().click();
  await page.waitForSelector('.game-wrapper', { timeout: 60000 });
  await waitMapReady();
  await shot(page, '16-loaded-save.png');
  const map2 = await mapState();
  check(map2 && map2.colored >= map2.regions * 0.98 && map2.labels >= 10, 'карта загруженного сейва окрашена и подписана');
  check(await page.locator('.turn-number').innerText().then(t => t.includes('2')), 'сейв загружен на ходе 2');
  check(await page.locator('.history-item').count() >= 1, 'история ходов восстановлена после загрузки сейва');

  check(pageErrors.length === 0, `нет ошибок страницы (${pageErrors.length})`);
} catch (e) {
  console.error(`[e2e] ERROR: ${e}`);
  failures.push(String(e));
  await shot(page, '99-failure.png').catch(() => {});
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`[e2e] FAILED (${failures.length}):\n  - ${failures.join('\n  - ')}`);
  process.exitCode = 1;
} else {
  log('E2E PASSED');
}
