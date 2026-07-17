/**
 * Open-Pax — LLM Layer: MiniMax
 * ==============================
 * MiniMax говорит в OpenAI-формате сообщений, но по собственному пути
 * (/v1/text/chatcompletion_v2) — поэтому это фабрика над
 * OpenAI-совместимым провайдером, а не отдельная реализация.
 */

import { OpenAICompatibleProvider } from './openai-compatible';
import type { LLMProvider } from './types';

export interface MiniMaxOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;         // default https://api.minimax.io/v1
  timeoutMs?: number;
  retries?: number;
}

export function createMiniMaxProvider(opts: MiniMaxOptions): LLMProvider {
  const baseUrl = (opts.baseUrl || 'https://api.minimax.io/v1').replace(/\/+$/, '');
  return new OpenAICompatibleProvider({
    name: 'minimax',
    baseUrl,
    apiKey: opts.apiKey,
    model: opts.model,
    chatPath: '/text/chatcompletion_v2',
    timeoutMs: opts.timeoutMs,
    retries: opts.retries,
  });
}
