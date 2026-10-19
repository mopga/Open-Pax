/**
 * Open-Pax — Worlds Routes
 * ========================
 */

import { Router } from 'express';
import { shortId } from '../utils/short-id';
import fs from 'fs';
import path from 'path';
import { worldRepository, relationshipRepository } from '../repositories';
import { svgPathToGeoJSON } from '../utils/svg-to-geojson';
import { BalanceAgent } from '../agents/balance-agent';
import { getLLMRouter } from '../llm';
import { loadPreset, loadPresetMap } from '../utils/preset-loader';
import { computeBorders } from '../utils/borders';
import { colorFromCode, resolveRegionColor } from '../utils/color';
import { buildRegionWorld, type RegionFeature } from '../utils/region-world';
import type { PolityRecord } from '../repositories/world.repository';

export const worldsRouter = Router();

// Этап 4: столицы стран для маркеров на карте.
// Контракт файла (отдаёт параллельный пайплайн Natural Earth):
//   { "USA": { capital: "Washington", lat: 38.9, lng: -77.0 }, ... }
// Читаем лениво и кэшируем; если файла нет или он битый — регионы просто
// остаются без столиц, генерация мира не падает.
interface CapitalEntry { capital: string; lat: number; lng: number }
let capitalsCache: Record<string, CapitalEntry> | null = null;
/** Реестр стран data/countries.json (английские имена и цвета) */
let countryRegistryCache: Record<string, { name: string; color: string }> | null = null;
function getCountryRegistry(): Record<string, { name: string; color: string }> {
  if (countryRegistryCache) return countryRegistryCache;
  try {
    const list = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'countries.json'), 'utf-8'));
    countryRegistryCache = Object.fromEntries((list as any[]).map(c => [c.code, { name: c.name, color: c.color }]));
  } catch {
    countryRegistryCache = {};
  }
  return countryRegistryCache!;
}

/**
 * Соседство стран стандартной карты Natural Earth. Геометрия статична, а
 * полный расчёт (turf, 243 страны) занимает ~10 с — считаем один раз и
 * кэшируем в data/geojson/country-borders.json.
 */
let standardBordersCache: Record<string, string[]> | null = null;
function getStandardBorders(geojsonFeatures: Record<string, any>): Record<string, string[]> {
  if (standardBordersCache) return standardBordersCache;
  const cachePath = path.join(process.cwd(), 'data', 'geojson', 'country-borders.json');
  try {
    if (fs.existsSync(cachePath)) {
      standardBordersCache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      return standardBordersCache!;
    }
  } catch { /* битый кэш — пересчитаем */ }
  standardBordersCache = computeBorders(
    Object.fromEntries(Object.entries(geojsonFeatures).map(([code, f]) => [code, f.geometry ?? f])),
  );
  try {
    fs.writeFileSync(cachePath, JSON.stringify(standardBordersCache));
  } catch (e) {
    console.warn('[Generate World] не удалось записать кэш соседства:', e);
  }
  return standardBordersCache;
}

/**
 * Регионы мельче стран (scripts/build-regions.mjs). Нет файла — мир
 * строится по-старому, одна страна = один регион.
 */
let regionFeaturesCache: RegionFeature[] | null | undefined;
function getRegionFeatures(): RegionFeature[] | null {
  if (regionFeaturesCache !== undefined) return regionFeaturesCache;
  const file = path.join(process.cwd(), 'data', 'geojson', 'regions.geojson');
  try {
    regionFeaturesCache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')).features : null;
  } catch (e) {
    console.warn('[Generate World] regions.geojson не прочитан — карта по странам:', e);
    regionFeaturesCache = null;
  }
  return regionFeaturesCache ?? null;
}

function capitalObjectsFor(code: string): any[] {
  const cap = getCapitals()[code];
  return (cap && typeof cap.lat === 'number' && typeof cap.lng === 'number')
    ? [{ id: shortId(), type: 'capital', name: cap.capital, lat: cap.lat, lng: cap.lng }]
    : [];
}

function getCapitals(): Record<string, CapitalEntry> {
  if (capitalsCache) return capitalsCache;
  try {
    const capitalsPath = path.join(process.cwd(), 'data', 'geojson', 'capitals.json');
    capitalsCache = fs.existsSync(capitalsPath)
      ? JSON.parse(fs.readFileSync(capitalsPath, 'utf-8'))
      : {};
  } catch (e) {
    console.warn('[Generate World] capitals.json не прочитан — регионы без столиц:', e);
    capitalsCache = {};
  }
  return capitalsCache!;
}

