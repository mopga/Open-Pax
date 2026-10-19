/**
 * Форматирование расхода токенов и стоимости для HUD и настроек.
 */

/** 18342 → «18.3k», 1250000 → «1.25M» */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(n);
}

/** $0.0042 → «$0.0042», $1.5 → «$1.50» — мелкие суммы без потери точности */
export function formatUsd(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

/** Подписи механик; неизвестная механика показывается по сырому ключу */
export const MECHANIC_LABELS: Record<string, string> = {
  jump: 'Симуляция мира',
  converter: 'Обработка приказов',
  suggestions: 'Идеи действий',
  advisor: 'Советник',
  consolidation: 'Сжатие истории',
};
