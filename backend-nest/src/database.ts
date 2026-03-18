/**
 * Open-Pax — Database
 * ====================
 * SQLite database initialization.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'open-pax.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// ==============================================================================
// Schema
// ==============================================================================

export function initDatabase() {
  // Maps table
  db.exec(`
    CREATE TABLE IF NOT EXISTS maps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      width INTEGER DEFAULT 800,
      height INTEGER DEFAULT 600,
      regions TEXT NOT NULL DEFAULT '[]',
      objects TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Worlds table
  db.exec(`
    CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_date TEXT DEFAULT '1951-01-01',
      base_prompt TEXT DEFAULT 'Альтернативная история',
      historical_accuracy REAL DEFAULT 0.8,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Regions table (world regions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_regions (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      name TEXT NOT NULL,
      svg_path TEXT,
      color TEXT DEFAULT '#888888',
      owner TEXT DEFAULT 'neutral',
      population INTEGER DEFAULT 1000000,
      gdp INTEGER DEFAULT 100,
      military_power INTEGER DEFAULT 100,
      borders TEXT DEFAULT '[]',
      objects TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    )
  `);

  // Games table
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      current_turn INTEGER DEFAULT 1,
      max_turns INTEGER DEFAULT 100,
      status TEXT DEFAULT 'playing',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    )
  `);

  // Players table
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      name TEXT NOT NULL,
      region_id TEXT NOT NULL,
      color TEXT DEFAULT '#FF0000',
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    )
  `);

  // Actions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      turn INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    )
  `);

  // Turn results table
  db.exec(`
    CREATE TABLE IF NOT EXISTS turn_results (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      turn INTEGER NOT NULL,
      narration TEXT,
      country_response TEXT,
      events TEXT DEFAULT '[]',
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS saves (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      name TEXT NOT NULL,
      current_turn INTEGER DEFAULT 1,
      current_date TEXT DEFAULT '1951-01-01',
      data TEXT,
      saved_at TEXT NOT NULL,
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    )
  `);

  console.log('✅ Database initialized');
}

export default db;
