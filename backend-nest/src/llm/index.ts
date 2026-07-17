import { LLMRouter } from './router';
import { loadLLMConfig, type LLMFullConfig } from './config';

export * from './types';
export { LLMRouter } from './router';
export { loadLLMConfig } from './config';
export type { LLMConfig, LLMFullConfig, MechanicConfig, ConsolidationConfig } from './config';

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
