/**
 * Тесты загрузки конфигурации LLM (Этап 1):
 *   env-fallback, наследование mechanics ← default, резолвинг apiKey "env:VAR".
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { loadLLMConfig, type LLMConfig } from '../src/llm/config';
import { ALL_MECHANICS } from '../src/llm/types';

const ENV_KEYS = [
  'LLM_PROVIDER', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL',
  'MINIMAX_API_KEY', 'MINIMAX_BASE_URL', 'LLM_CONFIG_PATH',
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    if (!(k in savedEnv)) savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const NO_FILE = path.join(os.tmpdir(), `no-such-llm-config-${process.pid}.json`);

describe('loadLLMConfig: env-fallback (обратная совместимость)', () => {
  it('без файла и env — все механики на MiniMax по умолчанию', () => {
    const cfg = loadLLMConfig(NO_FILE);
    for (const m of ALL_MECHANICS) {
      expect(cfg[m].provider).toBe('minimax');
      expect(cfg[m].baseUrl).toBe('https://api.minimax.io/v1');
      expect(cfg[m].model).toBe('MiniMax-M2.5');
      expect(cfg[m].timeoutMs).toBe(120_000);
      expect(cfg[m].retries).toBe(2);
    }
    // Кэш по умолчанию — только не-симуляционные механики
    expect(cfg.converter.cache).toBe(true);
    expect(cfg.advisor.cache).toBe(true);
    expect(cfg.suggestions.cache).toBe(true);
    expect(cfg.jump.cache).toBe(false);
    expect(cfg.narration.cache).toBe(false);
    expect(cfg.npc.cache).toBe(false);
  });

  it('MINIMAX_API_KEY подхватывается из env', () => {
    process.env.MINIMAX_API_KEY = 'mm-key-123';
    process.env.LLM_MODEL = 'Custom-Model';
    const cfg = loadLLMConfig(NO_FILE);
    expect(cfg.jump.apiKey).toBe('mm-key-123');
    expect(cfg.jump.model).toBe('Custom-Model');
  });

  it('LLM_* env имеют приоритет над MINIMAX_*', () => {
    process.env.MINIMAX_API_KEY = 'mm-key';
    process.env.LLM_API_KEY = 'llm-key';
    process.env.LLM_BASE_URL = 'http://localhost:11434/v1';
    process.env.LLM_PROVIDER = 'openai-compatible';
    const cfg = loadLLMConfig(NO_FILE);
    expect(cfg.npc.provider).toBe('openai-compatible');
    expect(cfg.npc.apiKey).toBe('llm-key');
    expect(cfg.npc.baseUrl).toBe('http://localhost:11434/v1');
  });
});

describe('loadLLMConfig: файл llm.config.json', () => {
  function writeTmpConfig(obj: unknown): string {
    const p = path.join(os.tmpdir(), `llm-config-test-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(p, JSON.stringify(obj));
    return p;
  }

  it('default наследуется всеми механиками, mechanics переопределяют точечно', () => {
    const file = writeTmpConfig({
      default: {
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'ollama',
        model: 'qwen2.5:14b',
        timeoutMs: 60000,
      },
      mechanics: {
        jump: { model: 'big-reasoner', retries: 5, stream: false },
        advisor: { cache: false },
      },
    });
    const cfg = loadLLMConfig(file);

    // Наследование
    expect(cfg.converter.provider).toBe('openai-compatible');
    expect(cfg.converter.baseUrl).toBe('http://localhost:11434/v1');
    expect(cfg.converter.model).toBe('qwen2.5:14b');
    expect(cfg.converter.timeoutMs).toBe(60000);

    // Точечные переопределения
    expect(cfg.jump.model).toBe('big-reasoner');
    expect(cfg.jump.retries).toBe(5);
    expect(cfg.jump.stream).toBe(false);
    expect(cfg.jump.baseUrl).toBe('http://localhost:11434/v1'); // унаследовано
    expect(cfg.advisor.cache).toBe(false);

    fs.rmSync(file);
  });

  it('apiKey "env:VAR" резолвится из окружения; отсутствующая — в пустую строку', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    const file = writeTmpConfig({
      default: { baseUrl: 'https://openrouter.ai/api/v1', model: 'x', apiKey: 'env:OPENROUTER_API_KEY' },
      mechanics: { npc: { apiKey: 'env:NO_SUCH_VAR_12345' } },
    });
    const cfg = loadLLMConfig(file);
    expect(cfg.jump.apiKey).toBe('sk-or-test');
    expect(cfg.npc.apiKey).toBe('');
    delete process.env.OPENROUTER_API_KEY;
    fs.rmSync(file);
  });

  it('пустая baseUrl в файле — понятная ошибка с именем механики', () => {
    const file = writeTmpConfig({
      default: { baseUrl: 'http://ok', model: 'm' },
      mechanics: { jump: { baseUrl: '' } },
    });
    expect(() => loadLLMConfig(file)).toThrow(/jump/);
    fs.rmSync(file);
  });

  it('тип LLMConfig покрывает все механики', () => {
    const cfg: LLMConfig = loadLLMConfig(NO_FILE);
    expect(Object.keys(cfg).sort()).toEqual([...ALL_MECHANICS].sort());
  });
});
