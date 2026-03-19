/**
 * Open-Pax — API Server
 * =====================
 */

import express from 'express';
import cors from 'cors';
import { v4 as uuid } from 'uuid';
import { MiniMaxProvider } from './llm';
import { initDatabase } from './database';
import db from './database';
import { mapRepository, worldRepository, gameRepository } from './repositories';
import { initSessionRegistry, getSessionRegistry } from './session-registry';
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

// Initialize Session Registry (manages per-game sessions)
const sessionRegistry = initSessionRegistry(llmProvider);

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

  try {
    const { session, playerId, gameId } = sessionRegistry.createSession(
      worldId,
      playerName || 'Player',
      playerRegionId
    );

    const player = session.getPlayer();
    const region = session.getRegion(playerRegionId);

    res.json({
      game_id: gameId,
      player_id: playerId,
      region: { id: region?.id, name: region?.name },
    });
  } catch (e: any) {
    if (e.message === 'World not found') {
      res.status(404).json({ error: 'World not found' });
    } else if (e.message === 'Region not found') {
      res.status(404).json({ error: 'Region not found' });
    } else {
      console.error('[POST /api/games] Error:', e);
      res.status(500).json({ error: 'Failed to create game' });
    }
  }
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
  const playerId = req.body.playerId || req.body.player_id;
  const text = req.body.text;
  const jump_days = req.body.jump_days || req.body.jumpDays || 30;
  const gameId = req.params.id;
  const timeJump = jump_days || 30;

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    const result = await session.applyTurn(text, timeJump);

    res.json({
      turn: result.turn,
      narration: result.narration,
      country_response: result.countryResponse,
      events: result.events,
      objects: result.objects,
    });
  } catch (e: any) {
    console.error('[POST /api/games/:id/action] Error:', e);
    if (e.message.includes('not found')) {
      res.status(404).json({ error: e.message });
    } else {
      res.status(500).json({ error: 'Failed to process turn' });
    }
  }
});

app.get('/api/games/:id/advisor', async (req, res) => {
  const { playerId, message } = req.query;
  const gameId = req.params.id;

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    const advice = await session.getAdvisor(message as string || '', []);
    res.json({ tips: [advice] });
  } catch (e) {
    console.error('[Advisor] Error:', e);
    res.status(404).json({ error: 'Game not found' });
  }
});

// Suggestions endpoint (uses actions.md)
app.get('/api/games/:id/suggestions', async (req, res) => {
  const gameId = req.params.id;

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    const suggestions = await session.getSuggestions();
    res.json({ suggestions });
  } catch (e) {
    console.error('[Suggestions] Error:', e);
    res.status(404).json({ error: 'Game not found' });
  }
});

// Save game endpoint
app.post('/api/games/:id/save', (req, res) => {
  const gameId = req.params.id;
  const { name } = req.body;

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    const { saveId, currentTurn, currentDate } = session.save(name);

    console.log('[SAVE] Game saved:', saveId, 'turn:', currentTurn);
    res.json({ save_id: saveId, currentTurn, currentDate });
  } catch (e) {
    console.error('[SAVE] Error:', e);
    res.status(404).json({ error: 'Game not found' });
  }
});

// List saved games
app.get('/api/saves', (_req, res) => {
  const stmt = db.prepare('SELECT id, game_id, name, current_turn, current_date, saved_at FROM saves ORDER BY saved_at DESC');
  const saves = stmt.all();
  res.json({ saves });
});

// Load saved game
app.post('/api/saves/:id/load', (req, res) => {
  const saveId = req.params.id;

  try {
    const session = getSessionRegistry().loadSavedGame(saveId);
    if (!session) {
      res.status(404).json({ error: 'Save not found' });
      return;
    }

    console.log('[LOAD] Game loaded:', saveId);
    res.json({
      game_id: session.id,
      currentTurn: session.getCurrentTurn(),
      currentDate: session.getCurrentDate(),
    });
  } catch (e) {
    console.error('[LOAD] Error:', e);
    res.status(404).json({ error: 'Failed to load game' });
  }
});

// ============================================================================
// Pending Actions Queue (Phase 2)
// ============================================================================

// Add action to queue (no processing)
app.post('/api/games/:id/actions/queue', (req, res) => {
  const gameId = req.params.id;
  const { text } = req.body;

  if (!text) {
    res.status(400).json({ error: 'Action text is required' });
    return;
  }

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    const action = session.queueAction(text);

    console.log('[QUEUE] Action added:', action.id);
    res.json({
      id: action.id,
      text: action.text,
      status: action.status,
      createdAt: action.createdAt,
    });
  } catch (e: any) {
    console.error('[QUEUE] Error:', e);
    if (e.message.includes('not found')) {
      res.status(404).json({ error: e.message });
    } else {
      res.status(500).json({ error: 'Failed to queue action' });
    }
  }
});

// Get pending actions
app.get('/api/games/:id/actions/queue', (req, res) => {
  const gameId = req.params.id;

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    const pendingActions = session.getPendingActions();

    res.json({ pendingActions });
  } catch (e: any) {
    console.error('[QUEUE GET] Error:', e);
    if (e.message.includes('not found')) {
      res.status(404).json({ error: e.message });
    } else {
      res.status(500).json({ error: 'Failed to get pending actions' });
    }
  }
});

// Process one action from queue
app.post('/api/games/:id/actions/process', async (req, res) => {
  const gameId = req.params.id;
  const { jump_days = 30 } = req.body;

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    const action = await session.processNextAction(jump_days);

    if (!action) {
      res.json({ message: 'No pending actions to process', action: null });
      return;
    }

    console.log('[PROCESS] Action processed:', action.id);
    res.json({
      id: action.id,
      text: action.text,
      status: action.status,
      result: action.result,
    });
  } catch (e: any) {
    console.error('[PROCESS] Error:', e);
    if (e.message.includes('not found')) {
      res.status(404).json({ error: e.message });
    } else {
      res.status(500).json({ error: 'Failed to process action' });
    }
  }
});

// Process all pending actions
app.post('/api/games/:id/actions/process-all', async (req, res) => {
  const gameId = req.params.id;
  const { jump_days = 30 } = req.body;

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    const processed = await session.processAllPendingActions(jump_days);

    console.log('[PROCESS ALL] Actions processed:', processed.length);
    res.json({
      processedCount: processed.length,
      actions: processed,
    });
  } catch (e: any) {
    console.error('[PROCESS ALL] Error:', e);
    if (e.message.includes('not found')) {
      res.status(404).json({ error: e.message });
    } else {
      res.status(500).json({ error: 'Failed to process actions' });
    }
  }
});

// ============================================================================
// Start Server
// ============================================================================

// Reload active sessions from database (survives server restart)
sessionRegistry.reloadActiveSessions();

app.listen(PORT, () => {
  console.log(`🚀 Open-Pax API running on http://localhost:${PORT}`);
});
