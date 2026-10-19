/**
 * Open-Pax — Usage Routes
 * =======================
 * GET /api/games/:id/usage — расход токенов и оценка стоимости по игре.
 */

import { Router } from 'express';
import { getLLMRouter } from '../llm';
import { usageRepository } from '../repositories/usage.repository';
import { loadSavedSettings } from '../settings/llm-settings';

export const usageRouter = Router();

usageRouter.get('/:id/usage', (req, res) => {
  const gameId = req.params.id;
  const jump = getLLMRouter().mechanicConfig('jump');
  res.json({
    gameId,
    totals: usageRepository.gameTotals(gameId),
    byMechanic: usageRepository.gameByMechanic(gameId),
    recent: usageRepository.recentCalls(gameId, 20),
    billing: jump.billing ?? 'payg',
    budgetPerGameUsd: loadSavedSettings()?.budgetPerGameUsd ?? null,
  });
});
