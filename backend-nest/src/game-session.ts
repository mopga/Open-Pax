/**
 * Open-Pax — Game Session
 * ========================
 * Per-game session that encapsulates all game state and logic.
 * Each game gets its own GameSession instance via SessionRegistry.
 */

import { shortId } from './utils/short-id';
import { LLMRouter } from './llm';
import { GameController } from './agents';
import { PromptEngine } from './prompt-builder';
import { worldRepository, gameRepository, relationshipRepository } from './repositories';
// ОТКЛЮЧЕНО: переговоры — chatRepository и типы чатов больше не используются
// (фича дипломатических чатов выключена решением владельца; таблицы chats/chat_messages в БД сохраняются).
// import { chatRepository } from './repositories';
// import type { ChatRecord, ChatSummary, ChatMessageRecord } from './repositories';
import db from './database';
import { RelationshipMatrix } from './core/RelationshipMatrix';
import { RegionResolver, PolityResolver } from './utils/name-resolver';
import { Difficulty, normalizeDifficulty } from './prompts/difficulty';
// ОТКЛЮЧЕНО: переговоры — промпт дипломатических чатов не собирается
// import { buildChatPrompt, parseChatResponse } from './prompts/chat';
import type { MapChange } from './prompts/types';

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
  borders: string[];
  status: 'active' | 'occupied' | 'destroyed' | 'independent';
}

export interface PlayerInfo {
  id: string;
  name: string;
  regionId: string;
  color: string;
  /** Полития игрока (код страны для шаблонов, 'player' для кастомных карт) */
  polityId?: string;
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
  relationships?: Record<string, Record<string, string>>;
  /** Этап 2: история ходов — иначе rewind/лоад теряет контекст для LLM */
  actions?: ActionRecord[];
  results?: TurnResultRecord[];
  /** Этап 2: консолидированная история и граница её покрытия */
  consolidatedHistory?: string;
  consolidatedUpTo?: number;
  /** Этап 2: сложность игры */
  difficulty?: Difficulty;
}

export class GameSession {
  public readonly id: string;
  public readonly worldId: string;

  // Full region state - source of truth during gameplay
  private regions: Map<string, RegionState> = new Map();

  // Session-specific agents (not shared!)
  private gameController: GameController;
  private promptEngine: PromptEngine;
  private llm: LLMRouter;

  // Game state
  private players: PlayerInfo[] = [];
  private currentTurn: number = 1;
  private currentDate: string = '1951-01-01';
  private maxTurns: number = 100;

  // World metadata cached at init/reconstruct (bug fix: buildGameData used to
  // send basePrompt: '' to every prompt, so the world's custom lore never
  // reached the LLM; STARTING_ROUND_DATE also "floated" each turn because
  // startDate was set to the current date).
  private worldName: string = '';
  private worldBasePrompt: string = '';
  private worldStartDate: string = '';
  /** Этап 5: кастомные правила симуляции мира (rules.md пресет-пакета) */
  private worldSimulationRules: string | undefined = undefined;

  /** Полития игрока по конвенции polityId (см. utils/name-resolver.ts) */
  private playerPolityId: string = 'player';
  /** Сложность игры (Этап 2) */
  private difficulty: Difficulty = 'normal';
  /** Консолидированная история ранних раундов и граница её покрытия (Этап 2) */
  private consolidatedHistory: string = '';
  private consolidatedUpTo: number = 0;
  /** Флаг «Intervene»: остановить применение оставшихся событий пачки (Этап 2) */
  private interveneRequested: boolean = false;
  private actions: ActionRecord[] = [];
  private results: TurnResultRecord[] = [];
  private status: 'waiting' | 'playing' | 'finished' = 'playing';

  // Pending actions queue (Phase 2)
  private pendingActions: PendingAction[] = [];

  /**
   * Per-session mutex around any read-modify-write sequence that mutates
   * `this.regions` / `this.currentTurn` / `this.currentDate` (processNextAction,
   * processNextAction, processAllPendingActions, syncRegionsToDB after a
   * write, etc.).
   *
   * Two concurrent POST /actions/process calls previously both flipped
   * the same PendingAction.status='processing', both ran the LLM call,
   * both applied the delta, both incremented currentTurn, and both
   * wrote the same action row to the DB. This lock collapses them
   * to one effective execution; the second caller gets `null` back
   * and can retry or surface "another turn in progress" to the client.
   *
   * KISS: a single boolean + an awaited promise. No external
   * dependency on `async-mutex`. Sufficient because there's exactly
   * one writer path (this class) — if that ever changes, switch to
   * a real semaphore.
   */
  private isProcessing: boolean = false;

  /**
   * Run `fn` under the per-session lock. If another caller already
   * holds the lock, return `null` immediately (no waiting — the
   * queue may run for many minutes and we don't want a second HTTP
   * request to block that long). On success or thrown error, the
   * lock is always released before this function resolves.
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.isProcessing) {
      console.warn('[GameSession] Concurrent turn attempt rejected (lock held)');
      return null;
    }
    this.isProcessing = true;
    try {
      return await fn();
    } finally {
      this.isProcessing = false;
    }
  }

  // Diplomatic relationships
  private relationships: RelationshipMatrix = new RelationshipMatrix();

  // SSE broadcaster for real-time updates
  private sseBroadcaster: ((type: string, data: any) => void) | null = null;

  constructor(gameId: string, worldId: string, provider: LLMRouter) {
    this.id = gameId;
    this.worldId = worldId;
    this.llm = provider;
    this.gameController = new GameController(provider);
    this.promptEngine = new PromptEngine(provider);
  }

  /**
   * Set SSE broadcaster for real-time updates
   */
  setSSEBroadcaster(broadcaster: (type: string, data: any) => void): void {
    this.sseBroadcaster = broadcaster;
  }

