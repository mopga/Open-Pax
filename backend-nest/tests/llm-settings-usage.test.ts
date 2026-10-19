/**
 * Тесты «свой ключ» и usage ledger:
 *   резолвинг настроек из UI (ключ не переиспользуется при смене адреса),
 *   наложение настроек на конфиг, цены, запись вызовов роутером,
 *   разбор usage у OpenAI/DeepSeek и Ollama, журнал в SQLite.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Путь к временной БД ДО импорта database.ts (он читает env при загрузке модуля)
const TEST_DB = path.join(os.tmpdir(), `open-pax-usage-test-${process.pid}-${Date.now()}.db`);
process.env.OPEN_PAX_DB_PATH = TEST_DB;

import { LLMRouter } from '../src/llm/router';
import { OpenAICompatibleProvider, parseOpenAIUsage } from '../src/llm/openai-compatible';
import { OllamaProvider } from '../src/llm/ollama';
import {
  ALL_MECHANICS, applyUserSettings, builtinPrice, estimateCostUsd, runWithLLMContext,
  type LLMCallRecord, type LLMProvider, type UserLLMSettings,
} from '../src/llm';
import type { LLMConfig, LLMFullConfig } from '../src/llm/config';

// Модули, импортирующие database.ts, грузим динамически — после установки OPEN_PAX_DB_PATH
// (статические import поднимаются выше присваивания env)
let db: any;
let usageRepository: any;
let resolveSettings: typeof import('../src/settings/llm-settings').resolveSettings;
let publicSettings: typeof import('../src/settings/llm-settings').publicSettings;
let SettingsValidationError: typeof import('../src/settings/llm-settings').SettingsValidationError;

beforeAll(async () => {
  const database = await import('../src/database');
  database.initDatabase();
  db = database.default;
  usageRepository = (await import('../src/repositories/usage.repository')).usageRepository;
  ({ resolveSettings, publicSettings, SettingsValidationError } = await import('../src/settings/llm-settings'));
});

afterAll(() => {
  db?.close();
  try { fs.unlinkSync(TEST_DB); } catch { /* ignore */ }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeConfig(overrides: Partial<LLMConfig['jump']> = {}): LLMFullConfig {
  const mechanics = {} as LLMConfig;
  for (const m of ALL_MECHANICS) {
    mechanics[m] = {
      provider: 'openai-compatible', baseUrl: 'http://test.local/v1', apiKey: 'k',
      model: 'deepseek-v4-pro', timeoutMs: 1000, retries: 0, stream: true,
      cache: m === 'suggestions', ...overrides,
    };
  }
  return { mechanics, consolidation: { startRound: 25, chunkSize: 5, keepRawTail: 10 } };
}

const SAVED: UserLLMSettings = {
  presetId: 'deepseek', provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com',
  apiKey: 'sk-secret-deepseek-key', model: 'deepseek-v4-pro', billing: 'payg',
};

describe('resolveSettings: ключ и валидация', () => {
  it('пустой ключ при том же адресе — берётся сохранённый', () => {
    const s = resolveSettings({ presetId: 'deepseek', model: 'deepseek-flash' }, SAVED);
    expect(s.apiKey).toBe(SAVED.apiKey);
    expect(s.baseUrl).toBe('https://api.deepseek.com');
  });

  it('смена адреса без нового ключа — ошибка, ключ не утекает на чужой сервер', () => {
    expect(() => resolveSettings(
      { presetId: 'custom', baseUrl: 'https://evil.example.com/v1', model: 'x' },
      SAVED,
    )).not.toThrow(); // custom не требует ключа…
    const s = resolveSettings({ presetId: 'custom', baseUrl: 'https://evil.example.com/v1', model: 'x' }, SAVED);
    expect(s.apiKey).toBe(''); // …но сохранённый ключ туда не подставляется

    expect(() => resolveSettings(
      { presetId: 'deepseek', baseUrl: 'https://evil.example.com', model: 'x' },
      SAVED,
    )).toThrow(SettingsValidationError);
  });

  it('пресет с обязательным ключом без ключа — ошибка', () => {
    expect(() => resolveSettings({ presetId: 'deepseek', model: 'deepseek-v4-pro' }, null))
      .toThrow(/API-ключ/);
  });

  it('локальный пресет не требует ключа и подставляет контекст по умолчанию', () => {
    const s = resolveSettings({ presetId: 'ollama', model: 'qwen3:14b', baseUrl: 'http://localhost:11434/v1' }, null);
    expect(s.provider).toBe('ollama');
    expect(s.baseUrl).toBe('http://localhost:11434');
    expect(s.billing).toBe('local');
    expect(s.contextLength).toBe(32768);
  });

  it('отклоняет кривой адрес и отрицательную цену', () => {
    expect(() => resolveSettings({ presetId: 'custom', baseUrl: 'ftp://x', model: 'm' }, null)).toThrow();
    expect(() => resolveSettings({
      presetId: 'llamacpp', model: 'm', pricing: { inputPerM: -1, outputPerM: 1 },
    }, null)).toThrow(/pricing/);
  });

  it('publicSettings не отдаёт ключ', () => {
    const pub = publicSettings(SAVED)!;
    expect(JSON.stringify(pub)).not.toContain(SAVED.apiKey);
    expect(pub.hasApiKey).toBe(true);
    expect(pub.apiKeyMasked).toBe('sk-…-key');
  });
});

