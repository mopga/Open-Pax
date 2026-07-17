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
import { resolveInside, safeReadJson } from '../utils/safe-path';
import { computeBorders } from '../utils/borders';

export const worldsRouter = Router();

// Generate world state from template (using Balance Agent)
worldsRouter.post('/generate', async (req, res) => {
  const { templateId, playerCountryCode } = req.body;

  if (!templateId || !playerCountryCode) {
    res.status(400).json({ error: 'templateId and playerCountryCode are required' });
    return;
  }

  // Confine the user-supplied templateId to data/templates; reject any
  // path traversal attempt before touching the filesystem.
  const resolved = resolveInside('data/templates', templateId, '.json');
  if (!resolved.ok || !resolved.path) {
    res.status(resolved.statusCode ?? 400).json({ error: resolved.error });
    return;
  }
  const template = safeReadJson<any>(resolved.path);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  try {
    const geojsonPath = path.join(process.cwd(), 'data', 'geojson', 'countries.geojson');
    let geojsonFeatures: Record<string, any> = {};
    if (fs.existsSync(geojsonPath)) {
      const geojsonData = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8'));
      for (const feature of geojsonData.features || []) {
        const code = feature.properties?.code;
        if (code) {
          geojsonFeatures[code] = feature;
        }
      }
    }

    const balanceAgent = new BalanceAgent(getLLMRouter());
    const worldState = await balanceAgent.generateInitialWorldState(template);

    const countriesObj: Record<string, any> = {};
    const regionsObj: Record<string, any> = {};

    for (const [code, state] of worldState.countries) {
      countriesObj[code] = state;

      const geojson = geojsonFeatures[code];
      if (geojson) {
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
          objects: [],
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

    const worldId = shortId();
    const worldData = {
      id: worldId,
      name: `${template.name} - ${new Date().toLocaleDateString()}`,
      description: template.description || template.base_prompt?.substring(0, 200) || '',
      startDate: worldState.date,
      basePrompt: template.base_prompt,
      historicalAccuracy: 0.8,
    };

    // Convert regionsObj to array and use createWithRegions (which wraps in transaction)
    // Prefix region IDs with worldId to ensure global uniqueness (since id is PRIMARY KEY)
    // Borders are computed from actual geometry (turf) once, here — the NPC
    // expansion logic depends on them to only spread into adjacent regions.
    const templateCodes = Object.keys(regionsObj);
    const bordersMap = computeBorders(
      Object.fromEntries(
        templateCodes
          .filter(code => geojsonFeatures[code])
          .map(code => [code, geojsonFeatures[code].geometry ?? geojsonFeatures[code]])
      )
    );

    const regionsArray = Object.entries(regionsObj).map(([code, region]) => ({
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
      // GameSession keys regions by full id — store borders in the same id space
      borders: (bordersMap[code] ?? []).map(c => `${worldId}_${c}`),
    }));

    worldRepository.createWithRegions(worldData, regionsArray);

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
      regions: regionsObj,
      regionIds: Object.fromEntries(
        Object.keys(regionsObj).map(code => [code, `${worldId}_${code}`])
      ),
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
