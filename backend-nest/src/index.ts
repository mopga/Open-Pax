/**
 * Open-Pax — API Server
 * =====================
 */

import express from 'express';
import cors from 'cors';
import { v4 as uuid } from 'uuid';
import { MiniMaxProvider } from './llm';
import { GameController } from './agents';
import { initDatabase } from './database';
import { mapRepository, worldRepository, gameRepository } from './repositories';
import type {
  Game, GameWorld, MapRegion, MapObject, Player, Action, TurnResult,
  CreateWorldRequest, CreateGameRequest, SubmitActionRequest, MapData
} from './models';

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Global request logging
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// Initialize Database
initDatabase();

// Initialize LLM
const llmProvider = new MiniMaxProvider();
const gameController = new GameController(llmProvider);

// In-memory cache for active games (for fast gameplay)
const activeGames: Map<string, any> = new Map();

// Helper: convert points to SVG path
const pointsToPath = (points: { x: number; y: number }[]): string => {
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
};

// ============================================================================
// Health
// ============================================================================

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================================
// Map Endpoints
// ============================================================================

app.post('/api/maps', (req, res) => {
  const { name, width = 800, height = 600, regions, objects } = req.body;

  const map = {
    id: uuid().slice(0, 8),
    name,
    width,
    height,
    regions: regions.map((r: any) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      path: r.path || pointsToPath(r.points || []),
    })),
    objects: objects || [],
  };

  mapRepository.create(map);
  res.json({ id: map.id, name: map.name });
});

app.get('/api/maps', (_req, res) => {
  const list = mapRepository.findAll().map(m => ({
    id: m.id,
    name: m.name,
    regions_count: m.regions_count,
    created_at: m.created_at,
  }));
  res.json(list);
});

app.get('/api/maps/:id', (req, res) => {
  const map = mapRepository.findById(req.params.id);
  if (!map) {
    res.status(404).json({ error: 'Map not found' });
    return;
  }
  res.json(map);
});

app.delete('/api/maps/:id', (req, res) => {
  const map = mapRepository.findById(req.params.id);
  if (!map) {
    res.status(404).json({ error: 'Map not found' });
    return;
  }
  mapRepository.delete(req.params.id);
  res.json({ status: 'deleted', id: req.params.id });
});

// ============================================================================
// World Endpoints
// ============================================================================

app.post('/api/worlds', (req, res) => {
  const { name, description, startDate, basePrompt, historicalAccuracy = 0.8 } = req.body;

  const world = {
    id: uuid().slice(0, 8),
    name,
    description,
    startDate: startDate || '1951-01-01',
    basePrompt: basePrompt || 'Альтернативная история',
    historicalAccuracy,
  };

  worldRepository.create(world);
  res.json({ id: world.id, name: world.name });
});

