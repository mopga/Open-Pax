/**
 * Open-Pax — LLM Layer: Ollama (нативный /api/chat)
 * ==================================================
 * Отдельный провайдер, а не OpenAI-совместимый /v1: только нативный API
 * позволяет задать длину контекста (options.num_ctx). По умолчанию Ollama
 * держит маленький контекст и молча обрезает начало промпта — для
 * многотысячного промпта прыжка это означает «модель не видит мир».
 * Заодно нативный ответ даёт точные счётчики токенов (prompt_eval_count/eval_count).
 */

import { postJson } from './http';
import { LLMError, type LLMGenerateOptions, type LLMProvider, type LLMResponse, type LLMUsage } from './types';

export interface OllamaOptions {
  /** http://localhost:11434 (суффикс /v1 или /api отбрасывается) */
  baseUrl?: string;
  model: string;
  /** Длина контекста в токенах (num_ctx) */
  contextLength?: number;
  timeoutMs?: number;
  retries?: number;
}

export const OLLAMA_DEFAULT_CONTEXT = 32768;

export function normalizeOllamaBaseUrl(baseUrl: string | undefined): string {
  return (baseUrl || 'http://localhost:11434').replace(/\/+$/, '').replace(/\/(v1|api)$/, '');
}

function usageFrom(data: any): LLMUsage | undefined {
  if (typeof data?.prompt_eval_count !== 'number' && typeof data?.eval_count !== 'number') return undefined;
  return { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0 };
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly model: string;

  private baseUrl: string;
  private contextLength: number;
  private timeoutMs: number;
  private retries: number;

  constructor(opts: OllamaOptions) {
    this.model = opts.model;
    this.baseUrl = normalizeOllamaBaseUrl(opts.baseUrl);
    this.contextLength = opts.contextLength || OLLAMA_DEFAULT_CONTEXT;
    // Локальная модель на большом промпте может думать минутами
    this.timeoutMs = opts.timeoutMs ?? 600_000;
    this.retries = opts.retries ?? 1;
  }

  private buildBody(system: string, user: string, options: LLMGenerateOptions, stream: boolean) {
    return {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user || 'Выполни инструкции из системного сообщения.' },
      ],
      stream,
      ...(options.jsonMode ? { format: 'json' } : {}),
      options: {
        num_ctx: this.contextLength,
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 4096,
      },
    };
  }

  async generate(system: string, user: string, options: LLMGenerateOptions = {}): Promise<LLMResponse> {
    const res = await postJson(
      `${this.baseUrl}/api/chat`,
      { 'Content-Type': 'application/json' },
      this.buildBody(system, user, options, false),
      { timeoutMs: this.timeoutMs, retries: this.retries, providerName: this.name }
    );
    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new LLMError(`${this.name}: невалидный JSON в ответе`, { provider: this.name, retriable: true });
    }
    const content = data?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new LLMError(`${this.name}: пустой ответ модели${data?.error ? ` — ${String(data.error).substring(0, 150)}` : ''}`,
        { provider: this.name, retriable: true });
    }
    const usage = usageFrom(data);
    return { content, usage, tokensUsed: usage ? usage.inputTokens + usage.outputTokens : undefined };
  }

  async stream(
    system: string,
    user: string,
    onToken: (charsSoFar: number) => void,
    options: LLMGenerateOptions = {}
  ): Promise<LLMResponse> {
    const res = await postJson(
      `${this.baseUrl}/api/chat`,
      { 'Content-Type': 'application/json' },
      this.buildBody(system, user, options, true),
      { timeoutMs: this.timeoutMs, retries: this.retries, providerName: this.name, stream: true }
    );
    if (!res.body) {
      throw new LLMError(`${this.name}: стриминг не поддерживается ответом`, { provider: this.name, retriable: true });
    }

    // Нативный стрим Ollama — NDJSON: по объекту на строку, последний с done=true и счётчиками
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
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk?.error) {
              throw new LLMError(`${this.name}: ${String(chunk.error).substring(0, 200)}`, { provider: this.name });
            }
            const delta = chunk?.message?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              content += delta;
              onToken(content.length);
            }
            if (chunk?.done) usage = usageFrom(chunk) ?? usage;
          } catch (e) {
            if (e instanceof LLMError) throw e;
            /* неполная строка — пропускаем */
          }
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
