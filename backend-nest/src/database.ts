/**
 * Open-Pax — Database
 * ====================
 * SQLite database initialization.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// DB path can be overridden for tests (vitest sets OPEN_PAX_DB_PATH to a temp file)
const DB_PATH = process.env.OPEN_PAX_DB_PATH || path.join(process.cwd(), 'data', 'open-pax.db');

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

  // Migration (Этап 5): кастомные правила симуляции пресета (rules.md),
  // сохранённые с миром при генерации из пресет-пакета
  try {
    db.exec("ALTER TABLE worlds ADD COLUMN simulation_rules TEXT DEFAULT NULL");
    console.log('[Migration] Added simulation_rules to worlds');
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) { /* уже есть */ }
  }

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

  // Migration: Add flag column to world_regions if it doesn't exist
  try {
    db.exec("ALTER TABLE world_regions ADD COLUMN flag TEXT");
    console.log('[Migration] Added flag column to world_regions');
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

  // Migration: dedupe relationships, then add the UNIQUE index that
  // relationshipRepository.bulkUpsert's ON CONFLICT(world_id, from_region_id, to_region_id)
  // requires (without it every upsert threw "ON CONFLICT clause does not match...").
  db.exec(`
    DELETE FROM country_relationships
    WHERE id NOT IN (
      SELECT MIN(id) FROM country_relationships
      GROUP BY world_id, from_region_id, to_region_id
    )
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_country_relationships_pair
    ON country_relationships(world_id, from_region_id, to_region_id)
  `);

  // Migration: unified polity-id convention. Region owner is the polity id
  // itself (template worlds: country code like 'USA', stored in `flag`;
  // custom-map worlds keep their 'player' / 'ai-N' ids, which are valid
  // polity ids as-is). Previously owners were 'player' / 'ai-USA' while
  // relationships were seeded with bare codes, so seeded diplomacy never
  // matched engine keys.
  db.exec(`
    UPDATE world_regions SET owner = flag
    WHERE flag IS NOT NULL AND flag != '' AND (owner = 'player' OR owner LIKE 'ai-%')
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

  // Migration (Этап 2): сложность игры (story/easy/normal/hard/very_hard)
  try {
    db.exec("ALTER TABLE games ADD COLUMN difficulty TEXT DEFAULT 'normal'");
    console.log('[Migration] Added difficulty to games');
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) { /* уже есть */ }
  }

  // Migration (Этап 2): консолидированная история + до какого раунда она покрывает
  try {
    db.exec("ALTER TABLE games ADD COLUMN consolidated_history TEXT DEFAULT ''");
    db.exec("ALTER TABLE games ADD COLUMN consolidated_up_to INTEGER DEFAULT 0");
    console.log('[Migration] Added consolidation columns to games');
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) { /* уже есть */ }
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

  // Migration: players.polity_id — the polity the player controls.
  // Needed because region owners change hands (conquest), so the player's
  // polity cannot be derived from region ownership after the fact.
  try {
    db.exec("ALTER TABLE players ADD COLUMN polity_id TEXT");
    console.log('[Migration] Added polity_id to players');
  } catch (e: any) {
    if (!e.message.includes('duplicate column name') && !e.message.includes('no such column')) {
      // Column already exists
    }
  }
  // Backfill polity_id for existing players from their home region's owner.
  db.exec(`
    UPDATE players SET polity_id = (
      SELECT wr.owner FROM world_regions wr
      JOIN games g ON g.world_id = wr.world_id
      WHERE wr.id = players.region_id AND g.id = players.game_id
    )
    WHERE polity_id IS NULL
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

  // Этап 3: дипломатические чаты (один чат на пару игра×полития)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      polity_id TEXT NOT NULL,
      polity_name TEXT NOT NULL,
      polity_color TEXT DEFAULT '#888888',
      created_at TEXT,
      last_message_at TEXT,
      UNIQUE(game_id, polity_id)
    )
  `);

  // Этап 3: сообщения дипломатических чатов
  // role: 'player' (игрок) | 'polity' (ответ политии); read — прочитано ли
  // сообщение политии игроком (для счётчика непрочитанных).
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      turn INTEGER DEFAULT 0,
      read INTEGER DEFAULT 0,
      created_at TEXT,
      FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
    )
  `);

  console.log('✅ Database initialized');
}

export default db;
