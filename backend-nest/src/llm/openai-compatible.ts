/**
 * Open-Pax — LLM Layer: OpenAI-совместимый провайдер
 * ===================================================
 * Один адаптер на ~90% сценариев «своя модель / свой ключ»:
 * Ollama и LM Studio (у обоих OpenAI-совместимый /v1), OpenAI,
 * OpenRouter, Together, DeepSeek, GLM, Kimi и др.
 */

import { postJson } from './http';
import { LLMError, type LLMGenerateOptions, type LLMProvider, type LLMResponse } from './types';

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

  constructor(opts: OpenAICompatibleOptions) {
    this.name = opts.name || 'openai-compatible';
    this.model = opts.model;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey || '';
    this.chatPath = opts.chatPath || '/chat/completions';
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = opts.retries ?? DEFAULT_RETRIES;
    this.extraHeaders = opts.extraHeaders || {};
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...this.extraHeaders,
    };
  }

  private buildBody(system: string, user: string, options: LLMGenerateOptions, stream: boolean) {
    return {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        // user никогда не пустой: часть моделей деградирует на пустом user-сообщении
        { role: 'user', content: user || 'Выполни инструкции из системного сообщения.' },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...(stream ? { stream: true } : {}),
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

    return { content, tokensUsed: data?.usage?.total_tokens };
  }

  async stream(
    system: string,
    user: string,
    onToken: (charsSoFar: number) => void,
    options: LLMGenerateOptions = {}
  ): Promise<LLMResponse> {
    const res = await postJson(
      `${this.baseUrl}${this.chatPath}`,
      this.buildHeaders(),
      this.buildBody(system, user, options, true),
      { timeoutMs: this.timeoutMs, retries: this.retries, providerName: this.name, stream: true }
    );

    if (!res.body) {
      throw new LLMError(`${this.name}: стриминг не поддерживается ответом`, { provider: this.name, retriable: true });
    }

    // Разбор OpenAI SSE: строки "data: {json}" с delta.content
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';

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

    return { content };
  }
}
