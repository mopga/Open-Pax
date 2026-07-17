/**
 * Open-Pax — Preset Loader (Этап 5)
 * =================================
 * Пресет-пакет = каталог data/presets/<id>/:
 *   preset.json   — обязательные: id, name, description, start_date,
 *                   country_codes[], base_prompt; опциональные:
 *                   historical_accuracy, countries[{code,name,color}],
 *                   country_colors{code: "#RRGGBB"} (кураторская палитра карты),
 *                   prompts{"<механика>": "<текст промпта>"} — переопределение
 *                   дефолтных промптов ИИ (simulation/jump, converter,
 *                   suggestions, advisor; плейсхолдеры ${VAR} / {{VAR}}),
 *                   author, version
 *   rules.md      — кастомные правила симуляции (→ HISTORICAL_PRESET_SIMULATION_RULES)
 *   lore.md       — расширенный лор мира (→ WORLD_BEFORE_ROUND_ONE_TEXT)
 *   map.geojson   — кастомная геометрия (FeatureCollection, properties.code)
 *   flags/        — <CODE>.svg|png флаги
 *
 * Легаси-шаблоны data/templates/*.json продолжают работать (source: 'legacy').
 * Пресет с тем же id выигрывает у легаси-шаблона.
 */

import fs from 'fs';
import path from 'path';

export const PRESETS_DIR = path.join(process.cwd(), 'data', 'presets');
export const LEGACY_TEMPLATES_DIR = path.join(process.cwd(), 'data', 'templates');

export interface PresetCountry {
  code: string;
  name: string;
  color: string;
}

export interface PresetPackage {
  id: string;
  name: string;
  description: string;
  start_date: string;
  country_codes: string[];
  base_prompt: string;
  historical_accuracy?: number;
  /** Кастомные страны (имена/цвета), перекрывают data/countries.json */
  countries?: PresetCountry[];
  /** Кураторская палитра карты: код страны → приглушённый цвет (#RRGGBB) */
  country_colors?: Record<string, string>;
  /** Переопределённые промпты ИИ пресета: механика → текст шаблона с ${VAR} */
  prompts?: Record<string, string>;
  /** rules.md — правила симуляции */
  simulation_rules?: string;
  /** lore.md — расширенный лор */
  lore?: string;
  has_custom_map: boolean;
  flags: string[];
  author?: string;
  version?: string;
  source: 'preset' | 'legacy';
}

export const PRESET_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function readOptionalText(dir: string, file: string): string | undefined {
  const p = path.join(dir, file);
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8').trim();
  } catch { /* игнорируем — опциональный файл */ }
  return undefined;
}

function listFlags(dir: string): string[] {
  const flagsDir = path.join(dir, 'flags');
  try {
    if (fs.existsSync(flagsDir)) {
      return fs.readdirSync(flagsDir).filter(f => /\.(svg|png)$/i.test(f));
    }
  } catch { /* нет флагов — не ошибка */ }
  return [];
}

/** Валидация содержимого preset.json. Бросает Error с понятным сообщением. */
export function validatePresetJson(raw: any, context = 'preset.json'): Omit<PresetPackage, 'has_custom_map' | 'flags' | 'source'> {
  if (!raw || typeof raw !== 'object') throw new Error(`${context}: не объект`);
  if (typeof raw.id !== 'string' || !PRESET_ID_RE.test(raw.id)) {
    throw new Error(`${context}: поле id обязательно и должно соответствовать ${PRESET_ID_RE}`);
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) throw new Error(`${context}: поле name обязательно`);
  if (!Array.isArray(raw.country_codes) || raw.country_codes.length === 0) {
    throw new Error(`${context}: country_codes должен быть непустым массивом кодов`);
  }
  for (const c of raw.country_codes) {
    if (typeof c !== 'string' || !/^[A-Z]{3}$/.test(c)) {
      throw new Error(`${context}: невалидный код страны "${c}" (нужен ISO_A3, например USA)`);
    }
  }
  if (typeof raw.base_prompt !== 'string' || !raw.base_prompt.trim()) {
    throw new Error(`${context}: поле base_prompt обязательно`);
  }
  if (raw.countries !== undefined) {
    if (!Array.isArray(raw.countries)) throw new Error(`${context}: countries должен быть массивом`);
    for (const c of raw.countries) {
      if (!c || typeof c.code !== 'string' || typeof c.name !== 'string') {
        throw new Error(`${context}: countries[] требует {code, name, color?}`);
      }
    }
  }
  if (raw.country_colors !== undefined) {
    if (!raw.country_colors || typeof raw.country_colors !== 'object' || Array.isArray(raw.country_colors)) {
      throw new Error(`${context}: country_colors должен быть объектом { "USA": "#RRGGBB" }`);
    }
    for (const [code, color] of Object.entries(raw.country_colors)) {
      if (!/^[A-Z]{3}$/.test(code)) {
        throw new Error(`${context}: country_colors — невалидный код страны "${code}" (нужен ISO_A3)`);
      }
      if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
        throw new Error(`${context}: country_colors["${code}"] должен быть цветом вида "#RRGGBB"`);
      }
    }
  }
  if (raw.prompts !== undefined) {
    if (!raw.prompts || typeof raw.prompts !== 'object' || Array.isArray(raw.prompts)) {
      throw new Error(`${context}: prompts должен быть объектом { "<механика>": "<текст промпта>" }`);
    }
    for (const [mechanic, text] of Object.entries(raw.prompts)) {
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error(`${context}: prompts["${mechanic}"] должен быть непустой строкой`);
      }
    }
  }
  return {
    id: raw.id,
    name: raw.name,
    description: typeof raw.description === 'string' ? raw.description : '',
    start_date: typeof raw.start_date === 'string' ? raw.start_date : '1951-01-01',
    country_codes: raw.country_codes,
    base_prompt: raw.base_prompt,
    historical_accuracy: typeof raw.historical_accuracy === 'number' ? raw.historical_accuracy : undefined,
    countries: raw.countries,
    country_colors: raw.country_colors,
    prompts: raw.prompts,
    author: typeof raw.author === 'string' ? raw.author : undefined,
    version: typeof raw.version === 'string' ? raw.version : undefined,
  };
}

