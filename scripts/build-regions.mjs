/**
 * Open-Pax — сборка регионов карты (мельче стран)
 * ================================================
 * Источник: Natural Earth «Admin 1 – States, Provinces» 1:10m (public domain,
 * ~4.6 тыс. единиц). Результат: backend-nest/data/geojson/regions.geojson —
 * ~1–1.5 тыс. регионов с полями { id, iso3, name, nameEn, nameRu, neighbors }.
 *
 * Шаги:
 *  1. mapshaper: упрощение с сохранением топологии (общие границы остаются
 *     общими — по ним считаются соседи и границы государств на карте).
 *  2. Жадное слияние единиц внутри страны до целевого числа регионов,
 *     растущего с площадью: Россия/Китай ~30, Франция ~6, Бельгия 1.
 *     Сначала объединяются единицы одного NE-«региона» (французские регионы,
 *     английские графства), потом — самые мелкие с самыми мелкими соседями.
 *  3. mapshaper: dissolve по группам, соседство итоговых регионов.
 *
 * Запуск: npm run map:regions  (скачает ~15 МБ в .cache/, если архива нет)
 */

import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import mapshaper from 'mapshaper';

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, '.cache', 'naturalearth');
const ZIP_PATH = path.join(CACHE_DIR, 'ne_10m_admin_1_states_provinces.zip');
const SHP_DIR = path.join(CACHE_DIR, 'admin1');
const SHP_PATH = path.join(SHP_DIR, 'ne_10m_admin_1_states_provinces.shp');
const SOURCE_URL = 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip';
const OUT_PATH = path.join(ROOT, 'backend-nest', 'data', 'geojson', 'regions.geojson');
const COUNTRIES_PATH = path.join(ROOT, 'backend-nest', 'data', 'geojson', 'countries.geojson');
const CAPITALS_PATH = path.join(ROOT, 'backend-nest', 'data', 'geojson', 'capitals.json');

/** Доля сохраняемых вершин при упрощении */
const SIMPLIFY = process.env.REGIONS_SIMPLIFY || '10%';
/** Целевое число регионов страны: sqrt(площадь км²) / DIVISOR, от 1 до MAX */
const AREA_DIVISOR = 120;
const MAX_REGIONS = 30;

/**
 * Мелкие территории Natural Earth с собственным кодом → страна-владелец
 * (базы, анклавы, острова), Палестина — к коду countries.geojson.
 */
const OWNER_ALIASES = {
  PSX: 'PSE', KAB: 'KAZ', USG: 'USA', GIB: 'GBR', ESB: 'GBR', WSB: 'GBR',
  UMI: 'USA', CSI: 'AUS', CLP: 'FRA',
};

async function ensureSource() {
  if (fs.existsSync(SHP_PATH)) return;
  fs.mkdirSync(SHP_DIR, { recursive: true });
  if (!fs.existsSync(ZIP_PATH)) {
    console.log(`Скачиваю ${SOURCE_URL} …`);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(ZIP_PATH, Buffer.from(await res.arrayBuffer()));
  }
  new AdmZip(ZIP_PATH).extractAllTo(SHP_DIR, true);
}

const keyOf = p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;

function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

/** Площадь в км² (сферическая аппроксимация по кольцам) */
function areaKm2(geometry) {
  const R = 6371;
  let total = 0;
  for (const poly of polygonsOf(geometry)) {
    poly.forEach((ring, ri) => {
      let s = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const [l1, p1] = ring[i];
        const [l2, p2] = ring[i + 1];
        s += ((l2 - l1) * Math.PI / 180) * (2 + Math.sin(p1 * Math.PI / 180) + Math.sin(p2 * Math.PI / 180));
      }
      const a = Math.abs((s * R * R) / 2);
      total += ri === 0 ? a : -a;
    });
  }
  return Math.max(0, total);
}

function pointIn(lng, lat, geometry) {
  for (const poly of polygonsOf(geometry)) {
    let inside = false;
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

function centroidOf(geometry) {
  let sx = 0, sy = 0, n = 0;
  for (const poly of polygonsOf(geometry)) {
    for (const [x, y] of poly[0]) { sx += x; sy += y; n++; }
  }
  return n ? [sx / n, sy / n] : [0, 0];
}

/** Соседство фич по общим отрезкам контуров (вершины после топологического упрощения общие) */
function adjacency(features) {
  const segOwner = new Map();
  const neighbors = features.map(() => new Set());
  features.forEach((f, idx) => {
    for (const poly of polygonsOf(f.geometry)) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i++) {
          const a = keyOf(ring[i]);
          const b = keyOf(ring[i + 1]);
          if (a === b) continue;
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          const other = segOwner.get(key);
          if (other === undefined) segOwner.set(key, idx);
          else if (other !== idx) {
            neighbors[idx].add(other);
            neighbors[other].add(idx);
          }
        }
      }
    }
  });
  return neighbors;
}

