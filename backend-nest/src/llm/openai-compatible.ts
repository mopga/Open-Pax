/**
 * Open-Pax — LLM Layer: OpenAI-совместимый провайдер
 * ===================================================
 * Один адаптер на ~90% сценариев «своя модель / свой ключ»:
 * Ollama и LM Studio (у обоих OpenAI-совместимый /v1), OpenAI,
 * OpenRouter, Together, DeepSeek, GLM, Kimi и др.
 */

import { postJson } from './http';
import { LLMError, type LLMGenerateOptions, type LLMProvider, type LLMResponse, type LLMUsage } from './types';

export interface OpenAICompatibleOptions {
  /** Базовый URL, напр. http://localhost:11434/v1 или https://openrouter.ai/api/v1 */
  baseUrl: string;
  apiKey?: string;          // для Ollama/LM Studio можно любой непустой
  model: string;
  /** Путь чат-эндпоинта (по умолчанию /chat/completions; у MiniMax свой) */
  chatPath?: string;
  timeoutMs?: number;
  retries?: number;
  /** Отображаемое имя провайдера (по умолчанию 'openai-compatible') */
  name?: string;
  /** Extra headers (OpenRouter: HTTP-Referer, X-Title и т.п.) */
  extraHeaders?: Record<string, string>;
  /**
   * Просить usage в последнем чанке стрима (stream_options.include_usage).
   * По умолчанию true; если сервер отвечает 400 на этот параметр,
   * провайдер один раз повторяет запрос без него.
   */
  streamUsage?: boolean;
}

/**
 * Разбирает usage в OpenAI-формате. Поддерживает кэш-поля OpenAI
 * (prompt_tokens_details.cached_tokens) и DeepSeek (prompt_cache_hit_tokens).
 */
export function parseOpenAIUsage(raw: any): LLMUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = Number(raw.prompt_tokens ?? raw.input_tokens);
  const output = Number(raw.completion_tokens ?? raw.output_tokens);
  if (!Number.isFinite(input) && !Number.isFinite(output)) return undefined;
  const cached = Number(raw.prompt_tokens_details?.cached_tokens ?? raw.prompt_cache_hit_tokens ?? 0);
  return {
    inputTokens: Number.isFinite(input) ? input : 0,
    outputTokens: Number.isFinite(output) ? output : 0,
    ...(cached > 0 ? { cachedInputTokens: cached } : {}),
  };
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RETRIES = 2;

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;

  private baseUrl: string;
  private apiKey: string;
  private chatPath: string;
  private timeoutMs: number;
  private retries: number;
  private extraHeaders: Record<string, string>;
  private streamUsage: boolean;
  /**
   * Официальный API OpenAI: reasoning-модели (gpt-5, o-серия) отвечают 400
   * на max_tokens и на нестандартную temperature — там шлём
   * max_completion_tokens и не задаём temperature.
   */
  private openaiNative: boolean;

  constructor(opts: OpenAICompatibleOptions) {
    this.name = opts.name || 'openai-compatible';
    this.model = opts.model;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey || '';
    this.chatPath = opts.chatPath || '/chat/completions';
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = opts.retries ?? DEFAULT_RETRIES;
    this.extraHeaders = opts.extraHeaders || {};
    this.streamUsage = opts.streamUsage ?? true;
    this.openaiNative = /^https:\/\/api\.openai\.com(\/|$)/.test(this.baseUrl);
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...this.extraHeaders,
    };
  }

  private buildBody(system: string, user: string, options: LLMGenerateOptions, stream: boolean, withStreamUsage = false) {
    const maxTokens = options.maxTokens ?? 4096;
    return {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        // user никогда не пустой: часть моделей деградирует на пустом user-сообщении
        { role: 'user', content: user || 'Выполни инструкции из системного сообщения.' },
      ],
      ...(this.openaiNative
        ? { max_completion_tokens: maxTokens }
        : { temperature: options.temperature ?? 0.7, max_tokens: maxTokens }),
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...(stream ? { stream: true } : {}),
      ...(stream && withStreamUsage ? { stream_options: { include_usage: true } } : {}),
    };
  }

  async generate(system: string, user: string, options: LLMGenerateOptions = {}): Promise<LLMResponse> {
    const res = await postJson(
      `${this.baseUrl}${this.chatPath}`,
      this.buildHeaders(),
      this.buildBody(system, user, options, false),
      { timeoutMs: this.timeoutMs, retries: this.retries, providerName: this.name }
    );

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new LLMError(`${this.name}: невалидный JSON в ответе`, { provider: this.name, retriable: true });
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      // Диагностика пустых ответов (reasoning-модели, фильтры, обрезка по токенам)
      try {
        const choice = data?.choices?.[0];
        console.error('[LLM] Пустой content. Диагностика:', JSON.stringify({
          finish_reason: choice?.finish_reason,
          message_keys: choice?.message ? Object.keys(choice.message) : null,
          reasoning_len: typeof choice?.message?.reasoning_content === 'string' ? choice.message.reasoning_content.length : null,
          usage: data?.usage ?? null,
          error: data?.error ?? null,
          raw_head: JSON.stringify(data)?.slice(0, 400),
        }));
      } catch { /* ignore */ }
      throw new LLMError(
        `${this.name}: пустой ответ модели${data?.error?.message ? ` — ${String(data.error.message).substring(0, 150)}` : ''}`,
        { provider: this.name, retriable: true }
      );
    }

    const usage = parseOpenAIUsage(data?.usage);
    return { content, tokensUsed: data?.usage?.total_tokens, usage };
  }

  async stream(
    system: string,
    user: string,
    onToken: (charsSoFar: number) => void,
    options: LLMGenerateOptions = {}
  ): Promise<LLMResponse> {
    const post = (withUsage: boolean) => postJson(
      `${this.baseUrl}${this.chatPath}`,
      this.buildHeaders(),
      this.buildBody(system, user, options, true, withUsage),
      { timeoutMs: this.timeoutMs, retries: this.retries, providerName: this.name, stream: true }
    );

    let res: Response;
    try {
      res = await post(this.streamUsage);
    } catch (e) {
      // Сервер не знает stream_options — больше не просим usage у этого провайдера
      if (!(this.streamUsage && e instanceof LLMError && e.status === 400)) throw e;
      this.streamUsage = false;
      res = await post(false);
    }

    if (!res.body) {
      throw new LLMError(`${this.name}: стриминг не поддерживается ответом`, { provider: this.name, retriable: true });
    }

    // Разбор OpenAI SSE: строки "data: {json}" с delta.content
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let usage: LLMUsage | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload);
            usage = parseOpenAIUsage(chunk?.usage) ?? usage;
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              content += delta;
              onToken(content.length);
            }
          } catch { /* неполный JSON-чанк — пропускаем */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (content.length === 0) {
      throw new LLMError(`${this.name}: пустой стрим от модели`, { provider: this.name, retriable: true });
    }

    return { content, usage, tokensUsed: usage ? usage.inputTokens + usage.outputTokens : undefined };
  }
}
