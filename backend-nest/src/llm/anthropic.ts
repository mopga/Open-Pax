/**
 * Open-Pax — LLM Layer: Anthropic (нативный Messages API)
 * ========================================================
 */

import { postJson } from './http';
import { LLMError, type LLMGenerateOptions, type LLMProvider, type LLMResponse } from './types';

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;         // default https://api.anthropic.com
  timeoutMs?: number;
  retries?: number;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;

  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;
  private retries: number;

  constructor(opts: AnthropicOptions) {
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.retries = opts.retries ?? 2;
  }

  async generate(system: string, user: string, options: LLMGenerateOptions = {}): Promise<LLMResponse> {
    const res = await postJson(
      `${this.baseUrl}/v1/messages`,
      {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      {
        model: this.model,
        system,
        messages: [{ role: 'user', content: user || 'Выполни инструкции из системного сообщения.' }],
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
      },
      { timeoutMs: this.timeoutMs, retries: this.retries, providerName: this.name }
    );

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new LLMError(`${this.name}: невалидный JSON в ответе`, { provider: this.name, retriable: true });
    }

    const content = data?.content?.[0]?.text;
    if (typeof content !== 'string' || content.length === 0) {
      throw new LLMError(
        `${this.name}: пустой ответ модели${data?.error?.message ? ` — ${String(data.error.message).substring(0, 150)}` : ''}`,
        { provider: this.name, retriable: true }
      );
    }

    return {
      content,
      tokensUsed: (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0) || undefined,
    };
  }
}
