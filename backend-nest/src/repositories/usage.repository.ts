/**
 * Open-Pax — Usage Repository
 * ===========================
 * Журнал LLM-вызовов (usage ledger) и агрегаты для UI.
 */

import db from '../database';
import type { LLMCallRecord } from '../llm/usage';

export interface UsageTotals {
  calls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  /** Сумма по вызовам с известной ценой */
  costUsd: number;
  /** Есть вызовы с неизвестной ценой — costUsd занижен */
  costIncomplete: boolean;
  /** Часть токенов оценена по длине текста */
  estimated: boolean;
}

export interface UsageByMechanic extends UsageTotals {
  mechanic: string;
  model: string;
}

export interface UsageCall {
  createdAt: string;
  mechanic: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  latencyMs: number;
  ok: boolean;
  error: string | null;
  costUsd: number | null;
  estimated: boolean;
  cacheHit: boolean;
}

const TOTALS_SQL = `
  COUNT(*) AS calls,
  SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed_calls,
  COALESCE(SUM(input_tokens), 0) AS input_tokens,
  COALESCE(SUM(output_tokens), 0) AS output_tokens,
  COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
  COALESCE(SUM(cost_usd), 0) AS cost_usd,
  SUM(CASE WHEN cost_usd IS NULL AND ok = 1 THEN 1 ELSE 0 END) AS unpriced,
  SUM(estimated) AS estimated
`;

function rowToTotals(row: any): UsageTotals {
  return {
    calls: row?.calls ?? 0,
    failedCalls: row?.failed_calls ?? 0,
    inputTokens: row?.input_tokens ?? 0,
    outputTokens: row?.output_tokens ?? 0,
    cachedInputTokens: row?.cached_input_tokens ?? 0,
    costUsd: row?.cost_usd ?? 0,
    costIncomplete: (row?.unpriced ?? 0) > 0,
    estimated: (row?.estimated ?? 0) > 0,
  };
}

export const usageRepository = {
  record(r: LLMCallRecord): void {
    db.prepare(`
      INSERT INTO llm_calls (game_id, mechanic, provider, model, input_tokens, output_tokens,
        cached_input_tokens, estimated, cache_hit, latency_ms, ok, error, cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      r.gameId, r.mechanic, r.provider, r.model, r.inputTokens, r.outputTokens,
      r.cachedInputTokens, r.estimated ? 1 : 0, r.cacheHit ? 1 : 0, r.latencyMs,
      r.ok ? 1 : 0, r.error ?? null, r.costUsd,
    );
  },

  gameTotals(gameId: string): UsageTotals {
    return rowToTotals(db.prepare(`SELECT ${TOTALS_SQL} FROM llm_calls WHERE game_id = ?`).get(gameId));
  },

  gameByMechanic(gameId: string): UsageByMechanic[] {
    const rows = db.prepare(`
      SELECT mechanic, model, ${TOTALS_SQL} FROM llm_calls
      WHERE game_id = ? GROUP BY mechanic, model ORDER BY cost_usd DESC, input_tokens DESC
    `).all(gameId) as any[];
    return rows.map(row => ({ mechanic: row.mechanic, model: row.model, ...rowToTotals(row) }));
  },

  recentCalls(gameId: string, limit = 20): UsageCall[] {
    const rows = db.prepare(`
      SELECT * FROM llm_calls WHERE game_id = ? ORDER BY id DESC LIMIT ?
    `).all(gameId, limit) as any[];
    return rows.map(row => ({
      createdAt: row.created_at,
      mechanic: row.mechanic,
      provider: row.provider,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cachedInputTokens: row.cached_input_tokens,
      latencyMs: row.latency_ms,
      ok: row.ok === 1,
      error: row.error,
      costUsd: row.cost_usd,
      estimated: row.estimated === 1,
      cacheHit: row.cache_hit === 1,
    }));
  },

  /** Всё время и сегодня (по локальной дате SQLite) — для экрана настроек */
  overall(): { allTime: UsageTotals; today: UsageTotals } {
    return {
      allTime: rowToTotals(db.prepare(`SELECT ${TOTALS_SQL} FROM llm_calls`).get()),
      today: rowToTotals(db.prepare(
        `SELECT ${TOTALS_SQL} FROM llm_calls WHERE date(created_at, 'localtime') = date('now', 'localtime')`,
      ).get()),
    };
  },
};
