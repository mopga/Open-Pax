/**
 * Open-Pax — Games Routes
 * ======================
 */

import { Router } from 'express';
import { shortId } from '../utils/short-id';
import { gameRepository, worldRepository } from '../repositories';
import { politiesFromRegions } from '../utils/name-resolver';
import { getSessionRegistry } from '../session-registry';
import { addSSEClient, removeSSEClient, broadcastToGame } from '../sse';
import { LLMError } from '../llm';

export const gamesRouter = Router();

/**
 * Единый обработчик ошибок игровых эндпоинтов:
 * LLMError → 502 с понятным сообщением (провайдер/причина),
 * "not found" → 404, всё остальное → 500.
 */
function respondRouteError(res: any, e: any, fallback: string): void {
  if (e instanceof LLMError) {
    res.status(502).json({ error: `LLM (${e.provider}): ${e.message}` });
  } else if (typeof e?.message === 'string' && e.message.includes('not found')) {
    res.status(404).json({ error: e.message });
  } else {
    res.status(500).json({ error: fallback });
  }
}

/**
 * Нормализация истории диалога с Советником из тела запроса:
 * принимаем только сообщения вида { role: 'user'|'assistant', content: string }.
 */
function normalizeAdvisorHistory(raw: any): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m: any) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }));
}

gamesRouter.post('/', (req, res) => {
  const worldId = req.body.worldId || req.body.world_id;
  const playerName = req.body.playerName || req.body.player_name;
  const playerRegionId = req.body.playerRegionId || req.body.player_region_id;

  try {
    const { session, playerId, gameId } = getSessionRegistry().createSession(
      worldId,
      playerName || 'Player',
      playerRegionId,
      req.body.playerColor || req.body.player_color || '#FF0000',
      req.body.difficulty
    );

    const player = session.getPlayer();
    const region = session.getRegion(playerRegionId);

    res.json({
      game_id: gameId,
      player_id: playerId,
      player_polity_id: player?.polityId,
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
    currentDate: game.current_date,
    maxTurns: game.max_turns,
    status: game.status,
    world: {
      id: game.world.id,
      name: game.world.name,
      regions: game.world.regions.map((r: any) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        owner: r.owner,
        geojson: r.geojson,
        flag: r.flag,
        // Столицы и батальоны — иначе маркеры появлялись только после первого события
        objects: r.objects ?? [],
      })),
      // Реестр государств (имя/цвет); у старых миров — выведен из регионов
      polities: (() => {
        const rows = worldRepository.getPolities(game.world.id);
        if (rows.length > 0) return rows.map(p => ({ id: p.id, name: p.name, color: p.color, flag: p.flag ?? null }));
        return politiesFromRegions(game.world.regions)
          .filter(p => p.id !== 'neutral')
          .map(p => ({ id: p.id, name: p.name, color: p.color || '#888888', flag: null }));
      })(),
    },
    players: game.players.map((p: any) => ({
      id: p.id,
      regionId: p.regionId,
      polityId: p.polityId,
    })),
    // История ходов — для ленты после загрузки сейва или перезагрузки страницы
    history: (() => {
      const session = getSessionRegistry().getSession(game.id);
      if (!session) return [];
      const actions = session.getActions();
      return session.getResults().map(r => {
        const orders = actions.filter(a => a.turn === r.turn).map(a => a.text);
        return {
          turn: r.turn,
          action: orders.length > 0 ? orders.join('\n') : '⏭️ Автономный ход мира',
          result: r.narration,
          events: r.events,
        };
      });
    })(),
  });
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

  const clientId = shortId();
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

// Этап 3: живой Советник — многоходовой диалог (message + history в теле)
gamesRouter.post('/:id/advisor', async (req, res) => {
  const gameId = req.params.id;
  const message = typeof req.body?.message === 'string' ? req.body.message : '';
  const history = normalizeAdvisorHistory(req.body?.history);

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    const reply = await session.getAdvisor(message, history);
    res.json({ reply });
  } catch (e: any) {
    console.error('[Advisor POST] Error:', e);
    respondRouteError(res, e, 'Failed to get advisor reply');
  }
});

