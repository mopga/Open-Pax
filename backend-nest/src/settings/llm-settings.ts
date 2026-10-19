/**
 * Open-Pax — настройки подключения к LLM из UI
 * =============================================
 * Пользователь выбирает пресет провайдера, вставляет свой ключ (или
 * указывает локальный сервер) и модели. Настройки лежат в SQLite и
 * накладываются поверх llm.config.json/env (см. applyUserSettings).
 *
 * Ключ никогда не уходит во фронтенд целиком — только маска. При смене
 * провайдера или адреса сохранённый ключ НЕ переиспользуется: иначе
 * любой, кто может дёрнуть API, перенаправил бы ключ на свой сервер.
 */

import {
  applyUserSettings, buildProvider, loadLLMConfig,
  type BillingMode, type LLMRouter, type MechanicConfig, type ModelPrice,
  type ProviderKind, type UserLLMSettings,
} from '../llm';
import { normalizeOllamaBaseUrl } from '../llm/ollama';
import { settingsRepository } from '../repositories/settings.repository';

const SETTINGS_KEY = 'llm';

export interface ProviderPreset {
  id: string;
  label: string;
  provider: ProviderKind;
  baseUrl: string;
  keyRequired: boolean;
  billing: BillingMode;
  model?: string;
  lightModel?: string;
  contextLength?: number;
  /** Где взять ключ */
  keyUrl?: string;
  hint?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek', label: 'DeepSeek', provider: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com', keyRequired: true, billing: 'payg',
    model: 'deepseek-v4-pro', lightModel: 'deepseek-flash',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'llamacpp', label: 'llama.cpp (локально)', provider: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:8085/v1', keyRequired: false, billing: 'local',
    hint: 'Запустите llama-server с --jinja и --ctx-size не меньше 32768: промпт симуляции большой.',
  },
  {
    id: 'ollama', label: 'Ollama (локально)', provider: 'ollama',
    baseUrl: 'http://localhost:11434', keyRequired: false, billing: 'local', contextLength: 32768,
    hint: 'Длина контекста передаётся в запросе (num_ctx); чем больше, тем больше VRAM.',
  },
  {
    id: 'lmstudio', label: 'LM Studio (локально)', provider: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1', keyRequired: false, billing: 'local',
    hint: 'Длину контекста задайте в LM Studio при загрузке модели (от 32768).',
  },
  {
    id: 'minimax', label: 'MiniMax (Token Plan)', provider: 'minimax',
    baseUrl: 'https://api.minimax.io/v1', keyRequired: true, billing: 'subscription',
    model: 'MiniMax-M3',
  },
  {
    id: 'zai', label: 'Z.ai GLM Coding Plan', provider: 'openai-compatible',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4', keyRequired: true, billing: 'subscription',
    hint: 'Сверьте адрес эндпоинта с личным кабинетом Z.ai.',
  },
  {
    id: 'openrouter', label: 'OpenRouter', provider: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1', keyRequired: true, billing: 'payg',
    keyUrl: 'https://openrouter.ai/keys', hint: 'Цены моделей подтянутся из списка OpenRouter.',
  },
  {
    id: 'anthropic', label: 'Anthropic (Claude)', provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com', keyRequired: true, billing: 'payg',
    model: 'claude-opus-5-5', lightModel: 'claude-haiku-5-5',
    keyUrl: 'https://platform.claude.com/settings/keys',
  },
  {
    id: 'openai', label: 'OpenAI', provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1', keyRequired: true, billing: 'payg',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'gemini', label: 'Google Gemini', provider: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyRequired: true, billing: 'payg',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'moonshot', label: 'Moonshot (Kimi)', provider: 'openai-compatible',
    baseUrl: 'https://api.moonshot.ai/v1', keyRequired: true, billing: 'payg',
  },
  {
    id: 'custom', label: 'Другой OpenAI-совместимый', provider: 'openai-compatible',
    baseUrl: '', keyRequired: false, billing: 'payg',
  },
];

const PROVIDER_KINDS: ProviderKind[] = ['openai-compatible', 'anthropic', 'minimax', 'ollama'];
const BILLING_MODES: BillingMode[] = ['payg', 'subscription', 'local'];

export class SettingsValidationError extends Error {}

/** Кандидат настроек из запроса (ключ может отсутствовать — тогда берём сохранённый). */
export interface LLMSettingsInput {
  presetId?: unknown;
  provider?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  model?: unknown;
  lightModel?: unknown;
  billing?: unknown;
  pricing?: unknown;
  lightPricing?: unknown;
  contextLength?: unknown;
  jsonMode?: unknown;
  budgetPerGameUsd?: unknown;
}

