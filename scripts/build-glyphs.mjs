/**
 * Open-Pax — сборка SDF-глифов (PBF) для подписей карты MapLibre
 * ===============================================================
 * Офлайн-замена glyph-серверу: шрифт PT Serif (SIL OFL 1.1, пакет
 * @fontsource/pt-serif) → frontend/public/glyphs/{fontstack}/{start}-{end}.pbf
 *
 * Как в fontnik/TinySDF: глиф растеризуется в 24 px с полем 3 px, по
 * растру считается знаковое расстояние (радиус 8, cutoff 0.25).
 * EDT — алгоритм Felzenszwalb–Huttenlocher в реализации @mapbox/tiny-sdf
 * (BSD-2-Clause).
 *
 * Запуск: npm run map:glyphs
 */

import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';
import { PbfWriter } from 'pbf';
import sharp from 'sharp';

const ROOT = process.cwd();
const FONT_DIR = path.join(ROOT, 'node_modules', '@fontsource', 'pt-serif', 'files');
const OUT_DIR = path.join(ROOT, 'frontend', 'public', 'glyphs');

const FONT_SIZE = 24;
const BUFFER = 3;
const RADIUS = 8;
const CUTOFF = 0.25;
/** Смещение базовой линии в метриках MapLibre (как у локальных глифов TinySDF) */
const ASCENT_OFFSET = 27;

const STACKS = [
  { name: 'PT Serif Regular', weight: 400 },
  { name: 'PT Serif Bold', weight: 700 },
];
const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'];

// ---------------------------------------------------------------------------
// EDT (из @mapbox/tiny-sdf, BSD-2-Clause)
// ---------------------------------------------------------------------------
const INF = 1e20;

function edt(data, x0, y0, width, height, gridSize, f, v, z) {
  for (let x = x0; x < x0 + width; x++) edt1d(data, y0 * gridSize + x, gridSize, height, f, v, z);
  for (let y = y0; y < y0 + height; y++) edt1d(data, y * gridSize + x0, 1, width, f, v, z);
}

function edt1d(grid, offset, stride, length, f, v, z) {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    const qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}

/** Альфа-растр (w×h, уже с полем BUFFER) → SDF-байты */
function toSdf(alpha, w, h) {
  const size = Math.max(w, h);
  const gridOuter = new Float64Array(w * h);
  const gridInner = new Float64Array(w * h);
  const f = new Float64Array(size);
  const z = new Float64Array(size + 1);
  const v = new Uint16Array(size);
  for (let i = 0; i < w * h; i++) {
    const a = alpha[i] / 255;
    if (a === 0) {
      gridOuter[i] = INF;
      gridInner[i] = 0;
    } else if (a === 1) {
      gridOuter[i] = 0;
      gridInner[i] = INF;
    } else {
      const d = 0.5 - a;
      gridOuter[i] = d > 0 ? d * d : 0;
      gridInner[i] = d < 0 ? d * d : 0;
    }
  }
  edt(gridOuter, 0, 0, w, h, w, f, v, z);
  edt(gridInner, 0, 0, w, h, w, f, v, z);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const d = Math.sqrt(gridOuter[i]) - Math.sqrt(gridInner[i]);
    out[i] = Math.max(0, Math.min(255, Math.round(255 - 255 * (d / RADIUS + CUTOFF))));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Растеризация глифа
// ---------------------------------------------------------------------------
async function renderGlyph(font, glyph, codepoint) {
  const scale = FONT_SIZE / font.unitsPerEm;
  const advance = Math.round(glyph.advanceWidth * scale);
  const bbox = glyph.getBoundingBox();
  const empty = !glyph.path || glyph.path.commands.length === 0 || bbox.x2 <= bbox.x1;
  if (empty) {
    return { id: codepoint, width: 0, height: 0, left: 0, top: -ASCENT_OFFSET, advance, bitmap: null };
  }
  const left = Math.floor(bbox.x1 * scale);
  const ascent = Math.ceil(bbox.y2 * scale);
  const width = Math.ceil(bbox.x2 * scale) - left;
  const height = ascent - Math.floor(bbox.y1 * scale);
  const W = width + 2 * BUFFER;
  const H = height + 2 * BUFFER;

  const pathData = glyph.getPath(BUFFER - left, BUFFER + ascent, FONT_SIZE).toPathData(3);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><path d="${pathData}" fill="#000"/></svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = data[i * info.channels + 3];

  return { id: codepoint, width, height, left, top: ascent - ASCENT_OFFSET, advance, bitmap: toSdf(alpha, W, H) };
}

// ---------------------------------------------------------------------------
// PBF (glyphs.proto)
// ---------------------------------------------------------------------------
function writeGlyph(g, pbf) {
  pbf.writeVarintField(1, g.id);
  if (g.bitmap) pbf.writeBytesField(2, g.bitmap);
  pbf.writeVarintField(3, g.width);
  pbf.writeVarintField(4, g.height);
  pbf.writeSVarintField(5, g.left);
  pbf.writeSVarintField(6, g.top);
  pbf.writeVarintField(7, g.advance);
}

function encodeRange(stackName, start, glyphs) {
  const pbf = new PbfWriter();
  pbf.writeMessage(1, (stack, p) => {
    p.writeStringField(1, stack.name);
    p.writeStringField(2, `${start}-${start + 255}`);
    for (const g of stack.glyphs) p.writeMessage(3, writeGlyph, g);
  }, { name: stackName, glyphs });
  return pbf.finish();
}

async function buildStack({ name, weight }) {
  // Подмножества fontsource — отдельные файлы; первый найденный глиф выигрывает
  const fonts = SUBSETS
    .map(s => path.join(FONT_DIR, `pt-serif-${s}-${weight}-normal.woff`))
    .filter(f => fs.existsSync(f))
    .map(f => {
      // Buffer может лежать в общем пуле — берём ровно его байты
      const buf = fs.readFileSync(f);
      return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    });

  const byCodepoint = new Map();
  for (const font of fonts) {
    for (let i = 0; i < font.glyphs.length; i++) {
      const glyph = font.glyphs.get(i);
      for (const cp of glyph.unicodes || []) {
        if (cp <= 0xffff && !byCodepoint.has(cp)) byCodepoint.set(cp, { font, glyph });
      }
    }
  }

  const dir = path.join(OUT_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;
  // Все 256 диапазонов: пустые тоже пишем, чтобы MapLibre не ловил 404
  for (let start = 0; start < 65536; start += 256) {
    const glyphs = [];
    for (let cp = start; cp < start + 256; cp++) {
      const entry = byCodepoint.get(cp);
      if (entry) glyphs.push(await renderGlyph(entry.font, entry.glyph, cp));
    }
    count += glyphs.length;
    fs.writeFileSync(path.join(dir, `${start}-${start + 255}.pbf`), encodeRange(name, start, glyphs));
  }
  console.log(`${name}: ${count} глифов`);
}

async function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  for (const stack of STACKS) await buildStack(stack);
  fs.copyFileSync(
    path.join(ROOT, 'node_modules', '@fontsource', 'pt-serif', 'LICENSE'),
    path.join(OUT_DIR, 'OFL-PT-Serif.txt'),
  );
  console.log(`Готово: ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
