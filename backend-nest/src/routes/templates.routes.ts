/**
 * Open-Pax — Templates Routes (Этап 5: пресет-пакеты)
 * ===================================================
 * Источник данных — preset-loader: пакеты data/presets/<id>/ выигрывают
 * у легаси-шаблонов data/templates/<id>.json при совпадении id.
 */

import { Router } from 'express';
import { countryRepository } from '../repositories/country.repository';
import { listPresets, loadPreset } from '../utils/preset-loader';

export const templatesRouter = Router();

templatesRouter.get('/', (_req, res) => {
  let templates: any[] = [];
  try {
    templates = listPresets().map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      start_date: p.start_date,
      country_count: p.country_codes.length,
      // Этап 5: метаданные пакета — фронт может пометить пресеты с лором/картой/флагами
      source: p.source,
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

  // Кастомные страны пакета (имена/цвета) перекрывают общий реестр data/countries.json
  const countries = preset.countries ?? countryRepository.findByCodes(preset.country_codes);

  // Формат ответа совместим со старым: id/name/description/start_date/
  // country_codes/countries/base_prompt на месте, плюс поля пакета
  // (simulation_rules, lore, has_custom_map, flags, source, author, version).
  res.json({
    ...preset,
    countries,
  });
});
