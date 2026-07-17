/**
 * Open-Pax — LLM Layer: HTTP с таймаутом и ретраями
 * ==================================================
 */

import { LLMError } from './types';

export interface PostJsonOptions {
  timeoutMs: number;
  retries: number;
  providerName: string;
  /** Считать ли ответ стриминговым (SSE) — тогда возвращаем Response как есть */
  stream?: boolean;
}

const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function backoffMs(attempt: number): number {
  // 0.7s, 2.1s, 4.5s (экспонента + джиттер)
  return Math.round(700 * Math.pow(2.2, attempt) + Math.random() * 300);
}

/**
 * POST JSON с AbortController-таймаутом и ретраями с backoff.
 * Бросает LLMError с безопасным сообщением (без тел запросов и ключей).
 */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  opts: PostJsonOptions
): Promise<Response> {
  const { timeoutMs, retries, providerName } = opts;
  let lastError: LLMError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const wait = backoffMs(attempt - 1);
      console.warn(`[LLM:${providerName}] retry ${attempt}/${retries} через ${wait}мс…`);
      await new Promise(r => setTimeout(r, wait));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) {
        return res;
      }

      // Ошибка HTTP: вытащим короткое сообщение из тела, если есть
      let detail = '';
      try {
        const errBody: any = await res.json();
        detail = errBody?.error?.message || errBody?.message || '';
        if (typeof detail !== 'string') detail = '';
        detail = detail.substring(0, 200);
      } catch { /* тело не JSON — не страшно */ }

      const retriable = RETRYABLE_STATUSES.has(res.status);
      lastError = new LLMError(
        `${providerName}: HTTP ${res.status}${detail ? ` — ${detail}` : ''}`,
        { provider: providerName, status: res.status, retriable }
      );
      if (!retriable) throw lastError;
    } catch (e: any) {
      if (e instanceof LLMError && !e.retriable) throw e;

      const isTimeout = e?.name === 'AbortError';
      const message = isTimeout
        ? `${providerName}: таймаут запроса (${timeoutMs}мс). Модель слишком медленная или недоступна.`
        : `${providerName}: сетевая ошибка — ${e?.message || e}`;

      if (e instanceof LLMError) {
        lastError = e;
      } else {
        lastError = new LLMError(message, { provider: providerName, retriable: true });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new LLMError(`${providerName}: запрос не удался`, { provider: providerName });
}
