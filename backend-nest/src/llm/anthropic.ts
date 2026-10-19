/**
 * Open-Pax — LLM Layer: Anthropic (официальный SDK, Messages API)
 * ================================================================
 * Всегда стримим: у современных моделей Claude thinking включён и съедает
 * часть max_tokens, а большой max_tokens без стриминга упирается в
 * HTTP-таймауты. generate() — тот же стрим, просто без колбэка.
 *
 * temperature не передаём: модели Claude 4.7+ отвечают 400 на
 * нестандартные параметры сэмплинга.
 */

import Anthropic from '@anthropic-ai/sdk';
import { LLMError, type LLMGenerateOptions, type LLMProvider, type LLMResponse, type LLMUsage } from './types';

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;         // default https://api.anthropic.com
  timeoutMs?: number;
  retries?: number;
}

const OFFICIAL_BASE_URL = 'https://api.anthropic.com';
/** Минимальный max_tokens: thinking тратит токены до ответа */
const MIN_MAX_TOKENS = 16_000;
/**
 * Модели, для которых на официальном API включаем серверный fallback при
 * отказе классификаторов (fallbacks: "default"). Через прокси/совместимые
 * эндпоинты параметр не шлём — они его не знают.
 */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;

  private client: Anthropic;
  private official: boolean;

  constructor(opts: AnthropicOptions) {
    this.model = opts.model;
    const baseURL = (opts.baseUrl || OFFICIAL_BASE_URL).replace(/\/+$/, '').replace(/\/v1$/, '');
    this.official = baseURL === OFFICIAL_BASE_URL;
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      baseURL,
      timeout: opts.timeoutMs ?? 600_000,
      maxRetries: opts.retries ?? 2,
    });
  }

  async generate(system: string, user: string, options: LLMGenerateOptions = {}): Promise<LLMResponse> {
    return this.run(system, user, options);
  }

  async stream(
    system: string,
    user: string,
    onToken: (charsSoFar: number) => void,
    options: LLMGenerateOptions = {}
  ): Promise<LLMResponse> {
    return this.run(system, user, options, onToken);
  }

  private async run(
    system: string,
    user: string,
    options: LLMGenerateOptions,
    onToken?: (charsSoFar: number) => void
  ): Promise<LLMResponse> {
    const params = {
      model: this.model,
      system,
      messages: [{ role: 'user' as const, content: user || 'Выполни инструкции из системного сообщения.' }],
      max_tokens: Math.max(options.maxTokens ?? 0, MIN_MAX_TOKENS),
    };

    let message: Anthropic.Message | Anthropic.Beta.BetaMessage;
    try {
      let chars = 0;
      const onText = (delta: string) => {
        chars += delta.length;
        onToken?.(chars);
      };
      if (this.official && FALLBACK_MODELS.has(this.model)) {
        const stream = this.client.beta.messages.stream({
          ...params,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        });
        stream.on('text', onText);
        message = await stream.finalMessage();
      } else {
        const stream = this.client.messages.stream(params);
        stream.on('text', onText);
        message = await stream.finalMessage();
      }
    } catch (e) {
      throw toLLMError(e, this.name);
    }

    if (message.stop_reason === 'refusal') {
      throw new LLMError(`${this.name}: модель отказалась отвечать на запрос (refusal)`, { provider: this.name });
    }

    // С включённым thinking первым идёт блок рассуждений — собираем только текст
    const content = message.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('');
    if (content.length === 0) {
      throw new LLMError(`${this.name}: пустой ответ модели (stop_reason: ${message.stop_reason})`,
        { provider: this.name, retriable: true });
    }

    const u = message.usage;
    const cached = u.cache_read_input_tokens ?? 0;
    const usage: LLMUsage = {
      // input_tokens у Anthropic не включает кэш — приводим к общему виду «всё входное»
      inputTokens: u.input_tokens + cached + (u.cache_creation_input_tokens ?? 0),
      outputTokens: u.output_tokens,
      ...(cached > 0 ? { cachedInputTokens: cached } : {}),
    };
    return { content, usage, tokensUsed: usage.inputTokens + usage.outputTokens };
  }
}

function toLLMError(e: unknown, provider: string): LLMError {
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return new LLMError(`${provider}: таймаут запроса`, { provider, retriable: true });
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new LLMError(`${provider}: сетевая ошибка — ${e.message}`, { provider, retriable: true });
  }
  if (e instanceof Anthropic.AuthenticationError) {
    return new LLMError(`${provider}: неверный API-ключ (HTTP 401)`, { provider, status: 401 });
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new LLMError(`${provider}: превышен лимит запросов (HTTP 429)`, { provider, status: 429, retriable: true });
  }
  if (e instanceof Anthropic.APIError) {
    const status = e.status ?? undefined;
    const retriable = status === undefined || status >= 500;
    return new LLMError(`${provider}: HTTP ${status ?? '?'} — ${String(e.message).substring(0, 200)}`,
      { provider, status, retriable });
  }
  if (e instanceof LLMError) return e;
  return new LLMError(`${provider}: ${(e as Error)?.message || String(e)}`, { provider, retriable: true });
}
