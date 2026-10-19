/**
 * Open-Pax — LLM Layer: учёт вызовов (usage ledger)
 * ==================================================
 * Роутер сообщает о каждом вызове в UsageSink; к какой игре относится
 * вызов, берётся из AsyncLocalStorage-контекста, который ставит
 * HTTP-middleware для /api/games/:id/* (см. index.ts). Так не нужно
 * протаскивать gameId через все агенты и промпт-билдеры.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Mechanic } from './types';

export interface LLMCallContext {
  gameId?: string | null;
}

const storage = new AsyncLocalStorage<LLMCallContext>();

export function runWithLLMContext<T>(ctx: LLMCallContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentLLMContext(): LLMCallContext {
  return storage.getStore() ?? {};
}

export interface LLMCallRecord {
  gameId: string | null;
  mechanic: Mechanic;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  /** Провайдер не вернул usage — числа оценены по длине текста */
  estimated: boolean;
  /** Ответ взят из локального кэша роутера, провайдер не вызывался */
  cacheHit: boolean;
  latencyMs: number;
  ok: boolean;
  error?: string;
  /** null — цена модели неизвестна (показываем только токены) */
  costUsd: number | null;
}

export type UsageSink = (record: LLMCallRecord) => void;

/**
 * Грубая оценка токенов по длине текста, когда провайдер не прислал usage.
 * ~3 символа на токен — компромисс между английским (~4) и русским (~2.5).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}
