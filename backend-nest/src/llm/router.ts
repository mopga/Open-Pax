import type { LLMProvider, Mechanic, LLMGenerateOptions, LLMResponse } from './types';
import type { LLMConfig, MechanicConfig } from './config';
import { OpenAICompatibleProvider } from './openai-compatible';
import { AnthropicProvider } from './anthropic';
import { createMiniMaxProvider } from './minimax';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 100;

interface CacheEntry { content: string; tokensUsed?: number; at: number }

function buildProvider(cfg: MechanicConfig): LLMProvider {
  const common = {
    baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model,
    timeoutMs: cfg.timeoutMs, retries: cfg.retries,
  };
  switch (cfg.provider) {
    case 'anthropic': return new AnthropicProvider(common);
    case 'minimax': return createMiniMaxProvider(common);
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

  constructor(
    private config: LLMConfig,
    private providerFactory: (cfg: MechanicConfig) => LLMProvider = buildProvider,
  ) {}

  private provider(mechanic: Mechanic): LLMProvider {
    let p = this.providers.get(mechanic);
    if (!p) {
      p = this.providerFactory(this.config[mechanic]);
      this.providers.set(mechanic, p);
    }
    return p;
  }

  async generate(mechanic: Mechanic, system: string, user: string, options?: LLMGenerateOptions): Promise<LLMResponse> {
    const cfg = this.config[mechanic];
    const key = cfg.cache ? JSON.stringify([mechanic, system, user]) : null;
    if (key) {
      const hit = this.cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { content: hit.content, tokensUsed: hit.tokensUsed };
    }
    const res = await this.provider(mechanic).generate(system, user, options);
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
    const cfg = this.config[mechanic];
    const p = this.provider(mechanic);
    if (cfg.stream && p.stream) return p.stream(system, user, onToken, options);
    const res = await this.generate(mechanic, system, user, options);
    onToken(res.content.length);
    return res;
  }

  /** Описание текущей конфигурации без секретов — для /api/llm/status. */
  describe(): Record<Mechanic, { provider: string; model: string; baseUrl: string }> {
    const out = {} as Record<Mechanic, { provider: string; model: string; baseUrl: string }>;
    for (const [m, cfg] of Object.entries(this.config) as [Mechanic, MechanicConfig][]) {
      out[m] = { provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl };
    }
    return out;
  }

  clearCache(): void { this.cache.clear(); }
}
