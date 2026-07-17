/**
 * Open-Pax — Presets Routes (Этап 5)
 * ==================================
 * Импорт/экспорт пресет-пакетов zip + отдача флагов пресетов.
 * Монтируется на /api/templates ПОСЛЕ templatesRouter
 * (пути не пересекаются: у templatesRouter только '/' и '/:id').
 */

import express, { Router } from 'express';
import { buildPresetZip, importPresetZip, PresetZipError } from '../utils/preset-zip';
import { getPresetFlagPath } from '../utils/preset-loader';

export const presetsRouter = Router();

// GET /api/templates/:id/export — скачать пресет-пакет как zip
presetsRouter.get('/:id/export', (req, res) => {
  const buf = buildPresetZip(req.params.id);
  if (!buf) {
    res.status(404).json({ error: 'Пресет не найден' });
    return;
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.openpax.zip"`);
  res.send(buf);
});

// POST /api/templates/import?overwrite=1 — импорт пресет-пакета из zip.
// express.raw только на этом роуте (общий лимит 50MB проверяется здесь).
presetsRouter.post(
  '/import',
  express.raw({ type: ['application/zip', 'application/octet-stream'], limit: '50mb' }),
  (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'Тело запроса должно быть zip-архивом (Content-Type: application/zip)' });
      return;
    }
    try {
      const { preset } = importPresetZip(req.body, { overwrite: req.query.overwrite === '1' });
      res.status(201).json({
        template: {
          id: preset.id,
          name: preset.name,
          description: preset.description,
          start_date: preset.start_date,
          country_count: preset.country_codes.length,
        },
      });
    } catch (e: any) {
      if (e instanceof PresetZipError) {
        // INVALID_ZIP / INVALID_PRESET → 400, EXISTS → 409
        res.status(e.code === 'EXISTS' ? 409 : 400).json({ error: e.message });
        return;
      }
      console.error('[Presets] Ошибка импорта:', e);
      res.status(500).json({ error: 'Внутренняя ошибка импорта пресета' });
    }
  },
);

// GET /api/templates/:id/flags/:file — файл флага пресета
presetsRouter.get('/:id/flags/:file', (req, res) => {
  const p = getPresetFlagPath(req.params.id, req.params.file);
  if (!p) {
    res.status(404).json({ error: 'Флаг не найден' });
    return;
  }
  res.sendFile(p);
});
