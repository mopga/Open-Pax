/**
 * Open-Pax — мир из пресета без вызовов ИИ
 * =======================================
 * Пресет — готовые данные (как у PaxHistoria): мир собирается из регионов
 * карты и государств пресета за доли секунды. Модель вызывается только в
 * ходе игры.
 */

import type { PresetPackage } from './preset-loader';
import type { CountryInfo } from './geodata';
import type { PolityRecord } from '../repositories/world.repository';
import { buildRegionWorld, type RegionFeature, type CapitalEntry } from './region-world';
import { computeBorders } from './borders';
import { colorFromCode, resolveRegionColor } from './color';

/** Государство, за которое можно играть */
export interface PolityCatalogEntry {
  code: string;
  name: string;
  color: string;
  /** Рекомендовано пресетом (показывается первым) */
  recommended: boolean;
  /** Страны карты, входящие в государство, кроме его собственного кода */
  members: string[];
  description?: string;
}

/** Код страны → код государства, в которое она входит */
export function memberMap(preset: PresetPackage): Record<string, string> {
  const memberOf: Record<string, string> = {};
  for (const [code, p] of Object.entries(preset.polities)) {
    for (const m of p.members ?? []) if (m !== code) memberOf[m] = code;
  }
  return memberOf;
}

/**
 * Все государства мира пресета: государства пресета плюс каждая страна карты,
 * не вошедшая в другое государство. Рекомендуемые — первыми, в порядке пресета,
 * остальные по имени.
 */
export function buildPolityCatalog(
  preset: PresetPackage,
  mapCodes: Iterable<string>,
  countries: Record<string, CountryInfo>,
): PolityCatalogEntry[] {
  const memberOf = memberMap(preset);
  const present = new Set<string>();
  for (const code of mapCodes) present.add(memberOf[code] ?? code);

  const curated = Object.fromEntries(
    Object.entries(preset.polities).filter(([, p]) => p.color).map(([code, p]) => [code, p.color!]),
  );
  const defaultName = (code: string) => {
    const c = countries[code];
    return (preset.language === 'ru' ? c?.nameRu || c?.nameEn : c?.nameEn || c?.nameRu) || code;
  };
  const recommendedOrder = new Map(preset.recommended.map((code, i) => [code, i]));

  const entries: PolityCatalogEntry[] = [...present].map(code => {
    const p = preset.polities[code];
    return {
      code,
      name: p?.name || defaultName(code),
      color: resolveRegionColor(code, countries[code]?.color || colorFromCode(code), curated),
      recommended: recommendedOrder.has(code),
      members: (p?.members ?? []).filter(m => m !== code),
      ...(p?.description ? { description: p.description } : {}),
    };
  });
  const locale = preset.language === 'ru' ? 'ru' : 'en';
  return entries.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    if (a.recommended) return recommendedOrder.get(a.code)! - recommendedOrder.get(b.code)!;
    return a.name.localeCompare(b.name, locale);
  });
}

export interface PresetGeo {
  /** Регионы Natural Earth (regions.geojson) */
  regionFeatures: RegionFeature[] | null;
  /** Своя карта пресета (map.geojson), если есть — вместо регионов */
  customMap: { features: any[] } | null;
  countries: Record<string, CountryInfo>;
  capitals: Record<string, CapitalEntry>;
}

export interface PresetWorld {
  world: {
    id: string;
    name: string;
    description: string;
    startDate: string;
    basePrompt: string;
    historicalAccuracy: number;
    simulationRules: string | null;
    prompts: string | null;
  };
  regions: any[];
  polities: PolityRecord[];
  /** Код государства → id региона со столицей (или первого региона) */
  homeRegion: Record<string, string>;
  catalog: PolityCatalogEntry[];
}

/** Коды стран, которые есть на карте пресета */
export function presetMapCodes(geo: PresetGeo): string[] {
  if (geo.customMap) return geo.customMap.features.map(f => f.properties?.code).filter(Boolean);
  return [...new Set((geo.regionFeatures ?? []).map(f => f.properties.iso3))];
}

export function buildPresetWorld(preset: PresetPackage, worldId: string, geo: PresetGeo, makeId: () => string): PresetWorld {
  const catalog = buildPolityCatalog(preset, presetMapCodes(geo), geo.countries);
  const memberOf = memberMap(preset);
  const seeds = new Map(catalog.map(p => [p.code, {
    name: p.name,
    color: p.color,
    ...(p.description ? { metadata: { description: p.description } } : {}),
  }]));

  const world = {
    id: worldId,
    name: `${preset.name} - ${new Date().toLocaleDateString()}`,
    description: preset.description || preset.base_prompt.substring(0, 200),
    startDate: preset.start_date,
    // Лор пакета (lore.md) дополняет базовый промпт мира
    basePrompt: preset.base_prompt + (preset.lore ? '\n\n' + preset.lore : ''),
    historicalAccuracy: preset.historical_accuracy ?? 0.8,
    simulationRules: preset.simulation_rules ?? null,
    prompts: preset.prompts ? JSON.stringify(preset.prompts) : null,
  };

  if (!geo.customMap) {
    const built = buildRegionWorld({
      worldId,
      features: geo.regionFeatures ?? [],
      polities: seeds,
      memberOf,
      fallbackPolity: code => ({ name: code, color: resolveRegionColor(code, colorFromCode(code)) }),
      capitals: geo.capitals,
      russianNames: preset.language === 'ru',
      makeId,
    });
    return { world, ...built, catalog };
  }

  // Своя карта: одна фича = один регион с кодом страны
  const features = geo.customMap.features.filter(f => f.properties?.code);
  const borders = computeBorders(Object.fromEntries(features.map(f => [f.properties.code, f.geometry ?? f])));
  const regionId = (code: string) => `${worldId}_${code}`;
  const homeRegion: Record<string, string> = {};
  const regions = features.map(f => {
    const code: string = f.properties.code;
    const owner = memberOf[code] ?? code;
    const seed = seeds.get(owner)!;
    const cap = geo.capitals[code];
    homeRegion[owner] ??= regionId(code);
    if (owner === code) homeRegion[owner] = regionId(code);
    return {
      id: regionId(code),
      worldId,
      name: f.properties.name || seeds.get(code)?.name || code,
      geojson: JSON.stringify(f),
      color: seed.color,
      owner,
      flag: owner,
      objects: cap && typeof cap.lat === 'number' && typeof cap.lng === 'number'
        ? [{ id: makeId(), type: 'capital', name: cap.capital, lat: cap.lat, lng: cap.lng }]
        : [],
      borders: (borders[code] ?? []).map(regionId),
    };
  });
  const polities: PolityRecord[] = catalog.map(p => ({
    id: p.code, name: p.name, color: p.color, flag: p.code,
    metadata: p.description ? { description: p.description } : null,
  }));
  return { world, regions, polities, homeRegion, catalog };
}