// Generate world state from template (using Balance Agent)
worldsRouter.post('/generate', async (req, res) => {
  const { templateId, playerCountryCode } = req.body;

  if (!templateId || !playerCountryCode) {
    res.status(400).json({ error: 'templateId and playerCountryCode are required' });
    return;
  }

  // Этап 5: пресет-пакет (data/presets/<id>/) или легаси-шаблон
  // (data/templates/<id>.json). loadPreset валидирует id через PRESET_ID_RE,
  // поэтому path traversal исключён без resolveInside.
  const preset = loadPreset(templateId);
  if (!preset) {
    res.status(404).json({ error: `Preset not found: ${templateId}` });
    return;
  }

  try {
    // Геометрия регионов: кастомная карта пакета (map.geojson) или
    // стандартная Natural Earth (data/geojson/countries.geojson)
    let geojsonFeatures: Record<string, any> = {};
    if (preset.has_custom_map) {
      const customMap = loadPresetMap(templateId);
      for (const feature of customMap?.features || []) {
        const code = feature.properties?.code;
        if (code) {
          geojsonFeatures[code] = feature;
        }
      }
    } else {
      const geojsonPath = path.join(process.cwd(), 'data', 'geojson', 'countries.geojson');
      if (fs.existsSync(geojsonPath)) {
        const geojsonData = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8'));
        for (const feature of geojsonData.features || []) {
          const code = feature.properties?.code;
          if (code) {
            geojsonFeatures[code] = feature;
          }
        }
      }
    }

    const balanceAgent = new BalanceAgent(getLLMRouter());
    // Кастомные страны пакета (имена/цвета) перекрывают реестр data/countries.json
    const worldState = await balanceAgent.generateInitialWorldState(preset, preset.countries);

    // Цвета карты: приоритет у кураторской палитры пресета (country_colors);
    // для кодов вне палитры — прежний цвет (реестр/countries[]) + анти-тёмный
    // post-process (карта фронта тёмная, #0a0a0f: чёрные регионы невидимы).
    for (const [code, state] of worldState.countries) {
      state.color = resolveRegionColor(code, state.color, preset.country_colors);
    }

    const countriesObj: Record<string, any> = {};
    const regionsObj: Record<string, any> = {};

    for (const [code, state] of worldState.countries) {
      countriesObj[code] = state;

      const geojson = geojsonFeatures[code];
      if (geojson) {
        // Этап 4: столица страны как map feature (формат согласован с фронтом:
        // { id, type, name, lat, lng }). Нет записи в capitals.json — без столицы.
        const capitalObjects = capitalObjectsFor(code);
        regionsObj[code] = {
          id: code,
          name: state.name,
          color: state.color || '#888888',
          geojson: JSON.stringify(geojson),
          // Unified polity-id convention: owner IS the polity id (country code).
          // Player's polity is identified via players.polity_id, not by a 'player' marker.
          owner: code,
          population: state.population || 0,
          gdp: state.gdp || 0,
          militaryPower: state.military || 0,
          objects: capitalObjects,
          borders: [],
          status: 'active',
          flag: code,
          metadata: {
            ideology: state.ideology,
            allies: state.allies,
            enemies: state.enemies,
            status: state.status,
          },
        };
      }
    }

    // Весь мир под владельцами: страны Natural Earth вне пресета становятся
    // самостоятельными политиями без LLM-генерации (иначе на карте пустая
    // суша). Язык имён — как у стран пресета, чтобы на карте не было смеси.
    if (!preset.has_custom_map) {
      const presetUsesCyrillic = Object.values(regionsObj).some(r => /[А-Яа-яЁё]/.test(r.name));
      const registry = getCountryRegistry();
      for (const [code, feature] of Object.entries(geojsonFeatures)) {
        if (regionsObj[code]) continue;
        const props = feature.properties || {};
        const name = presetUsesCyrillic
          ? (props.name || props.nameEn || code)
          : (registry[code]?.name || props.nameEn || props.name || code);
        regionsObj[code] = {
          id: code,
          name,
          color: resolveRegionColor(code, registry[code]?.color || colorFromCode(code), preset.country_colors),
          geojson: JSON.stringify(feature),
          owner: code,
          population: 0,
          gdp: 0,
          militaryPower: 0,
          objects: capitalObjectsFor(code),
          borders: [],
          status: 'active',
          flag: code,
          // Фоновая страна: не входит в пресет, статы не генерировались
          metadata: { background: true },
        };
      }
    }

    const worldId = shortId();
    const worldData = {
      id: worldId,
      name: `${preset.name} - ${new Date().toLocaleDateString()}`,
      description: preset.description || preset.base_prompt?.substring(0, 200) || '',
      startDate: worldState.date,
      // Лор пакета (lore.md) дополняет базовый промпт мира
      basePrompt: preset.base_prompt + (preset.lore ? '\n\n' + preset.lore : ''),
      historicalAccuracy: preset.historical_accuracy ?? 0.8,
      // Этап 5: кастомные правила симуляции пресета (rules.md) едут с миром
      simulationRules: preset.simulation_rules ?? null,
      // Переопределённые промпты ИИ пресета (секция "prompts") едут с миром
      prompts: preset.prompts ? JSON.stringify(preset.prompts) : null,
    };

    const regionFeatures = preset.has_custom_map ? null : getRegionFeatures();
    let regionsArray: any[];
    let polities: PolityRecord[] = [];
    let regionIds: Record<string, string>;

    if (regionFeatures) {
      // Регионы мельче стран: государство владеет многими регионами
      const memberOf: Record<string, string> = {};
      for (const [polity, members] of Object.entries(preset.polity_members ?? {})) {
        for (const m of members) memberOf[m] = polity;
      }
      const presetPolities = new Map([...worldState.countries].map(([code, st]) => [code, {
        name: st.name,
        color: st.color || colorFromCode(code),
        metadata: { ideology: st.ideology, allies: st.allies, enemies: st.enemies, status: st.status },
      }]));
      const russianNames = [...presetPolities.values()].some(p => /[А-Яа-яЁё]/.test(p.name));
      const registry = getCountryRegistry();
      const built = buildRegionWorld({
        worldId,
        features: regionFeatures,
        presetPolities,
        memberOf,
        fallbackPolity: code => {
          const props = geojsonFeatures[code]?.properties || {};
          return {
            name: russianNames ? (props.name || props.nameEn || code) : (registry[code]?.name || props.nameEn || props.name || code),
            color: resolveRegionColor(code, registry[code]?.color || colorFromCode(code), preset.country_colors),
            metadata: { background: true },
          };
        },
        capitals: getCapitals(),
        russianNames,
        makeId: shortId,
      });
      regionsArray = built.regions;
      polities = built.polities;
      // Игрок стартует в регионе со столицей своего государства
      regionIds = built.homeRegion;
    } else {
    // Convert regionsObj to array and use createWithRegions (which wraps in transaction)
    // Prefix region IDs with worldId to ensure global uniqueness (since id is PRIMARY KEY)
    // Borders are computed from actual geometry (turf) once, here — the NPC
    // expansion logic depends on them to only spread into adjacent regions.
    const templateCodes = Object.keys(regionsObj);
    const bordersMap = preset.has_custom_map
      ? computeBorders(
        Object.fromEntries(
          templateCodes
            .filter(code => geojsonFeatures[code])
            .map(code => [code, geojsonFeatures[code].geometry ?? geojsonFeatures[code]])
        )
      )
      : getStandardBorders(geojsonFeatures);

    regionsArray = Object.entries(regionsObj).map(([code, region]) => ({
      id: `${worldId}_${code}`,
      worldId,
      name: region.name,
      geojson: region.geojson,
      color: region.color,
      owner: region.owner,
      population: region.population,
      gdp: region.gdp,
      militaryPower: region.militaryPower,
      flag: region.flag,
      // Этап 4: маркеры на карте (столица), иначе addRegion их не увидит
      objects: region.objects ?? [],
      // GameSession keys regions by full id — store borders in the same id space
      borders: (bordersMap[code] ?? []).map(c => `${worldId}_${c}`),
    }));
    regionIds = Object.fromEntries(Object.keys(regionsObj).map(code => [code, `${worldId}_${code}`]));
    }

    worldRepository.createWithRegions(worldData, regionsArray, polities);

    // Persist diplomatic relationships from Balance Agent allies/enemies
    const relEntries: { from: string; to: string; type: 'ally' | 'hostile' }[] = [];
    for (const [code, state] of worldState.countries) {
      for (const allyCode of state.allies || []) {
        relEntries.push({ from: code, to: allyCode, type: 'ally' });
      }
      for (const enemyCode of state.enemies || []) {
        relEntries.push({ from: code, to: enemyCode, type: 'hostile' });
      }
    }
    if (relEntries.length > 0) {
      relationshipRepository.initForWorld(worldId, relEntries);
    }

    res.json({
      templateId,
      worldId,
      date: worldState.date,
      countries: countriesObj,
      regionIds,
      playerCountryCode,
    });
  } catch (e: any) {
    console.error('[Generate World] Error:', e);
    res.status(500).json({ error: 'Failed to generate world: ' + e.message });
  }
});

