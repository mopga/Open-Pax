/**
 * Open-Pax — сборка офлайн-тайлов рельефа для карты
 * ==================================================
 * Источник: Natural Earth «Shaded Relief, low res» (SR_LR, public domain,
 * 16200×8100, градации серого, равнопромежуточная проекция).
 * Результат: XYZ-тайлы Web Mercator frontend/public/tiles/relief/{z}/{x}/{y}.webp
 *
 * Тайл — не картинка рельефа, а полупрозрачный оверлей: тени — чёрный с
 * альфой, света — белый с альфой, «плоский» уровень (океан, равнины) —
 * прозрачный. Слой лежит поверх заливок государств и «тонирует» цвет
 * владельца рельефом, не трогая воду.
 *
 * Запуск (из корня репозитория):
 *   npm run map:relief                 # скачает SR_LR.zip (~25 МБ) в .cache/, если его нет
 *   npm run map:relief -- --max-zoom 5
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import AdmZip from 'adm-zip';

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, '.cache', 'naturalearth');
const ZIP_PATH = path.join(CACHE_DIR, 'SR_LR.zip');
const TIF_PATH = path.join(CACHE_DIR, 'SR_LR.tif');
const SOURCE_URL = 'https://naciscdn.org/naturalearth/10m/raster/SR_LR.zip';
const OUT_DIR = path.join(ROOT, 'frontend', 'public', 'tiles', 'relief');
const TILE = 256;
const MAX_LAT = 85.0511287798;

const maxZoomArg = process.argv.indexOf('--max-zoom');
const MAX_ZOOM = maxZoomArg > 0 ? Number(process.argv[maxZoomArg + 1]) : 6;

// Сила оверлея: альфа полной тени и полного света
const SHADOW_ALPHA = 210;
const HIGHLIGHT_ALPHA = 110;

sharp.cache(false);

async function ensureSource() {
  if (fs.existsSync(TIF_PATH)) return;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (!fs.existsSync(ZIP_PATH)) {
    console.log(`Скачиваю ${SOURCE_URL} …`);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`Не удалось скачать SR_LR.zip: HTTP ${res.status}`);
    fs.writeFileSync(ZIP_PATH, Buffer.from(await res.arrayBuffer()));
  }
  console.log('Распаковываю SR_LR.tif …');
  const entry = new AdmZip(ZIP_PATH).getEntries().find(e => e.entryName === 'SR_LR.tif');
  if (!entry) throw new Error('В архиве нет SR_LR.tif');
  fs.writeFileSync(TIF_PATH, entry.getData());
}

/** Самое частое значение яркости — «плоский» уровень (океан), он станет прозрачным */
function neutralLevel(buf) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < buf.length; i += 7) hist[buf[i]]++;
  let best = 0;
  for (let v = 1; v < 256; v++) if (hist[v] > hist[best]) best = v;
  return best;
}

async function main() {
  await ensureSource();
  const meta = await sharp(TIF_PATH, { limitInputPixels: false }).metadata();
  console.log(`Источник: ${meta.width}×${meta.height}, каналов: ${meta.channels}`);

  const full = await sharp(TIF_PATH, { limitInputPixels: false }).greyscale().raw().toBuffer();
  const neutral = neutralLevel(full);
  console.log(`Нейтральный уровень: ${neutral}`);

  // Таблица яркость → [rgb, alpha] оверлея
  const lutRgb = new Uint8Array(256);
  const lutA = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    if (v < neutral) {
      lutRgb[v] = 0;
      lutA[v] = Math.min(255, Math.round(((neutral - v) / neutral) * SHADOW_ALPHA));
    } else {
      lutRgb[v] = 255;
      lutA[v] = Math.min(255, Math.round(((v - neutral) / Math.max(1, 255 - neutral)) * HIGHLIGHT_ALPHA));
    }
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  let written = 0;

  for (let z = 0; z <= MAX_ZOOM; z++) {
    const W = TILE * 2 ** z;
    // Источник, уменьшенный до ширины зума (усреднение — без алиасинга на мелких зумах)
    const srcW = Math.min(meta.width, W);
    const srcH = Math.round(srcW / 2);
    const src = srcW === meta.width
      ? full
      : await sharp(full, { raw: { width: meta.width, height: meta.height, channels: 1 } })
        .resize(srcW, srcH, { kernel: 'lanczos3' })
        // resize отдаёт sRGB (3 канала) даже для серого входа — оставляем один
        .extractChannel(0)
        .raw()
        .toBuffer();

    // Для каждой строки Меркатора — исходная строка (широта) и вес билинейной интерполяции
    const n = 2 ** z;
    for (let ty = 0; ty < n; ty++) {
      const strip = Buffer.alloc(W * TILE * 4);
      for (let row = 0; row < TILE; row++) {
        const y = ty * TILE + row;
        const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / W))) * 180 / Math.PI;
        const sy = Math.min(srcH - 1.001, Math.max(0, ((90 - Math.min(MAX_LAT, Math.max(-MAX_LAT, lat))) / 180) * srcH - 0.5));
        const y0 = Math.floor(sy);
        const fy = sy - y0;
        const r0 = y0 * srcW;
        const r1 = (y0 + 1) * srcW;
        for (let x = 0; x < W; x++) {
          const sx = ((x + 0.5) / W) * srcW - 0.5;
          const x0 = Math.max(0, Math.floor(sx));
          const x1 = Math.min(srcW - 1, x0 + 1);
          const fx = Math.min(1, Math.max(0, sx - x0));
          const v = Math.round(
            (src[r0 + x0] * (1 - fx) + src[r0 + x1] * fx) * (1 - fy)
            + (src[r1 + x0] * (1 - fx) + src[r1 + x1] * fx) * fy,
          );
          const o = (row * W + x) * 4;
          strip[o] = strip[o + 1] = strip[o + 2] = lutRgb[v];
          strip[o + 3] = lutA[v];
        }
      }

      for (let tx = 0; tx < n; tx++) {
        const dir = path.join(OUT_DIR, String(z), String(tx));
        fs.mkdirSync(dir, { recursive: true });
        await sharp(strip, { raw: { width: W, height: TILE, channels: 4 } })
          .extract({ left: tx * TILE, top: 0, width: TILE, height: TILE })
          .webp({ quality: 72, alphaQuality: 80, effort: 4 })
          .toFile(path.join(dir, `${ty}.webp`));
        written++;
      }
    }
    console.log(`z${z}: ${n * n} тайлов`);
  }
  console.log(`Готово: ${written} тайлов в ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
