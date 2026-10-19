/**
 * Open-Pax — Color Utils
 * ======================
 * Пост-обработка палитры регионов для тёмной карты фронта (#0a0a0f).
 *
 * Проблема: цвета флагов из реестра data/countries.json — «сырые»
 * (#FF0000, #000000). Чёрные регионы невидимы на тёмном фоне, а множество
 * красных оттенков сливаются в «красную карту». Решения:
 *  - кураторская палитра пресета (country_colors в preset.json) — приоритет;
 *  - анти-тёмный post-process для остальных цветов: если относительная
 *    яркость ниже порога — микс с белым (~45%), регион становится читаемым.
 */

/** Порог относительной яркости: ниже — цвет считается слишком тёмным. */
export const DARK_LUMINANCE_THRESHOLD = 0.18;

/** Доля белого в миксе при осветлении тёмного цвета. */
export const LIGHTEN_MIX = 0.45;

/** Цвет по умолчанию (нейтральные/невалидные). */
export const FALLBACK_COLOR = '#888888';

interface Rgb { r: number; g: number; b: number }

/** Разобрать #RGB / #RRGGBB в каналы 0..255; null — невалидный ввод. */
function parseHex(hex: string): Rgb | null {
  if (typeof hex !== 'string') return null;
  let h = hex.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h.split('').map(c => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Нормализация к #RRGGBB (uppercase); null — невалидный ввод. */
export function normalizeHexColor(hex: string): string | null {
  const rgb = parseHex(hex);
  return rgb ? toHex(rgb) : null;
}

/**
 * Относительная яркость 0..1: 0.2126R + 0.7152G + 0.0722B (каналы 0..1).
 * null — невалидный цвет.
 */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

/** Микс с белым: channel' = channel + (255 - channel) * amount. */
export function lighten(hex: string, amount: number = LIGHTEN_MIX): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const mix = (c: number) => c + (255 - c) * amount;
  return toHex({ r: mix(rgb.r), g: mix(rgb.g), b: mix(rgb.b) });
}

/**
 * Анти-тёмный post-process: цвет с яркостью ниже threshold осветляется
 * миксом с белым (~45%), иначе возвращается нормализованным (#RRGGBB).
 * Невалидный ввод → FALLBACK_COLOR.
 */
export function ensureVisibleOnDark(hex: string, threshold: number = DARK_LUMINANCE_THRESHOLD): string {
  const lum = relativeLuminance(hex);
  if (lum === null) return FALLBACK_COLOR;
  if (lum >= threshold) return toHex(parseHex(hex)!);
  return lighten(hex, LIGHTEN_MIX);
}

/**
 * Цвет региона при генерации мира:
 *  1. если у пресета есть кураторский цвет для кода страны (country_colors) — он;
 *  2. иначе — прежний цвет (реестр/пресет countries[]) + анти-тёмный post-process.
 */
/**
 * Детерминированный цвет страны по коду — для стран вне реестра и палитры
 * пресета. Приглушённые насыщенные тона в духе политических карт; один и тот
 * же код всегда получает один цвет.
 */
export function colorFromCode(code: string): string {
  let h = 2166136261;
  for (const ch of code) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  const sat = 0.42 + ((h >>> 9) % 20) / 100;   // 0.42–0.61
  const light = 0.46 + ((h >>> 17) % 14) / 100; // 0.46–0.59
  // HSL → RGB
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return toHex({ r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) });
}

export function resolveRegionColor(
  code: string,
  fallback: string | undefined,
  presetColors?: Record<string, string>,
): string {
  const curated = presetColors?.[code];
  if (typeof curated === 'string' && normalizeHexColor(curated)) {
    return normalizeHexColor(curated)!;
  }
  return ensureVisibleOnDark(fallback || FALLBACK_COLOR);
}
