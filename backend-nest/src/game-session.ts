/**
 * Open-Pax — Game Session
 * ========================
 * Per-game session that encapsulates all game state and logic.
 * Each game gets its own GameSession instance via SessionRegistry.
 */

import { v4 as uuid } from 'uuid';
import { MiniMaxProvider } from './llm';
import { GameController } from './agents';
import { PromptEngine } from './prompt-builder';
import { worldRepository, gameRepository } from './repositories';
import db from './database';

export interface RegionState {
  id: string;
  name: string;
  color: string;
  owner: string;
  population: number;
  gdp: number;
  militaryPower: number;
  objects: any[];
  svgPath?: string;
  borders?: string[];
  status?: string;
}

export interface PlayerInfo {
  id: string;
  name: string;
  regionId: string;
  color: string;
}

export interface ActionRecord {
  id: string;
  playerId: string;
  turn: number;
  text: string;
  createdAt: string;
}

export interface TurnResultRecord {
  id: string;
  turn: number;
  narration: string;
  countryResponse: string;
  events: string[];
}

export interface PendingAction {
  id: string;
  text: string;
  createdAt: string;
  status: 'pending' | 'processing' | 'completed';
  result?: {
    narration: string;
    countryResponse: string;
    events: string[];
    objects: any[];
    turn: number;
    periodStart: string;  // Date before processing this action
    periodEnd: string;    // Date after processing this action
  };
}

export interface WorldChanges {
  regionOwners?: Record<string, string>;
  regionColors?: Record<string, string>;
  regionGDP?: Record<string, number>;
  regionMilitary?: Record<string, number>;
  regionPopulation?: Record<string, number>;
}

export interface SaveData {
  currentTurn: number;
  currentDate: string;
  players: PlayerInfo[];
  regions: [string, RegionState][]; // [regionId, state] pairs
}

export class GameSession {
  public readonly id: string;
  public readonly worldId: string;

  // Full region state - source of truth during gameplay
  private regions: Map<string, RegionState> = new Map();

  // Session-specific agents (not shared!)
  private gameController: GameController;
  private promptEngine: PromptEngine;

  // Game state
  private players: PlayerInfo[] = [];
  private currentTurn: number = 1;
  private currentDate: string = '1951-01-01';
  private maxTurns: number = 100;
  private actions: ActionRecord[] = [];
  private results: TurnResultRecord[] = [];
  private status: 'waiting' | 'playing' | 'finished' = 'playing';

  // Pending actions queue (Phase 2)
  private pendingActions: PendingAction[] = [];

  constructor(gameId: string, worldId: string, provider: MiniMaxProvider) {
    this.id = gameId;
    this.worldId = worldId;
    this.gameController = new GameController(provider);
    this.promptEngine = new PromptEngine(provider);
  }

