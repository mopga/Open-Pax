/**
 * Open-Pax — Database
 * ====================
 * SQLite database initialization and queries.
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

export const db = new Database(DB_PATH);

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

  console.log('✅ Database initialized');
}

// ==============================================================================
// Map Queries
// ==============================================================================

export const mapQueries = {
  create: (map: { id: string; name: string; width: number; height: number; regions: any[]; objects?: any[] }) => {
    const stmt = db.prepare(`
      INSERT INTO maps (id, name, width, height, regions, objects)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(map.id, map.name, map.width, map.height, JSON.stringify(map.regions), JSON.stringify(map.objects || []));
    return map;
  },

  getById: (id: string) => {
    const stmt = db.prepare('SELECT * FROM maps WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      ...row,
      regions: JSON.parse(row.regions),
      objects: JSON.parse(row.objects || '[]'),
    };
  },

  getAll: () => {
    const stmt = db.prepare('SELECT id, name, width, height, regions, objects, created_at FROM maps ORDER BY created_at DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      ...row,
      regions: JSON.parse(row.regions),
      objects: JSON.parse(row.objects || '[]'),
      regions_count: JSON.parse(row.regions).length,
    }));
  },

  delete: (id: string) => {
    const stmt = db.prepare('DELETE FROM maps WHERE id = ?');
    stmt.run(id);
  },
};

// ==============================================================================
// World Queries
// ==============================================================================

export const worldQueries = {
  create: (world: { id: string; name: string; description?: string; startDate?: string; basePrompt?: string; historicalAccuracy?: number }) => {
    const stmt = db.prepare(`
      INSERT INTO worlds (id, name, description, start_date, base_prompt, historical_accuracy)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      world.id,
      world.name,
      world.description || '',
      world.startDate || '1951-01-01',
      world.basePrompt || 'Альтернативная история',
      world.historicalAccuracy ?? 0.8
    );
    return world;
  },

  getById: (id: string) => {
    const stmt = db.prepare('SELECT * FROM worlds WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      ...row,
      regions: worldQueries.getRegions(id),
    };
  },

  getRegions: (worldId: string) => {
    const stmt = db.prepare('SELECT * FROM world_regions WHERE world_id = ?');
    const rows = stmt.all(worldId) as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      svgPath: row.svg_path,
      color: row.color,
      owner: row.owner,
      population: row.population,
      gdp: row.gdp,
      militaryPower: row.military_power,
      borders: JSON.parse(row.borders),
      objects: JSON.parse(row.objects || '[]'),
      status: row.status,
    }));
  },

  addRegion: (region: { id: string; worldId: string; name: string; svgPath?: string; color?: string; owner?: string; population?: number; gdp?: number; militaryPower?: number }) => {
    const stmt = db.prepare(`
      INSERT INTO world_regions (id, world_id, name, svg_path, color, owner, population, gdp, military_power)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      region.id,
      region.worldId,
      region.name,
      region.svgPath || '',
      region.color || '#888888',
      region.owner || 'neutral',
      region.population || 1000000,
      region.gdp || 100,
      region.militaryPower || 100
    );
    return region;
  },

  updateRegion: (regionId: string, updates: Partial<{
    name: string; color: string; owner: string; population: number; gdp: number; militaryPower: number; objects: any[]
  }>) => {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color); }
    if (updates.owner !== undefined) { fields.push('owner = ?'); values.push(updates.owner); }
    if (updates.population !== undefined) { fields.push('population = ?'); values.push(updates.population); }
    if (updates.gdp !== undefined) { fields.push('gdp = ?'); values.push(updates.gdp); }
    if (updates.militaryPower !== undefined) { fields.push('military_power = ?'); values.push(updates.militaryPower); }
    if (updates.objects !== undefined) { fields.push('objects = ?'); values.push(JSON.stringify(updates.objects)); }

    if (fields.length === 0) return;

    values.push(regionId);
    const stmt = db.prepare(`UPDATE world_regions SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  },

  createWithRegions: (world: { id: string; name: string; description?: string; startDate?: string; basePrompt?: string; historicalAccuracy?: number }, regions: any[]) => {
    const createWorld = db.transaction(() => {
      worldQueries.create(world);
      for (const region of regions) {
        worldQueries.addRegion({
          id: region.id,
          worldId: world.id,
          name: region.name,
          svgPath: region.svgPath,
          color: region.color,
          owner: region.owner,
          population: region.population,
          gdp: region.gdp,
          militaryPower: region.militaryPower,
        });
      }
    });
    createWorld();
    return worldQueries.getById(world.id);
  },
};

// ==============================================================================
// Game Queries
// ==============================================================================

export const gameQueries = {
  create: (game: { id: string; worldId: string; currentTurn?: number; maxTurns?: number; status?: string }) => {
    const stmt = db.prepare(`
      INSERT INTO games (id, world_id, current_turn, max_turns, status)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      game.id,
      game.worldId,
      game.currentTurn || 1,
      game.maxTurns || 100,
      game.status || 'playing'
    );
    return game;
  },

  getById: (id: string) => {
    const stmt = db.prepare('SELECT * FROM games WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      ...row,
      world: worldQueries.getById(row.world_id),
      players: gameQueries.getPlayers(id),
    };
  },

  getPlayers: (gameId: string) => {
    const stmt = db.prepare('SELECT * FROM players WHERE game_id = ?');
    const rows = stmt.all(gameId) as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      regionId: row.region_id,
      color: row.color,
    }));
  },

  addPlayer: (player: { id: string; gameId: string; name: string; regionId: string; color?: string }) => {
    const stmt = db.prepare(`
      INSERT INTO players (id, game_id, name, region_id, color)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(player.id, player.gameId, player.name, player.regionId, player.color || '#FF0000');
    return player;
  },

  addAction: (action: { id: string; gameId: string; playerId: string; turn: number; text: string }) => {
    const stmt = db.prepare(`
      INSERT INTO actions (id, game_id, player_id, turn, text)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(action.id, action.gameId, action.playerId, action.turn, action.text);
    return action;
  },

  addTurnResult: (result: { id: string; gameId: string; turn: number; narration: string; countryResponse: string; events?: string[] }) => {
    const stmt = db.prepare(`
      INSERT INTO turn_results (id, game_id, turn, narration, country_response, events)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      result.id,
      result.gameId,
      result.turn,
      result.narration,
      result.countryResponse,
      JSON.stringify(result.events || [])
    );
    return result;
  },

  updateTurn: (gameId: string, turn: number) => {
    const stmt = db.prepare('UPDATE games SET current_turn = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(turn, gameId);
  },
};

export default db;
