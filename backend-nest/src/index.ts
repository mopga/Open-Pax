/**
 * Open-Pax — API Server
 * =====================
 */

import express from 'express';
import cors from 'cors';
import { MiniMaxProvider } from './llm';
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

// Initialize Session Registry
const llmProvider = new MiniMaxProvider();
const sessionRegistry = initSessionRegistry(llmProvider);

// Register all route files
registerRoutes(app);

// Reload active sessions from database (survives server restart)
sessionRegistry.reloadActiveSessions();

app.listen(PORT, () => {
  console.log(`🚀 Open-Pax API running on http://localhost:${PORT}`);
});
