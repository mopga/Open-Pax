/**
 * Open-Pax — Prompt Overrides (переопределяемые промпты пресета)
 * ==============================================================
 * У оригинальной Pax Historia каждый пресет может переопределять промпты ИИ
 * (экран «Редактировать промпты ИИ»). Здесь — аналог: необязательная секция
 * "prompts" в preset.json:
 *
 *   "prompts": {
 *     "simulation": "Текст промпта с плейсхолдерами ${PLAYER_POLITY} ...",
 *     "suggestions": "..."
 *   }
 *
 * Секция едет с миром (колонка worlds.prompts, JSON). При сборке промпта
 * механики сначала смотрится переопределение мира; если его нет — дефолтный
 * builder. Плейсхолдеры — переменные PromptVariables в форме ${VAR} или
 * {{VAR}}; регистр не важен (${language} тоже найдёт LANGUAGE — совместимость
 * с текстами оригинала). Неизвестные плейсхолдеры остаются как есть, чтобы
 * опечатку было видно в логах, а не съедало молча.
 */

import { PromptVariables } from './types';

/** Переопределения промптов: ключ — механика, значение — текст шаблона. */
export type PromptOverrides = Record<string, string>;

/**
 * Механики с поддержкой переопределений и принимаемые ключи секции "prompts".
 * 'jump' — алиас 'simulation' (так механика называется в LLM-роутере).
 */
export const PROMPT_MECHANIC_KEYS: Record<string, string[]> = {
  simulation: ['simulation', 'jump'],
  converter: ['converter'],
  suggestions: ['suggestions'],
  advisor: ['advisor'],
};

/** Механики, для которых есть переопределения (для доков/валидации). */
export const OVERRIDABLE_MECHANICS = Object.keys(PROMPT_MECHANIC_KEYS);

/**
 * Найти переопределение для механики с учётом алиасов ключей.
 * Пустая/не-строковая запись игнорируется.
 */
export function getPromptOverride(
  overrides: PromptOverrides | undefined | null,
  mechanic: keyof typeof PROMPT_MECHANIC_KEYS,
): string | undefined {
  if (!overrides) return undefined;
  for (const key of PROMPT_MECHANIC_KEYS[mechanic] ?? [mechanic]) {
    const value = overrides[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

// ${VAR} или {{VAR}}; внутри — идентификатор (допускаем lowercase для ${language})
const PLACEHOLDER_RE = /\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}|\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/**
 * Подставить переменные промпта в шаблон пресета.
 * Значения — из PromptVariables; числа приводятся к строке. Плейсхолдер,
 * которого нет среди переменных, остаётся в тексте без изменений.
 */
export function renderPromptTemplate(template: string, vars: PromptVariables): string {
  const dict = vars as unknown as Record<string, unknown>;
  return template.replace(PLACEHOLDER_RE, (match, a: string | undefined, b: string | undefined) => {
    const key = (a ?? b)!;
    const value = dict[key] ?? dict[key.toUpperCase()];
    return value === undefined || value === null ? match : String(value);
  });
}
