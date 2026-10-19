/**
 * Open-Pax — LLM Layer: цены моделей для оценки стоимости
 * =======================================================
 * Встроенная таблица — только оценка: цены провайдеров меняются, поэтому
 * в настройках цену можно переопределить, а для OpenRouter она приходит
 * из его списка моделей. Для неизвестной модели стоимость не считается
 * (UI показывает только токены).
 */

import type { LLMUsage } from './types';

/** Цена в долларах за 1M токенов */
export interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
  /** Входные токены из prompt-кэша провайдера; по умолчанию = inputPerM */
  cachedInputPerM?: number;
}

const BUILTIN_PRICES: Record<string, ModelPrice> = {
  // Anthropic, первая сторона (2026-10)
  'claude-fable-5-1': { inputPerM: 10, outputPerM: 50, cachedInputPerM: 0.25 },
  'claude-fable-5': { inputPerM: 10, outputPerM: 50, cachedInputPerM: 1 },
  'claude-opus-5-5': { inputPerM: 4, outputPerM: 20, cachedInputPerM: 0.2 },
  'claude-opus-5': { inputPerM: 5, outputPerM: 25, cachedInputPerM: 0.5 },
  'claude-opus-4-8': { inputPerM: 5, outputPerM: 25, cachedInputPerM: 0.5 },
  'claude-opus-4-7': { inputPerM: 5, outputPerM: 25, cachedInputPerM: 0.5 },
  'claude-opus-4-6': { inputPerM: 5, outputPerM: 25, cachedInputPerM: 0.5 },
  'claude-sonnet-5-5': { inputPerM: 2, outputPerM: 10, cachedInputPerM: 0.2 },
  'claude-sonnet-5': { inputPerM: 2, outputPerM: 10, cachedInputPerM: 0.2 },
  'claude-sonnet-4-6': { inputPerM: 3, outputPerM: 15, cachedInputPerM: 0.3 },
  'claude-haiku-5-5': { inputPerM: 0.1, outputPerM: 0.5, cachedInputPerM: 0.01 },
  'claude-haiku-4-5': { inputPerM: 1, outputPerM: 5, cachedInputPerM: 0.1 },
  // DeepSeek (2026-10, пиковый тариф — консервативная оценка)
  'deepseek-v4-pro': { inputPerM: 1.32, outputPerM: 3.96, cachedInputPerM: 0.044 },
  'deepseek-flash': { inputPerM: 0.3, outputPerM: 1.2, cachedInputPerM: 0.006 },
  'deepseek-v4-flash': { inputPerM: 0.3, outputPerM: 1.2, cachedInputPerM: 0.006 },
};

/** Встроенная цена по id модели; понимает префикс OpenRouter ("anthropic/claude-…"). */
export function builtinPrice(model: string): ModelPrice | undefined {
  const id = model.trim().toLowerCase();
  return BUILTIN_PRICES[id] ?? BUILTIN_PRICES[id.split('/').pop() ?? ''];
}

export function estimateCostUsd(usage: LLMUsage, price: ModelPrice): number {
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const fresh = usage.inputTokens - cached;
  const cachedRate = price.cachedInputPerM ?? price.inputPerM;
  return (fresh * price.inputPerM + cached * cachedRate + usage.outputTokens * price.outputPerM) / 1_000_000;
}