describe('applyUserSettings', () => {
  it('основная модель — для прыжка, лёгкая — для подсказок и конвертера', () => {
    const cfg = applyUserSettings(makeConfig(), { ...SAVED, lightModel: 'deepseek-flash' });
    expect(cfg.source).toBe('settings');
    expect(cfg.mechanics.jump.model).toBe('deepseek-v4-pro');

    expect(cfg.mechanics.suggestions.model).toBe('deepseek-flash');
    expect(cfg.mechanics.converter.model).toBe('deepseek-flash');
    expect(cfg.mechanics.jump.apiKey).toBe(SAVED.apiKey);
  });
});

describe('pricing', () => {
  it('встроенные цены и учёт кэша', () => {
    const price = builtinPrice('deepseek-v4-pro')!;
    expect(price.inputPerM).toBeGreaterThan(0);
    expect(builtinPrice('anthropic/claude-opus-5-5')).toEqual(builtinPrice('claude-opus-5-5'));
    expect(builtinPrice('unknown-model')).toBeUndefined();

    const cost = estimateCostUsd(
      { inputTokens: 1_000_000, outputTokens: 1_000_000, cachedInputTokens: 500_000 },
      { inputPerM: 2, outputPerM: 10, cachedInputPerM: 0.2 },
    );
    expect(cost).toBeCloseTo(0.5 * 2 + 0.5 * 0.2 + 10, 6);
  });
});

describe('LLMRouter: usage sink', () => {
  function usageProvider(): LLMProvider {
    return {
      name: 'stub', model: 'stub',
      async generate() {
        return { content: 'ok', usage: { inputTokens: 1000, outputTokens: 500, cachedInputTokens: 200 } };
      },
    };
  }

  it('пишет вызов с gameId из контекста, токенами и стоимостью', async () => {
    const records: LLMCallRecord[] = [];
    const router = new LLMRouter(makeConfig(), () => usageProvider());
    router.setUsageSink(r => records.push(r));

    await runWithLLMContext({ gameId: 'game-1' }, () => router.generate('jump', 'sys', 'user'));

    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.gameId).toBe('game-1');
    expect(r.mechanic).toBe('jump');
    expect(r.inputTokens).toBe(1000);
    expect(r.cachedInputTokens).toBe(200);
    expect(r.ok).toBe(true);
    expect(r.costUsd).toBeCloseTo(estimateCostUsd(
      { inputTokens: 1000, outputTokens: 500, cachedInputTokens: 200 }, builtinPrice('deepseek-v4-pro')!), 9);
  });

  it('локальная модель стоит $0, неизвестная цена — null, кэш-хит без токенов', async () => {
    const records: LLMCallRecord[] = [];
    const local = new LLMRouter(makeConfig({ billing: 'local', model: 'qwen' }), () => usageProvider());
    local.setUsageSink(r => records.push(r));
    await local.generate('jump', 's', 'u');
    expect(records[0].costUsd).toBe(0);

    const unknown = new LLMRouter(makeConfig({ model: 'mystery' }), () => usageProvider());
    unknown.setUsageSink(r => records.push(r));
    await unknown.generate('jump', 's', 'u');
    expect(records[1].costUsd).toBeNull();

    await unknown.generate('suggestions', 's', 'u');
    await unknown.generate('suggestions', 's', 'u'); // из кэша роутера
    expect(records[3].cacheHit).toBe(true);
    expect(records[3].inputTokens).toBe(0);
    expect(records[3].costUsd).toBe(0);
  });

  it('ошибка провайдера тоже попадает в журнал', async () => {
    const records: LLMCallRecord[] = [];
    const router = new LLMRouter(makeConfig(), () => ({
      name: 'stub', model: 'stub',
      async generate(): Promise<never> { throw new Error('HTTP 401 — bad key'); },
    }));
    router.setUsageSink(r => records.push(r));
    await expect(router.generate('jump', 's', 'u')).rejects.toThrow();
    expect(records[0].ok).toBe(false);
    expect(records[0].error).toContain('401');
  });

  it('без usage от провайдера — оценка по длине текста', async () => {
    const records: LLMCallRecord[] = [];
    const router = new LLMRouter(makeConfig(), () => ({
      name: 'stub', model: 'stub',
      async generate() { return { content: 'x'.repeat(300) }; },
    }));
    router.setUsageSink(r => records.push(r));
    await router.generate('jump', 'a'.repeat(600), 'b'.repeat(300));
    expect(records[0].estimated).toBe(true);
    expect(records[0].inputTokens).toBe(300);
    expect(records[0].outputTokens).toBe(100);
  });

  it('reconfigure меняет модель без пересоздания роутера', async () => {
    const seen: string[] = [];
    const router = new LLMRouter(makeConfig(), cfg => ({
      name: 'stub', model: cfg.model,
      async generate() { seen.push(cfg.model); return { content: 'ok' }; },
    }));
    await router.generate('jump', 's', 'u');
    router.reconfigure(applyUserSettings(makeConfig(), { ...SAVED, model: 'deepseek-flash' }));
    await router.generate('jump', 's', 'u');
    expect(seen).toEqual(['deepseek-v4-pro', 'deepseek-flash']);
  });
});