  /**
   * Build game data object for prompt engine
   */
  private buildGameData(): any {
    const player = this.players[0];

    // Convert regions Map to object for compatibility
    const regionsObj: Record<string, RegionState> = {};
    for (const [id, region] of this.regions) {
      regionsObj[id] = region;
    }

    return {
      id: this.id,
      currentDate: this.currentDate,
      currentTurn: this.currentTurn,
      world: {
        name: '',
        basePrompt: '',
        startDate: this.currentDate,
        regions: regionsObj,
      },
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        regionId: p.regionId,
      })),
      actions: this.actions,
      results: this.results,
    };
  }

  /**
   * Initialize session from existing world data
   */
  async initialize(playerRegionId: string, playerName: string, playerColor: string = '#FF0000'): Promise<string> {
    // Load world from DB
    const world = worldRepository.findById(this.worldId);
    if (!world) throw new Error('World not found');

    // Load all regions into session state
    for (const region of world.regions) {
      this.regions.set(region.id, {
        id: region.id,
        name: region.name,
        color: region.color,
        owner: region.owner,
        population: region.population,
        gdp: region.gdp,
        militaryPower: region.militaryPower,
        objects: region.objects || [],
        svgPath: region.svgPath,
        borders: region.borders,
        status: region.status,
      });
    }

    // Create player
    const playerId = uuid().slice(0, 8);
    this.players = [{
      id: playerId,
      name: playerName,
      regionId: playerRegionId,
      color: playerColor,
    }];

    // Initialize session-specific game controller
    this.gameController.initPromptEngine(this.buildGameData());
    this.gameController.setupWorld(world.base_prompt);

    const playerRegion = this.regions.get(playerRegionId);
    this.gameController.addCountry(playerRegionId, playerRegion?.name || 'Unknown');

    // Setup NPC agents
    const regionConfigs = Array.from(this.regions.values())
      .filter(r => r.owner.startsWith('ai-'))
      .map(r => ({ id: r.id, name: r.name, owner: r.owner }));
    this.gameController.setupNPCCountries(regionConfigs);

    this.currentDate = world.start_date || '1951-01-01';

    // Sync all regions to DB on init (ensure baseline is persisted)
    await this.syncRegionsToDB();

    return playerId;
  }

  /**
   * Reconstruct session from DB state (used when loading from DB)
   * Fully restores session including game controller for AI to work
   */
  reconstructFromDB(data: {
    currentTurn: number;
    currentDate: string;
    players: PlayerInfo[];
    regionStates?: [string, RegionState][];
    basePrompt?: string;
  }): void {
    this.currentTurn = data.currentTurn;
    this.currentDate = data.currentDate;
    this.players = data.players || [];

    // If region states provided (from save), use them
    if (data.regionStates) {
      this.regions = new Map(data.regionStates);
    } else {
      // Load from world_regions table
      const dbRegions = worldRepository.getRegions(this.worldId);
      for (const region of dbRegions) {
        this.regions.set(region.id, {
          id: region.id,
          name: region.name,
          color: region.color,
          owner: region.owner,
          population: region.population,
          gdp: region.gdp,
          militaryPower: region.militaryPower,
          objects: region.objects || [],
          svgPath: region.svgPath,
          borders: region.borders,
          status: region.status,
        });
      }
    }

    // Re-initialize game controller with current state
    this.gameController.initPromptEngine(this.buildGameData());

    // Load world for base prompt
    const world = worldRepository.findById(this.worldId);
    const basePrompt = data.basePrompt || world?.base_prompt || '';
    this.gameController.setupWorld(basePrompt);

    // Re-add player country
    const player = this.players[0];
    if (player) {
      const playerRegion = this.regions.get(player.regionId);
      this.gameController.addCountry(player.regionId, playerRegion?.name || 'Unknown');
    }

    // Re-setup NPC countries
    const regionConfigs = Array.from(this.regions.values())
      .filter(r => r.owner.startsWith('ai-'))
      .map(r => ({ id: r.id, name: r.name, owner: r.owner }));
    this.gameController.setupNPCCountries(regionConfigs);

    console.log('[GameSession] Reconstructed session from DB, turn:', this.currentTurn);
  }

  /**
   * Get region by ID
   */
  getRegion(regionId: string): RegionState | undefined {
    return this.regions.get(regionId);
  }

  /**
   * Get all regions
   */
  getAllRegions(): RegionState[] {
    return Array.from(this.regions.values());
  }

  /**
   * Get player info
   */
  getPlayer(): PlayerInfo | undefined {
    return this.players[0];
  }

  /**
   * Get current turn
   */
  getCurrentTurn(): number {
    return this.currentTurn;
  }

  /**
   * Get current date
   */
  getCurrentDate(): string {
    return this.currentDate;
  }

  /**
   * Get game status
   */
  getStatus(): string {
    return this.status;
  }

  /**
   * Get game results history
   */
  getResults(): TurnResultRecord[] {
    return this.results;
  }

  /**
   * Apply a turn - main game logic entry point
   */
  async applyTurn(playerAction: string, jumpDays: number): Promise<{
    turn: number;
    narration: string;
    countryResponse: string;
    events: string[];
    objects: any[];
  }> {
    const player = this.players[0];
    if (!player) throw new Error('No player in session');

    const playerRegion = this.regions.get(player.regionId);
    if (!playerRegion) throw new Error('Player region not found');

    const timeJump = jumpDays || 30;

    // Build game data for prompt engine
    const gameData = this.buildGameData();

    // Process turn with prompts (time-rewind.md)
    const promptResult = await this.gameController.processTurnWithPrompts(
      gameData,
      playerAction.split(' | '),
      timeJump
    );

    // Apply world changes from simulation
    if (promptResult.worldChanges) {
      this.applyWorldChanges(promptResult.worldChanges);
    }

    // Detect and create objects
    const createdObjects = this.detectAndCreateObjects(playerRegion, playerAction + ' ' + promptResult.convertedActions.map((a: any) => a.text).join(' '));

    // Process NPC turns
    const npcEvents = await this.processNPCTurns();

    // Apply random events
    const randomEvents = this.applyRandomEvents();

    // Record action
    const actionRecord: ActionRecord = {
      id: uuid().slice(0, 8),
      playerId: player.id,
      turn: this.currentTurn,
      text: playerAction,
      createdAt: new Date().toISOString(),
    };
    this.actions.push(actionRecord);

    // Persist action to DB
    gameRepository.addAction({
      id: actionRecord.id,
      gameId: this.id,
      playerId: player.id,
      turn: this.currentTurn,
      text: playerAction,
    });

    // Create turn result
    const turnResult: TurnResultRecord = {
      id: uuid().slice(0, 8),
      turn: this.currentTurn,
      narration: promptResult.narration,
      countryResponse: promptResult.convertedActions.map((a: any) => a.text).join('\n'),
      events: [...npcEvents, ...randomEvents, ...createdObjects.map(o => o.text)],
    };
    this.results.push(turnResult);

    // Persist turn result to DB
    gameRepository.addTurnResult({
      id: turnResult.id,
      gameId: this.id,
      turn: this.currentTurn,
      narration: turnResult.narration,
      countryResponse: turnResult.countryResponse,
      events: turnResult.events,
    });

    // Persist ALL region changes to DB (FIXES: was only persisting player region)
    await this.syncRegionsToDB();

    // Persist turn number to DB
    gameRepository.updateTurn(this.id, this.currentTurn + 1);

    // Advance turn
    this.currentTurn++;
    const date = new Date(this.currentDate);
    date.setDate(date.getDate() + timeJump);
    this.currentDate = date.toISOString().split('T')[0];

    return {
      turn: this.currentTurn - 1,
      narration: turnResult.narration,
      countryResponse: turnResult.countryResponse,
      events: turnResult.events,
      objects: playerRegion.objects,
    };
  }

  /**
   * Apply world changes from simulation
   */
  private applyWorldChanges(changes: WorldChanges): void {
    if (changes.regionOwners) {
      for (const [regionId, newOwner] of Object.entries(changes.regionOwners)) {
        const region = this.regions.get(regionId);
        if (region) {
          region.owner = newOwner;
          // Sync color with owner
          if (changes.regionColors?.[regionId]) {
            region.color = changes.regionColors[regionId];
          }
        }
      }
    }

    if (changes.regionGDP) {
      for (const [regionId, gdp] of Object.entries(changes.regionGDP)) {
        const region = this.regions.get(regionId);
        if (region) region.gdp = gdp;
      }
    }

    if (changes.regionMilitary) {
      for (const [regionId, military] of Object.entries(changes.regionMilitary)) {
        const region = this.regions.get(regionId);
        if (region) region.militaryPower = military;
      }
    }

    if (changes.regionPopulation) {
      for (const [regionId, pop] of Object.entries(changes.regionPopulation)) {
        const region = this.regions.get(regionId);
        if (region) region.population = pop;
      }
    }
  }

  /**
   * Detect and create objects from action text
   */
  private detectAndCreateObjects(region: RegionState, text: string): { text: string }[] {
    const createdObjects: { text: string }[] = [];

    const objectPatterns: Record<string, RegExp[]> = {
      army: [/арми(?:ю|я|ю|)\s/iu, /войск(?:а|о|у|)\s/iu, /воен(?:ый|ая|ое)\s/iu, /soldiers/iu],
      fleet: [/флот(?:а|у|ом|)\s/iu, /корабл(?:ь|ей|ям|)\s/iu, /морск(?:ой|ая|ое)\s/iu, /navy/iu, /fleet/iu],
      missile: [/ракет(?:а|ы|е|)\s/iu, /баллистическ/iu, /missile/iu],
      radar: [/радар(?:а|у|ом|)\s/iu, /радиолокацион/iu, /radar/iu],
      port: [/порт(?:а|у|ом|)\s/iu, /гаван(?:ь|и|ью|)\s/iu, /port/iu],
      exchange: [/бирж(?:а|у|ей|)\s/iu, /обмен(?:а|у|)\s/iu, /exchange/iu],
      clearing: [/клиринг(?:а|у|ов|)\s/iu, /расчет(?:а|ов|)\s/iu, /clearing/iu],
      grouping: [/группировк(?:а|и|у|)\s/iu, /объединен/iu, /grouping/iu],
      factory: [/завод(?:а|у|ом|)\s/iu, /фабрик(?:а|и|у|)\s/iu, /предприят/iu, /factory/iu, /plant/iu],
      university: [/университет(?:а|у|ом|)\s/iu, /университет/iu, /институт(?:а|у|)\s/iu, /академи(?:я|и|)\s/iu, /university/iu, / institute/iu],
      city: [/город(?:а|у|ом|)?\s/iu, /city/iu, /capital/iu, /столиц/iu, /посел(?:ок|ение|ий)/iu],
    };

    // Helper to calculate centroid from SVG path
    const getCentroid = (path: string): { x: number; y: number } | null => {
      const nums = path.match(/-?\d+\.?\d*/g);
      if (!nums || nums.length < 2) return null;
      const points: number[] = nums.map(Number);
      let sumX = 0, sumY = 0, count = 0;
      for (let i = 0; i < points.length; i += 2) {
        sumX += points[i];
        sumY += points[i + 1] || 0;
        count++;
      }
      return count > 0 ? { x: sumX / count, y: sumY / count } : null;
    };

    const combinedText = text.toLowerCase();
    const centroid = getCentroid(region.svgPath || '');

    for (const [objType, patterns] of Object.entries(objectPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(combinedText)) {
          // For cities, use centroid position; for others, use random with offset
          const baseX = centroid ? centroid.x : 500;
          const baseY = centroid ? centroid.y : 400;
          const offsetX = objType === 'city' ? 0 : (Math.random() - 0.5) * 200;
          const offsetY = objType === 'city' ? 0 : (Math.random() - 0.5) * 150;

          const newObject = {
            id: uuid().slice(0, 8),
            type: objType,
            name: `${region.name} ${objType === 'city' ? 'гор.' : objType.charAt(0).toUpperCase() + objType.slice(1)} ${(region.objects?.length || 0) + 1}`,
            x: baseX + offsetX,
            y: baseY + offsetY,
            level: 1,
          };

          if (!region.objects) {
            region.objects = [];
          }

          region.objects.push(newObject);
          createdObjects.push({ text: `✓ Создан ${objType}: ${newObject.name}` });
          break;
        }
      }
    }

    return createdObjects;
  }

  /**
   * Process NPC turns for all NPC countries
   */
  private async processNPCTurns(): Promise<string[]> {
    const npcEvents: string[] = [];
    const npcRegionIds = this.gameController.getNPCCountries();

    for (const npcRegionId of npcRegionIds) {
      const npcRegion = this.regions.get(npcRegionId);
      if (!npcRegion) continue;

      // Build neighbors
      const neighbors = Array.from(this.regions.values())
        .filter(r => r.id !== npcRegionId)
        .slice(0, 5)
        .map(r => ({
          id: r.id,
          name: r.name,
          owner: r.owner,
          militaryPower: r.militaryPower,
          gdp: r.gdp,
        }));

      const npcContext = {
        turn: this.currentTurn,
        population: npcRegion.population,
        gdp: npcRegion.gdp,
        militaryPower: npcRegion.militaryPower,
        neighbors,
        recentEvents: this.results.slice(-3).map(r => r.narration),
      };

      try {
        const npcAction = await this.gameController.processNPCTurn(npcRegionId, npcContext);
        if (npcAction) {
          npcEvents.push(`${npcRegion.name}: ${npcAction.description}`);

          // Apply NPC action effects
          if (npcAction.type === 'develop') {
            npcRegion.gdp = Math.floor(npcRegion.gdp * 1.05);
            npcRegion.militaryPower = Math.floor(npcRegion.militaryPower * 1.03);
          } else if (npcAction.type === 'war' && npcAction.targetRegionId) {
            const targetRegion = this.regions.get(npcAction.targetRegionId);
            if (targetRegion && targetRegion.militaryPower < npcRegion.militaryPower * 0.7) {
              targetRegion.owner = npcRegionId;
              targetRegion.color = npcRegion.color;
              npcEvents.push(`⚔️ ${npcRegion.name} захватила ${targetRegion.name}!`);
            }
          }
        }
      } catch (e) {
        console.error(`NPC turn error for ${npcRegionId}:`, e);
      }
    }

    return npcEvents;
  }

  /**
   * Apply random events (15% chance)
   */
  private applyRandomEvents(): string[] {
    const randomEvents: string[] = [];

    if (Math.random() < 0.15) {
      const eventTypes = [
        { name: 'Природное бедствие', effects: ['землетрясение', 'наводнение', 'засуха', 'ураган'] },
        { name: 'Экономический кризис', effects: ['рецессия', 'инфляция', 'дефицит'] },
        { name: 'Технологический прорыв', effects: ['изобретение', 'открытие', 'инновация'] },
        { name: 'Социальные волнения', effects: ['протесты', 'забастовка', 'революция'] },
        { name: 'Эпидемия', effects: ['чума', 'грипп', 'вирус'] },
      ];

      const event = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const effect = event.effects[Math.floor(Math.random() * event.effects.length)];
      const regionsArray = Array.from(this.regions.values());
      const targetRegion = regionsArray[Math.floor(Math.random() * regionsArray.length)];

      const eventText = `🔮 ${event.name}: ${effect} в ${targetRegion.name}`;
      randomEvents.push(eventText);

      // Apply effects
      if (event.name === 'Природное бедствие') {
        targetRegion.population = Math.floor(targetRegion.population * 0.95);
        targetRegion.gdp = Math.floor(targetRegion.gdp * 0.9);
      } else if (event.name === 'Экономический кризис') {
        targetRegion.gdp = Math.floor(targetRegion.gdp * 0.85);
      } else if (event.name === 'Технологический прорыв') {
        targetRegion.gdp = Math.floor(targetRegion.gdp * 1.15);
        targetRegion.militaryPower = Math.floor(targetRegion.militaryPower * 1.1);
      } else if (event.name === 'Социальные волнения') {
        targetRegion.militaryPower = Math.floor(targetRegion.militaryPower * 0.9);
      } else if (event.name === 'Эпидемия') {
        targetRegion.population = Math.floor(targetRegion.population * 0.9);
        targetRegion.militaryPower = Math.floor(targetRegion.militaryPower * 0.85);
      }
    }

    return randomEvents;
  }

  /**
   * Sync all region changes to database
   * Called after each turn to persist all changes
   */
  async syncRegionsToDB(): Promise<void> {
    for (const [regionId, region] of this.regions) {
      worldRepository.updateRegion(regionId, {
        owner: region.owner,
        color: region.color,
        population: region.population,
        gdp: region.gdp,
        militaryPower: region.militaryPower,
        objects: region.objects,
      });
    }
  }

  /**
   * Save full session state to saves table
   */
  save(name: string): { saveId: string; currentTurn: number; currentDate: string } {
    const saveId = uuid().slice(0, 8);

    // Capture full region snapshot
    const saveData: SaveData = {
      currentTurn: this.currentTurn,
      currentDate: this.currentDate,
      players: this.players,
      regions: Array.from(this.regions.entries()),
    };

    const stmt = db.prepare(`
      INSERT INTO saves (id, game_id, name, current_turn, current_date, data, saved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      saveId,
      this.id,
      name || `Game ${new Date().toLocaleDateString()}`,
      this.currentTurn,
      this.currentDate,
      JSON.stringify(saveData),
      new Date().toISOString()
    );

    console.log('[GameSession] Saved:', saveId, 'turn:', this.currentTurn);
    return { saveId, currentTurn: this.currentTurn, currentDate: this.currentDate };
  }

  /**
   * Load session from save data
   */
  loadFromSave(saveData: SaveData): void {
    this.currentTurn = saveData.currentTurn;
    this.currentDate = saveData.currentDate;
    this.players = saveData.players || [];

    // Restore regions
    if (saveData.regions) {
      this.regions = new Map(saveData.regions);
    }

    // Update game in DB
    gameRepository.updateTurn(this.id, this.currentTurn);

    // Sync restored regions to DB
    this.syncRegionsToDB();

    console.log('[GameSession] Loaded from save, turn:', this.currentTurn);
  }

  /**
   * Get advisor response using prompt system
   */
  async getAdvisor(message: string, history: any[] = []): Promise<string> {
    const gameData = this.buildGameData();
    return this.gameController.getAdvisorWithPrompts(gameData, message, history);
  }

  /**
   * Get suggestions using actions.md prompts
   */
  async getSuggestions(): Promise<any[]> {
    const gameData = this.buildGameData();
    return this.gameController.getSuggestionsWithPrompts(gameData);
  }

  // =========================================================================
  // Pending Actions Queue (Phase 2)
  // =========================================================================

  /**
   * Add action to pending queue (without processing)
   */
  queueAction(text: string): PendingAction {
    const action: PendingAction = {
      id: uuid().slice(0, 8),
      text,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    this.pendingActions.push(action);
    console.log('[GameSession] Queued action:', action.id, 'text:', text.substring(0, 50));
    return action;
  }

  /**
   * Get all pending actions
   */
  getPendingActions(): PendingAction[] {
    return this.pendingActions;
  }

  /**
   * Clear completed actions from queue
   */
  clearCompletedActions(): void {
    this.pendingActions = this.pendingActions.filter(a => a.status !== 'completed');
  }

  /**
   * Process ONE action from the queue (for sequential processing)
   * Called when time-skip happens or when explicitly processing
   */
  async processNextAction(jumpDays: number = 30): Promise<PendingAction | null> {
    // Find next pending action
    const action = this.pendingActions.find(a => a.status === 'pending');
    if (!action) {
      console.log('[GameSession] No pending actions to process');
      return null;
    }

    action.status = 'processing';
    console.log('[GameSession] Processing action:', action.id, 'text:', action.text.substring(0, 50));

    try {
      // Call the existing applyTurn logic but for a single action
      const player = this.players[0];
      if (!player) throw new Error('No player in session');

      const playerRegion = this.regions.get(player.regionId);
      if (!playerRegion) throw new Error('Player region not found');

      const timeJump = jumpDays || 30;

      // Build game data for prompt engine
      const gameData = this.buildGameData();

      // Process turn with prompts (single action)
      const promptResult = await this.gameController.processTurnWithPrompts(
        gameData,
        [action.text], // Single action as array
        timeJump
      );

      // Apply world changes from simulation
      if (promptResult.worldChanges) {
        this.applyWorldChanges(promptResult.worldChanges);
      }

      // Detect and create objects
      const createdObjects = this.detectAndCreateObjects(
        playerRegion,
        action.text + ' ' + promptResult.convertedActions.map((a: any) => a.text).join(' ')
      );

      // Process NPC turns (for this period)
      const npcEvents = await this.processNPCTurns();

      // Apply random events
      const randomEvents = this.applyRandomEvents();

      // Record action
      const actionRecord: ActionRecord = {
        id: action.id,
        playerId: player.id,
        turn: this.currentTurn,
        text: action.text,
        createdAt: action.createdAt,
      };
      this.actions.push(actionRecord);

      // Persist action to DB
      gameRepository.addAction({
        id: actionRecord.id,
        gameId: this.id,
        playerId: player.id,
        turn: this.currentTurn,
        text: action.text,
      });

      // Create turn result
      const turnResult: TurnResultRecord = {
        id: uuid().slice(0, 8),
        turn: this.currentTurn,
        narration: promptResult.narration,
        countryResponse: promptResult.convertedActions.map((a: any) => a.text).join('\n'),
        events: [...npcEvents, ...randomEvents, ...createdObjects.map(o => o.text)],
      };
      this.results.push(turnResult);

      // Persist turn result to DB
      gameRepository.addTurnResult({
        id: turnResult.id,
        gameId: this.id,
        turn: this.currentTurn,
        narration: turnResult.narration,
        countryResponse: turnResult.countryResponse,
        events: turnResult.events,
      });

      // Persist ALL region changes to DB
      await this.syncRegionsToDB();

      // Persist turn number to DB
      gameRepository.updateTurn(this.id, this.currentTurn + 1);

      // Update action with result (before advancing date)
      action.status = 'completed';
      const periodStart = this.currentDate;
      action.result = {
        narration: turnResult.narration,
        countryResponse: turnResult.countryResponse,
        events: turnResult.events,
        objects: playerRegion.objects,
        turn: this.currentTurn,
        periodStart,
        periodEnd: '', // Will be set after date advance
      };

      // Advance turn and date
      this.currentTurn++;
      const date = new Date(this.currentDate);
      date.setDate(date.getDate() + timeJump);
      this.currentDate = date.toISOString().split('T')[0];

      // Now set periodEnd (after advancing)
      action.result.periodEnd = this.currentDate;

      console.log('[GameSession] Action processed, new date:', this.currentDate);
      return action;

    } catch (e) {
      console.error('[GameSession] Error processing action:', e);
      action.status = 'pending'; // Reset status on error
      throw e;
    }
  }

  /**
   * Process all pending actions sequentially
   */
  async processAllPendingActions(jumpDays: number = 30): Promise<PendingAction[]> {
    const processed: PendingAction[] = [];
    let action = await this.processNextAction(jumpDays);

    while (action) {
      processed.push(action);
      action = await this.processNextAction(jumpDays);
    }

    return processed;
  }

  /**
   * Advance date without processing actions (for time-skip without pending actions)
   */
  advanceDate(jumpDays: number = 30): { newDate: string; newTurn: number } {
    const periodStart = this.currentDate;
    this.currentTurn++;
    const date = new Date(this.currentDate);
    date.setDate(date.getDate() + jumpDays);
    this.currentDate = date.toISOString().split('T')[0];

    // Persist to DB
    gameRepository.updateTurn(this.id, this.currentTurn);

    console.log('[GameSession] Advanced date:', periodStart, '->', this.currentDate);
    return { newDate: this.currentDate, newTurn: this.currentTurn };
  }
}