  /**
   * Broadcast event to SSE clients
   */
  private broadcast(type: string, data: any): void {
    if (this.sseBroadcaster) {
      this.sseBroadcaster(type, data);
    }
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
      difficulty: this.difficulty,
      consolidatedHistory: this.consolidatedHistory,
      consolidationTail: this.llm.consolidation.keepRawTail,
      world: {
        name: this.worldName,
        basePrompt: this.worldBasePrompt,
        startDate: this.worldStartDate || this.currentDate,
        regions: regionsObj,
      },
      // Этап 5: правила симуляции мира → HISTORICAL_PRESET_SIMULATION_RULES
      simulationRules: this.worldSimulationRules ?? undefined,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        regionId: p.regionId,
        polityId: p.polityId,
      })),
      playerPolityId: this.playerPolityId,
      actions: this.actions,
      results: this.results,
      // ОТКЛЮЧЕНО: переговоры — транскрипты чатов в промпт симуляции не передаём
      // (prompt-builder подставляет chatTranscripts ?? '')
      // chatTranscripts: this.buildChatTranscripts(),
    };
  }

  // =========================================================================
  // Этап 3: дипломатические чаты — ОТКЛЮЧЕНО: переговоры
  // =========================================================================
  // Фича дипломатических чатов выключена решением владельца: симуляция не
  // создаёт чаты, LLM-вызовы механики 'chat' не выполняются, роуты не
  // смонтированы (см. routes/index.ts). Код сохранён закомментированным;
  // таблицы chats/chat_messages и chat.repository не тронуты — данные и
  // возможность быстрого возврата фичи сохраняются.
  //
  // /**
  //  * Список чатов игры (с последним сообщением и счётчиком непрочитанных).
  //  */
  // getChats(): ChatSummary[] {
  //   return chatRepository.getChatsByGame(this.id);
  // }
  //
  // /**
  //  * Сообщения чата (404, если чат чужой или не существует).
  //  */
  // getChatMessages(chatId: string): ChatMessageRecord[] {
  //   const chat = chatRepository.getChatById(chatId);
  //   if (!chat || chat.gameId !== this.id) {
  //     throw new Error(`Chat not found: ${chatId}`);
  //   }
  //   return chatRepository.getMessages(chatId);
  // }
  //
  // /** Пометить сообщения политии в чате прочитанными. */
  // markChatRead(chatId: string): void {
  //   const chat = chatRepository.getChatById(chatId);
  //   if (!chat || chat.gameId !== this.id) {
  //     throw new Error(`Chat not found: ${chatId}`);
  //   }
  //   chatRepository.markRead(chatId);
  // }
  //
  // /**
  //  * Найти или создать чат с политией по её ИМЕНИ (так её называет LLM/игрок).
  //  * Полития резолвится через PolityResolver по текущим регионам; чат с самим
  //  * собой, с 'neutral' и с несуществующей политией — 404-ошибка.
  //  */
  // ensureChat(polityName: string): ChatRecord {
  //   const resolvers = this.buildResolvers();
  //   const resolution = resolvers.polities.resolve(polityName);
  //
  //   if (!resolution || resolution.isNew
  //       || resolution.polityId === 'neutral'
  //       || resolution.polityId === this.playerPolityId) {
  //     throw new Error(`Polity not found: ${polityName}`);
  //   }
  //
  //   const polityId = resolution.polityId;
  //   const polityRegions = Array.from(this.regions.values()).filter(r => r.owner === polityId);
  //   const displayName = polityRegions[0]?.name || polityId;
  //   const color = polityRegions[0]?.color || '#888888';
  //
  //   const existing = chatRepository.getChatByGameAndPolity(this.id, polityId);
  //   if (existing) return existing;
  //
  //   return chatRepository.createChat({
  //     id: shortId(),
  //     gameId: this.id,
  //     polityId,
  //     polityName: displayName,
  //     polityColor: color,
  //   });
  // }
  //
  // /**
  //  * Отправить сообщение в чат: сохраняет сообщение игрока, спрашивает LLM
  //  * (механика 'chat'), сохраняет ответ политии и рассылает его по SSE.
  //  */
  // async sendChatMessage(chatId: string, content: string): Promise<{ message: ChatMessageRecord; reply: ChatMessageRecord }> {
  //   const chat = chatRepository.getChatById(chatId);
  //   if (!chat || chat.gameId !== this.id) {
  //     throw new Error(`Chat not found: ${chatId}`);
  //   }
  //
  //   // История ДО нового сообщения игрока
  //   const history = chatRepository.getMessages(chatId)
  //     .map(m => ({ role: m.role, content: m.content }));
  //
  //   const message = chatRepository.addMessage(chatId, 'player', content, this.currentTurn);
  //
  //   const prompt = buildChatPrompt({
  //     polityName: chat.polityName,
  //     worldContext: this.worldBasePrompt || 'Альтернативная история',
  //     mapContext: this.buildChatMapContext(),
  //     date: this.currentDate,
  //     relationship: this.relationships.get(chat.polityId, this.playerPolityId),
  //     history,
  //     playerMessage: content,
  //   });
  //
  //   const response = await this.llm.generate(
  //     'chat',
  //     `Ты — лидер и МИД политии ${chat.polityName} в стратегической игре. Отвечай на русском, от первого лица державы, не выходи из роли.`,
  //     prompt,
  //     { temperature: 0.7 }
  //   );
  //
  //   const reply = chatRepository.addMessage(chatId, 'polity', parseChatResponse(response.content), this.currentTurn);
  //
  //   this.broadcast('chat_message', {
  //     chatId: chat.id,
  //     polityId: chat.polityId,
  //     polityName: chat.polityName,
  //     message: reply,
  //   });
  //
  //   return { message, reply };
  // }
  //
  // /**
  //  * Компактное описание карты для чат-промпта: «Полития: регион1, регион2».
  //  */
  // private buildChatMapContext(): string {
  //   const byOwner = new Map<string, RegionState[]>();
  //   for (const region of this.regions.values()) {
  //     if (region.owner === 'neutral') continue;
  //     if (!byOwner.has(region.owner)) byOwner.set(region.owner, []);
  //     byOwner.get(region.owner)!.push(region);
  //   }
  //   const lines: string[] = [];
  //   for (const regions of byOwner.values()) {
  //     lines.push(`${regions[0].name}: ${regions.map(r => r.name).join(', ')}`);
  //   }
  //   return lines.join('\n');
  // }
  //
  // /**
  //  * Предформатированные транскрипты последних чатов для промпта симуляции:
  //  * до 3 самых свежих чатов, до 15 последних сообщений каждого.
  //  */
  // private buildChatTranscripts(): string {
  //   const chats = chatRepository.getChatsByGame(this.id).slice(0, 3);
  //   const parts: string[] = [];
  //
  //   for (const chat of chats) {
  //     const messages = chatRepository.getMessages(chat.id).slice(-15);
  //     if (messages.length === 0) continue;
  //     const lines = messages.map(m =>
  //       m.role === 'player' ? `Игрок: ${m.content}` : `${chat.polityName}: ${m.content}`
  //     );
  //     parts.push(`[Переговоры с ${chat.polityName}]\n${lines.join('\n')}`);
  //   }
  //
  //   return parts.join('\n\n');
  // }

  /**
   * Initialize session from existing world data
   */
  async initialize(playerRegionId: string, playerName: string, playerColor: string = '#FF0000', difficulty?: string): Promise<string> {
    // Load world from DB
    const world = worldRepository.findById(this.worldId);
    if (!world) throw new Error('World not found');

    // Cache world metadata for prompts (bug fix: lore never reached the LLM)
    this.worldName = world.name || '';
    this.worldBasePrompt = world.base_prompt || '';
    this.worldStartDate = world.start_date || '1951-01-01';
    this.worldSimulationRules = world.simulation_rules || undefined;
    this.difficulty = normalizeDifficulty(difficulty);

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
        status: (region.status || 'active') as 'active' | 'occupied' | 'destroyed' | 'independent',
      });
    }

    // Create player. Player's polity = owner of the chosen region
    // (unified polity-id convention: country code for templates).
    const playerPolityId = this.regions.get(playerRegionId)?.owner || 'player';
    this.playerPolityId = playerPolityId;
    const playerId = shortId();
    this.players = [{
      id: playerId,
      name: playerName,
      regionId: playerRegionId,
      color: playerColor,
      polityId: playerPolityId,
    }];

    // Initialize session-specific game controller
    this.gameController.initPromptEngine(this.buildGameData());
    this.gameController.setupWorld(world.base_prompt);

    // Setup NPC agents: NPC = любая полития, кроме игрока и 'neutral'
    // (раньше фильтр был owner.startsWith('ai-') и не видел шаблонные коды).
    const regionConfigs = Array.from(this.regions.values())
      .filter(r => r.owner !== 'neutral' && r.owner !== this.playerPolityId)
      .map(r => ({ id: r.id, name: r.name, owner: r.owner }));
    this.gameController.setupNPCCountries(regionConfigs);

    // Load diplomatic relationships from DB
    const rels = relationshipRepository.getForWorld(this.worldId);
    for (const rel of rels) {
      this.relationships.set(rel.from, rel.to, rel.type);
    }

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
    difficulty?: string;
    consolidatedHistory?: string;
    consolidatedUpTo?: number;
  }): void {
    this.currentTurn = data.currentTurn;
    this.currentDate = data.currentDate;
    this.players = data.players || [];
    this.difficulty = normalizeDifficulty(data.difficulty);
    this.consolidatedHistory = data.consolidatedHistory || '';
    this.consolidatedUpTo = data.consolidatedUpTo || 0;

    // Cache world metadata for prompts BEFORE buildGameData runs below
    // (bug fix: lore never reached the LLM because buildGameData sent basePrompt: '').
    const world = worldRepository.findById(this.worldId);
    this.worldName = world?.name || '';
    this.worldBasePrompt = data.basePrompt || world?.base_prompt || '';
    this.worldStartDate = world?.start_date || '';
    this.worldSimulationRules = world?.simulation_rules || undefined;

    // Restore player's polity (persisted in players.polity_id; fallback —
    // owner of the home region for legacy rows).
    const primaryPlayer = this.players[0];
    this.playerPolityId =
      primaryPlayer?.polityId ||
      (primaryPlayer ? this.regions.get(primaryPlayer.regionId)?.owner : undefined) ||
      'player';

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
          status: (region.status || 'active') as 'active' | 'occupied' | 'destroyed' | 'independent',
        });
      }
    }

    // Re-initialize game controller with current state
    this.gameController.initPromptEngine(this.buildGameData());

    this.gameController.setupWorld(this.worldBasePrompt);

    // Load relationships from DB
    const rels = relationshipRepository.getForWorld(this.worldId);
    for (const rel of rels) {
      this.relationships.set(rel.from, rel.to, rel.type);
    }

    // Re-setup NPC countries: любая полития, кроме игрока и 'neutral'
    const regionConfigs = Array.from(this.regions.values())
      .filter(r => r.owner !== 'neutral' && r.owner !== this.playerPolityId)
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
   * Build name resolvers from the current region state.
   * "ИИ по именам, движок по id": LLM видит только имена, движок резолвит их
   * обратно в regionId/polityId (bug fix: раньше LLM просили вернуть regionId,
   * который он никогда не видел, поэтому mapChanges почти никогда не применялись).
   */
  private buildResolvers(): { regions: RegionResolver; polities: PolityResolver } {
    const all = Array.from(this.regions.values());
    return {
      regions: new RegionResolver(all),
      polities: new PolityResolver(all, this.playerPolityId),
    };
  }

  /**
   * Apply world changes from simulation.
   * Keys могут быть как regionId (legacy), так и ИМЕНА регионов/политий —
   * резолвим оба варианта.
   */
  private applyWorldChanges(changes: WorldChanges): void {
    const resolvers = this.buildResolvers();

    if (changes.regionOwners) {
      for (const [regionKey, newOwner] of Object.entries(changes.regionOwners)) {
        const region = this.regions.get(regionKey) || resolvers.regions.resolve(regionKey);
        if (!region) {
          console.warn('[GameSession] worldChanges: region not found for key:', regionKey);
          continue;
        }
        const liveRegion = this.regions.get(region.id);
        if (!liveRegion) continue;

        const ownerResolution = resolvers.polities.resolve(newOwner);
        liveRegion.owner = ownerResolution?.polityId || newOwner;

        // Sync color: из regionColors, либо цвет существующей политии
        const explicitColor = changes.regionColors?.[regionKey] || changes.regionColors?.[region.id];
        const inheritedColor = resolvers.polities.colorOf(liveRegion.owner);
        if (explicitColor) {
          liveRegion.color = explicitColor;
        } else if (inheritedColor && inheritedColor !== liveRegion.color) {
          liveRegion.color = inheritedColor;
        }
      }
    }

    if (changes.regionGDP) {
      for (const [regionKey, gdp] of Object.entries(changes.regionGDP)) {
        const region = this.regions.get(regionKey) || resolvers.regions.resolve(regionKey);
        const liveRegion = region && this.regions.get(region.id);
        if (liveRegion) liveRegion.gdp = gdp;
      }
    }

    if (changes.regionMilitary) {
      for (const [regionKey, military] of Object.entries(changes.regionMilitary)) {
        const region = this.regions.get(regionKey) || resolvers.regions.resolve(regionKey);
        const liveRegion = region && this.regions.get(region.id);
        if (liveRegion) liveRegion.militaryPower = military;
      }
    }

    if (changes.regionPopulation) {
      for (const [regionKey, pop] of Object.entries(changes.regionPopulation)) {
        const region = this.regions.get(regionKey) || resolvers.regions.resolve(regionKey);
        const liveRegion = region && this.regions.get(region.id);
        if (liveRegion) liveRegion.population = pop;
      }
    }
  }

  /**
   * Гибкий резолвинг региона: id → имя (fuzzy) → override-форматы оригинала
   * ('random', 'coastal', 'west/east/north/south' и русские аналоги, 'target X').
   */
  private resolveRegionFlexible(key: string | undefined | null, resolver: RegionResolver): RegionState | undefined {
    if (!key) return undefined;
    const direct = this.regions.get(key) || resolver.resolve(key);
    if (direct) return this.regions.get(direct.id);

    const norm = key.trim().toLowerCase();
    const all = Array.from(this.regions.values());
    if (all.length === 0) return undefined;

    // Детерминированный «случайный» выбор — от длины строки, чтобы ход был воспроизводим
    const pickDeterministic = (pool: RegionState[]) =>
      pool[key.length % pool.length];

    if (norm === 'random') return pickDeterministic(all);

    if (norm === 'coastal') {
      const coastal = all.filter(r => (r.objects || []).some((o: any) => o.type === 'port'));
      return pickDeterministic(coastal.length > 0 ? coastal : all);
    }

    if (norm.startsWith('target ')) {
      const inner = this.regions.get(norm.slice(7)) || resolver.resolve(key.slice(7));
      return inner ? this.regions.get(inner.id) : undefined;
    }

    const dirMap: Record<string, 'west' | 'east' | 'north' | 'south'> = {
      west: 'west', western: 'west', запад: 'west',
      east: 'east', eastern: 'east', восток: 'east',
      north: 'north', northern: 'north', север: 'north',
      south: 'south', southern: 'south', юг: 'south',
    };
    const dir = Object.entries(dirMap).find(([k]) => norm === k || norm.startsWith(k + ' '))?.[1];
    if (dir) {
      const withCentroid = all
        .map(r => ({ r, c: this.svgCentroid(r.svgPath) }))
        .filter((x): x is { r: RegionState; c: { x: number; y: number } } => !!x.c);
      if (withCentroid.length === 0) return pickDeterministic(all);
      withCentroid.sort((a, b) => {
        switch (dir) {
          case 'west': return a.c.x - b.c.x;
          case 'east': return b.c.x - a.c.x;
          case 'north': return a.c.y - b.c.y; // SVG: y растёт вниз
          case 'south': return b.c.y - a.c.y;
        }
      });
      return withCentroid[0].r;
    }

    return undefined;
  }

  /** Центроид региона из SVG-пути (среднее всех координат). */
  private svgCentroid(path: string | undefined): { x: number; y: number } | null {
    if (!path) return null;
    const nums = path.match(/-?\d+\.?\d*/g);
    if (!nums || nums.length < 4) return null;
    let sumX = 0, sumY = 0, count = 0;
    for (let i = 0; i < nums.length; i += 2) {
      sumX += Number(nums[i]);
      sumY += Number(nums[i + 1] || 0);
      count++;
    }
    return count > 0 ? { x: sumX / count, y: sumY / count } : null;
  }

  /** Кэш геоцентроидов регионов: geojson тяжёлый, считаем один раз на сессию. */
  private geoCenterCache: Map<string, { lat: number; lng: number } | null> = new Map();

  /**
   * Центр региона в lat/lng — для маркеров Этапа 4 ({ id, type, name, lat, lng }).
   * Приоритет: geojson-геометрия из БД (шаблонные миры Natural Earth; кастомные
   * SVG-карты тоже сконвертированы в lng/lat через svgPathToGeoJSON) →
   * центроид SVG-пути по конвенции 2000x1500 → null.
   */
  private regionCenter(region: RegionState): { lat: number; lng: number } | null {
    if (!this.geoCenterCache.has(region.id)) {
      this.geoCenterCache.set(region.id, this.computeGeoCenter(region.id));
    }
    const fromGeo = this.geoCenterCache.get(region.id);
    if (fromGeo) return fromGeo;

    const c = this.svgCentroid(region.svgPath);
    if (c) {
      // Та же конвенция SVG→lng/lat, что в svgPathToGeoJSON (холст 2000x1500)
      return { lng: (c.x / 2000) * 360 - 180, lat: 90 - (c.y / 1500) * 180 };
    }
    return null;
  }

  /**
   * Центроид региона по geojson из БД: среднее точек внешнего кольца
   * наибольшего полигона. GeoJSON хранит координаты как [lng, lat].
   * Для стран через антимеридиан (Россия, США) среднее грубое — для маркера достаточно.
   */
  private computeGeoCenter(regionId: string): { lat: number; lng: number } | null {
    try {
      const row = db.prepare('SELECT geojson FROM world_regions WHERE id = ?').get(regionId) as any;
      if (!row?.geojson) return null;
      const gj = JSON.parse(row.geojson);
      const geom = gj?.geometry ?? gj;
      const polygons: any[] = geom?.type === 'Polygon'
        ? [geom.coordinates]
        : geom?.type === 'MultiPolygon' ? geom.coordinates : [];
      let bestRing: any[] | null = null;
      for (const poly of polygons) {
        const ring = poly?.[0];
        if (Array.isArray(ring) && (!bestRing || ring.length > bestRing.length)) bestRing = ring;
      }
      if (!bestRing || bestRing.length === 0) return null;
      let sumLng = 0, sumLat = 0, n = 0;
      for (const pt of bestRing) {
        if (Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
          sumLng += pt[0];
          sumLat += pt[1];
          n++;
        }
      }
      return n > 0 ? { lng: sumLng / n, lat: sumLat / n } : null;
    } catch {
      return null;
    }
  }

  /**
   * Apply mapChanges from a single simulation event (transfer/create/update/delete).
   * Регионы и политии адресуются ИМЕНАМИ (так их видит LLM в описании карты).
   */
  private applyMapChanges(mapChanges: MapChange[] | undefined): void {
    if (!mapChanges || mapChanges.length === 0) return;
    const resolvers = this.buildResolvers();

    for (const change of mapChanges) {
      const regionKey = change.regionName || change.regionId;
      const liveRegion = this.resolveRegionFlexible(regionKey, resolvers.regions);
      if (!liveRegion) {
        console.warn('[GameSession] mapChange: region not resolved:', regionKey);
        continue;
      }

      switch (change.type) {
        case 'transfer': {
          const ownerResolution = resolvers.polities.resolve(change.newOwner);
          if (!ownerResolution) break;
          liveRegion.owner = ownerResolution.polityId;
          // Цвет: явный newColor или цвет новой политии
          const inherited = resolvers.polities.colorOf(ownerResolution.polityId);
          liveRegion.color = change.newColor || inherited || liveRegion.color;
          break;
        }
        case 'update': {
          if (change.newColor) liveRegion.color = change.newColor;
          if (change.newName) liveRegion.name = change.newName;
          break;
        }
        case 'delete': {
          liveRegion.owner = 'neutral';
          liveRegion.color = '#888888';
          break;
        }
        case 'create_polity':
        case 'create': {
          // Создание новой политии: регион получает нового владельца (+ цвет)
          const ownerResolution = resolvers.polities.resolve(change.newOwner || change.newName);
          if (ownerResolution) {
            liveRegion.owner = ownerResolution.polityId;
            if (change.newColor) liveRegion.color = change.newColor;
          }
          break;
        }
        case 'spawn_battalion': {
          liveRegion.objects = liveRegion.objects || [];
          // Этап 4: формат маркера согласован с фронтом — { id, type, name, lat, lng },
          // type ровно 'battalion'. Координаты — центр региона (geojson/SVG).
          const center = this.regionCenter(liveRegion);
          liveRegion.objects.push({
            id: shortId(),
            type: 'battalion',
            name: change.feature?.name || `Батальон ${liveRegion.name} ${(liveRegion.objects.filter((o: any) => o.type === 'battalion').length) + 1}`,
            lat: center?.lat ?? 0,
            lng: center?.lng ?? 0,
          });
          break;
        }
        case 'move_battalion': {
          const target = this.resolveRegionFlexible(change.targetRegionName, resolvers.regions);
          if (!target) break;
          const objects = liveRegion.objects || [];
          const featureId = (change.feature as any)?.id;
          const featureName = change.feature?.name;
          // Батальон адресуется по id; если id не передан или не найден — по имени;
          // последний fallback — первый батальон региона (прежнее поведение).
          let idx = featureId
            ? objects.findIndex((o: any) => o.type === 'battalion' && o.id === featureId)
            : -1;
          if (idx < 0 && featureName) {
            idx = objects.findIndex((o: any) => o.type === 'battalion' && o.name === featureName);
          }
          if (idx < 0) {
            idx = objects.findIndex((o: any) => o.type === 'battalion');
          }
          if (idx >= 0) {
            const [b] = objects.splice(idx, 1);
            target.objects = target.objects || [];
            // Координаты — центр целевого региона, иначе маркер остался бы на старом месте
            const center = this.regionCenter(target);
            if (center) {
              b.lat = center.lat;
              b.lng = center.lng;
            }
            target.objects.push(b);
          }
          break;
        }
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
            id: shortId(),
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

    const regionResolver = new RegionResolver(Array.from(this.regions.values()));

    for (const npcRegionId of npcRegionIds) {
      const npcRegion = this.regions.get(npcRegionId);
      if (!npcRegion) continue;

      // Build neighbors: реальные границы, посчитанные turf при генерации мира;
      // для старых миров (borders пуст) — прежний fallback на первые 8 регионов.
      const bordered = (npcRegion.borders || [])
        .map(id => this.regions.get(id))
        .filter((r): r is RegionState => !!r && r.id !== npcRegionId);
      const neighborSource = bordered.length > 0
        ? bordered
        : Array.from(this.regions.values()).filter(r => r.id !== npcRegionId).slice(0, 8);
      const neighbors = neighborSource.map(r => ({
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
            // LLM может вернуть как id, так и ИМЯ региона — резолвим оба варианта
            const resolved = this.regions.get(npcAction.targetRegionId)
              || regionResolver.resolve(npcAction.targetRegionId);
            const targetRegion = resolved ? this.regions.get(resolved.id) : undefined;
            if (targetRegion && targetRegion.militaryPower < npcRegion.militaryPower * 0.7) {
              // Bug fix: раньше сюда писался npcRegionId (id региона) вместо
              // id политии-владельца — это ломало владение и матрицу дипломатии.
              targetRegion.owner = npcRegion.owner;
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
   * Sync all region changes to database.
   * Uses batch update for performance (single transaction for all regions).
   *
   * Persists population/gdp/militaryPower (every turn) and owner/color
   * (rarely changes, but NPC conquests in processNPCTurns and LLM-driven
   * mapChanges in applyWorldChanges both mutate them in memory, so we
   * write them too to keep the DB consistent with the in-memory state
   * across restarts).
   */
  async syncRegionsToDB(): Promise<void> {
    const updates = Array.from(this.regions.values()).map(region => ({
      id: region.id,
      population: region.population,
      gdp: region.gdp,
      militaryPower: region.militaryPower,
      owner: region.owner,
      color: region.color,
      // Этап 4: маркеры на карте (столицы/батальоны) — передаём всегда,
      // иначе updateRegionsBatch их не сохранял и объекты терялись при рестарте
      objects: region.objects || [],
    }));
    worldRepository.updateRegionsBatch(updates);
  }

  /**
   * Save full session state to saves table
   */
  save(name: string): { saveId: string; currentTurn: number; currentDate: string } {
    const saveId = shortId();

    // Capture full region snapshot
    const saveData: SaveData = {
      currentTurn: this.currentTurn,
      currentDate: this.currentDate,
      players: this.players,
      regions: Array.from(this.regions.entries()),
      relationships: this.relationships.toJSON(),
      actions: this.actions,
      results: this.results,
      consolidatedHistory: this.consolidatedHistory,
      consolidatedUpTo: this.consolidatedUpTo,
      difficulty: this.difficulty,
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

    // Restore relationships
    if (saveData.relationships) {
      this.relationships = RelationshipMatrix.fromJSON(saveData.relationships);
    }

    // Этап 2: история, консолидация, сложность (без них rewind терял контекст)
    this.actions = saveData.actions || [];
    this.results = saveData.results || [];
    this.consolidatedHistory = saveData.consolidatedHistory || '';
    this.consolidatedUpTo = saveData.consolidatedUpTo || 0;
    this.difficulty = normalizeDifficulty(saveData.difficulty);
    this.interveneRequested = false;
    // Очередь — про «будущую» ветку времени, после отката она невалидна
    this.pendingActions = [];

    // Update game in DB
    gameRepository.updateTurnAndDate(this.id, this.currentTurn, this.currentDate);
    gameRepository.updateConsolidation(this.id, this.consolidatedHistory, this.consolidatedUpTo);

    // Sync restored regions to DB
    this.syncRegionsToDB();

    console.log('[GameSession] Loaded from save, turn:', this.currentTurn);
  }

  // =========================================================================
  // Этап 2: Rewind-снапшоты, Intervene, консолидация истории
  // =========================================================================

  /**
   * Снапшот перед ходом — основа rewind. Хранится в saves под служебным
   * именем '__rewind__'; держим только один (последний) снапшот на игру.
   */
  private saveRewindSnapshot(): void {
    const saveData: SaveData = {
      currentTurn: this.currentTurn,
      currentDate: this.currentDate,
      players: this.players,
      regions: Array.from(this.regions.entries()),
      relationships: this.relationships.toJSON(),
      actions: this.actions,
      results: this.results,
      consolidatedHistory: this.consolidatedHistory,
      consolidatedUpTo: this.consolidatedUpTo,
      difficulty: this.difficulty,
    };
    const id = shortId();
    db.prepare(`
      INSERT INTO saves (id, game_id, name, current_turn, current_date, data, saved_at)
      VALUES (?, ?, '__rewind__', ?, ?, ?, ?)
    `).run(id, this.id, this.currentTurn, this.currentDate, JSON.stringify(saveData), new Date().toISOString());

    // Держим только последний rewind-снапшот
    db.prepare("DELETE FROM saves WHERE game_id = ? AND name = '__rewind__' AND id != ?").run(this.id, id);
  }

  /**
   * Откат на ход назад: восстанавливает снапшот, снятый перед последним ходом,
   * и вычищает «будущие» записи действий/результатов из БД.
   * Возвращает новое состояние или null, если откатываться некуда.
   */
  rewind(): { turn: number; date: string } | null {
    const save = db.prepare(
      "SELECT * FROM saves WHERE game_id = ? AND name = '__rewind__' ORDER BY saved_at DESC LIMIT 1"
    ).get(this.id) as any;
    if (!save) return null;

    let saveData: SaveData;
    try {
      saveData = JSON.parse(save.data);
    } catch (e) {
      console.error('[GameSession] Rewind: повреждённый снапшот:', e);
      return null;
    }

    this.loadFromSave(saveData);
    // Результат откаченного хода записан с turn == восстановленному currentTurn
    gameRepository.deleteAfterTurn(this.id, this.currentTurn - 1);
    // Снапшот потреблён — повторный rewind подряд невозможен
    db.prepare('DELETE FROM saves WHERE id = ?').run(save.id);

    this.broadcast('turn_complete', {
      turn: this.currentTurn,
      narration: '⏪ Откат на ход назад',
      events: ['⏪ Ход отменён, мир возвращён к предыдущему состоянию'],
      newTurn: this.currentTurn,
      newDate: this.currentDate,
      rewound: true,
    });

    console.log('[GameSession] Rewound to turn:', this.currentTurn, 'date:', this.currentDate);
    return { turn: this.currentTurn, date: this.currentDate };
  }

  /** Есть ли куда откатиться (для UI-кнопки). */
  canRewind(): boolean {
    const row = db.prepare(
      "SELECT 1 FROM saves WHERE game_id = ? AND name = '__rewind__' LIMIT 1"
    ).get(this.id);
    return !!row;
  }

  /**
   * Intervene: попросить движок остановиться после текущего события
   * (оставшиеся события пачки будут откачены — просто не применятся).
   */
  requestIntervene(): void {
    this.interveneRequested = true;
    console.log('[GameSession] Intervene requested');
  }

  /**
   * Консолидация истории (механика оригинала): когда раундов накопилось
   * больше consolidation.chunkSize поверх consolidatedUpTo — LLM-саммари
   * старых раундов дописывается в consolidated_history, а в промпты
   * подаётся саммари + сырой хвост последних раундов.
   */
  private async maybeConsolidate(): Promise<void> {
    const cfg = this.llm.consolidation;
    const lastTurn = this.currentTurn - 1;
    if (lastTurn < cfg.startRound) return;
    if (lastTurn - this.consolidatedUpTo < cfg.chunkSize) return;

    const toSummarize = this.results.filter(
      r => r.turn > this.consolidatedUpTo && r.turn <= lastTurn
    );
    if (toSummarize.length === 0) return;

    console.log(`[GameSession] Consolidating rounds ${this.consolidatedUpTo + 1}..${lastTurn} (${toSummarize.length} раундов)`);

    const system = 'Ты — летописец стратегической игры. Сжимай историю, сохраняя факты.';
    const user = `Ниже — летопись уже прожитых раундов стратегической игры (раунды ${this.consolidatedUpTo + 1}–${lastTurn}).
${this.consolidatedHistory ? `\n[Уже консолидированная ранняя история]\n${this.consolidatedHistory}\n` : ''}
[Новые раунды для сжатия]
${toSummarize.map(r => `Раунд ${r.turn}: ${r.narration}`).join('\n\n')}

Сожми ВСЮ историю (старый конспект + новые раунды) в связный конспект до ~400 слов.
Обязательно сохрани: смены владельцев регионов, войны и мирные договоры, союзы,
ключевые решения игрока и их последствия. Не добавляй новых фактов.`;

    const res = await this.llm.generate('consolidation', system, user, { temperature: 0.3, maxTokens: 2000 });
    this.consolidatedHistory = res.content;
    this.consolidatedUpTo = lastTurn;
    gameRepository.updateConsolidation(this.id, this.consolidatedHistory, this.consolidatedUpTo);
    console.log('[GameSession] Consolidated history updated, length:', this.consolidatedHistory.length);
  }

  /**
   * Get all relationships for the frontend UI
   */
  getRelationships(): Record<string, Record<string, string>> {
    return this.relationships.toJSON();
  }

  /**
   * Get advisor response using prompt system
   */
  async getAdvisor(message: string, history: any[] = []): Promise<string> {
    const gameData = this.buildGameData();
    return this.gameController.getAdvisorWithPrompts(gameData, message, history);
  }

  /**
   * Streaming-вариант советника (Этап 3): токены приходят в onToken
   * (число символов накопленного ответа), возвращается полный текст.
   */
  async getAdvisorStream(message: string, history: any[] = [], onToken: (chars: number) => void): Promise<string> {
    const gameData = this.buildGameData();
    return this.gameController.getAdvisorStreamWithPrompts(gameData, message, history, onToken);
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
      id: shortId(),
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
   * Process ONE action from the queue (for sequential processing).
   * Called when time-skip happens or when explicitly processing.
   *
   * Wrapped in `withLock` so two concurrent HTTP requests can't
   * double-process the same action. Returns `null` if another
   * turn is already in flight for this session.
   */
  async processNextAction(jumpDays: number = 30): Promise<PendingAction | null> {
    return (await this.withLock(async () => this._processNextActionUnlocked(jumpDays))) as PendingAction | null;
  }

  /**
   * Body of processNextAction, without the lock. Private so external
   * callers cannot bypass withLock.
   */
  private async _processNextActionUnlocked(jumpDays: number = 30): Promise<PendingAction | null> {
    // Find next pending action
    const action = this.pendingActions.find(a => a.status === 'pending');
    if (!action) {
      console.log('[GameSession] No pending actions to process');
      return null;
    }

    action.status = 'processing';
    console.log('[GameSession] Processing action:', action.id, 'text:', action.text.substring(0, 50));

    try {
      const player = this.players[0];
      if (!player) throw new Error('No player in session');

      const playerRegion = this.regions.get(player.regionId);
      if (!playerRegion) throw new Error('Player region not found');

      // Этап 2: снапшот для rewind — ДО любых мутаций состояния
      this.saveRewindSnapshot();

      // jumpDays <= 0 — auto-jump «к следующему важному событию» (горизонт — год)
      const autoJump = jumpDays <= 0;
      const timeJump = autoJump ? 365 : jumpDays;

      this.broadcast('turn_start', { turn: this.currentTurn, action: action.text });

      // Build game data for prompt engine
      const gameData = this.buildGameData();

      // Process turn with prompts (single action)
      const promptResult = await this.gameController.processTurnWithPrompts(
        gameData,
        [action.text], // Single action as array
        timeJump,
        (chars) => this.broadcast('llm_progress', { mechanic: 'jump', chars }),
        autoJump
      );

      // Нереалистичные действия, отклонённые симуляцией
      const voided = promptResult.voided || [];
      for (const v of voided) {
        this.broadcast('action_voided', { turn: this.currentTurn, action: v.action, reason: v.reason });
      }

      // События применяются ПО ОДНОМУ с SSE-рассылкой — между ними игрок
      // может нажать Intervene и откатить остаток пачки (Этап 2).
      this.interveneRequested = false;
      const events = promptResult.events || [];
      const appliedEvents: typeof events = [];
      let intervened = false;
      for (let i = 0; i < events.length; i++) {
        if (this.interveneRequested) {
          intervened = true;
          break;
        }
        const event = events[i];
        if (event.mapChanges && event.mapChanges.length > 0) {
          this.applyMapChanges(event.mapChanges);
        }
        appliedEvents.push(event);
        this.broadcast('jump_event', { turn: this.currentTurn, index: i, total: events.length, event });
        // Пауза, чтобы фронт успел показать событие (только при живом SSE)
        if (this.sseBroadcaster && i < events.length - 1) {
          await new Promise(r => setTimeout(r, 350));
        }
      }
      if (intervened) {
        console.log(`[GameSession] Intervene: применено ${appliedEvents.length}/${events.length} событий`);
      }

      // Итоговые worldChanges — только если пачка применена целиком;
      // при Intervene итоговое состояние недостижимо, применяем только
      // mapChanges уже показанных событий.
      if (!intervened && promptResult.worldChanges) {
        this.applyWorldChanges(promptResult.worldChanges);
      }

      // ОТКЛЮЧЕНО: переговоры — LLM-initiated дипломатические чаты.
      // Симуляция больше не создаёт чаты по startChat из promptResult:
      // фича выключена решением владельца, LLM-вызовы/сообщения не создаются.
      // for (const startChat of promptResult.startChat || []) {
      //   try {
      //     const chat = this.ensureChat(startChat.polityName);
      //     const firstMessage = chatRepository.addMessage(
      //       chat.id,
      //       'polity',
      //       startChat.topic || 'Хотим обсудить текущую ситуацию',
      //       this.currentTurn
      //     );
      //     this.broadcast('chat_message', {
      //       chatId: chat.id,
      //       polityId: chat.polityId,
      //       polityName: chat.polityName,
      //       message: firstMessage,
      //     });
      //   } catch (e) {
      //     console.warn('[GameSession] startChat: полития не найдена:', startChat.polityName, e);
      //   }
      // }

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

      // Create turn result (заголовки только ПРИМЕНЁННЫХ событий + voided)
      const llmEventHeadlines = appliedEvents.map((e: any) => e.headline).filter(Boolean);
      const voidedHeadlines = voided.map(v => `⊘ Отклонено: ${v.action}${v.reason ? ` — ${v.reason}` : ''}`);
      if (intervened) llmEventHeadlines.push('⏸ Симуляция прервана игроком (Intervene)');
      const turnResult: TurnResultRecord = {
        id: shortId(),
        turn: this.currentTurn,
        narration: promptResult.narration,
        countryResponse: promptResult.convertedActions.map((a: any) => a.text).join('\n'),
        events: [...voidedHeadlines, ...llmEventHeadlines, ...npcEvents, ...randomEvents, ...createdObjects.map(o => o.text)],
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
      const lastEventDate = appliedEvents
        .map(e => e.date)
        .filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d))
        .sort()
        .pop();
      if (intervened && lastEventDate) {
        // Пачка откачена частично — дата по последнему применённому событию
        this.currentDate = lastEventDate;
      } else if (autoJump && promptResult.targetDate && /^\d{4}-\d{2}-\d{2}/.test(promptResult.targetDate)) {
        this.currentDate = promptResult.targetDate;
      } else {
        const date = new Date(this.currentDate);
        date.setDate(date.getDate() + timeJump);
        this.currentDate = date.toISOString().split('T')[0];
      }

      // Now set periodEnd (after advancing)
      action.result.periodEnd = this.currentDate;

      // Persist turn and date to DB in single operation
      gameRepository.updateTurnAndDate(this.id, this.currentTurn, this.currentDate);

      // Этап 2: консолидация истории — не должна ронять успешный ход
      try {
        await this.maybeConsolidate();
      } catch (e) {
        console.error('[GameSession] Consolidation failed (turn kept):', e);
      }

      this.broadcast('turn_complete', {
        turn: this.currentTurn - 1,
        narration: turnResult.narration,
        events: turnResult.events,
        newTurn: this.currentTurn,
        newDate: this.currentDate,
        intervened,
      });

      // Этап 3: проактивный советник — короткий комментарий итогов периода.
      // Fire-and-forget: ход уже успешен, советник не должен его задерживать
      // или ронять.
      this.getAdvisor(
        'Кратко (до 500 символов) прокомментируй итоги прошедшего периода для своего лидера',
        []
      )
        .then(content => this.broadcast('advisor_proactive', { content }))
        .catch(e => console.error('[GameSession] Proactive advisor failed:', e));

      console.log('[GameSession] Action processed, new date:', this.currentDate);
      return action;

    } catch (e) {
      console.error('[GameSession] Error processing action:', e);
      action.status = 'pending'; // Reset status on error
      throw e;
    }
  }

  /**
   * Process all pending actions sequentially.
   *
   * Holds the session lock for the whole loop. If another call comes
   * in while we're processing the queue, that caller gets `[]` back
   * and can poll. We intentionally do NOT await the in-flight queue
   * because the queue itself may take many minutes (each action does
   * an LLM call) and the caller would block for the entire duration.
   */
  async processAllPendingActions(jumpDays: number = 30): Promise<PendingAction[]> {
    const result = await this.withLock(async () => {
      const processed: PendingAction[] = [];
      let action = await this._processNextActionUnlocked(jumpDays);
      while (action) {
        processed.push(action);
        action = await this._processNextActionUnlocked(jumpDays);
      }
      return processed;
    });
    return result ?? [];
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
    gameRepository.updateTurnAndDate(this.id, this.currentTurn, this.currentDate);

    console.log('[GameSession] Advanced date:', periodStart, '->', this.currentDate);
    return { newDate: this.currentDate, newTurn: this.currentTurn };
  }
}