export function loadSavedSettings(): UserLLMSettings | null {
  return settingsRepository.get<UserLLMSettings>(SETTINGS_KEY);
}

function normalizeBaseUrl(provider: ProviderKind, url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return provider === 'ollama' ? normalizeOllamaBaseUrl(trimmed) : trimmed;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parsePrice(v: unknown, field: string): ModelPrice | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'object') throw new SettingsValidationError(`${field}: ожидается объект цены`);
  const p = v as Record<string, unknown>;
  const num = (x: unknown, name: string, optional = false): number | undefined => {
    if (optional && (x === undefined || x === null || x === '')) return undefined;
    const n = Number(x);
    if (!Number.isFinite(n) || n < 0) throw new SettingsValidationError(`${field}.${name}: неотрицательное число`);
    return n;
  };
  return {
    inputPerM: num(p.inputPerM, 'inputPerM')!,
    outputPerM: num(p.outputPerM, 'outputPerM')!,
    ...(num(p.cachedInputPerM, 'cachedInputPerM', true) !== undefined
      ? { cachedInputPerM: num(p.cachedInputPerM, 'cachedInputPerM', true) } : {}),
  };
}

/**
 * Проверяет кандидата и разрешает ключ. Пустой ключ = «оставить
 * сохранённый», но только если провайдер и адрес не менялись.
 */
export function resolveSettings(input: LLMSettingsInput, saved: UserLLMSettings | null): UserLLMSettings {
  const presetId = str(input.presetId) || 'custom';
  const preset = PROVIDER_PRESETS.find(p => p.id === presetId);
  if (!preset) throw new SettingsValidationError(`Неизвестный пресет: ${presetId}`);

  const provider = (str(input.provider) || preset.provider) as ProviderKind;
  if (!PROVIDER_KINDS.includes(provider)) throw new SettingsValidationError(`Неизвестный провайдер: ${provider}`);

  const rawUrl = str(input.baseUrl) || preset.baseUrl;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SettingsValidationError('Укажите корректный адрес API (http:// или https://)');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SettingsValidationError('Адрес API должен начинаться с http:// или https://');
  }
  const baseUrl = normalizeBaseUrl(provider, rawUrl);

  const model = str(input.model);
  if (!model) throw new SettingsValidationError('Укажите основную модель');
  const lightModel = str(input.lightModel) || undefined;

  const billing = (str(input.billing) || preset.billing) as BillingMode;
  if (!BILLING_MODES.includes(billing)) throw new SettingsValidationError(`Неизвестный тип оплаты: ${billing}`);

  let contextLength: number | undefined;
  if (input.contextLength !== undefined && input.contextLength !== null && input.contextLength !== '') {
    contextLength = Number(input.contextLength);
    if (!Number.isInteger(contextLength) || contextLength < 2048 || contextLength > 1_048_576) {
      throw new SettingsValidationError('Длина контекста: целое число от 2048 до 1048576');
    }
  } else if (preset.contextLength) {
    contextLength = preset.contextLength;
  }

  let budgetPerGameUsd: number | undefined;
  if (input.budgetPerGameUsd !== undefined && input.budgetPerGameUsd !== null && input.budgetPerGameUsd !== '') {
    budgetPerGameUsd = Number(input.budgetPerGameUsd);
    if (!Number.isFinite(budgetPerGameUsd) || budgetPerGameUsd < 0) {
      throw new SettingsValidationError('Бюджет на игру: неотрицательное число');
    }
  }

  let apiKey = str(input.apiKey);
  if (!apiKey && saved?.apiKey && saved.provider === provider
    && normalizeBaseUrl(saved.provider, saved.baseUrl) === baseUrl) {
    apiKey = saved.apiKey;
  }
  if (!apiKey && preset.keyRequired) {
    throw new SettingsValidationError(saved?.apiKey
      ? 'Адрес или провайдер изменились — введите API-ключ заново'
      : 'Введите API-ключ');
  }

  return {
    presetId, provider, baseUrl, apiKey, model, billing,
    ...(lightModel ? { lightModel } : {}),
    ...(parsePrice(input.pricing, 'pricing') ? { pricing: parsePrice(input.pricing, 'pricing') } : {}),
    ...(parsePrice(input.lightPricing, 'lightPricing') ? { lightPricing: parsePrice(input.lightPricing, 'lightPricing') } : {}),
    ...(contextLength ? { contextLength } : {}),
    ...(typeof input.jsonMode === 'boolean' ? { jsonMode: input.jsonMode } : {}),
    ...(budgetPerGameUsd !== undefined ? { budgetPerGameUsd } : {}),
  };
}

