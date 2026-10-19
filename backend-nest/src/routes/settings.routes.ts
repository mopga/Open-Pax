/**
 * Open-Pax — Settings Routes
 * ==========================
 * GET    /api/settings/llm         — текущие настройки (ключ замаскирован), пресеты, расход
 * PUT    /api/settings/llm         — сохранить и применить без перезапуска
 * DELETE /api/settings/llm         — сбросить к llm.config.json / env
 * POST   /api/settings/llm/test    — проверить подключение (основная и лёгкая модель)
 * POST   /api/settings/llm/models  — список моделей у провайдера
 */

import { Router } from 'express';
import { getLLMRouter } from '../llm';
import { usageRepository } from '../repositories/usage.repository';
import {
  PROVIDER_PRESETS, SettingsValidationError,
  applySavedSettings, clearSettings, isConfigured, listModels, loadSavedSettings,
  publicSettings, resolveSettings, saveSettings, testConnection,
} from '../settings/llm-settings';

export const settingsRouter = Router();

function settingsView() {
  const router = getLLMRouter();
  const describe = router.describe();
  return {
    configured: isConfigured(router),
    source: router.source ?? 'env',
    settings: publicSettings(loadSavedSettings()),
    presets: PROVIDER_PRESETS,
    effective: { jump: describe.jump, suggestions: describe.suggestions },
    usage: usageRepository.overall(),
  };
}

function sendError(res: any, e: unknown) {
  if (e instanceof SettingsValidationError) {
    res.status(400).json({ error: e.message });
  } else {
    console.error('[settings] error:', e);
    res.status(500).json({ error: (e as Error)?.message || 'Внутренняя ошибка' });
  }
}

settingsRouter.get('/llm', (_req, res) => {
  res.json(settingsView());
});

settingsRouter.put('/llm', (req, res) => {
  try {
    const resolved = resolveSettings(req.body ?? {}, loadSavedSettings());
    saveSettings(resolved);
    applySavedSettings(getLLMRouter());
    res.json(settingsView());
  } catch (e) {
    sendError(res, e);
  }
});

settingsRouter.delete('/llm', (_req, res) => {
  try {
    clearSettings();
    applySavedSettings(getLLMRouter());
    res.json(settingsView());
  } catch (e) {
    sendError(res, e);
  }
});

settingsRouter.post('/llm/test', async (req, res) => {
  try {
    const candidate = resolveSettings(req.body ?? {}, loadSavedSettings());
    const results = [await testConnection(candidate, candidate.model)];
    if (candidate.lightModel && candidate.lightModel !== candidate.model) {
      results.push(await testConnection(candidate, candidate.lightModel));
    }
    res.json({ ok: results.every(r => r.ok), results });
  } catch (e) {
    sendError(res, e);
  }
});

settingsRouter.post('/llm/models', async (req, res) => {
  try {
    // Для списка моделей сама модель не нужна — подставляем заглушку для валидации
    const body = { ...(req.body ?? {}), model: req.body?.model || '-' };
    const candidate = resolveSettings(body, loadSavedSettings());
    res.json({ models: await listModels(candidate) });
  } catch (e) {
    if (e instanceof SettingsValidationError) {
      sendError(res, e);
    } else {
      res.status(502).json({ error: `Не удалось получить список моделей: ${(e as Error)?.message || e}` });
    }
  }
});
