/**
 * Open-Pax — Templates Routes (пресеты)
 * =====================================
 * GET /api/templates      — список пресетов data/presets/<id>/
 * GET /api/templates/:id  — пресет и все государства, за которые можно играть
 */

import { Router } from 'express';
import { listPresets, loadPreset, loadPresetMap, type PresetPackage } from '../utils/preset-loader';
import { getCountryInfo, getRegionFeatures } from '../utils/geodata';
import { buildPolityCatalog, presetMapCodes } from '../utils/preset-world';

export const templatesRouter = Router();

function catalogFor(preset: PresetPackage) {
  const mapCodes = presetMapCodes({
    regionFeatures: preset.has_custom_map ? null : getRegionFeatures(),
    customMap: preset.has_custom_map ? loadPresetMap(preset.id) ?? { features: [] } : null,
    countries: {},
    capitals: {},
  });
  return buildPolityCatalog(preset, mapCodes, getCountryInfo());
}

templatesRouter.get('/', (_req, res) => {
  let templates: any[] = [];
  try {
    templates = listPresets().map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      start_date: p.start_date,
      country_count: p.recommended.length,
      has_rules: !!p.simulation_rules,
      has_map: p.has_custom_map,
      flags_count: p.flags.length,
    }));
  } catch (e) {
    console.error('[Templates] Error listing presets:', e);
  }

  res.json({ templates });
});

templatesRouter.get('/:id', (req, res) => {
  // loadPreset сам валидирует id через PRESET_ID_RE — traversal невозможен
  const preset = loadPreset(req.params.id);
  if (!preset) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  // countries — все государства мира (рекомендуемые первыми): за любое можно играть
  res.json({
    ...preset,
    countries: catalogFor(preset),
  });
});