export function maskKey(key: string): string {
  if (!key) return '';
  return key.length > 10 ? `${key.slice(0, 3)}…${key.slice(-4)}` : '••••';
}

/** Настройки для фронтенда — без ключа. */
export function publicSettings(s: UserLLMSettings | null) {
  if (!s) return null;
  const { apiKey, ...rest } = s;
  return { ...rest, hasApiKey: !!apiKey, apiKeyMasked: maskKey(apiKey) };
}

export function saveSettings(s: UserLLMSettings): void {
  settingsRepository.set(SETTINGS_KEY, s);
}

export function clearSettings(): void {
  settingsRepository.delete(SETTINGS_KEY);
}

/** Пересобирает конфиг роутера: файл/env + сохранённые настройки из UI. */
export function applySavedSettings(router: LLMRouter): void {
  const base = loadLLMConfig();
  const saved = loadSavedSettings();
  router.reconfigure(saved ? applyUserSettings(base, saved) : base);
}

function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

/** Готова ли модель симуляции к работе (иначе UI показывает онбординг). */
export function isConfigured(router: LLMRouter): boolean {
  const jump = router.mechanicConfig('jump');
  return !!jump.apiKey || jump.billing === 'local' || isLocalUrl(jump.baseUrl);
}

function mechanicConfigFor(s: UserLLMSettings, model: string): MechanicConfig {
  return {
    provider: s.provider, baseUrl: s.baseUrl, apiKey: s.apiKey, model,
    timeoutMs: s.billing === 'local' ? 300_000 : 60_000, retries: 0, stream: false,
    billing: s.billing, contextLength: s.contextLength,
  };
}

export interface ConnectionTestResult {
  ok: boolean;
  model: string;
  latencyMs: number;
  reply?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Короткий запрос к модели: проверяет адрес, ключ и имя модели. */
export async function testConnection(s: UserLLMSettings, model = s.model): Promise<ConnectionTestResult> {
  const started = Date.now();
  try {
    const provider = buildProvider(mechanicConfigFor(s, model));
    // Запас по токенам: reasoning-модели тратят часть на рассуждения
    const res = await provider.generate(
      'Ты — проверка связи для игры Open-Pax.',
      'Ответь ровно одним словом: OK',
      { maxTokens: 1024, temperature: 0 },
    );
    return {
      ok: true, model, latencyMs: Date.now() - started,
      reply: res.content.trim().substring(0, 200),
      inputTokens: res.usage?.inputTokens, outputTokens: res.usage?.outputTokens,
    };
  } catch (e) {
    return { ok: false, model, latencyMs: Date.now() - started, error: (e as Error)?.message || String(e) };
  }
}

export interface RemoteModel {
  id: string;
  /** Цена из списка провайдера (OpenRouter) */
  pricing?: ModelPrice;
}

async function getJson(url: string, headers: Record<string, string>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e: any) {
    throw new Error(e?.name === 'AbortError' ? 'таймаут запроса списка моделей' : (e?.message || String(e)));
  } finally {
    clearTimeout(timer);
  }
}

/** Список моделей у провайдера (для выпадающего списка в настройках). */
export async function listModels(s: UserLLMSettings): Promise<RemoteModel[]> {
  let models: RemoteModel[];
  if (s.provider === 'ollama') {
    const data = await getJson(`${s.baseUrl}/api/tags`, {});
    models = (data?.models ?? []).map((m: any) => ({ id: String(m.name) }));
  } else if (s.provider === 'anthropic') {
    const base = s.baseUrl.replace(/\/v1$/, '');
    const data = await getJson(`${base}/v1/models?limit=100`, {
      'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01',
    });
    models = (data?.data ?? []).map((m: any) => ({ id: String(m.id) }));
  } else {
    const data = await getJson(`${s.baseUrl}/models`, s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {});
    models = (data?.data ?? data?.models ?? []).map((m: any) => {
      // OpenRouter: pricing.prompt/completion — строки, $ за токен
      const prompt = Number(m?.pricing?.prompt);
      const completion = Number(m?.pricing?.completion);
      const cacheRead = Number(m?.pricing?.input_cache_read);
      return {
        id: String(m.id ?? m.name),
        ...(Number.isFinite(prompt) && Number.isFinite(completion) ? {
          pricing: {
            inputPerM: +(prompt * 1e6).toFixed(4),
            outputPerM: +(completion * 1e6).toFixed(4),
            ...(Number.isFinite(cacheRead) ? { cachedInputPerM: +(cacheRead * 1e6).toFixed(4) } : {}),
          },
        } : {}),
      };
    });
  }
  return models.filter(m => m.id && m.id !== 'undefined').sort((a, b) => a.id.localeCompare(b.id)).slice(0, 1000);
}
