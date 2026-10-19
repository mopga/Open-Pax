import { LLMRouter } from './router';
import { loadLLMConfig, type LLMFullConfig } from './config';

export * from './types';
export { LLMRouter, buildProvider } from './router';
export { loadLLMConfig, applyUserSettings } from './config';
export type {
  LLMConfig, LLMFullConfig, MechanicConfig, ConsolidationConfig,
  ProviderKind, BillingMode, UserLLMSettings,
} from './config';
export * from './usage';
export * from './pricing';

let router: LLMRouter | null = null;

/** Инициализирует глобальный LLM-роутер (вызывается один раз при старте сервера). */
export function initLLMRouter(configPath?: string, config?: LLMFullConfig): LLMRouter {
  router = new LLMRouter(config ?? loadLLMConfig(configPath));
  return router;
}

export function getLLMRouter(): LLMRouter {
  if (!router) router = new LLMRouter(loadLLMConfig());
  return router;
}
