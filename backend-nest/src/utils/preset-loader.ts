/**
 * Open-Pax — Preset Loader
 * ========================
 * Пресет = каталог data/presets/<id>/:
 *   preset.json   — данные сценария (формат ниже)
 *   rules.md      — правила симуляции (→ HISTORICAL_PRESET_SIMULATION_RULES)
 *   lore.md       — мир до первого раунда (→ WORLD_BEFORE_ROUND_ONE_TEXT)
 *   map.geojson   — своя карта (FeatureCollection, properties.code) вместо регионов Natural Earth
 *   flags/        — <CODE>.svg|png флаги
 *
 * preset.json, формат 2 (как у PaxHistoria: готовые данные, без генерации ИИ при старте):
 *   id, name, description, start_date, base_prompt — сценарий;
 *   language: "ru" | "en" — язык названий на карте (по умолчанию "ru");
 *   polities: { "<КОД>": { name?, color?, members?, description? } } — государства,
 *     которые отличаются от карты Natural Earth. Все остальные страны карты —
 *     самостоятельные государства с именем и цветом по умолчанию.
 *     members — коды стран карты, чьи регионы при старте принадлежат государству
 *     (СССР = RUS + UKR + …). description видит ИИ в описании карты;
 *   recommended: ["<КОД>", …] — рекомендуемые государства (игрок может выбрать любое);
 *   prompts: { "<механика>": "<шаблон с ${VAR}>" } — переопределение промптов ИИ;
 *   historical_accuracy, author, version.
 *
 * Формат 1 (country_codes, countries, country_colors, polity_members) читается
 * и приводится к формату 2 при загрузке.
 */

import fs from 'fs';
import path from 'path';

export const PRESETS_DIR = path.join(process.cwd(), 'data', 'presets');

/** Государство пресета; незаданные поля берутся из справочников карты */
export interface PresetPolity {
  name?: string;
  color?: string;
  /** Коды стран карты, входящих в государство (кроме его собственного кода) */
  members?: string[];
  /** Описание для ИИ */
  description?: string;
}

export type PresetLanguage = 'ru' | 'en';

export interface PresetPackage {
  id: string;
  name: string;
  description: string;
  start_date: string;
  base_prompt: string;
  historical_accuracy?: number;
  language: PresetLanguage;
  /** Государства пресета по коду */
  polities: Record<string, PresetPolity>;
  /** Рекомендуемые государства — в порядке показа */
  recommended: string[];
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
}

export const PRESET_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const CODE_RE = /^[A-Z]{3}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

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

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function checkCodes(list: unknown, what: string): string[] {
  if (!Array.isArray(list) || !list.every(c => typeof c === 'string' && CODE_RE.test(c))) {
    throw new Error(`${what} — нужен массив кодов ISO_A3, например ["USA", "RUS"]`);
  }
  return list;
}

/** Формат 1 → государства и рекомендуемые формата 2 */
function politiesFromV1(raw: any, context: string): { polities: Record<string, PresetPolity>; recommended: string[]; language: PresetLanguage } {
  const codes = checkCodes(raw.country_codes, `${context}: country_codes`);
  if (codes.length === 0) throw new Error(`${context}: country_codes должен быть непустым массивом кодов`);

  if (raw.countries !== undefined) {
    if (!Array.isArray(raw.countries)) throw new Error(`${context}: countries должен быть массивом`);
    for (const c of raw.countries) {
      if (!c || typeof c.code !== 'string' || typeof c.name !== 'string') {
        throw new Error(`${context}: countries[] требует {code, name, color?}`);
      }
    }
  }
  if (raw.country_colors !== undefined) {
    if (!isPlainObject(raw.country_colors)) {
      throw new Error(`${context}: country_colors должен быть объектом { "USA": "#RRGGBB" }`);
    }
    for (const [code, color] of Object.entries(raw.country_colors)) {
      if (!CODE_RE.test(code) || typeof color !== 'string' || !COLOR_RE.test(color)) {
        throw new Error(`${context}: country_colors["${code}"] — нужен код ISO_A3 и цвет вида "#RRGGBB"`);
      }
    }
  }
  if (raw.polity_members !== undefined && !isPlainObject(raw.polity_members)) {
    throw new Error(`${context}: polity_members должен быть объектом { "YUG": ["SRB", "HRV"] }`);
  }

  const polities: Record<string, PresetPolity> = {};
  const countries: any[] = raw.countries ?? [];
  for (const code of codes) {
    const c = countries.find(x => x.code === code);
    const color: string | undefined = raw.country_colors?.[code] ?? c?.color;
    polities[code] = {
      ...(c?.name ? { name: c.name } : {}),
      ...(color ? { color } : {}),
    };
  }
  for (const [code, members] of Object.entries(raw.polity_members ?? {})) {
    polities[code] = { ...(polities[code] ?? {}), members: checkCodes(members, `${context}: polity_members["${code}"]`) };
  }
  // Раньше имена брались из countries.json (английские), если пресет не задавал свои
  const language: PresetLanguage = countries.some(c => /[А-Яа-яЁё]/.test(c.name)) ? 'ru' : 'en';
  return { polities, recommended: codes, language };
}

