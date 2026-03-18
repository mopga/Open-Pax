/**
 * Open-Pax — API Server
 * =====================
 */

import express from 'express';
import cors from 'cors';
import { v4 as uuid } from 'uuid';
import { MiniMaxProvider } from './llm';
import { GameController } from './agents';
import type {
  Game, GameWorld, MapRegion, Player, Action, TurnResult,
  CreateWorldRequest, CreateGameRequest, SubmitActionRequest, MapData
} from './models';

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize LLM
const llmProvider = new MiniMaxProvider();
const gameController = new GameController(llmProvider);

// In-memory storage
const worlds: Map<string, GameWorld> = new Map();
const games: Map<string, Game> = new Map();
const maps: Map<string, MapData> = new Map();

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
  const { name, width = 800, height = 600, regions } = req.body;

  const map: MapData = {
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
  };

  maps.set(map.id, map);
  res.json({ id: map.id, name: map.name });
});

app.get('/api/maps', (_req, res) => {
  const list = Array.from(maps.values()).map(m => ({
    id: m.id,
    name: m.name,
    regions_count: m.regions.length,
  }));
  res.json(list);
});

app.get('/api/maps/:id', (req, res) => {
  const map = maps.get(req.params.id);
  if (!map) {
    res.status(404).json({ error: 'Map not found' });
    return;
  }
  res.json(map);
});

app.delete('/api/maps/:id', (req, res) => {
  if (!maps.has(req.params.id)) {
    res.status(404).json({ error: 'Map not found' });
    return;
  }
  maps.delete(req.params.id);
  res.json({ status: 'deleted', id: req.params.id });
});

// ============================================================================
// World Endpoints
// ============================================================================