async function runMapshaper(commands, input) {
  const out = await mapshaper.applyCommands(commands, input);
  const file = Object.keys(out)[0];
  return JSON.parse(out[file].toString());
}

async function main() {
  await ensureSource();

  console.log(`Упрощаю admin-1 (${SIMPLIFY}) …`);
  const units = await runMapshaper(
    `-i "${SHP_PATH}" -simplify ${SIMPLIFY} keep-shapes -clean ` +
    '-filter-fields adm0_a3,name,name_en,name_ru,region ' +
    '-o units.json format=geojson precision=0.001',
  );
  const feats = units.features.filter(f => f.geometry);
  console.log(`Единиц: ${feats.length}`);

  const unitNeighbors = adjacency(feats);
  const info = feats.map(f => {
    const p = f.properties;
    const iso3 = OWNER_ALIASES[p.adm0_a3] || p.adm0_a3;
    return { iso3, area: areaKm2(f.geometry), centroid: centroidOf(f.geometry), props: p };
  });

  // Группы: union-find по индексам единиц
  const parent = feats.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { parent[find(b)] = find(a); };

  const byCountry = new Map();
  info.forEach((u, i) => {
    const list = byCountry.get(u.iso3) ?? [];
    list.push(i);
    byCountry.set(u.iso3, list);
  });

  for (const [, idxs] of byCountry) {
    const countryArea = idxs.reduce((s, i) => s + info[i].area, 0);
    const target = Math.max(1, Math.min(MAX_REGIONS, Math.round(Math.sqrt(countryArea) / AREA_DIVISOR)));
    const groups = () => new Set(idxs.map(find));

    // 1. Единицы одного NE-региона объединяем, если это не уводит ниже цели
    const byRegion = new Map();
    for (const i of idxs) {
      const r = info[i].props.region;
      if (!r) continue;
      const list = byRegion.get(r) ?? [];
      list.push(i);
      byRegion.set(r, list);
    }
    if (byRegion.size >= target && byRegion.size < groups().size) {
      for (const list of byRegion.values()) for (let k = 1; k < list.length; k++) union(list[0], list[k]);
    }

    // 2. Жадно: самая мелкая группа сливается с самым мелким соседом (или ближайшей группой)
    const groupArea = () => {
      const m = new Map();
      for (const i of idxs) m.set(find(i), (m.get(find(i)) ?? 0) + info[i].area);
      return m;
    };
    while (groups().size > target) {
      const areas = groupArea();
      const smallest = [...areas.entries()].sort((a, b) => a[1] - b[1])[0][0];
      const members = idxs.filter(i => find(i) === smallest);
      const adjGroups = new Set();
      for (const i of members) for (const n of unitNeighbors[i]) {
        if (info[n].iso3 === info[i].iso3 && find(n) !== smallest) adjGroups.add(find(n));
      }
      let partner;
      if (adjGroups.size > 0) {
        partner = [...adjGroups].sort((a, b) => areas.get(a) - areas.get(b))[0];
      } else {
        // Остров без соседей своей страны — к ближайшей по центру группе
        const [cx, cy] = info[members[0]].centroid;
        let best = Infinity;
        for (const g of areas.keys()) {
          if (g === smallest) continue;
          const [gx, gy] = info[g].centroid;
          const d = (gx - cx) ** 2 + (gy - cy) ** 2;
          if (d < best) { best = d; partner = g; }
        }
      }
      if (partner === undefined) break;
      union(partner, smallest);
    }
  }

  // Имена: страна из одного региона называется как страна; иначе — по
  // крупнейшей единице группы (уникально и узнаваемо, в отличие от общих
  // NE-регионов вроде «West»/«Midwest»). Совпадения уточняются страной.
  const countryNames = new Map(
    JSON.parse(fs.readFileSync(COUNTRIES_PATH, 'utf8')).features
      .map(f => [f.properties.code, { ru: f.properties.name, en: f.properties.nameEn }]),
  );
  // Единица со столицей страны: её группа называется по ней («Париж», а не
  // крупнейший департамент «Марна»)
  const capitals = fs.existsSync(CAPITALS_PATH) ? JSON.parse(fs.readFileSync(CAPITALS_PATH, 'utf8')) : {};
  const capitalUnit = new Map();
  for (const [iso3, idxs] of byCountry) {
    const cap = capitals[iso3];
    if (!cap) continue;
    const hit = idxs.find(i => pointIn(cap.lng, cap.lat, feats[i].geometry));
    if (hit !== undefined) capitalUnit.set(find(hit), hit);
  }
  const groupsMeta = new Map();
  info.forEach((u, i) => {
    const g = find(i);
    const meta = groupsMeta.get(g) ?? { iso3: u.iso3, members: [] };
    meta.members.push(i);
    groupsMeta.set(g, meta);
  });
  const counters = new Map();
  const groupsPerCountry = new Map();
  for (const meta of groupsMeta.values()) groupsPerCountry.set(meta.iso3, (groupsPerCountry.get(meta.iso3) ?? 0) + 1);
  for (const meta of groupsMeta.values()) {
    const largest = meta.members.reduce((a, b) => (info[b].area > info[a].area ? b : a));
    const p = info[capitalUnit.get(find(meta.members[0])) ?? largest].props;
    const n = (counters.get(meta.iso3) ?? 0) + 1;
    counters.set(meta.iso3, n);
    meta.id = `${meta.iso3}-${n}`;
    const country = countryNames.get(meta.iso3);
    if (groupsPerCountry.get(meta.iso3) === 1 && country) {
      meta.nameEn = country.en;
      meta.nameRu = country.ru;
    } else {
      meta.nameEn = p.name_en || p.name;
      meta.nameRu = p.name_ru || meta.nameEn;
    }
  }
  // Уникальность имён по всей карте: «Luxembourg (Belgium)»
  for (const lang of ['nameEn', 'nameRu']) {
    const seen = new Map();
    for (const meta of groupsMeta.values()) {
      const list = seen.get(meta[lang]) ?? [];
      list.push(meta);
      seen.set(meta[lang], list);
    }
    for (const list of seen.values()) {
      if (list.length < 2) continue;
      for (const meta of list) {
        const country = countryNames.get(meta.iso3);
        const suffix = lang === 'nameRu' ? (country?.ru ?? meta.iso3) : (country?.en ?? meta.iso3);
        if (groupsPerCountry.get(meta.iso3) > 1 || list.filter(m => m.iso3 === meta.iso3).length < list.length) {
          meta[lang] = `${meta[lang]} (${suffix})`;
        }
      }
    }
  }
  // Совпадения внутри одной страны (Вьентьян-префектура и провинция) — номером
  for (const lang of ['nameEn', 'nameRu']) {
    const count = new Map();
    for (const meta of groupsMeta.values()) {
      const n = (count.get(meta[lang]) ?? 0) + 1;
      count.set(meta[lang], n);
      if (n > 1) meta[lang] = `${meta[lang]} ${n}`;
    }
  }
  feats.forEach((f, i) => {
    const meta = groupsMeta.get(find(i));
    f.properties = { gid: meta.id };
  });

  console.log(`Регионов после слияния: ${groupsMeta.size}. Dissolve …`);
  const dissolved = await runMapshaper(
    '-i units.json -dissolve gid -o regions.json format=geojson precision=0.001',
    { 'units.json': JSON.stringify({ type: 'FeatureCollection', features: feats }) },
  );
  const metaById = new Map([...groupsMeta.values()].map(m => [m.id, m]));
  const out = dissolved.features.filter(f => f.geometry);
  const regionNeighbors = adjacency(out);
  const features = out.map((f, i) => {
    const meta = metaById.get(f.properties.gid);
    return {
      type: 'Feature',
      properties: {
        id: meta.id,
        iso3: meta.iso3,
        name: meta.nameEn,
        nameEn: meta.nameEn,
        nameRu: meta.nameRu,
        neighbors: [...regionNeighbors[i]].map(n => out[n].properties.gid).sort(),
      },
      geometry: f.geometry,
    };
  }).sort((a, b) => a.properties.id.localeCompare(b.properties.id, 'en', { numeric: true }));

  fs.writeFileSync(OUT_PATH, JSON.stringify({ type: 'FeatureCollection', features }));
  let vertices = 0;
  for (const f of features) for (const poly of polygonsOf(f.geometry)) for (const ring of poly) vertices += ring.length;
  const size = (fs.statSync(OUT_PATH).size / 1e6).toFixed(1);
  console.log(`Готово: ${features.length} регионов, ${vertices} вершин, ${size} МБ → ${path.relative(ROOT, OUT_PATH)}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
