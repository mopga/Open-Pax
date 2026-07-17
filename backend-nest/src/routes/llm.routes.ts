/**
 * Open-Pax — LLM Routes
 * =====================
 * GET /api/llm/status — текущая конфигурация LLM-слоя (без секретов).
 */

import { Router } from 'express';
import { getLLMRouter } from '../llm';

export const llmRouter = Router();

llmRouter.get('/status', (_req, res) => {
  const router = getLLMRouter();
  res.json({ mechanics: router.describe() });
});
