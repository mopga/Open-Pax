import fs from 'node:fs';
import path from 'node:path';
import type { Mechanic } from './types';
import { ALL_MECHANICS } from './types';
import type { ModelPrice } from './pricing';

export type ProviderKind = 'openai-compatible' | 'anthropic' | 'minimax' | 'ollama';

/**
 * Как оплачивается модель: payg — за токены (считаем $), subscription —
 * подписка/token plan (считаем токены, $ = 0), local — локальная модель.
 */
export type BillingMode = 'payg' | 'subscription' | 'local';

export interface MechanicConfig {
  provider: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  retries: number;
  /** Разрешить стриминг токенов (используется для прыжка). */
  stream: boolean;
  /** Разрешить кэширование ответов (по умолчанию только advisor/suggestions/converter). */
  cache?: boolean;
  /**
   * Просить у провайдера строгий JSON (OpenAI response_format / Ollama format).
   * Включай только если провайдер это поддерживает — часть API отвечает 400.
   */
  jsonMode?: boolean;
  billing?: BillingMode;
  /** Своя цена модели; иначе встроенная таблица (llm/pricing.ts) */
  pricing?: ModelPrice;
  /** Длина контекста для локальных моделей (Ollama num_ctx) */
  contextLength?: number;
}

export type LLMConfig = Record<Mechanic, MechanicConfig>;

/**
 * Настройки консолидации истории (Этап 2).
 * Целевые модели — облачные с контекстом 256K+, поэтому дефолты выше
 * оригинальных (15 раундов): startRound=25. Для локальных моделей 8–32B
 * стоит понизить до 10–15 через llm.config.json или env.
 */
export interface ConsolidationConfig {
  /** С какого раунда начинать консолидировать */
  startRound: number;
  /** Размер чанка консолидации (раундов за одно саммари) */
  chunkSize: number;
  /** Сколько последних раундов всегда держать сырыми */
  keepRawTail: number;
}

export interface LLMFullConfig {
  mechanics: LLMConfig;
  consolidation: ConsolidationConfig;
  /** Откуда взята конфигурация — для экрана настроек */
  source?: 'settings' | 'file' | 'env';
}

/**
 * Настройки модели из UI (хранятся в SQLite, см. settings/llm-settings.ts).
 * Одно подключение и две модели: основная — для прыжка (симуляции мира),
 * лёгкая — для подсказок, конвертера, советника и консолидации.
 */
export interface UserLLMSettings {
  presetId: string;
  provider: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  lightModel?: string;
  billing: BillingMode;
  pricing?: ModelPrice;
  lightPricing?: ModelPrice;
  contextLength?: number;
  jsonMode?: boolean;
  /** Мягкий бюджет на одну игру, $ (только предупреждение в UI) */
  budgetPerGameUsd?: number;
}

/** Механики, которым достаточно лёгкой модели */
const LIGHT_MECHANICS = new Set<Mechanic>(['converter', 'advisor', 'suggestions', 'consolidation', 'narration', 'npc', 'chat']);

/** Накладывает настройки из UI поверх базовой конфигурации (файл/env). */
export function applyUserSettings(base: LLMFullConfig, settings: UserLLMSettings): LLMFullConfig {
  const mechanics = {} as LLMConfig;
  for (const m of ALL_MECHANICS) {
    const light = LIGHT_MECHANICS.has(m) && !!settings.lightModel;
    mechanics[m] = {
      ...base.mechanics[m],
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: light ? settings.lightModel! : settings.model,
      billing: settings.billing,
      pricing: light ? settings.lightPricing : settings.pricing,
      contextLength: settings.contextLength,
      jsonMode: settings.jsonMode ?? base.mechanics[m].jsonMode,
      // Локальные модели на большом промпте медленные
      timeoutMs: settings.billing === 'local' ? Math.max(base.mechanics[m].timeoutMs, 600_000) : base.mechanics[m].timeoutMs,
    };
  }
  return { ...base, mechanics, source: 'settings' };
}

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
  const envModel = process.env.LLM_MODEL || 'MiniMax-M3';
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
 * 1. llm.config.json (путь из LLM_CONFIG_PATH или рядом с cwd) — секции default + mechanics (+ consolidation).
 * 2. Env-переменные LLM_PROVIDER/LLM_BASE_URL/LLM_API_KEY/LLM_MODEL.
 * 3. Обратная совместимость: MINIMAX_API_KEY/MINIMAX_BASE_URL → все механики на MiniMax.
 */
export function loadLLMConfig(configPath?: string): LLMFullConfig {
  const file = configPath
    ?? process.env.LLM_CONFIG_PATH
    ?? path.join(process.cwd(), 'llm.config.json');
  const cfg = defaultConfig();
  const consolidation: ConsolidationConfig = {
    startRound: Number(process.env.LLM_CONSOLIDATION_START_ROUND) || 25,
    chunkSize: Number(process.env.LLM_CONSOLIDATION_CHUNK_SIZE) || 5,
    keepRawTail: Number(process.env.LLM_CONSOLIDATION_KEEP_RAW_TAIL) || 10,
  };

  let source: LLMFullConfig['source'] = 'env';
  if (fs.existsSync(file)) {
    source = 'file';
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      default?: Partial<MechanicConfig>;
      mechanics?: Partial<Record<Mechanic, Partial<MechanicConfig>>>;
      consolidation?: Partial<ConsolidationConfig>;
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
    Object.assign(consolidation, raw.consolidation ?? {});
  }

  return { mechanics: cfg, consolidation, source };
}
