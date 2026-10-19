/**
 * Open-Pax — LLM Layer: типы
 * ==========================
 * Единый интерфейс провайдеров (Этап 1 роадмапа): любая модель —
 * локальная (Ollama, LM Studio) или облачная (OpenAI, OpenRouter,
 * Anthropic, MiniMax) — за одним контрактом.
 */

/** Игровые механики, которым можно назначать разные модели (аналог тиров Light/Pro/Max). */
export type Mechanic =
  | 'jump'          // симуляция прыжка вперёд (самая тяжёлая)
  | 'converter'     // конвертер действий description→action
  | 'advisor'       // советник
  | 'suggestions'   // подсказки действий
  | 'consolidation'; // консолидация истории

export const ALL_MECHANICS: Mechanic[] = [
  'jump', 'converter', 'advisor', 'suggestions', 'consolidation',
];

/** Расход токенов одного вызова (для учёта стоимости). */
export interface LLMUsage {
  /** Все входные токены, включая прочитанные из кэша провайдера */
  inputTokens: number;
  outputTokens: number;
  /** Сколько входных токенов провайдер взял из своего prompt-кэша (дешевле) */
  cachedInputTokens?: number;
  /** true — провайдер не вернул usage, числа оценены по длине текста */
  estimated?: boolean;
}

export interface LLMResponse {
  content: string;
  tokensUsed?: number;
  usage?: LLMUsage;
}

export interface LLMGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  /**
   * Просить у провайдера строгий JSON (OpenAI response_format / Ollama format).
   * Включается только если механика явно разрешила это в конфиге —
   * часть провайдеров отвечает 400 на неизвестный параметр.
   */
  jsonMode?: boolean;
}

export interface LLMProvider {
  /** Короткое имя для логов/статуса: 'openai-compatible' | 'anthropic' | 'minimax' */
  readonly name: string;
  /** Модель, которую реально дёргает этот провайдер (для /api/llm/status) */
  readonly model: string;

  generate(system: string, user: string, options?: LLMGenerateOptions): Promise<LLMResponse>;

  /**
   * Стриминг: onToken вызывается с накопленным числом символов.
   * Провайдеры без поддержки стриминга могут не реализовывать —
   * роутер откатится на generate().
   */
  stream?(
    system: string,
    user: string,
    onToken: (charsSoFar: number) => void,
    options?: LLMGenerateOptions
  ): Promise<LLMResponse>;
}

/**
 * Ошибка уровня LLM. message — безопасен для показа пользователю
 * (без ключей и тел запросов).
 */
export class LLMError extends Error {
  readonly provider: string;
  readonly mechanic?: Mechanic;
  readonly status?: number;
  /** Можно ли повторить запрос (429/5xx/сеть/таймаут) */
  readonly retriable: boolean;

  constructor(
    message: string,
    opts: { provider: string; mechanic?: Mechanic; status?: number; retriable?: boolean }
  ) {
    super(message);
    this.name = 'LLMError';
    this.provider = opts.provider;
    this.mechanic = opts.mechanic;
    this.status = opts.status;
    this.retriable = opts.retriable ?? false;
  }
}
