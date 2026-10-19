/**
 * Open-Pax — подготовка данных карты (чистые функции, без MapLibre)
 * ==================================================================
 * - parseRegionFeatures: регионы игры → GeoJSON-фичи (геометрия статична,
 *   владелец и цвет живут в feature-state).
 * - buildBorderEdges: общие рёбра соседних регионов и береговые линии.
 *   Граница государств рисуется только там, где у соседей разные владельцы.
 * - buildPolityLabels: одна подпись на государство (и на каждый его крупный
 *   отдельный кусок — как PORTUGAL в Анголе и Мозамбике у PaxHistoria);
 *   размер шрифта — от площади куска в пикселях Меркатора.
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
  point: Position;
  /** Размер шрифта на зуме 0, px (растёт ×2 на каждый уровень зума) */
  size0: number;
  /** Площадь куска в пикселях зума 0 — для приоритета при коллизиях */
  area0: number;
  /** Зум, с которого подпись видна (до этого шрифт меньше MIN_LABEL_PX) */
  minZoom: number;
}

/** Минимальный читаемый размер подписи, px */
export const MIN_LABEL_PX = 7;
/** Подпись занимает примерно такую долю ширины куска */
const LABEL_FILL = 0.8;
/** Высота подписи — не больше такой доли высоты куска */
const LABEL_MAX_HEIGHT = 0.5;
/** Ширина символа в капсе с разрядкой, в долях кегля */
const CHAR_WIDTH_EM = 0.95;
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
      const [x, y] = polylabel(poly, 0.05) as unknown as Position;
      // Подпись горизонтальная: влезает по ширине куска и не выше его доли по высоте
      const { w, h } = ringBBox(poly[0]);
      const size0 = Math.min((LABEL_FILL * w) / (chars * CHAR_WIDTH_EM), LABEL_MAX_HEIGHT * h);
      labels.push({
        owner,
        name,
        point: unproject([x, y]),
        size0,
        area0: areas[i],
        minZoom: Math.max(0, Math.log2(MIN_LABEL_PX / size0)),
      });
    });
  }
  return labels;
}