/** Валидация содержимого preset.json. Бросает Error с понятным сообщением. */
export function validatePresetJson(raw: any, context = 'preset.json'): Omit<PresetPackage, 'has_custom_map' | 'flags'> {
  if (!isPlainObject(raw)) throw new Error(`${context}: не объект`);
  if (typeof raw.id !== 'string' || !PRESET_ID_RE.test(raw.id)) {
    throw new Error(`${context}: поле id обязательно и должно соответствовать ${PRESET_ID_RE}`);
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) throw new Error(`${context}: поле name обязательно`);
  if (typeof raw.base_prompt !== 'string' || !raw.base_prompt.trim()) {
    throw new Error(`${context}: поле base_prompt обязательно`);
  }

  let polities: Record<string, PresetPolity>;
  let recommended: string[];
  let language: PresetLanguage;

  if (raw.polities === undefined && raw.country_codes !== undefined) {
    ({ polities, recommended, language } = politiesFromV1(raw, context));
  } else {
    if (raw.polities !== undefined && !isPlainObject(raw.polities)) {
      throw new Error(`${context}: polities должен быть объектом { "USA": { "name": "США", "color": "#RRGGBB" } }`);
    }
    polities = {};
    for (const [code, p] of Object.entries<any>(raw.polities ?? {})) {
      if (!CODE_RE.test(code)) throw new Error(`${context}: polities — невалидный код "${code}" (нужен ISO_A3, например USA)`);
      if (!isPlainObject(p)) throw new Error(`${context}: polities["${code}"] должен быть объектом`);
      if (p.name !== undefined && (typeof p.name !== 'string' || !p.name.trim())) {
        throw new Error(`${context}: polities["${code}"].name должен быть непустой строкой`);
      }
      if (p.color !== undefined && (typeof p.color !== 'string' || !COLOR_RE.test(p.color))) {
        throw new Error(`${context}: polities["${code}"].color должен быть цветом вида "#RRGGBB"`);
      }
      if (p.description !== undefined && typeof p.description !== 'string') {
        throw new Error(`${context}: polities["${code}"].description должен быть строкой`);
      }
      polities[code] = {
        ...(p.name ? { name: p.name.trim() } : {}),
        ...(p.color ? { color: p.color } : {}),
        ...(p.members !== undefined ? { members: checkCodes(p.members, `${context}: polities["${code}"].members`) } : {}),
        ...(p.description?.trim() ? { description: p.description.trim() } : {}),
      };
    }
    recommended = raw.recommended === undefined ? Object.keys(polities) : checkCodes(raw.recommended, `${context}: recommended`);
    if (raw.language !== undefined && raw.language !== 'ru' && raw.language !== 'en') {
      throw new Error(`${context}: language должен быть "ru" или "en"`);
    }
    language = raw.language ?? 'ru';
  }

  // Страна может входить только в одно государство
  const owner: Record<string, string> = {};
  for (const [code, p] of Object.entries(polities)) {
    for (const m of p.members ?? []) {
      if (owner[m] && owner[m] !== code) {
        throw new Error(`${context}: страна ${m} входит и в ${owner[m]}, и в ${code}`);
      }
      owner[m] = code;
    }
  }

  if (raw.prompts !== undefined) {
    if (!isPlainObject(raw.prompts)) {
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
    base_prompt: raw.base_prompt,
    historical_accuracy: typeof raw.historical_accuracy === 'number' ? raw.historical_accuracy : undefined,
    language,
    polities,
    recommended,
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
    };
  } catch (e: any) {
    console.warn('[PresetLoader] Пропускаю битый пресет', dir, '-', e.message);
    return null;
  }
}

/** Загрузить пресет по id из data/presets/<id>. */
export function loadPreset(id: string): PresetPackage | null {
  if (!PRESET_ID_RE.test(id)) return null;
  return loadFromDir(path.join(PRESETS_DIR, id));
}

/** Все пресеты из data/presets. */
export function listPresets(): PresetPackage[] {
  const out: PresetPackage[] = [];
  try {
    if (fs.existsSync(PRESETS_DIR)) {
      for (const entry of fs.readdirSync(PRESETS_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const p = loadFromDir(path.join(PRESETS_DIR, entry.name));
        if (p) out.push(p);
      }
    }
  } catch (e) { console.warn('[PresetLoader] Ошибка чтения пресетов:', e); }
  return out;
}

/** Своя карта пресета (map.geojson) или null. */
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
