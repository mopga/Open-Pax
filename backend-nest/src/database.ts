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
      geojson TEXT,
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

  // Migration: Add geojson column to world_regions if it doesn't exist
  try {
    db.exec("ALTER TABLE world_regions ADD COLUMN geojson TEXT");
    console.log('[Migration] Added geojson column to world_regions');
  } catch (e: any) {
    if (!e.message.includes('duplicate column name') && !e.message.includes('no such column')) {
      // Ignore "duplicate column" errors or "no such column" - column already exists
      console.log('[Migration] geojson column check:', e.message);
    }
  }

  // Migration: Add metadata column to world_regions if it doesn't exist
  try {
    db.exec("ALTER TABLE world_regions ADD COLUMN metadata TEXT");
    console.log('[Migration] Added metadata column to world_regions');
  } catch (e: any) {
    if (!e.message.includes('duplicate column name') && !e.message.includes('no such column')) {
      // Ignore duplicate / no-such-column errors
    }
  }

  // Country relationships table (allies/enemies per world)
  db.exec(`
    CREATE TABLE IF NOT EXISTS country_relationships (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      from_region_id TEXT NOT NULL,
      to_region_id TEXT NOT NULL,
      relationship TEXT DEFAULT 'neutral',
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    )
  `);

  // Games table
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      current_turn INTEGER DEFAULT 1,
      current_date TEXT DEFAULT '1951-01-01',
      max_turns INTEGER DEFAULT 100,
      status TEXT DEFAULT 'playing',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add current_date to games table if it doesn't exist
  try {
    db.exec("ALTER TABLE games ADD COLUMN current_date TEXT DEFAULT '1951-01-01'");
    console.log('[Migration] Added current_date to games');
  } catch (e: any) {
    if (!e.message.includes('duplicate column name') && !e.message.includes('no such column')) {
      console.log('[Migration] current_date column check:', e.message);
    }
  }

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

  // Migration: Add current_turn and current_date if they don't exist
  try {
    db.exec("ALTER TABLE saves ADD COLUMN current_turn INTEGER DEFAULT 1");
    console.log('[Migration] Added current_turn to saves');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      // Column might already exist or SQLite version doesn't support this
    }
  }
  try {
    db.exec("ALTER TABLE saves ADD COLUMN current_date TEXT DEFAULT '1951-01-01'");
    console.log('[Migration] Added current_date to saves');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      // Column might already exist
    }
  }

  console.log('✅ Database initialized');
}

export default db;
