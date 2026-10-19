/**
 * Open-Pax — подготовка данных карты (чистые функции, без MapLibre)
 * ==================================================================
 * - parseRegionFeatures: регионы игры → GeoJSON-фичи (геометрия статична,
 *   владелец и цвет живут в feature-state).
 * - buildBorderEdges: общие рёбра соседних регионов и береговые линии.
 *   Граница государств рисуется только там, где у соседей разные владельцы.
 * - buildPolityLabels: одна подпись на государство (и на каждый его крупный
 *   отдельный кусок — как PORTUGAL в Анголе и Мозамбике у PaxHistoria).
 *   Подпись идёт вдоль «линии метки» — плавной дуги по главной оси куска
 *   (labelLineForPart); размер шрифта и разрядка подбираются под её длину.
 */

import polylabel from 'polylabel';

export interface MapRegionInput {
  id: string;
  name: string;
  owner?: string | null;
  geojson?: string;
}

export type Position = [number, number];
type Ring = Position[];
type PolygonCoords = Ring[];

export interface RegionFeature {
  type: 'Feature';
  properties: { id: string; name: string };
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

/** Ширина мира в пикселях Меркатора на зуме 0 */
const WORLD_PX = 256;
const MAX_LAT = 85.0511287798;

/** lng/lat → пиксели Web Mercator на зуме 0 */
export function project([lng, lat]: Position): Position {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  const x = ((lng + 180) / 360) * WORLD_PX;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * WORLD_PX;
  return [x, y];
}

/** Обратная проекция: пиксели Меркатора зума 0 → lng/lat */
export function unproject([x, y]: Position): Position {
  const lng = (x / WORLD_PX) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / WORLD_PX;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return [lng, lat];
}

function polygonsOf(geometry: GeoJSON.Geometry): PolygonCoords[] {
  if (geometry.type === 'Polygon') return [geometry.coordinates as PolygonCoords];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as PolygonCoords[];
  return [];
}

/** Регионы → фичи для источника карты (битый geojson пропускается) */
export function parseRegionFeatures(regions: MapRegionInput[]): RegionFeature[] {
  const out: RegionFeature[] = [];
  for (const region of regions) {
    if (!region.geojson) continue;
    try {
      const parsed = JSON.parse(region.geojson);
      const geometry = parsed?.geometry ?? parsed;
      if (geometry?.type !== 'Polygon' && geometry?.type !== 'MultiPolygon') continue;
      out.push({ type: 'Feature', properties: { id: region.id, name: region.name }, geometry });
    } catch {
      /* пропускаем */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Общие рёбра
// ---------------------------------------------------------------------------

export interface BorderEdge {
  /** Пара соседей; b = null — берег (у отрезка один регион) */
  a: string;
  b: string | null;
  lines: Position[][];
}

const keyOf = (p: Position) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;

/**
 * Разбивает контуры регионов на рёбра «регион–сосед» и береговые линии.
 * Natural Earth хранит общие границы стран одинаковыми вершинами, поэтому
 * сосед находится по совпадению отрезка. Несовпавшие отрезки уходят в
 * «берег» — граница всё равно нарисуется, просто как внешняя.
 */
export function buildBorderEdges(features: RegionFeature[]): BorderEdge[] {
  const segOwners = new Map<string, { ids: string[]; p: Position; q: Position }>();

  for (const f of features) {
    const id = f.properties.id;
    for (const poly of polygonsOf(f.geometry)) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i++) {
          const p = ring[i] as Position;
          const q = ring[i + 1] as Position;
          const kp = keyOf(p);
          const kq = keyOf(q);
          if (kp === kq) continue;
          const key = kp < kq ? `${kp}|${kq}` : `${kq}|${kp}`;
          const entry = segOwners.get(key);
          if (entry) {
            if (!entry.ids.includes(id)) entry.ids.push(id);
          } else {
            segOwners.set(key, { ids: [id], p, q });
          }
        }
      }
    }
  }

  // Группируем отрезки по паре регионов
  const groups = new Map<string, { a: string; b: string | null; segs: [Position, Position][] }>();
  for (const { ids, p, q } of segOwners.values()) {
    const [a, b] = ids.length >= 2 ? [ids[0], ids[1]].sort() : [ids[0], null];
    const gk = `${a}|${b ?? ''}`;
    let g = groups.get(gk);
    if (!g) {
      g = { a, b, segs: [] };
      groups.set(gk, g);
    }
    g.segs.push([p, q]);
  }

  return [...groups.values()].map(g => ({ a: g.a, b: g.b, lines: chainSegments(g.segs) }));
}

/** Склеивает отрезки в полилинии (чтобы толстая линия не рвалась на стыках) */
export function chainSegments(segs: [Position, Position][]): Position[][] {
  const adj = new Map<string, number[]>();
  segs.forEach(([p, q], i) => {
    for (const k of [keyOf(p), keyOf(q)]) {
      const list = adj.get(k);
      if (list) list.push(i);
      else adj.set(k, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const lines: Position[][] = [];

  const extend = (line: Position[], forward: boolean) => {
    for (;;) {
      const end = forward ? line[line.length - 1] : line[0];
      const next = (adj.get(keyOf(end)) ?? []).find(i => !used[i]);
      if (next === undefined) return;
      used[next] = 1;
      const [p, q] = segs[next];
      const other = keyOf(p) === keyOf(end) ? q : p;
      if (forward) line.push(other);
      else line.unshift(other);
    }
  };

  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line: Position[] = [segs[i][0], segs[i][1]];
    extend(line, true);
    extend(line, false);
    lines.push(line);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Подписи государств
// ---------------------------------------------------------------------------

export interface PolityLabel {
  owner: string;
  name: string;
  /** Линия метки (lng/lat): подпись рисуется вдоль неё */
  line: Position[];
  /** Середина линии — для поиска и отладки */
  point: Position;
  /** Межбуквенный интервал, em: растягивает текст на длину линии */
  letterSpacing: number;
  /** Размер шрифта на зуме 0, px (растёт ×2 на каждый уровень зума) */
  size0: number;
  /** Площадь куска в пикселях зума 0 — для приоритета при коллизиях */
  area0: number;
  /** Зум, с которого подпись видна (до этого шрифт меньше MIN_LABEL_PX) */
  minZoom: number;
}

/** Минимальный читаемый размер подписи, px */
export const MIN_LABEL_PX = 7;
/** Текст занимает такую долю длины линии метки */
const LABEL_FILL = 0.85;
/** Высота подписи — не больше такой доли толщины куска поперёк линии */
const LABEL_MAX_THICKNESS = 0.6;
/** Ширина заглавной буквы PT Serif без разрядки, в долях кегля */
const CHAR_BASE_EM = 0.7;
/** Разрядка по умолчанию, em (когда кегль ограничен длиной линии) */
const BASE_SPACING_EM = 0.25;
const MAX_SPACING_EM = 1.4;
/** Удлинение линии метки за край куска (доля её длины), как 0.015 у PaxHistoria */
export const LABEL_LINE_EXTENSION = 0.015;
/** Число поперечных станций вдоль оси куска */
const LABEL_STATIONS = 24;
/** Ниже такой анизотропии кусок считается круглым — линия горизонтальная */
const ROUND_ANISOTROPY = 1.8;
/** Прогиб дуги не больше такой доли толщины куска */
const MAX_SAG = 0.35;
/** Куски меньше этой доли от самого большого не подписываются отдельно */
const SECONDARY_PART_RATIO = 0.3;

function ringBBox(ring: Position[]): { w: number; h: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { w: maxX - minX, h: maxY - minY };
}

function ringArea(ring: Position[]): number {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(s) / 2;
}

/**
 * @param regions  регионы с владельцами
 * @param features разобранная геометрия (parseRegionFeatures)
 * @param polityName имя государства по его id (владельцу)
 */
export interface LabelLine {
  /** Точки линии в пикселях Меркатора зума 0 */
  line: Position[];
  length: number;
  /** Медианная ширина куска поперёк линии */
  thickness: number;
}

/** Решение 3x3 СЛАУ (нормальные уравнения квадратичной регрессии) */
function solve3(m: number[][], r: number[]): number[] | null {
  const a = m.map((row, i) => [...row, r[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let i = c + 1; i < 3; i++) if (Math.abs(a[i][c]) > Math.abs(a[piv][c])) piv = i;
    if (Math.abs(a[piv][c]) < 1e-12) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    for (let i = 0; i < 3; i++) {
      if (i === c) continue;
      const f = a[i][c] / a[c][c];
      for (let k = c; k < 4; k++) a[i][k] -= f * a[c][k];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

/**
 * Линия метки для куска (кольца в пикселях Меркатора зума 0):
 *  1. главная ось — взвешенный по длине рёбер PCA контура; почти круглые
 *     куски получают горизонтальную ось (так подпись читается естественно);
 *  2. вдоль оси LABEL_STATIONS станций, в каждой — самая длинная хорда
 *     поперёк оси и её середина;
 *  3. по серединам — взвешенная квадратичная дуга (плавная, как у
 *     PaxHistoria), прогиб ограничен долей толщины куска;
 *  4. дуга удлиняется на LABEL_LINE_EXTENSION с обеих сторон.
 */
export function labelLineForPart(poly: PolygonCoords): LabelLine | null {
  const outer = poly[0];
  if (!outer || outer.length < 4) return null;

  // 1. Взвешенный PCA по серединам рёбер
  let sw = 0, mx = 0, my = 0;
  for (let i = 0; i < outer.length - 1; i++) {
    const [x0, y0] = outer[i];
    const [x1, y1] = outer[i + 1];
    const l = Math.hypot(x1 - x0, y1 - y0);
    sw += l;
    mx += (l * (x0 + x1)) / 2;
    my += (l * (y0 + y1)) / 2;
  }
  if (sw === 0) return null;
  mx /= sw;
  my /= sw;
  let cxx = 0, cyy = 0, cxy = 0;
  for (let i = 0; i < outer.length - 1; i++) {
    const [x0, y0] = outer[i];
    const [x1, y1] = outer[i + 1];
    const l = Math.hypot(x1 - x0, y1 - y0);
    const dx = (x0 + x1) / 2 - mx;
    const dy = (y0 + y1) / 2 - my;
    cxx += l * dx * dx;
    cyy += l * dy * dy;
    cxy += l * dx * dy;
  }
  const half = Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy * cxy);
  const l1 = (cxx + cyy) / 2 + half;
  const l2 = (cxx + cyy) / 2 - half;
  const anisotropy = l2 > 1e-12 ? l1 / l2 : Infinity;
  const theta = anisotropy < ROUND_ANISOTROPY ? 0 : 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const toUV = ([x, y]: Position): Position => {
    const dx = x - mx, dy = y - my;
    return [dx * cos + dy * sin, -dx * sin + dy * cos];
  };
  const fromUV = ([u, v]: Position): Position => [mx + u * cos - v * sin, my + u * sin + v * cos];

  const rings = poly.map(ring => ring.map(p => toUV(p as Position)));
  let umin = Infinity, umax = -Infinity;
  for (const [u] of rings[0]) {
    if (u < umin) umin = u;
    if (u > umax) umax = u;
  }
  if (!(umax > umin)) return null;

  // 2. Поперечные хорды
  const stations: { u: number; mid: number; len: number }[] = [];
  for (let k = 0; k < LABEL_STATIONS; k++) {
    const u = umin + ((k + 0.5) / LABEL_STATIONS) * (umax - umin);
    const vs: number[] = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [ua, va] = ring[i];
        const [ub, vb] = ring[i + 1];
        if ((ua <= u && ub > u) || (ub <= u && ua > u)) vs.push(va + ((u - ua) / (ub - ua)) * (vb - va));
      }
    }
    vs.sort((a, b) => a - b);
    let best = { mid: 0, len: 0 };
    for (let i = 0; i + 1 < vs.length; i += 2) {
      const len = vs[i + 1] - vs[i];
      if (len > best.len) best = { mid: (vs[i] + vs[i + 1]) / 2, len };
    }
    if (best.len > 0) stations.push({ u, ...best });
  }
  if (stations.length < 2) return null;

  // Хвосты тоньше четверти максимальной ширины не тянут линию (полуострова, косы)
  const maxLen = Math.max(...stations.map(st => st.len));
  const core = stations.filter(st => st.len >= maxLen * 0.25);
  const used = core.length >= 2 ? core : stations;
  const sortedLens = used.map(st => st.len).sort((a, b) => a - b);
  const thickness = sortedLens[Math.floor(sortedLens.length / 2)];

  // 3. Взвешенная квадратичная регрессия v = a*u^2 + b*u + c
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const r = [0, 0, 0];
  for (const st of used) {
    const w = st.len;
    const basis = [st.u * st.u, st.u, 1];
    for (let i = 0; i < 3; i++) {
      r[i] += w * basis[i] * st.mid;
      for (let j = 0; j < 3; j++) m[i][j] += w * basis[i] * basis[j];
    }
  }
  const u0 = used[0].u;
  const u1 = used[used.length - 1].u;
  let coef = used.length >= 3 ? solve3(m, r) : null;
  if (!coef) {
    // Вырожденный случай — прямая через среднюю середину
    const avg = used.reduce((acc, st) => acc + st.mid, 0) / used.length;
    coef = [0, 0, avg];
  }
  // Ограничиваем изгиб, сохраняя значение и наклон дуги в центре
  const span = (u1 - u0) / 2;
  const sag = Math.abs(coef[0]) * span * span;
  if (sag > MAX_SAG * thickness) {
    const uc = (u0 + u1) / 2;
    const a2 = coef[0] * ((MAX_SAG * thickness) / sag);
    const b2 = coef[1] + 2 * uc * (coef[0] - a2);
    const vc = coef[0] * uc * uc + coef[1] * uc + coef[2];
    const c2 = vc - a2 * uc * uc - b2 * uc;
    coef = [a2, b2, c2];
  }

  // 4. Сэмплирование дуги с удлинением концов
  const ext = (u1 - u0) * LABEL_LINE_EXTENSION;
  const start = u0 - ext;
  const end = u1 + ext;
  const N = 16;
  const line: Position[] = [];
  for (let i = 0; i <= N; i++) {
    const u = start + ((end - start) * i) / N;
    line.push(fromUV([u, coef[0] * u * u + coef[1] * u + coef[2]]));
  }
  let length = 0;
  for (let i = 1; i < line.length; i++) length += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return { line, length, thickness };
}

/** Самый крупный кусок (по площади в пикселях Меркатора) набора фич — для вида на страну */
export function largestPartBounds(features: RegionFeature[]): [[number, number], [number, number]] | null {
  let best: PolygonCoords | null = null;
  let bestArea = 0;
  for (const f of features) {
    for (const poly of polygonsOf(f.geometry)) {
      const area = ringArea(poly[0].map(p => project(p as Position)));
      if (area > bestArea) {
        bestArea = area;
        best = poly;
      }
    }
  }
  if (!best) return null;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of best[0]) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [[minLng, Math.max(-85, minLat)], [maxLng, Math.min(85, maxLat)]];
}

/**
 * Приглушает цвет владельца для карты: цвета реестра — флаговые и кислотные,
 * а политическая карта в духе PaxHistoria читается в мягких тонах.
 * Насыщенность ≤ 0.55, светлота в коридоре 0.36–0.62 (тон сохраняется).
 */
export function muteColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l0 = (max + min) / 2;
  const d = max - min;
  const s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = Math.min(0.55, s0);
  const l = Math.min(0.62, Math.max(0.36, l0));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + mm) * 255).toString(16).padStart(2, '0');
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

export function buildPolityLabels(
  regions: MapRegionInput[],
  features: RegionFeature[],
  polityName: (owner: string) => string,
): PolityLabel[] {
  const geomById = new Map(features.map(f => [f.properties.id, f.geometry]));
  const partsByOwner = new Map<string, PolygonCoords[]>();

  for (const r of regions) {
    const owner = r.owner;
    if (!owner || owner === 'neutral') continue;
    const geom = geomById.get(r.id);
    if (!geom) continue;
    const list = partsByOwner.get(owner) ?? [];
    // Куски — в пикселях Меркатора: площадь и точка подписи считаются в плоскости карты
    for (const poly of polygonsOf(geom)) list.push(poly.map(ring => ring.map(p => project(p as Position))));
    partsByOwner.set(owner, list);
  }

  const labels: PolityLabel[] = [];
  for (const [owner, parts] of partsByOwner) {
    const areas = parts.map(poly => ringArea(poly[0]) - poly.slice(1).reduce((s, h) => s + ringArea(h), 0));
    const maxArea = Math.max(...areas);
    if (!(maxArea > 0)) continue;
    const name = polityName(owner);
    const chars = Math.max(3, [...name].length);

    parts.forEach((poly, i) => {
      if (areas[i] < maxArea * SECONDARY_PART_RATIO) return;
      let ll = labelLineForPart(poly);
      if (!ll) {
        // Запасной вариант: горизонталь через полюс недоступности
        const [x, y] = polylabel(poly, 0.05) as unknown as Position;
        const { w, h } = ringBBox(poly[0]);
        ll = { line: [[x - w * 0.4, y], [x + w * 0.4, y]], length: w * 0.8, thickness: h };
      }
      // Кегль: текст с базовой разрядкой влезает в линию и не толще куска
      const size0 = Math.min(
        (LABEL_FILL * ll.length) / (chars * (CHAR_BASE_EM + BASE_SPACING_EM)),
        LABEL_MAX_THICKNESS * ll.thickness,
      );
      if (!(size0 > 0)) return;
      // Разрядка растягивает текст на линию (крупно и вразбивку, как SOVIET у PaxHistoria)
      const letterSpacing = Math.min(MAX_SPACING_EM, Math.max(BASE_SPACING_EM,
        (LABEL_FILL * ll.length) / (chars * size0) - CHAR_BASE_EM));
      const line = ll.line.map(p => unproject(p));
      labels.push({
        owner,
        name,
        line,
        point: line[Math.floor(line.length / 2)],
        letterSpacing,
        size0,
        area0: areas[i],
        minZoom: Math.max(0, Math.log2(MIN_LABEL_PX / size0)),
      });
    });
  }
  return labels;
}
