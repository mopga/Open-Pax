import { LLMRouter } from './router';
import { loadLLMConfig, type LLMConfig } from './config';

export * from './types';
export { LLMRouter } from './router';
export { loadLLMConfig } from './config';
export type { LLMConfig, MechanicConfig } from './config';

let router: LLMRouter | null = null;

/** Инициализирует глобальный LLM-роутер (вызывается один раз при старте сервера). */
export function initLLMRouter(configPath?: string, config?: LLMConfig): LLMRouter {
  router = new LLMRouter(config ?? loadLLMConfig(configPath));
  return router;
}

export function getLLMRouter(): LLMRouter {
  if (!router) router = new LLMRouter(loadLLMConfig());
  return router;
}
