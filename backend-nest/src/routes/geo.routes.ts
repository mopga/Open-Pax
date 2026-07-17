/**
 * Open-Pax — Geo Routes
 * =====================
 * Отдаёт статичные геоданные Natural Earth (Этап 4):
 *   GET /api/geo/countries     — FeatureCollection стран (properties: code, name, nameEn)
 *   GET /api/geo/capitals      — координаты столиц по кодам стран
 *   GET /api/geo/country-codes — массив всех кодов стран
 * Файлы читаются и кэшируются в памяти при старте сервера.
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';

export const geoRouter = Router();

// Кэш в памяти: сырой текст (для отдачи без повторной сериализации) и распарсенные данные
let countriesRaw: string | null = null;
let countriesParsed: { features: Array<{ properties?: { code?: string } }> } | null = null;
let capitalsRaw: string | null = null;
let countryCodes: string[] = [];

function loadGeoData(): void {
  try {
    const geoDir = path.join(process.cwd(), 'data', 'geojson');
    countriesRaw = fs.readFileSync(path.join(geoDir, 'countries.geojson'), 'utf-8');
    countriesParsed = JSON.parse(countriesRaw);
    countryCodes = (countriesParsed?.features ?? [])
      .map((f) => f.properties?.code)
      .filter((c): c is string => typeof c === 'string');
    capitalsRaw = fs.readFileSync(path.join(geoDir, 'capitals.json'), 'utf-8');
    console.log(`[Geo] Загружено стран: ${countryCodes.length}, столиц закэшировано`);
  } catch (e) {
    console.error('[Geo] Не удалось загрузить геоданные:', e);
    countriesRaw = null;
    countriesParsed = null;
    capitalsRaw = null;
    countryCodes = [];
  }
}

// Кэшируем при старте
loadGeoData();

// GET /api/geo/countries — полный FeatureCollection стран
geoRouter.get('/countries', (_req, res) => {
  if (!countriesRaw) {
    res.status(500).json({ error: 'Геоданные стран не загружены' });
    return;
  }
  res.type('application/json').send(countriesRaw);
});

// GET /api/geo/capitals — карта код -> { capital, lat, lng }
geoRouter.get('/capitals', (_req, res) => {
  if (!capitalsRaw) {
    res.status(500).json({ error: 'Данные столиц не загружены' });
    return;
  }
  res.type('application/json').send(capitalsRaw);
});

// GET /api/geo/country-codes — массив кодов стран
geoRouter.get('/country-codes', (_req, res) => {
  if (!countriesParsed) {
    res.status(500).json({ error: 'Геоданные стран не загружены' });
    return;
  }
  res.json(countryCodes);
});
