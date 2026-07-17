/**
 * Open-Pax — API Server
 * =====================
 */

import express from 'express';
import cors from 'cors';
import { initLLMRouter } from './llm';
import { initDatabase } from './database';
import { initSessionRegistry } from './session-registry';
import { registerRoutes } from './routes';

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
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
const sessionRegistry = initSessionRegistry(llmRouter);
for (const [mechanic, cfg] of Object.entries(llmRouter.describe())) {
  console.log(`[LLM] ${mechanic}: ${cfg.provider} / ${cfg.model}`);
}

// Register all route files
registerRoutes(app);

// Reload active sessions from database (survives server restart)
sessionRegistry.reloadActiveSessions();

const server = app.listen(PORT, () => {
  console.log(`🚀 Open-Pax API running on http://localhost:${PORT}`);
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
