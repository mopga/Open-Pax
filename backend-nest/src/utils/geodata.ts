/**
 * Open-Pax — справочники карты
 * ============================
 * Статичные файлы data/ читаются один раз и кэшируются:
 *   geojson/regions.geojson   — регионы мельче стран (scripts/build-regions.mjs)
 *   geojson/countries.geojson — страны Natural Earth: русское (name) и английское (nameEn) имя
 *   geojson/capitals.json     — { "USA": { capital, lat, lng } }
 *   countries.json            — английские имена и цвета стран
 */

import fs from 'fs';
import path from 'path';
import type { RegionFeature, CapitalEntry } from './region-world';

const dataPath = (...parts: string[]) => path.join(process.cwd(), 'data', ...parts);

function readJson<T>(file: string, fallback: T, what: string): T {
  try {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : fallback;
  } catch (e) {
    console.warn(`[Geodata] ${what} не прочитан:`, e);
    return fallback;
  }
}

export interface CountryInfo {
  /** Русское имя (Natural Earth NAME_RU) */
  nameRu?: string;
  /** Английское имя */
  nameEn?: string;
  /** Цвет из countries.json */
  color?: string;
}

let regionFeatures: RegionFeature[] | null | undefined;
/** Регионы мира; null — файла нет */
export function getRegionFeatures(): RegionFeature[] | null {
  if (regionFeatures === undefined) {
    regionFeatures = readJson<{ features: RegionFeature[] } | null>(dataPath('geojson', 'regions.geojson'), null, 'regions.geojson')?.features ?? null;
  }
  return regionFeatures;
}

let capitals: Record<string, CapitalEntry> | undefined;
export function getCapitals(): Record<string, CapitalEntry> {
  if (!capitals) capitals = readJson(dataPath('geojson', 'capitals.json'), {}, 'capitals.json');
  return capitals!;
}

let countryInfo: Record<string, CountryInfo> | undefined;
/** Имена и цвета стран по коду ISO_A3 */
export function getCountryInfo(): Record<string, CountryInfo> {
  if (countryInfo) return countryInfo;
  const info: Record<string, CountryInfo> = {};
  const geo = readJson<{ features: any[] }>(dataPath('geojson', 'countries.geojson'), { features: [] }, 'countries.geojson');
  for (const f of geo.features) {
    const code = f.properties?.code;
    if (code) info[code] = { nameRu: f.properties.name, nameEn: f.properties.nameEn };
  }
  const registry = readJson<any[]>(dataPath('countries.json'), [], 'countries.json');
  for (const c of registry) {
    if (!c?.code) continue;
    info[c.code] = { ...info[c.code], nameEn: c.name || info[c.code]?.nameEn, color: c.color };
  }
  countryInfo = info;
  return info;
}