app.get('/api/worlds/:id', (req, res) => {
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

app.post('/api/worlds/:id/regions', (req, res) => {
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

// ============================================================================
// Game Endpoints (create from map)
// ============================================================================

app.post('/api/worlds/from-map', (req, res) => {
  const { mapId, name, description, startDate, basePrompt, historicalAccuracy, initialOwners } = req.body;
  console.log('[DEBUG] from-map request, mapId:', mapId, 'name:', name);

  const map = mapRepository.findById(mapId);
  if (!map) {
    console.log('[DEBUG] Map not found in DB, checking all maps...');
    // Debug: list all maps
    const allMaps = (mapRepository as any).findAll?.() || [];
    console.log('[DEBUG] Available maps:', allMaps);
    res.status(404).json({ error: 'Map not found', mapId });
    return;
  }
  console.log('[DEBUG] Map found:', map.name);

  const worldId = uuid().slice(0, 8);

  // Create owner lookup map
  const ownerMap = new Map<string, string>();
  if (initialOwners && Array.isArray(initialOwners)) {
    for (const owner of initialOwners) {
      ownerMap.set(owner.id, owner.owner);
    }
  }

  // Prepare regions from map - generate new unique IDs for world
  const regions = map.regions.map((r: any, index: number) => {
    const owner = ownerMap.get(r.id) || 'neutral';
    const regionId = `${worldId}_r${index}_${uuid().slice(0, 4)}`;

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

    return {
      id: regionId,
      name: r.name,
      svgPath: r.path,
      color: r.color,
      owner,
      population,
      gdp,
      militaryPower,
    };
  });

  // Save world and regions to database
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

// ============================================================================
// Game Endpoints
// ============================================================================

app.post('/api/games', (req, res) => {
  // Support both camelCase and snake_case field names
  const worldId = req.body.worldId || req.body.world_id;
  const playerName = req.body.playerName || req.body.player_name;
  const playerRegionId = req.body.playerRegionId || req.body.player_region_id;

  const world = worldRepository.findById(worldId);
  if (!world) {
    res.status(404).json({ error: 'World not found' });
    return;
  }

  const region = world.regions.find((r: any) => r.id === playerRegionId);
  if (!region) {
    res.status(404).json({ error: 'Region not found' });
    return;
  }

  const playerId = uuid().slice(0, 8);
  const gameId = uuid().slice(0, 8);

  // Save game to database
  gameRepository.create({
    id: gameId,
    worldId,
    currentTurn: 1,
    maxTurns: 100,
    status: 'playing',
  });

  gameRepository.addPlayer({
    id: playerId,
    gameId,
    name: playerName || 'Player',
    regionId: playerRegionId,
    color: '#FF0000',
  });

  // Setup game controller
  gameController.setupWorld(world.base_prompt);
  gameController.addCountry(playerRegionId, region.name);

  // Setup NPC countries
  const regionConfigs = world.regions.map((r: any) => ({
    id: r.id,
    name: r.name,
    owner: r.owner,
  }));
  gameController.setupNPCCountries(regionConfigs);

  // Cache in memory for fast gameplay
  const game = {
    id: gameId,
    world: { ...world, regions: world.regions.reduce((acc: any, r: any) => { acc[r.id] = r; return acc; }, {}) },
    players: [{ id: playerId, name: playerName || 'Player', regionId: playerRegionId, color: '#FF0000' }],
    currentTurn: 1,
    currentDate: world.start_date || '1951-01-01',
    maxTurns: 100,
    actions: [],
    results: [],
    status: 'playing',
  };
  activeGames.set(gameId, game);

  res.json({
    game_id: gameId,
    player_id: playerId,
    region: { id: region.id, name: region.name },
  });
});

app.get('/api/games/:id', (req, res) => {
  const game = gameRepository.findById(req.params.id);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  res.json({
    id: game.id,
    currentTurn: game.current_turn,
    maxTurns: game.max_turns,
    status: game.status,
    world: {
      name: game.world.name,
      regions: game.world.regions.map((r: any) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        owner: r.owner,
        population: r.population,
        militaryPower: r.militaryPower,
      })),
    },
    players: game.players.map((p: any) => ({
      id: p.id,
      regionId: p.regionId,
    })),
  });
});

app.post('/api/games/:id/action', async (req, res) => {
  console.log('[API] POST /api/games/:id/action called');
  // Support both camelCase and snake_case
  const playerId = req.body.playerId || req.body.player_id;
  const text = req.body.text;
  const jump_days = req.body.jump_days || req.body.jumpDays || 30;
  console.log('[API] Request body:', { playerId, text: text?.substring(0, 50), jump_days });
  const gameId = req.params.id;
  const timeJump = jump_days || 30; // Default 30 days

  const game = activeGames.get(gameId);
  console.log('[API] Active games:', Array.from(activeGames.keys()));
  console.log('[API] Looking for gameId:', gameId);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const player = game.players.find((p: any) => p.id === playerId);
  if (!player) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }

  const region = typeof game.world.regions.get === 'function'
    ? game.world.regions.get(player.regionId)
    : game.world.regions[player.regionId];
  if (!region) {
    res.status(404).json({ error: 'Region not found' });
    return;
  }

  const gameContext = {
    turn: game.currentTurn,
    state: {
      region: {
        name: region.name,
        population: region.population,
        gdp: region.gdp,
        militaryPower: region.militaryPower,
      },
      world: {
        regionsCount: game.world.regions.size,
      },
    },
  };

  // Используем новую систему промптов (time-rewind.md)
  console.log('[API] Using new prompt system...');
  const promptResult = await gameController.processTurnWithPrompts(
    game,
    text.split(' | '), // Разделяем действия
    timeJump
  );

  const result = {
    countryResponse: promptResult.convertedActions.map((a: any) => a.text).join('\n'),
    worldResponse: promptResult.narration,
    narration: promptResult.narration,
    events: promptResult.events,
  };

  // Применяем изменения мира
  if (promptResult.worldChanges) {
    const { regionOwners, regionColors } = promptResult.worldChanges;
    // Обновляем владельцев регионов
    for (const [regionId, newOwner] of Object.entries(regionOwners || {})) {
      const targetRegion = typeof game.world.regions.get === 'function'
        ? game.world.regions.get(regionId)
        : game.world.regions[regionId];
      if (targetRegion) {
        targetRegion.owner = newOwner;
        targetRegion.color = regionColors?.[regionId] || targetRegion.color;
      }
    }
  }

  // ==============================================================================
  // Detect and create objects from player actions
  // ==============================================================================
  const createdObjects: string[] = [];

  // Object type patterns (Russian keywords)
  const objectPatterns: Record<string, RegExp[]> = {
    army: [/арми(?:ю|я|ю|)\s/iu, /войск(?:а|о|у|)\s/iu, /воен(?:ый|ая|ое)\s/iu, /soldiers/iu],
    fleet: [/флот(?:а|у|ом|)\s/iu, /корабл(?:ь|ей|ям|)\s/iu, /морск(?:ой|ая|ое)\s/iu, /navy/iu, /fleet/iu],
    missile: [/ракет(?:а|ы|е|)\s/iu, /баллистическ/iu, /missile/iu],
    radar: [/радар(?:а|у|ом|)\s/iu, /радиолокацион/iu, /radar/iu],
    port: [/порт(?:а|у|ом|)\s/iu, /гаван(?:ь|и|ью|)\s/iu, /port/iu],
    exchange: [/бирж(?:а|у|ей|)\s/iu, /обмен(?:а|у|)\s/iu, /exchange/iu],
    clearing: [/клиринг(?:а|у|ов|)\s/iu, /расчет(?:а|ов|)\s/iu, /clearing/iu],
    grouping: [/группировк(?:а|и|у|)\s/iu, /объединен/iu, /grouping/iu],
    factory: [/завод(?:а|у|ом|)\s/iu, /фабрик(?:а|и|у|)\s/iu, /предприят/iu, /factory/iu, /plant/iu],
    university: [/университет(?:а|у|ом|)\s/iu, /университет/iu, /институт(?:а|у|)\s/iu, /академи(?:я|и|)\s/iu, /university/iu, / institute/iu],
  };

  // Check action text and response for object creation
  const combinedText = (text + ' ' + result.countryResponse).toLowerCase();

  for (const [objType, patterns] of Object.entries(objectPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(combinedText)) {
        // Create new object
        const newObject: MapObject = {
          id: uuid().slice(0, 8),
          type: objType,
          name: `${objType.charAt(0).toUpperCase() + objType.slice(1)} ${region.objects.length + 1}`,
          x: 400 + Math.random() * 200, // Random position in region
          y: 300 + Math.random() * 150,
          level: 1,
        };

        // Initialize objects array if needed
        if (!region.objects) {
          region.objects = [];
        }

        region.objects.push(newObject);
        createdObjects.push(`✓ Создан ${objType}: ${newObject.name}`);
        break;
      }
    }
  }

  // Process NPC turns
  const npcCountries = gameController.getNPCCountries();
  const npcEvents: string[] = [];

  for (const npcRegionId of npcCountries) {
    const npcRegion = typeof game.world.regions.get === 'function'
      ? game.world.regions.get(npcRegionId)
      : game.world.regions[npcRegionId];
    if (!npcRegion) continue;

    // Get neighbors for NPC context
    const regionsArray = Object.values(game.world.regions) as any[];
    const neighbors = regionsArray
      .filter((r: any) => r.id !== npcRegionId)
      .slice(0, 5)
      .map((r: any) => ({
        id: r.id,
        name: r.name,
        owner: r.owner,
        militaryPower: r.militaryPower,
        gdp: r.gdp,
      }));

    const npcContext = {
      turn: game.currentTurn,
      population: npcRegion.population,
      gdp: npcRegion.gdp,
      militaryPower: npcRegion.militaryPower,
      neighbors,
      recentEvents: game.results.slice(-3).map((r: any) => r.narration),
    };

    try {
      const npcAction = await gameController.processNPCTurn(npcRegionId, npcContext);
      if (npcAction) {
        npcEvents.push(`${npcRegion.name}: ${npcAction.description}`);

        // Apply NPC action effects (simplified)
        if (npcAction.type === 'develop') {
          npcRegion.gdp = Math.floor(npcRegion.gdp * 1.05);
          npcRegion.militaryPower = Math.floor(npcRegion.militaryPower * 1.03);
        } else if (npcAction.type === 'war' && npcAction.targetRegionId) {
          const targetRegion = typeof game.world.regions.get === 'function'
            ? game.world.regions.get(npcAction.targetRegionId)
            : game.world.regions[npcAction.targetRegionId];
          if (targetRegion && targetRegion.militaryPower < npcRegion.militaryPower * 0.7) {
            // Conquer the region
            targetRegion.owner = npcRegionId;
            targetRegion.color = npcRegion.color;
            npcEvents.push(`⚔️ ${npcRegion.name} захватила ${targetRegion.name}!`);
          }
        }
      }
    } catch (e) {
      console.error(`NPC turn error for ${npcRegionId}:`, e);
    }
  }

  // Save action
  const actionId = uuid().slice(0, 8);
  const action: Action = {
    id: actionId,
    playerId: player.id,
    turn: game.currentTurn,
    text,
    createdAt: new Date().toISOString(),
  };
  game.actions.push(action);

  // Persist action to database
  gameRepository.addAction({
    id: actionId,
    gameId: game.id,
    playerId: player.id,
    turn: game.currentTurn,
    text,
  });

  // Save result with NPC events
  const resultId = uuid().slice(0, 8);

  // ==============================================================================
  // Random Events (15% chance per turn)
  // ==============================================================================
  const randomEvents: string[] = [];
  if (Math.random() < 0.15) {
    const eventTypes = [
      { name: 'Природное бедствие', effects: ['землетрясение', 'наводнение', 'засуха', 'ураган'] },
      { name: 'Экономический кризис', effects: ['рецессия', 'инфляция', 'дефицит'] },
      { name: 'Технологический прорыв', effects: ['изобретение', 'открытие', 'инновация'] },
      { name: 'Социальные волнения', effects: ['протесты', 'забастовка', 'революция'] },
      { name: 'Эпидемия', effects: ['чума', 'грипп', 'вирус'] },
    ];

    const event = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const effect = event.effects[Math.floor(Math.random() * event.effects.length)];
    const affectedRegions = Array.from(game.world.regions.values()) as MapRegion[];
    const targetRegion = affectedRegions[Math.floor(Math.random() * affectedRegions.length)] as MapRegion;

    const eventText = `🔮 ${event.name}: ${effect} в ${targetRegion.name}`;
    randomEvents.push(eventText);

    // Apply random event effects
    if (event.name === 'Природное бедствие') {
      targetRegion.population = Math.floor(targetRegion.population * 0.95);
      targetRegion.gdp = Math.floor(targetRegion.gdp * 0.9);
    } else if (event.name === 'Экономический кризис') {
      targetRegion.gdp = Math.floor(targetRegion.gdp * 0.85);
    } else if (event.name === 'Технологический прорыв') {
      targetRegion.gdp = Math.floor(targetRegion.gdp * 1.15);
      targetRegion.militaryPower = Math.floor(targetRegion.militaryPower * 1.1);
    } else if (event.name === 'Социальные волнения') {
      targetRegion.militaryPower = Math.floor(targetRegion.militaryPower * 0.9);
    } else if (event.name === 'Эпидемия') {
      targetRegion.population = Math.floor(targetRegion.population * 0.9);
      targetRegion.militaryPower = Math.floor(targetRegion.militaryPower * 0.85);
    }
  }

  const turnResult: TurnResult = {
    turn: game.currentTurn,
    narration: result.worldResponse,
    countryResponse: result.countryResponse,
    events: [...npcEvents, ...randomEvents],
  };
  game.results.push(turnResult);

  // Persist turn result to database
  gameRepository.addTurnResult({
    id: resultId,
    gameId: game.id,
    turn: game.currentTurn,
    narration: result.worldResponse,
    countryResponse: result.countryResponse,
    events: [...npcEvents, ...createdObjects],
  });

  // Persist region updates (objects)
  worldRepository.updateRegion(player.regionId, { objects: region.objects });

  // Persist turn number
  gameRepository.updateTurn(game.id, game.currentTurn + 1);

  // Next turn - update date
  game.currentTurn += 1;
  const currentDate = new Date(game.currentDate);
  currentDate.setDate(currentDate.getDate() + timeJump);
  game.currentDate = currentDate.toISOString().split('T')[0];

  res.json({
    turn: game.currentTurn - 1,
    narration: result.worldResponse,
    country_response: result.countryResponse,
    events: [...npcEvents, ...randomEvents, ...createdObjects],
    objects: region.objects,
  });
});

app.get('/api/games/:id/advisor', async (req, res) => {
  const { playerId, message } = req.query;
  const gameId = req.params.id;

  const game = activeGames.get(gameId);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  // Используем первого игрока если playerId не передан или не найден
  const player = game.players.find((p: any) => p.id === playerId) || game.players[0];
  if (!player) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }

  // Используем новую систему промптов для советника
  try {
    const advice = await gameController.getAdvisorWithPrompts(game, message as string || '', []);
    res.json({ tips: [advice] });
  } catch (e) {
    console.error('[Advisor] Error:', e);
    res.status(500).json({ error: 'Failed to get advisor tips' });
  }
});

// Suggestions endpoint (использует actions.md)
app.get('/api/games/:id/suggestions', async (req, res) => {
  const gameId = req.params.id;

  const game = activeGames.get(gameId);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  try {
    const suggestions = await gameController.getSuggestionsWithPrompts(game);
    res.json({ suggestions });
  } catch (e) {
    console.error('[Suggestions] Error:', e);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
  console.log(`🚀 Open-Pax API running on http://localhost:${PORT}`);
});
