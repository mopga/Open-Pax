/**
 * Open-Pax — сборка мира из регионов (мельче стран)
 * =================================================
 * Вход: регионы data/geojson/regions.geojson (scripts/build-regions.mjs),
 * каталог государств пресета и столицы. Выход: регионы мира с владельцами и
 * реестр государств. Государство по умолчанию = страна Natural Earth; пресет
 * может собрать государство из нескольких стран (members: YUG = SRB+HRV+…).
 */

import type { PolityRecord } from '../repositories/world.repository';

export interface RegionFeature {
  type: 'Feature';
  properties: { id: string; iso3: string; name: string; nameEn: string; nameRu: string; neighbors: string[] };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
}

export interface PolitySeed {
  name: string;
  color: string;
  metadata?: Record<string, any>;
}

export interface CapitalEntry { capital: string; lat: number; lng: number }

export interface RegionWorldInput {
  worldId: string;
  features: RegionFeature[];
  /** Государства по коду: имя, цвет, метаданные */
  polities: Map<string, PolitySeed>;
  /** Код страны → код государства-владельца (members пресета, развёрнутый) */
  memberOf: Record<string, string>;
  /** Имя и цвет страны, которой нет в каталоге */
  fallbackPolity: (code: string) => PolitySeed;
  capitals: Record<string, CapitalEntry>;
  /** Регионы называть по-русски (если пресет русскоязычный) */
  russianNames: boolean;
  makeId: () => string;
}

export interface RegionWorldRegion {
  id: string;
  worldId: string;
  name: string;
  geojson: string;
  color: string;
  owner: string;
  flag: string;
  objects: any[];
  borders: string[];
}

export interface RegionWorld {
  regions: RegionWorldRegion[];
  polities: PolityRecord[];
  /** Код государства → id региона со столицей (или первого региона) */
  homeRegion: Record<string, string>;
}

/** Точка в многоугольнике (чётность пересечений; дыры учитываются) */
export function pointInGeometry(lng: number, lat: number, geometry: RegionFeature['geometry']): boolean {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polygons) {
    let inside = false;
    for (const ring of poly as number[][][]) {
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

/** Индекс региона с вершиной, ближайшей к точке (в градусах — для выбора столицы достаточно) */
function nearestRegion(lng: number, lat: number, items: (readonly [number, RegionFeature['geometry']])[]): number | undefined {
  let best: number | undefined;
  let bestDist = Infinity;
  for (const [i, geometry] of items) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const poly of polygons) {
      for (const [x, y] of (poly as number[][][])[0]) {
        const d = (x - lng) ** 2 + (y - lat) ** 2;
        if (d < bestDist) { bestDist = d; best = i; }
      }
    }
  }
  return best;
}

export function buildRegionWorld(input: RegionWorldInput): RegionWorld {
  const { worldId, features, memberOf, fallbackPolity, capitals, russianNames, makeId } = input;
  const regionId = (rid: string) => `${worldId}_${rid}`;

  // Государства каталога + страны карты, которых в нём нет
  const polities = new Map<string, PolityRecord>();
  for (const [code, seed] of input.polities) {
    polities.set(code, { id: code, name: seed.name, color: seed.color, flag: code, metadata: seed.metadata ?? null });
  }
  const ownerOf = (iso3: string) => memberOf[iso3] ?? iso3;
  for (const f of features) {
    const owner = ownerOf(f.properties.iso3);
    if (!polities.has(owner)) {
      const seed = fallbackPolity(owner);
      polities.set(owner, { id: owner, name: seed.name, color: seed.color, flag: owner, metadata: seed.metadata ?? null });
    }
  }

  const regions: RegionWorldRegion[] = features.map(f => {
    const owner = ownerOf(f.properties.iso3);
    const { neighbors, ...props } = f.properties;
    return {
      id: regionId(props.id),
      worldId,
      name: russianNames ? props.nameRu : props.nameEn,
      geojson: JSON.stringify({ type: 'Feature', properties: props, geometry: f.geometry }),
      color: polities.get(owner)!.color,
      owner,
      // Флаг — государства-владельца (для флага на карте и в списках)
      flag: owner,
      objects: [],
      borders: neighbors.map(regionId),
    };
  });

  // Столицы: точка из capitals.json → регион государства, внутри которого она лежит.
  // У составного государства без своей записи (YUG) — столица первой страны-члена.
  const membersOf = new Map<string, string[]>();
  for (const [member, owner] of Object.entries(memberOf)) {
    membersOf.set(owner, [...(membersOf.get(owner) ?? []), member]);
  }
  const homeRegion: Record<string, string> = {};
  const byOwner = new Map<string, number[]>();
  regions.forEach((r, i) => {
    const list = byOwner.get(r.owner) ?? [];
    list.push(i);
    byOwner.set(r.owner, list);
  });
  for (const [owner, idxs] of byOwner) {
    const cap = capitals[owner] ?? (membersOf.get(owner) ?? []).map(m => capitals[m]).find(Boolean);
    let home = idxs[0];
    if (cap && typeof cap.lat === 'number' && typeof cap.lng === 'number') {
      // Точка столицы на упрощённом берегу может не попасть ни в один регион —
      // тогда берём регион с ближайшей к ней вершиной
      const hit = idxs.find(i => pointInGeometry(cap.lng, cap.lat, features[i].geometry))
        ?? nearestRegion(cap.lng, cap.lat, idxs.map(i => [i, features[i].geometry] as const));
      if (hit !== undefined) home = hit;
      regions[home].objects.push({ id: makeId(), type: 'capital', name: cap.capital, lat: cap.lat, lng: cap.lng });
    }
    homeRegion[owner] = regions[home].id;
  }

  // Государства без единого региона (нет геометрии) в реестр не попадают
  const owned = new Set(regions.map(r => r.owner));
  return { regions, polities: [...polities.values()].filter(p => owned.has(p.id)), homeRegion };
}
