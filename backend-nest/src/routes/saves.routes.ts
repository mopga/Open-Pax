/**
 * Open-Pax — Saves Routes
 * =======================
 */

import { Router } from 'express';
import db from '../database';
import { getSessionRegistry } from '../session-registry';

export const savesRouter = Router();

savesRouter.get('/', (_req, res) => {
  const stmt = db.prepare('SELECT id, game_id, name, current_turn, current_date, saved_at FROM saves ORDER BY saved_at DESC');
  const saves = stmt.all();
  res.json({ saves });
});

savesRouter.post('/:id/load', (req, res) => {
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
