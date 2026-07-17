/**
 * Open-Pax — Routes Index
 * =======================
 * Combines all Express routers into a single export.
 */

import { Router } from 'express';
import { healthRouter } from './health.routes';
import { countriesRouter } from './countries.routes';
import { templatesRouter } from './templates.routes';
import { mapsRouter } from './maps.routes';
import { worldsRouter } from './worlds.routes';
import { gamesRouter } from './games.routes';
import { chatsRouter } from './chats.routes';
import { savesRouter } from './saves.routes';
import { llmRouter } from './llm.routes';

export { healthRouter, countriesRouter, templatesRouter, mapsRouter, worldsRouter, gamesRouter, chatsRouter, savesRouter, llmRouter };

// Combined router for mounting all routes
export function registerRoutes(app: Router): void {
  // Health check
  app.use('/health', healthRouter);

  // API routes
  app.use('/api/countries', countriesRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/maps', mapsRouter);
  app.use('/api/worlds', worldsRouter);
  app.use('/api/games', gamesRouter);
  // Этап 3: дипломатические чаты — тот же префикс /api/games
  app.use('/api/games', chatsRouter);
  app.use('/api/saves', savesRouter);
  app.use('/api/llm', llmRouter);
}