worldsRouter.post('/', (req, res) => {
  const { name, description, startDate, basePrompt, historicalAccuracy = 0.8 } = req.body;

  const world = {
    id: shortId(),
    name,
    description,
    startDate: startDate || '1951-01-01',
    basePrompt: basePrompt || 'Альтернативная история',
    historicalAccuracy,
  };

  worldRepository.create(world);
  res.json({ id: world.id, name: world.name });
});

worldsRouter.get('/:id', (req, res) => {
  const world = worldRepository.findById(req.params.id);
  if (!world) {
    res.status(404).json({ error: 'World not found' });
    return;
  }
  res.json({
    id: world.id,
    name: world.name,
    description: world.description,
    startDate: world.start_date,
    basePrompt: world.base_prompt,
    historicalAccuracy: world.historical_accuracy,
    createdAt: world.created_at,
    updatedAt: world.updated_at,
    regions: world.regions.reduce((acc: any, r: any) => { acc[r.id] = r; return acc; }, {}),
  });
});

worldsRouter.patch('/:id/prompt', (req, res) => {
  const world = worldRepository.findById(req.params.id);
  if (!world) {
    res.status(404).json({ error: 'World not found' });
    return;
  }

  const { basePrompt } = req.body;
  if (typeof basePrompt !== 'string') {
    res.status(400).json({ error: 'basePrompt must be a string' });
    return;
  }

  worldRepository.update(req.params.id, { basePrompt });
  getLLMRouter().clearCache(); // Invalidate cached narrations when world prompt changes
  res.json({ success: true, basePrompt });
});