// Этап 3: стриминг ответа Советника (text/plain; токены пишем по мере поступления)
gamesRouter.post('/:id/advisor/stream', async (req, res) => {
  const gameId = req.params.id;
  const message = typeof req.body?.message === 'string' ? req.body.message : '';
  const history = normalizeAdvisorHistory(req.body?.history);

  // Заголовки стрима: setHeader сам по себе ответ НЕ коммитит —
  // до первого res.write ещё можно ответить обычной JSON-ошибкой (404/502).
  // Content-Length не ставим — Node сам включит Transfer-Encoding: chunked.
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  // Не буферизовать ответ на прокси (nginx и подобных)
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);

    let gotTextChunks = false;
    const onToken = (chunk: unknown) => {
      // Строковый токен — пишем сразу. Число (charsSoFar — конвенция
      // LLMRouter.stream) несёт только прогресс без текста: полный текст
      // тогда дописываем в конце одним куском.
      if (typeof chunk === 'string' && chunk.length > 0) {
        gotTextChunks = true;
        res.write(chunk);
      }
    };

    // GameSession.getAdvisorStream (Этап 3); защитный fallback на
    // нестриминговый ответ — для старых сессий в памяти после хот-релоада.
    const streamFn = (session as any).getAdvisorStream;
    const reply: string = typeof streamFn === 'function'
      ? await streamFn.call(session, message, history, onToken)
      : await session.getAdvisor(message, history);

    if (!gotTextChunks && reply) {
      res.write(reply);
    }
    res.end();
  } catch (e: any) {
    console.error('[Advisor STREAM] Error:', e);
    if (res.headersSent) {
      // Поток уже начат — статус не поменять, просто обрываем ответ
      res.end();
    } else {
      respondRouteError(res, e, 'Failed to stream advisor reply');
    }
  }
});

gamesRouter.get('/:id/suggestions', async (req, res) => {
  const gameId = req.params.id;

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    const suggestions = await session.getSuggestions();
    res.json({ suggestions });
  } catch (e: any) {
    console.error('[Suggestions] Error:', e);
    if (e instanceof LLMError) {
      res.status(502).json({ error: `LLM (${e.provider}): ${e.message}` });
    } else {
      res.status(404).json({ error: 'Game not found' });
    }
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

gamesRouter.post('/:id/time-skip', async (req, res) => {
  const gameId = req.params.id;
  const { jump_days = 30, actions } = req.body;

  if (!Number.isInteger(jump_days) || jump_days < 0 || jump_days > 270) {
    res.status(400).json({ error: 'jump_days должен быть 0 (до следующего события) или целым числом от 1 до 270' });
    return;
  }

  if (actions !== undefined && (!Array.isArray(actions)
    || actions.length > 20
    || actions.some((text: unknown) => typeof text !== 'string' || !text.trim() || text.length > 2000))) {
    res.status(400).json({ error: 'actions должен быть массивом из 0–20 непустых строк длиной до 2000 символов' });
    return;
  }

  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    const normalizedActions = Array.isArray(actions) ? actions.map((text: string) => text.trim()) : undefined;
    const execution = await session.processTimeSkip(jump_days, normalizedActions);

    if (!execution) {
      res.status(409).json({ error: 'Другой ход уже обрабатывается — попробуйте позже' });
      return;
    }

    if (execution.actions.length > 0) {
      res.json({
        type: 'actions_processed',
        processedCount: execution.actions.length,
        actions: execution.actions,
      });
    } else {
      res.json({
        type: 'world_simulated',
        result: execution.result,
        newDate: execution.result.periodEnd,
        newTurn: execution.result.turn + 1,
        jumpDays: jump_days,
      });
    }
  } catch (e: any) {
    console.error('[TIME-SKIP] Error:', e);
    respondRouteError(res, e, 'Failed to time-skip');
  }
});

// Этап 2: Rewind — откат на ход назад
gamesRouter.post('/:id/rewind', (req, res) => {
  const gameId = req.params.id;
  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    const result = session.rewind();
    if (!result) {
      res.status(404).json({ error: 'Нет снапшота для отката (сделайте хотя бы один ход)' });
      return;
    }
    res.json({ type: 'rewound', newTurn: result.turn, newDate: result.date });
  } catch (e: any) {
    console.error('[REWIND] Error:', e);
    respondRouteError(res, e, 'Failed to rewind');
  }
});

// Этап 2: можно ли откатиться (для UI)
gamesRouter.get('/:id/rewind', (req, res) => {
  const gameId = req.params.id;
  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    res.json({ canRewind: session.canRewind() });
  } catch (e: any) {
    respondRouteError(res, e, 'Failed to check rewind');
  }
});

// Этап 2: Intervene — прервать применение оставшихся событий пачки
gamesRouter.post('/:id/intervene', (req, res) => {
  const gameId = req.params.id;
  try {
    const session = getSessionRegistry().getSessionOrThrow(gameId);
    session.requestIntervene();
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[INTERVENE] Error:', e);
    respondRouteError(res, e, 'Failed to intervene');
  }
});