function loadFromDir(dir: string): PresetPackage | null {
  const presetPath = path.join(dir, 'preset.json');
  if (!fs.existsSync(presetPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(presetPath, 'utf-8'));
    const base = validatePresetJson(raw, presetPath);
    return {
      ...base,
      simulation_rules: readOptionalText(dir, 'rules.md'),
      lore: readOptionalText(dir, 'lore.md'),
      has_custom_map: fs.existsSync(path.join(dir, 'map.geojson')),
      flags: listFlags(dir),
      source: 'preset',
    };
  } catch (e: any) {
    console.warn('[PresetLoader] Пропускаю битый пресет', dir, '-', e.message);
    return null;
  }
}

function loadLegacy(id: string): PresetPackage | null {
  const p = path.join(LEGACY_TEMPLATES_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
    let codes = raw.country_codes ?? [];
    // Легаси-формат: country_codes может быть строкой "['USA', ...]"
    if (typeof codes === 'string') {
      codes = codes.replace(/'/g, '"');
      codes = JSON.parse(codes);
    }
    const base = validatePresetJson({ ...raw, country_codes: codes }, p);
    return { ...base, has_custom_map: false, flags: [], source: 'legacy' };
  } catch (e: any) {
    console.warn('[PresetLoader] Пропускаю битый легаси-шаблон', p, '-', e.message);
    return null;
  }
}

/** Загрузить пресет по id: сначала пакет из data/presets, потом легаси. */
export function loadPreset(id: string): PresetPackage | null {
  if (!PRESET_ID_RE.test(id)) return null;
  const fromDir = loadFromDir(path.join(PRESETS_DIR, id));
  if (fromDir) return fromDir;
  return loadLegacy(id);
}

/** Все пресеты: пакеты + легаси-шаблоны (пакет выигрывает при совпадении id). */
export function listPresets(): PresetPackage[] {
  const byId = new Map<string, PresetPackage>();

  try {
    if (fs.existsSync(LEGACY_TEMPLATES_DIR)) {
      for (const f of fs.readdirSync(LEGACY_TEMPLATES_DIR)) {
        if (!f.endsWith('.json')) continue;
        const p = loadLegacy(f.slice(0, -5));
        if (p) byId.set(p.id, p);
      }
    }
  } catch (e) { console.warn('[PresetLoader] Ошибка чтения легаси-шаблонов:', e); }

  try {
    if (fs.existsSync(PRESETS_DIR)) {
      for (const entry of fs.readdirSync(PRESETS_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const p = loadFromDir(path.join(PRESETS_DIR, entry.name));
        if (p) byId.set(p.id, p);
      }
    }
  } catch (e) { console.warn('[PresetLoader] Ошибка чтения пресетов:', e); }

  return Array.from(byId.values());
}

/** Кастомная карта пресета (map.geojson) или null. */
export function loadPresetMap(id: string): any | null {
  if (!PRESET_ID_RE.test(id)) return null;
  const p = path.join(PRESETS_DIR, id, 'map.geojson');
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e: any) {
    console.warn('[PresetLoader] Битый map.geojson у пресета', id, '-', e.message);
  }
  return null;
}

/** Абсолютный путь к файлу флага пресета (для отдачи через sendFile). */
export function getPresetFlagPath(id: string, filename: string): string | null {
  if (!PRESET_ID_RE.test(id)) return null;
  // Защита от traversal: имя файла без каталогов
  const safe = path.basename(filename);
  if (!/^[A-Za-z0-9_-]+\.(svg|png)$/i.test(safe)) return null;
  const p = path.join(PRESETS_DIR, id, 'flags', safe);
  return fs.existsSync(p) ? p : null;
}
