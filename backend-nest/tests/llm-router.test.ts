/**
 * Тесты LLMRouter и OpenAI-совместимого провайдера (Этап 1):
 *   per-механика резолвинг, TTL-кэш (converter кэшируется, jump — нет),
 *   stream-фолбэк, неизвестный провайдер, retry/timeout/HTTP-ошибки.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LLMRouter } from '../src/llm/router';
import { OpenAICompatibleProvider } from '../src/llm/openai-compatible';
import { LLMError, ALL_MECHANICS, type LLMProvider, type Mechanic } from '../src/llm';
import type { LLMConfig, LLMFullConfig } from '../src/llm/config';

function makeConfig(): LLMFullConfig {
  const mechanics = {} as LLMConfig;
  for (const m of ALL_MECHANICS) {
    mechanics[m] = {
      provider: 'openai-compatible',
      baseUrl: 'http://test.local/v1',
      apiKey: 'k',
      model: `model-${m}`,
      timeoutMs: 1000,
      retries: 0,
      stream: true,
      cache: ['advisor', 'suggestions', 'converter'].includes(m),
    };
  }
  return { mechanics, consolidation: { startRound: 25, chunkSize: 5, keepRawTail: 10 } };
}

/** Stub-провайдер, считающий вызовы */
function stubProvider(calls: string[]): LLMProvider {
  return {
    name: 'stub',
    model: 'stub-model',
    async generate(system: string, user: string) {
      calls.push(`${system}|${user}`);
      return { content: `ответ-${calls.length}`, tokensUsed: 10 };
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LLMRouter: per-механика резолвинг', () => {
  it('каждая механика получает свой конфиг; провайдер создаётся лениво и один раз', async () => {
    const factoryCfgs: string[] = [];
    const router = new LLMRouter(makeConfig(), (cfg) => {
      factoryCfgs.push(cfg.model);
      return stubProvider([]);
    });

    await router.generate('jump', 's', 'u');
    await router.generate('advisor', 's', 'u');
    await router.generate('jump', 's2', 'u2');

    expect(factoryCfgs).toEqual(['model-jump', 'model-advisor']);
  });

  it('describe() возвращает конфиг без apiKey', () => {
    const router = new LLMRouter(makeConfig(), () => stubProvider([]));
    const d = router.describe();
    expect(d.jump.model).toBe('model-jump');
    expect(d.jump.provider).toBe('openai-compatible');
    expect(JSON.stringify(d)).not.toContain('"apiKey"');
    expect(Object.keys(d)).toHaveLength(ALL_MECHANICS.length);
  });

  it('неизвестный провайдер — понятная ошибка', async () => {
    const cfg = makeConfig();
    (cfg.mechanics.jump as any).provider = 'bogus';
    const router = new LLMRouter(cfg); // дефолтная фабрика
    await expect(router.generate('jump', 's', 'u')).rejects.toThrow(/Неизвестный LLM-провайдер/);
  });
});

describe('LLMRouter: кэш', () => {
  it('converter кэшируется, jump — нет', async () => {
    const calls: string[] = [];
    const router = new LLMRouter(makeConfig(), () => stubProvider(calls));

    await router.generate('converter', 'sys', 'usr');
    await router.generate('converter', 'sys', 'usr'); // из кэша
    expect(calls).toHaveLength(1);

    await router.generate('jump', 'sys', 'usr');
    await router.generate('jump', 'sys', 'usr'); // НЕ кэшируется
    expect(calls).toHaveLength(3);
  });

  it('clearCache() инвалидирует закэшированное', async () => {
    const calls: string[] = [];
    const router = new LLMRouter(makeConfig(), () => stubProvider(calls));

    await router.generate('advisor', 's', 'u');
    router.clearCache();
    await router.generate('advisor', 's', 'u');
    expect(calls).toHaveLength(2);
  });
});

describe('LLMRouter: stream', () => {
  it('без stream у провайдера — фолбэк на generate + onToken', async () => {
    const router = new LLMRouter(makeConfig(), () => stubProvider([]));
    const tokens: number[] = [];
    const res = await router.stream('jump', 's', 'u', (c) => tokens.push(c));
    expect(res.content).toBe('ответ-1');
    expect(tokens).toEqual([res.content.length]);
  });

  it('со stream у провайдера — вызывается stream', async () => {
    const streamed: boolean[] = [];
    const provider: LLMProvider = {
      name: 'stub',
      model: 'm',
      async generate() {
        throw new Error('generate не должен вызываться');
      },
      async stream(_s, _u, onToken) {
        streamed.push(true);
        onToken(3);
        onToken(7);
        return { content: 'стрим' };
      },
    };
    const router = new LLMRouter(makeConfig(), () => provider);
    const tokens: number[] = [];
    const res = await router.stream('jump', 's', 'u', (c) => tokens.push(c));
    expect(streamed).toEqual([true]);
    expect(tokens).toEqual([3, 7]);
    expect(res.content).toBe('стрим');
  });
});

describe('OpenAICompatibleProvider: retry/timeout/HTTP-ошибки', () => {
  const okBody = {
    choices: [{ message: { content: 'привет' } }],
    usage: { total_tokens: 42 },
  };

  function mockFetchSequence(steps: Array<() => Promise<any>>) {
    let i = 0;
    const calls: any[] = [];
    vi.stubGlobal('fetch', async (url: any, init: any) => {
      calls.push({ url, init });
      const step = steps[Math.min(i, steps.length - 1)];
      i++;
      return step();
    });
    return calls;
  }

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('500 → retry → 200: успех, два вызова fetch', async () => {
    const calls = mockFetchSequence([
      async () => jsonResponse(500, { error: { message: 'boom' } }),
      async () => jsonResponse(200, okBody),
    ]);
    const p = new OpenAICompatibleProvider({
      baseUrl: 'http://test.local/v1', apiKey: 'k', model: 'm', timeoutMs: 1000, retries: 1,
    });
    const res = await p.generate('sys', 'usr');
    expect(res.content).toBe('привет');
    expect(res.tokensUsed).toBe(42);
    expect(calls).toHaveLength(2);
    // URL и заголовки
    expect(calls[0].url).toBe('http://test.local/v1/chat/completions');
    expect(calls[0].init.headers.Authorization).toBe('Bearer k');
  }, 15000);

  it('401 — без ретраев, LLMError сразу', async () => {
    const calls = mockFetchSequence([async () => jsonResponse(401, { error: { message: 'bad key' } })]);
    const p = new OpenAICompatibleProvider({
      baseUrl: 'http://test.local/v1', apiKey: 'bad', model: 'm', timeoutMs: 1000, retries: 2,
    });
    const err = await p.generate('s', 'u').catch((e) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.status).toBe(401);
    expect(err.retriable).toBe(false);
    expect(err.message).toContain('bad key');
    expect(calls).toHaveLength(1);
  });

  it('таймаут — LLMError с понятным сообщением', async () => {
    vi.stubGlobal('fetch', (_url: any, init: any) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const e = new Error('The operation was aborted');
          e.name = 'AbortError';
          reject(e);
        });
      })
    );
    const p = new OpenAICompatibleProvider({
      baseUrl: 'http://test.local/v1', model: 'm', timeoutMs: 50, retries: 0,
    });
    const err = await p.generate('s', 'u').catch((e) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.message).toMatch(/таймаут запроса/);
  });

  it('пустой content в ответе — LLMError', async () => {
    mockFetchSequence([async () => jsonResponse(200, { choices: [{ message: {} }] })]);
    const p = new OpenAICompatibleProvider({
      baseUrl: 'http://test.local/v1', model: 'm', timeoutMs: 1000, retries: 0,
    });
    await expect(p.generate('s', 'u')).rejects.toThrow(/пустой ответ/);
  });
});
