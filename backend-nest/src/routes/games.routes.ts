/**
 * Open-Pax — Games Routes
 * ======================
 */

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { gameRepository } from '../repositories';
import { getSessionRegistry } from '../session-registry';
import { addSSEClient, removeSSEClient, broadcastToGame } from '../sse';

export const gamesRouter = Router();

gamesRouter.post('/', (req, res) => {
  const worldId = req.body.worldId || req.body.world_id;
  const playerName = req.body.playerName || req.body.player_name;
  const playerRegionId = req.body.playerRegionId || req.body.player_region_id;

  try {
    const { session, playerId, gameId } = getSessionRegistry().createSession(
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

gamesRouter.get('/:id', (req, res) => {
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

gamesRouter.post('/:id/action', async (req, res) => {
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

// SSE endpoint for real-time game updates
gamesRouter.get('/:id/events', (req, res) => {
  const gameId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  res.write(`event: connected\ndata: {"gameId":"${gameId}"}\n\n`);

  const clientId = uuid().slice(0, 8);
  addSSEClient(gameId, { id: clientId, response: res });

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    session.setSSEBroadcaster((type, data) => {
      broadcastToGame(gameId, type, data);
    });
  } catch (e) {
    console.warn('[SSE] Game session not found:', gameId);
  }

  const pingInterval = setInterval(() => {
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(pingInterval);
    removeSSEClient(gameId, clientId);
  });
});

gamesRouter.get('/:id/advisor', async (req, res) => {
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

gamesRouter.get('/:id/suggestions', async (req, res) => {
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

gamesRouter.get('/:id/relationships', (req, res) => {
  const gameId = req.params.id;

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    res.json(session.getRelationships());
  } catch (e) {
    console.error('[Relationships] Error:', e);
    res.status(404).json({ error: 'Game not found' });
  }
});

gamesRouter.post('/:id/save', (req, res) => {
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

gamesRouter.post('/:id/actions/queue', (req, res) => {
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

gamesRouter.get('/:id/actions/queue', (req, res) => {
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

gamesRouter.post('/:id/actions/process', async (req, res) => {
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

gamesRouter.post('/:id/actions/process-all', async (req, res) => {
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

gamesRouter.post('/:id/time-skip', async (req, res) => {
  const gameId = req.params.id;
  const { jump_days = 30 } = req.body;

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    const pendingActions = session.getPendingActions();

    if (pendingActions.length > 0) {
      const processed = await session.processAllPendingActions(jump_days);
      res.json({
        type: 'actions_processed',
        processedCount: processed.length,
        actions: processed,
      });
    } else {
      const result = session.advanceDate(jump_days);
      res.json({
        type: 'date_advanced',
        newDate: result.newDate,
        newTurn: result.newTurn,
        jumpDays: jump_days,
      });
    }
  } catch (e: any) {
    console.error('[TIME-SKIP] Error:', e);
    if (e.message.includes('not found')) {
      res.status(404).json({ error: e.message });
    } else {
      res.status(500).json({ error: 'Failed to time-skip' });
    }
  }
});
