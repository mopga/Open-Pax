/**
 * Open-Pax — API Server
 * =====================
 */

// Загружаем .env (MINIMAX_API_KEY, LLM_* и т.д.) ДО любых импортов конфигов
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { initLLMRouter, runWithLLMContext } from './llm';
import { applySavedSettings } from './settings/llm-settings';
import { usageRepository } from './repositories/usage.repository';
import { initDatabase } from './database';
import { initSessionRegistry } from './session-registry';
import { registerRoutes } from './routes';

const app = express();
const PORT = Number(process.env.PORT) || 8000;
// Сервер хранит API-ключи пользователя — по умолчанию доступен только с этой машины.
// HOST=0.0.0.0 открывает его в сеть (на свой риск).
const HOST = process.env.HOST || '127.0.0.1';

// Middleware: CORS только для локальных страниц, чтобы чужой сайт в браузере
// не мог дёргать API (и тратить токены пользователя)
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const extraOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || LOCAL_ORIGIN.test(origin) || extraOrigins.includes(origin)),
}));
app.use(express.json({ limit: '10mb' }));

// Global request logging
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// Initialize Database
initDatabase();

// Initialize LLM router (providers from llm.config.json / env)
const llmRouter = initLLMRouter();
// Поверх файла/env — настройки модели, сохранённые в UI
try {
  applySavedSettings(llmRouter);
} catch (e) {
  console.error('[LLM] Не удалось применить сохранённые настройки:', e);
}
// Каждый вызов модели — в журнал расхода токенов
llmRouter.setUsageSink(record => usageRepository.record(record));
const sessionRegistry = initSessionRegistry(llmRouter);
for (const [mechanic, cfg] of Object.entries(llmRouter.describe())) {
  console.log(`[LLM] ${mechanic}: ${cfg.provider} / ${cfg.model}`);
}

// LLM-вызовы внутри запросов к игре относим к этой игре (usage ledger)
app.use('/api/games/:id', (req, _res, next) => runWithLLMContext({ gameId: req.params.id }, next));

// Register all route files
registerRoutes(app);

// Reload active sessions from database (survives server restart)
sessionRegistry.reloadActiveSessions();

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Open-Pax API running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

/**
 * Graceful shutdown: flush in-memory session state to the DB before
 * the process exits, so NPC conquests / pending region changes / etc.
 * are not lost on SIGTERM (pm2, docker stop, systemd) or SIGINT (Ctrl+C).
 *
 * The flush is awaited up to a hard timeout so a hung DB write cannot
 * block shutdown indefinitely. The closeIdleConnections + close hooks
 * ensure the HTTP server stops accepting new requests while the flush
 * is running.
 */
let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] Graceful shutdown starting...`);

  server.close((err) => {
    if (err) console.error('[shutdown] server.close error:', err);
  });

  const FLUSH_TIMEOUT_MS = 10_000;
  const flushPromise = sessionRegistry.flushAll();
  const timeout = new Promise<void>((resolve) =>
    setTimeout(() => {
      console.warn(`[shutdown] flush timed out after ${FLUSH_TIMEOUT_MS}ms`);
      resolve();
    }, FLUSH_TIMEOUT_MS),
  );
  await Promise.race([flushPromise, timeout]);

  console.log(`[${signal}] Shutdown complete`);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
