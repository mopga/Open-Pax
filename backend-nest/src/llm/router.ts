import type { LLMProvider, Mechanic, LLMGenerateOptions, LLMResponse } from './types';
import type { LLMFullConfig, MechanicConfig, ConsolidationConfig } from './config';
import { OpenAICompatibleProvider } from './openai-compatible';
import { AnthropicProvider } from './anthropic';
import { createMiniMaxProvider } from './minimax';
import { OllamaProvider } from './ollama';
import { builtinPrice, estimateCostUsd } from './pricing';
import { currentLLMContext, estimateTokens, type LLMCallRecord, type UsageSink } from './usage';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 100;

interface CacheEntry { content: string; tokensUsed?: number; at: number }

export function buildProvider(cfg: MechanicConfig): LLMProvider {
  const common = {
    baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model,
    timeoutMs: cfg.timeoutMs, retries: cfg.retries,
  };
  switch (cfg.provider) {
    case 'anthropic': return new AnthropicProvider(common);
    case 'minimax': return createMiniMaxProvider(common);
    case 'ollama': return new OllamaProvider({ ...common, contextLength: cfg.contextLength });
    case 'openai-compatible': return new OpenAICompatibleProvider({ ...common, name: 'openai-compatible' });
    default: throw new Error(`Неизвестный LLM-провайдер: ${String(cfg.provider)}`);
  }
}

/**
 * Роутер: направляет вызовы каждой механики в свой провайдер/модель,
 * с ограниченным TTL-кэшем для не-симуляционных механик.
 */
export class LLMRouter {
  private providers = new Map<Mechanic, LLMProvider>();
  private cache = new Map<string, CacheEntry>();
  private usageSink: UsageSink | null = null;

  constructor(
    private config: LLMFullConfig,
    private providerFactory: (cfg: MechanicConfig) => LLMProvider = buildProvider,
  ) {}

  /** Куда сообщать о каждом вызове (usage ledger). */
  setUsageSink(sink: UsageSink | null): void {
    this.usageSink = sink;
  }

  /**
   * Заменяет конфигурацию на лету (сохранение настроек в UI). Сессии
   * держат ссылку на этот же роутер, поэтому перезапуск сервера не нужен.
   */
  reconfigure(config: LLMFullConfig): void {
    this.config = config;
    this.providers.clear();
    this.cache.clear();
  }

  get source(): LLMFullConfig['source'] {
    return this.config.source;
  }

  private record(
    mechanic: Mechanic,
    started: number,
    system: string,
    user: string,
    outcome: { res?: LLMResponse; error?: unknown; cacheHit?: boolean },
  ): void {
    if (!this.usageSink) return;
    const cfg = this.config.mechanics[mechanic];
    const { res, error, cacheHit = false } = outcome;
    // Провайдер не прислал usage (часть стримов) — оцениваем по длине текста
    const usage = cacheHit
      ? { inputTokens: 0, outputTokens: 0 }
      : res?.usage ?? (res ? {
        inputTokens: estimateTokens(system) + estimateTokens(user),
        outputTokens: estimateTokens(res.content),
        estimated: true,
      } : { inputTokens: 0, outputTokens: 0 });
    const price = cfg.pricing ?? builtinPrice(cfg.model);
    const free = cacheHit || cfg.billing === 'local' || cfg.billing === 'subscription';
    const entry: LLMCallRecord = {
      gameId: currentLLMContext().gameId ?? null,
      mechanic,
      provider: cfg.provider,
      model: cfg.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens ?? 0,
      estimated: !!usage.estimated,
      cacheHit,
      latencyMs: Date.now() - started,
      ok: !error,
      ...(error ? { error: String((error as Error)?.message ?? error).substring(0, 300) } : {}),
      costUsd: free ? 0 : price ? estimateCostUsd(usage, price) : null,
    };
    try {
      this.usageSink(entry);
    } catch (e) {
      // Учёт не должен ломать игру
      console.error('[LLM] usage sink error:', e);
    }
  }

  private async tracked(
    mechanic: Mechanic,
    system: string,
    user: string,
    call: () => Promise<LLMResponse>,
  ): Promise<LLMResponse> {
    const started = Date.now();
    try {
      const res = await call();
      this.record(mechanic, started, system, user, { res });
      return res;
    } catch (error) {
      this.record(mechanic, started, system, user, { error });
      throw error;
    }
  }

  /** Настройки консолидации истории (Этап 2). */
  get consolidation(): ConsolidationConfig {
    return this.config.consolidation;
  }

  private provider(mechanic: Mechanic): LLMProvider {
    let p = this.providers.get(mechanic);
    if (!p) {
      p = this.providerFactory(this.config.mechanics[mechanic]);
      this.providers.set(mechanic, p);
    }
    return p;
  }

  async generate(mechanic: Mechanic, system: string, user: string, options?: LLMGenerateOptions): Promise<LLMResponse> {
    const cfg = this.config.mechanics[mechanic];
    // jsonMode из конфига механики, если вызов не задал его явно
    const opts: LLMGenerateOptions = { ...options, jsonMode: options?.jsonMode ?? cfg.jsonMode ?? false };
    const key = cfg.cache ? JSON.stringify([mechanic, system, user]) : null;
    if (key) {
      const hit = this.cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        this.record(mechanic, Date.now(), system, user, { cacheHit: true });
        return { content: hit.content, tokensUsed: hit.tokensUsed };
      }
    }
    const res = await this.tracked(mechanic, system, user, () => this.provider(mechanic).generate(system, user, opts));
    if (key) {
      if (this.cache.size >= CACHE_MAX) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      this.cache.set(key, { content: res.content, tokensUsed: res.tokensUsed, at: Date.now() });
    }
    return res;
  }

  async stream(
    mechanic: Mechanic,
    system: string,
    user: string,
    onToken: (charsSoFar: number) => void,
    options?: LLMGenerateOptions,
  ): Promise<LLMResponse> {
    const cfg = this.config.mechanics[mechanic];
    const p = this.provider(mechanic);
    const opts: LLMGenerateOptions = { ...options, jsonMode: options?.jsonMode ?? cfg.jsonMode ?? false };
    if (cfg.stream && p.stream) {
      const stream = p.stream.bind(p);
      return this.tracked(mechanic, system, user, () => stream(system, user, onToken, opts));
    }
    const res = await this.generate(mechanic, system, user, opts);
    onToken(res.content.length);
    return res;
  }

  /** Полный конфиг механики (с ключом) — только для серверного кода, не для API. */
  mechanicConfig(mechanic: Mechanic): MechanicConfig {
    return this.config.mechanics[mechanic];
  }

  /** Описание текущей конфигурации без секретов — для /api/llm/status. */
  describe(): Record<Mechanic, { provider: string; model: string; baseUrl: string }> {
    const out = {} as Record<Mechanic, { provider: string; model: string; baseUrl: string }>;
    for (const [m, cfg] of Object.entries(this.config.mechanics) as [Mechanic, MechanicConfig][]) {
      out[m] = { provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl };
    }
    return out;
  }

  clearCache(): void { this.cache.clear(); }
}
