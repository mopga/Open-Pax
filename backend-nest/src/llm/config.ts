import fs from 'node:fs';
import path from 'node:path';
import type { Mechanic } from './types';
import { ALL_MECHANICS } from './types';

export interface MechanicConfig {
  provider: 'openai-compatible' | 'anthropic' | 'minimax';
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  retries: number;
  /** Разрешить стриминг токенов (используется для прыжка). */
  stream: boolean;
  /** Разрешить кэширование ответов (по умолчанию только advisor/suggestions/converter). */
  cache?: boolean;
}

export type LLMConfig = Record<Mechanic, MechanicConfig>;

const DEFAULT_CACHE_MECHANICS = new Set<Mechanic>(['advisor', 'suggestions', 'converter']);

function resolveApiKey(raw: string | undefined): string {
  if (raw && raw.startsWith('env:')) {
    return process.env[raw.slice(4)] ?? '';
  }
  return raw ?? '';
}

function defaultConfig(): LLMConfig {
  const envKey = process.env.LLM_API_KEY || process.env.MINIMAX_API_KEY || '';
  const envBase = process.env.LLM_BASE_URL || process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1';
  const envModel = process.env.LLM_MODEL || 'MiniMax-M2.5';
  const envProvider = (process.env.LLM_PROVIDER as MechanicConfig['provider']) || 'minimax';
  const cfg = {} as LLMConfig;
  for (const m of ALL_MECHANICS) {
    cfg[m] = {
      provider: envProvider, baseUrl: envBase, apiKey: envKey, model: envModel,
      timeoutMs: 120_000, retries: 2, stream: true, cache: DEFAULT_CACHE_MECHANICS.has(m),
    };
  }
  return cfg;
}

/**
 * Загружает конфигурацию LLM. Приоритет:
 * 1. llm.config.json (путь из LLM_CONFIG_PATH или рядом с cwd) — секции default + mechanics.
 * 2. Env-переменные LLM_PROVIDER/LLM_BASE_URL/LLM_API_KEY/LLM_MODEL.
 * 3. Обратная совместимость: MINIMAX_API_KEY/MINIMAX_BASE_URL → все механики на MiniMax.
 */
export function loadLLMConfig(configPath?: string): LLMConfig {
  const file = configPath
    ?? process.env.LLM_CONFIG_PATH
    ?? path.join(process.cwd(), 'llm.config.json');
  const cfg = defaultConfig();
  if (!fs.existsSync(file)) return cfg;

  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    default?: Partial<MechanicConfig>;
    mechanics?: Partial<Record<Mechanic, Partial<MechanicConfig>>>;
  };
  const base: Partial<MechanicConfig> = raw.default ?? {};
  for (const m of ALL_MECHANICS) {
    const merged = { ...cfg[m], ...base, ...(raw.mechanics?.[m] ?? {}) };
    merged.apiKey = resolveApiKey(merged.apiKey);
    if (merged.cache === undefined) merged.cache = DEFAULT_CACHE_MECHANICS.has(m);
    if (!merged.baseUrl || !merged.model) {
      throw new Error(`llm.config.json: механика "${m}": нужно указать baseUrl и model`);
    }
    cfg[m] = merged;
  }
  return cfg;
}
