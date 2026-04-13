/**
 * Open-Pax — Game Repository
 * ==========================
 */

import db from '../database';
import { worldRepository } from './world.repository';

export interface PlayerRecord {
  id: string;
  name: string;
  regionId: string;
  color: string;
}

export const gameRepository = {
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

  findById: (id: string) => {
    const stmt = db.prepare('SELECT * FROM games WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    const world = worldRepository.findById(row.world_id);
    const players = gameRepository.getPlayers(id);

    return {
      ...row,
      world,
      players,
    };
  },

  getPlayers: (gameId: string): PlayerRecord[] => {
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

  updateDate: (gameId: string, date: string) => {
    const stmt = db.prepare('UPDATE games SET current_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(date, gameId);
  },
};