worldsRouter.post('/:id/regions', (req, res) => {
  const world = worldRepository.findById(req.params.id);
  if (!world) {
    res.status(404).json({ error: 'World not found' });
    return;
  }

  const { id, name, svgPath, color = '#888888' } = req.body;

  worldRepository.addRegion({
    id,
    worldId: req.params.id,
    name,
    svgPath,
    color,
  });
  res.json({ id, name });
});

worldsRouter.post('/from-map', (req, res) => {
  const { mapId, name, description, startDate, basePrompt, historicalAccuracy, initialOwners } = req.body;
  console.log('[DEBUG] from-map request, mapId:', mapId, 'name:', name);

  const mapRepository = require('../repositories').mapRepository;
  const map = mapRepository.findById(mapId);
  if (!map) {
    console.log('[DEBUG] Map not found in DB, checking all maps...');
    const allMaps = mapRepository.findAll?.() || [];
    console.log('[DEBUG] Available maps:', allMaps);
    res.status(404).json({ error: 'Map not found', mapId });
    return;
  }
  console.log('[DEBUG] Map found:', map.name);

  const worldId = shortId();

  const ownerMap = new Map<string, string>();
  if (initialOwners && Array.isArray(initialOwners)) {
    for (const owner of initialOwners) {
      ownerMap.set(owner.id, owner.owner);
    }
  }

  const regions = map.regions.map((r: any, index: number) => {
    const owner = ownerMap.get(r.id) || 'neutral';
    const regionId = `${worldId}_r${index}_${shortId()}`;

    let militaryPower = 100;
    let population = 1000000;
    let gdp = 100;

    if (owner === 'player') {
      militaryPower = 150;
      population = 1500000;
      gdp = 150;
    } else if (owner.startsWith('ai-')) {
      militaryPower = 80 + Math.floor(Math.random() * 80);
      population = 800000 + Math.floor(Math.random() * 400000);
      gdp = 80 + Math.floor(Math.random() * 80);
    }

    const geojson = svgPathToGeoJSON(r.path, { width: map.width || 2000, height: map.height || 1500 });

    return {
      id: regionId,
      name: r.name,
      svgPath: r.path,
      geojson: geojson ? JSON.stringify(geojson) : undefined,
      color: r.color,
      owner,
      population,
      gdp,
      militaryPower,
      // Кодов стран на кастомной карте нет — столицы не сидируем, объекты пустые
      objects: [],
    };
  });

  // Borders from converted SVG geometry — same NPC-expansion dependency as in /generate
  const bordersById = computeBorders(
    Object.fromEntries(
      regions
        .filter((r: any) => r.geojson)
        .map((r: any) => {
          try {
            const gj = JSON.parse(r.geojson);
            return [r.id, gj.geometry ?? gj];
          } catch {
            return null;
          }
        })
        .filter((entry: [string, any] | null): entry is [string, any] => entry !== null)
    )
  );
  for (const r of regions) {
    (r as any).borders = bordersById[r.id] ?? [];
  }

  worldRepository.createWithRegions({
    id: worldId,
    name: name || map.name,
    description: description || '',
    startDate: startDate || '1951-01-01',
    basePrompt: basePrompt || 'Альтернативная история',
    historicalAccuracy: historicalAccuracy ?? 0.8,
  }, regions);

  res.json({
    world_id: worldId,
    name: name || map.name,
    regions_count: regions.length,
    regions: regions.map((r: any) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      owner: r.owner,
    })),
  });
});
