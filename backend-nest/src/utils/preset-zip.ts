/**
 * Open-Pax — Preset ZIP (Этап 5)
 * ==============================
 * Импорт/экспорт пресет-пакетов в формате zip ("<id>.openpax.zip").
 *
 * Структура архива (все записи опциональны, кроме preset.json):
 *   preset.json   — обязательный, валидируется validatePresetJson
 *   rules.md      — правила симуляции
 *   lore.md       — лор мира
 *   map.geojson   — кастомная карта (валидный JSON)
 *   flags/<name>.svg|png — флаги стран
 *
 * Прочие записи в архиве игнорируются. Zip-slip записи (../, абсолютные
 * пути) отбрасываются. Чистые функции — роуты лишь тонкие обёртки.
 */

import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import {
  PRESETS_DIR,
  PresetPackage,
  loadPreset,
  validatePresetJson,
} from './preset-loader';

/** Коды ошибок импорта — маппятся роутом в HTTP-статусы */
export type PresetZipErrorCode = 'INVALID_ZIP' | 'INVALID_PRESET' | 'EXISTS';

export class PresetZipError extends Error {
  readonly code: PresetZipErrorCode;
  constructor(code: PresetZipErrorCode, message: string) {
    super(message);
    this.name = 'PresetZipError';
    this.code = code;
  }
}

/** Корневые файлы пакета, разрешённые в архиве */
const ALLOWED_ROOT_FILES = new Set(['preset.json', 'rules.md', 'lore.md', 'map.geojson']);

/** Нормализация имени zip-записи: прямые слеши, без ведущего "./" */
function normalizeEntryName(name: string): string {
  return name.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}

/** Имя записи безопасно для извлечения внутрь каталога пресета? */
function isSafeEntryName(name: string): boolean {
  if (name.includes('..')) return false;
  if (name.startsWith('/') || path.isAbsolute(name)) return false;
  return true;
}

/**
 * Собрать zip-пакет пресета по id.
 * Для пакета — файлы с диска; для легаси-шаблона — синтезируем архив
 * только с preset.json (поля из loadPreset). null, если пресет не найден.
 */
export function buildPresetZip(id: string): Buffer | null {
  const preset = loadPreset(id);
  if (!preset) return null;

  const zip = new AdmZip();

  if (preset.source === 'legacy') {
    // Легаси-шаблон: синтезируем preset.json из загруженных полей
    const json: Record<string, unknown> = {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      start_date: preset.start_date,
      country_codes: preset.country_codes,
      base_prompt: preset.base_prompt,
    };
    if (preset.historical_accuracy !== undefined) json.historical_accuracy = preset.historical_accuracy;
    if (preset.countries !== undefined) json.countries = preset.countries;
    if (preset.author !== undefined) json.author = preset.author;
    if (preset.version !== undefined) json.version = preset.version;
    zip.addFile('preset.json', Buffer.from(JSON.stringify(json, null, 2), 'utf-8'));
    return zip.toBuffer();
  }

  // Пакет: читаем файлы из data/presets/<id>
  const dir = path.join(PRESETS_DIR, preset.id);
  const addIfExists = (file: string, entryName = file) => {
    const p = path.join(dir, file);
    try {
      if (fs.existsSync(p)) zip.addFile(entryName, fs.readFileSync(p));
    } catch { /* не читается — пропускаем */ }
  };

  addIfExists('preset.json');
  addIfExists('rules.md');
  addIfExists('lore.md');
  addIfExists('map.geojson');
  for (const flag of preset.flags) {
    addIfExists(path.join('flags', flag), `flags/${flag}`);
  }
  return zip.toBuffer();
}

/**
 * Импортировать пресет из zip-буфера.
 * id пресета берётся из preset.json (НЕ из имени архива).
 * Бросает PresetZipError с кодом INVALID_ZIP / INVALID_PRESET / EXISTS.
 */
export function importPresetZip(
  buffer: Buffer,
  opts: { overwrite?: boolean } = {},
): { preset: PresetPackage } {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new PresetZipError('INVALID_ZIP', 'Файл не является валидным zip-архивом');
  }

  const entries = zip
    .getEntries()
    .filter(e => !e.isDirectory)
    .map(e => ({ entry: e, name: normalizeEntryName(e.entryName) }));

  // preset.json обязателен
  const presetEntry = entries.find(e => e.name === 'preset.json');
  if (!presetEntry) {
    throw new PresetZipError('INVALID_ZIP', 'В архиве нет preset.json');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(presetEntry.entry.getData().toString('utf-8'));
  } catch {
    throw new PresetZipError('INVALID_PRESET', 'preset.json: содержимое не является JSON');
  }

  let validated: ReturnType<typeof validatePresetJson>;
  try {
    validated = validatePresetJson(raw, 'preset.json');
  } catch (e: any) {
    throw new PresetZipError('INVALID_PRESET', e.message);
  }

  const id = validated.id;
  const dir = path.join(PRESETS_DIR, id);
  if (fs.existsSync(dir) && !opts.overwrite) {
    throw new PresetZipError('EXISTS', `Пресет "${id}" уже существует (передайте overwrite=1 для перезаписи)`);
  }

  // Валидация + сбор разрешённых файлов ДО любых записей на диск
  const files: Array<{ rel: string; data: Buffer }> = [];
  for (const { entry, name } of entries) {
    if (!isSafeEntryName(name)) continue; // zip-slip — игнорируем

    if (ALLOWED_ROOT_FILES.has(name)) {
      if (name === 'map.geojson') {
        try {
          JSON.parse(entry.getData().toString('utf-8'));
        } catch {
          throw new PresetZipError('INVALID_PRESET', 'map.geojson: содержимое не является JSON');
        }
      }
      files.push({ rel: name, data: entry.getData() });
      continue;
    }

    // Флаги: только flags/<имя>.(svg|png), без вложенных каталогов
    if (name.startsWith('flags/')) {
      const file = name.slice('flags/'.length);
      if (file && !file.includes('/') && path.basename(file) === file && /\.(svg|png)$/i.test(file)) {
        files.push({ rel: `flags/${file}`, data: entry.getData() });
      }
      continue;
    }
    // Прочие записи игнорируем
  }

  // Извлечение: каталог data/presets/<id> (при overwrite — пересоздаём)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) {
    const target = path.join(dir, f.rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.data);
  }

  const preset = loadPreset(id);
  if (!preset) {
    throw new PresetZipError('INVALID_PRESET', `Пресет "${id}" записан, но не читается`);
  }
  return { preset };
}
