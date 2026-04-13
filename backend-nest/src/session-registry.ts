/**
 * Open-Pax — Session Registry
 * ============================
 * Manages all active GameSession instances.
 * Provides session lookup, creation, loading from DB.
 */

import { v4 as uuid } from 'uuid';
import { MiniMaxProvider } from './llm';
import { GameSession, SaveData } from './game-session';
import { gameRepository, worldRepository } from './repositories';
import db from './database';

class SessionRegistry {
  private sessions: Map<string, GameSession> = new Map();
  private provider: MiniMaxProvider;

  constructor(provider: MiniMaxProvider) {
    this.provider = provider;
  }

  /**
   * Create a new game session
   */
  createSession(worldId: string, playerName: string, playerRegionId: string, playerColor: string = '#FF0000'): { session: GameSession; playerId: string; gameId: string } {
    const gameId = uuid().slice(0, 8);

    // Verify world exists
    const world = worldRepository.findById(worldId);
    if (!world) {
      throw new Error('World not found');
    }

    // Verify region exists
    const region = world.regions.find((r: any) => r.id === playerRegionId);
    if (!region) {
      throw new Error('Region not found');
    }

    // Create game in database
    gameRepository.create({
      id: gameId,
      worldId,
      currentTurn: 1,
      maxTurns: 100,
      status: 'playing',
    });

    // Add player to database
    const playerId = uuid().slice(0, 8);
    gameRepository.addPlayer({
      id: playerId,
      gameId,
      name: playerName || 'Player',
      regionId: playerRegionId,
      color: playerColor,
    });

    // Create session
    const session = new GameSession(gameId, worldId, this.provider);

    // Initialize session (sets up agents, loads regions)
    session.initialize(playerRegionId, playerName, playerColor);

    // Cache session
    this.sessions.set(gameId, session);

    console.log('[SessionRegistry] Created session:', gameId);
    return { session, playerId, gameId };
  }

  /**
   * Get existing session from memory or load from DB
   */
  getSession(gameId: string): GameSession | null {
    // Check memory first
    if (this.sessions.has(gameId)) {
      return this.sessions.get(gameId)!;
    }

    // Try to load from database
    const game = gameRepository.findById(gameId);
    if (!game) {
      return null;
    }

    // Reconstruct session from DB state
    const session = new GameSession(gameId, game.world_id, this.provider);

    // Get player info from DB
    const players = gameRepository.getPlayers(gameId);

    // Load regions from DB
    const dbRegions = worldRepository.getRegions(game.world_id);
    const regionStates: [string, any][] = dbRegions.map(r => [
      r.id,
      {
        id: r.id,
        name: r.name,
        color: r.color,
        owner: r.owner,
        population: r.population,
        gdp: r.gdp,
        militaryPower: r.militaryPower,
        objects: r.objects || [],
        svgPath: r.svgPath,
      }
    ]);

    session.reconstructFromDB({
      currentTurn: game.current_turn,
      currentDate: game.current_date || game.world?.start_date || '1951-01-01',
      players: players.map(p => ({
        id: p.id,
        name: p.name,
        regionId: p.regionId,
        color: p.color,
      })),
      regionStates,
    });

    // Cache session
    this.sessions.set(gameId, session);

    console.log('[SessionRegistry] Loaded session from DB:', gameId);
    return session;
  }

  /**
   * Load a saved game
   */
  loadSavedGame(saveId: string): GameSession | null {
    // Get save record
    const stmt = db.prepare('SELECT * FROM saves WHERE id = ?');
    const save = stmt.get(saveId) as any;

    if (!save) {
      console.log('[SessionRegistry] Save not found:', saveId);
      return null;
    }

    // Get or create session for this game
    let session = this.getSession(save.game_id);
    if (!session) {
      console.log('[SessionRegistry] Game not found for save:', save.game_id);
      return null;
    }

    // Parse save data
    let saveData: SaveData;
    try {
      saveData = JSON.parse(save.data);
    } catch (e) {
      console.error('[SessionRegistry] Failed to parse save data:', e);
      return null;
    }

    // Load session from save data
    session.loadFromSave(saveData);

    console.log('[SessionRegistry] Loaded saved game:', saveId, 'turn:', saveData.currentTurn);
    return session;
  }

  /**
   * Get session or throw error
   */
  getSessionOrThrow(gameId: string): GameSession {
    const session = this.getSession(gameId);
    if (!session) {
      throw new Error('Game not found: ' + gameId);
    }
    return session;
  }

  /**
   * Reload active sessions from DB on server restart
   */
  reloadActiveSessions(): void {
    const stmt = db.prepare("SELECT * FROM games WHERE status = 'playing'");
    const activeGames = stmt.all() as any[];

    for (const game of activeGames) {
      try {
        const session = new GameSession(game.id, game.world_id, this.provider);

        // Get player info from DB
        const players = gameRepository.getPlayers(game.id);

        // Load regions from DB
        const dbRegions = worldRepository.getRegions(game.world_id);
        const regionStates: [string, any][] = dbRegions.map(r => [
          r.id,
          {
            id: r.id,
            name: r.name,
            color: r.color,
            owner: r.owner,
            population: r.population,
            gdp: r.gdp,
            militaryPower: r.militaryPower,
            objects: r.objects || [],
            svgPath: r.svgPath,
          }
        ]);

        session.reconstructFromDB({
          currentTurn: game.current_turn,
          currentDate: game.world?.start_date || '1951-01-01',
          players: players.map((p: any) => ({
            id: p.id,
            name: p.name,
            regionId: p.regionId,
            color: p.color,
          })),
          regionStates,
        });

        this.sessions.set(game.id, session);
        console.log('[SessionRegistry] Restored session:', game.id);
      } catch (e) {
        console.error('[SessionRegistry] Failed to restore session:', game.id, e);
      }
    }

    console.log(`[SessionRegistry] Reloaded ${this.sessions.size} active sessions`);
  }

  /**
   * Remove session from registry
   */
  removeSession(gameId: string): void {
    this.sessions.delete(gameId);
    console.log('[SessionRegistry] Removed session:', gameId);
  }

  /**
   * Get all active session IDs
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }
}

// Singleton instance - will be initialized in index.ts with provider
let registry: SessionRegistry | null = null;

export function initSessionRegistry(provider: MiniMaxProvider): SessionRegistry {
  registry = new SessionRegistry(provider);
  return registry;
}

export function getSessionRegistry(): SessionRegistry {
  if (!registry) {
    throw new Error('SessionRegistry not initialized');
  }
  return registry;
}

export { SessionRegistry };
