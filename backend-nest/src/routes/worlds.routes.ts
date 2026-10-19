/**
 * Open-Pax — Worlds Routes
 * ========================
 * POST  /api/worlds/generate    — мир из пресета (без вызовов ИИ)
 * PATCH /api/worlds/:id/prompt  — правка базового промпта мира
 */

import { Router } from 'express';
import { shortId } from '../utils/short-id';
import { worldRepository } from '../repositories';
import { getLLMRouter } from '../llm';
import { loadPreset, loadPresetMap } from '../utils/preset-loader';
import { getCapitals, getCountryInfo, getRegionFeatures } from '../utils/geodata';
import { buildPresetWorld } from '../utils/preset-world';

export const worldsRouter = Router();

worldsRouter.post('/generate', (req, res) => {
  const { templateId, playerCountryCode } = req.body;

  if (!templateId || !playerCountryCode) {
    res.status(400).json({ error: 'templateId and playerCountryCode are required' });
    return;
  }

  // loadPreset валидирует id через PRESET_ID_RE — path traversal исключён
  const preset = loadPreset(templateId);
  if (!preset) {
    res.status(404).json({ error: `Preset not found: ${templateId}` });
    return;
  }

  try {
    const worldId = shortId();
    const built = buildPresetWorld(preset, worldId, {
      regionFeatures: preset.has_custom_map ? null : getRegionFeatures(),
      customMap: preset.has_custom_map ? loadPresetMap(templateId) ?? { features: [] } : null,
      countries: getCountryInfo(),
      capitals: getCapitals(),
    }, shortId);

    if (!built.homeRegion[playerCountryCode]) {
      res.status(400).json({ error: `Государства ${playerCountryCode} нет на карте пресета` });
      return;
    }

    worldRepository.createWithRegions(built.world, built.regions, built.polities);

    res.json({
      templateId,
      worldId,
      date: preset.start_date,
      regionIds: built.homeRegion,
      playerCountryCode,
    });
  } catch (e: any) {
    console.error('[Generate World] Error:', e);
    res.status(500).json({ error: 'Failed to generate world: ' + e.message });
  }
});

worldsRouter.patch('/:id/prompt', (req, res) => {
  const world = worldRepository.findById(req.params.id);
  if (!world) {
    res.status(404).json({ error: 'World not found' });
    return;
  }

  const { basePrompt } = req.body;
  if (typeof basePrompt !== 'string') {
    res.status(400).json({ error: 'basePrompt must be a string' });
    return;
  }

  worldRepository.update(req.params.id, { basePrompt });
  getLLMRouter().clearCache(); // Invalidate cached narrations when world prompt changes
  res.json({ success: true, basePrompt });
});