app.post('/api/worlds', (req, res) => {
  const { name, description, startDate, basePrompt, historicalAccuracy = 0.8 } = req.body;

  const world: GameWorld = {
    id: uuid().slice(0, 8),
    name,
    description,
    startDate: startDate || '1951-01-01',
    basePrompt: basePrompt || 'Альтернативная история',
    historicalAccuracy,
    regions: new Map(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  worlds.set(world.id, world);
  res.json({ id: world.id, name: world.name });
});

app.get('/api/worlds/:id', (req, res) => {
  const world = worlds.get(req.params.id);
  if (!world) {
    res.status(404).json({ error: 'World not found' });
    return;
  }
  // Convert Map to object for JSON serialization
  res.json({
    ...world,
    regions: Array.from(world.regions.entries()).reduce((acc, [k, v]) => {
      acc[k] = v;
      return acc;
    }, {} as Record<string, MapRegion>),
  });
});

app.post('/api/worlds/:id/regions', (req, res) => {
  const world = worlds.get(req.params.id);
  if (!world) {
    res.status(404).json({ error: 'World not found' });
    return;
  }

  const { id, name, svgPath, color = '#888888' } = req.body;

  const region: MapRegion = {
    id,
    name,
    svgPath,
    color,
    owner: 'neutral',
    population: 1000000,
    gdp: 100,
    militaryPower: 100,
    borders: [],
    status: 'active',
  };

  world.regions.set(id, region);
  res.json({ id: region.id, name: region.name });
});

// ============================================================================
// Game Endpoints (create from map)
// ============================================================================

app.post('/api/worlds/from-map', (req, res) => {
  const { mapId, name, description, startDate, basePrompt, historicalAccuracy, initialOwners } = req.body;

  const map = maps.get(mapId);
  if (!map) {
    res.status(404).json({ error: 'Map not found' });
    return;
  }

  const worldId = uuid().slice(0, 8);

  // Create owner lookup map
  const ownerMap = new Map<string, string>();
  if (initialOwners && Array.isArray(initialOwners)) {
    for (const owner of initialOwners) {
      ownerMap.set(owner.id, owner.owner);
    }
  }

  // Create regions from map
  const regions = new Map<string, MapRegion>();
  map.regions.forEach(r => {
    const owner = ownerMap.get(r.id) || 'neutral';

    // Assign different military power based on owner type
    let militaryPower = 100;
    let population = 1000000;
    let gdp = 100;

    if (owner === 'player') {
      militaryPower = 150;
      population = 1500000;
      gdp = 150;
    } else if (owner.startsWith('ai-')) {
      // AI countries get varying power
      militaryPower = 80 + Math.floor(Math.random() * 80);
      population = 800000 + Math.floor(Math.random() * 400000);
      gdp = 80 + Math.floor(Math.random() * 80);
    }

    regions.set(r.id, {
      id: r.id,
      name: r.name,
      svgPath: r.path,
      color: r.color,
      owner,
      population,
      gdp,
      militaryPower,
      borders: [],
      status: 'active',
    });
  });

  const world: GameWorld = {
    id: worldId,
    name: name || map.name,
    description: description || '',
    startDate: startDate || '1951-01-01',
    basePrompt: basePrompt || 'Альтернативная история',
    historicalAccuracy: historicalAccuracy ?? 0.8,
    regions,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  worlds.set(worldId, world);

  res.json({
    world_id: worldId,
    name: world.name,
    regions_count: world.regions.size,
    regions: Array.from(world.regions.values()).map(r => ({
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
  const { worldId, playerName, playerRegionId } = req.body;

  const world = worlds.get(worldId);
  if (!world) {
    res.status(404).json({ error: 'World not found' });
    return;
  }

  const region = world.regions.get(playerRegionId);
  if (!region) {
    res.status(404).json({ error: 'Region not found' });
    return;
  }

  const player: Player = {
    id: uuid().slice(0, 8),
    name: playerName || 'Player',
    regionId: playerRegionId,
    color: '#FF0000',
  };

  const game: Game = {
    id: uuid().slice(0, 8),
    world,
    players: [player],
    currentTurn: 1,
    maxTurns: 100,
    actions: [],
    results: [],
    status: 'playing',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  games.set(game.id, game);

  // Setup game controller
  gameController.setupWorld(world.basePrompt);
  gameController.addCountry(playerRegionId, region.name);

  // Setup NPC countries
  const regionConfigs = Array.from(world.regions.values()).map(r => ({
    id: r.id,
    name: r.name,
    owner: r.owner,
  }));
  gameController.setupNPCCountries(regionConfigs);

  res.json({
    game_id: game.id,
    player_id: player.id,
    region: { id: region.id, name: region.name },
  });
});

app.get('/api/games/:id', (req, res) => {
  const game = games.get(req.params.id);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  res.json({
    id: game.id,
    turn: game.currentTurn,
    status: game.status,
    world: {
      name: game.world.name,
      regions: Array.from(game.world.regions.values()).map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        owner: r.owner,
        population: r.population,
        militaryPower: r.militaryPower,
      })),
    },
    players: game.players.map(p => ({
      id: p.id,
      regionId: p.regionId,
    })),
  });
});

app.post('/api/games/:id/action', async (req, res) => {
  const { playerId, text } = req.body;
  const gameId = req.params.id;

  const game = games.get(gameId);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const player = game.players.find(p => p.id === playerId);
  if (!player) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }

  const region = game.world.regions.get(player.regionId);
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

  const result = await gameController.processTurnLegacy(player.regionId, text, gameContext);

  // Process NPC turns
  const npcCountries = gameController.getNPCCountries();
  const npcEvents: string[] = [];

  for (const npcRegionId of npcCountries) {
    const npcRegion = game.world.regions.get(npcRegionId);
    if (!npcRegion) continue;

    // Get neighbors for NPC context
    const neighbors = Array.from(game.world.regions.values())
      .filter(r => r.id !== npcRegionId)
      .slice(0, 5)
      .map(r => ({
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
      recentEvents: game.results.slice(-3).map(r => r.narration),
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
          const targetRegion = game.world.regions.get(npcAction.targetRegionId);
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
  const action: Action = {
    id: uuid().slice(0, 8),
    playerId: player.id,
    turn: game.currentTurn,
    text,
    createdAt: new Date().toISOString(),
  };
  game.actions.push(action);

  // Save result with NPC events
  const turnResult: TurnResult = {
    turn: game.currentTurn,
    narration: result.worldResponse,
    countryResponse: result.countryResponse,
    events: npcEvents,
  };
  game.results.push(turnResult);

  // Next turn
  game.currentTurn += 1;

  res.json({
    turn: game.currentTurn - 1,
    narration: result.worldResponse,
    country_response: result.countryResponse,
    events: npcEvents,
  });
});

app.get('/api/games/:id/advisor', async (req, res) => {
  const { playerId } = req.query;
  const gameId = req.params.id;

  const game = games.get(gameId);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const player = game.players.find(p => p.id === playerId);
  if (!player) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }

  const region = game.world.regions.get(player.regionId);

  const gameContext = {
    turn: game.currentTurn,
    playerState: {
      region: region?.name || '',
      population: region?.population || 0,
      gdp: region?.gdp || 0,
      militaryPower: region?.militaryPower || 0,
    },
    worldState: {
      totalRegions: game.world.regions.size,
      totalPlayers: game.players.length,
    },
  };

  const tips = await gameController.getAdvisorTips(gameContext);
  res.json({ tips });
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
  console.log(`🚀 Open-Pax API running on http://localhost:${PORT}`);
});