describe('провайдеры: разбор usage', () => {
  it('OpenAI и DeepSeek поля кэша', () => {
    expect(parseOpenAIUsage({ prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 4 } }))
      .toEqual({ inputTokens: 10, outputTokens: 5, cachedInputTokens: 4 });
    expect(parseOpenAIUsage({ prompt_tokens: 10, completion_tokens: 5, prompt_cache_hit_tokens: 7 }))
      .toEqual({ inputTokens: 10, outputTokens: 5, cachedInputTokens: 7 });
    expect(parseOpenAIUsage(null)).toBeUndefined();
  });

  function sseResponse(lines: string[]): Response {
    const body = new ReadableStream({
      start(controller) {
        for (const l of lines) controller.enqueue(new TextEncoder().encode(l));
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }

  it('стрим OpenAI: usage из последнего чанка; 400 на stream_options → повтор без него', async () => {
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      if (body.stream_options) {
        return new Response(JSON.stringify({ error: { message: 'unknown field stream_options' } }), { status: 400 });
      }
      return sseResponse([
        'data: {"choices":[{"delta":{"content":"Прив"}}]}\n',
        'data: {"choices":[{"delta":{"content":"ет"}}]}\n',
        'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3}}\n',
        'data: [DONE]\n',
      ]);
    }));
    const p = new OpenAICompatibleProvider({ baseUrl: 'http://x/v1', model: 'm', retries: 0 });
    const res = await p.stream('s', 'u', () => {});
    expect(res.content).toBe('Привет');
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect(bodies).toHaveLength(2);
    expect(bodies[1].stream_options).toBeUndefined();
  });

  it('официальный OpenAI: max_completion_tokens и без temperature', async () => {
    let body: any;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
    }));
    await new OpenAICompatibleProvider({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-x', retries: 0 })
      .generate('s', 'u', { maxTokens: 100 });
    expect(body.max_completion_tokens).toBe(100);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it('Ollama: нативный /api/chat, num_ctx и счётчики токенов', async () => {
    let url = '';
    let body: any;
    vi.stubGlobal('fetch', vi.fn(async (u: string, init: any) => {
      url = u;
      body = JSON.parse(init.body);
      return sseResponse([
        '{"message":{"content":"Ми"},"done":false}\n',
        '{"message":{"content":"р"},"done":true,"prompt_eval_count":40,"eval_count":2}\n',
      ]);
    }));
    const p = new OllamaProvider({ baseUrl: 'http://localhost:11434/v1', model: 'qwen', contextLength: 65536, retries: 0 });
    const res = await p.stream('s', 'u', () => {});
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(body.options.num_ctx).toBe(65536);
    expect(res.content).toBe('Мир');
    expect(res.usage).toEqual({ inputTokens: 40, outputTokens: 2 });
  });
});

describe('usage repository', () => {
  it('агрегирует расход по игре и механикам', () => {
    const base: LLMCallRecord = {
      gameId: 'g-usage', mechanic: 'jump', provider: 'openai-compatible', model: 'deepseek-v4-pro',
      inputTokens: 1000, outputTokens: 200, cachedInputTokens: 0, estimated: false, cacheHit: false,
      latencyMs: 100, ok: true, costUsd: 0.01,
    };
    usageRepository.record(base);
    usageRepository.record({ ...base, mechanic: 'suggestions', model: 'deepseek-flash', costUsd: null });
    usageRepository.record({ ...base, ok: false, error: 'boom', inputTokens: 0, outputTokens: 0, costUsd: null });

    const totals = usageRepository.gameTotals('g-usage');
    expect(totals.calls).toBe(3);
    expect(totals.failedCalls).toBe(1);
    expect(totals.inputTokens).toBe(2000);
    expect(totals.costUsd).toBeCloseTo(0.01, 9);
    expect(totals.costIncomplete).toBe(true);

    const byMech = usageRepository.gameByMechanic('g-usage');
    expect(byMech.map((m: any) => m.mechanic).sort()).toEqual(['jump', 'suggestions']);
    expect(usageRepository.recentCalls('g-usage', 2)).toHaveLength(2);
    expect(usageRepository.overall().allTime.calls).toBeGreaterThanOrEqual(3);
  });
});
