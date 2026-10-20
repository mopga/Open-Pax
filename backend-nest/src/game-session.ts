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
import { worldRepository, gameRepository } from './repositories';
import db from './database';
import { RegionResolver, PolityResolver, politiesFromRegions } from './utils/name-resolver';
import { colorFromCode } from './utils/color';
import { Difficulty, normalizeDifficulty } from './prompts/difficulty';
import type { MapChange, SimulationEvent } from './prompts/types';

export interface RegionState {
  id: string;
  name: string;
  color: string;
  owner: string;
  objects: any[];
  borders: string[];
  status: 'active' | 'occupied' | 'destroyed' | 'independent';
}

/** Государство (полития): имя и цвет живут здесь, регион хранит только owner */
export interface PolityState {
  id: string;
  name: string;
  color: string;
  flag?: string | null;
  /** Описание государства из пресета — видит ИИ */
  description?: string;
}

/** Изменение региона, рассылаемое в SSE jump_event */
export interface RegionDelta {
  id: string;
  owner: string;
  color: string;
  name: string;
  status: RegionState['status'];
  /** Объекты региона (столица, батальоны) — меняются событиями spawn/move_battalion */
  objects: any[];
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

export interface ProcessedTurnResult {
  narration: string;
  countryResponse: string;
  events: string[];
  /** Full ordered reactions for card rendering; `events` remains the legacy headline list. */
  timelineEvents: SimulationEvent[];
  objects: any[];
  turn: number;
  periodStart: string;
  periodEnd: string;
}

export interface PendingAction {
  id: string;
  text: string;
  createdAt: string;
  status: 'pending' | 'processing' | 'completed';
  result?: ProcessedTurnResult;
}

export interface TimeSkipExecution {
  /** Real player orders included in the round. Empty means an autonomous world turn. */
  actions: PendingAction[];
  result: ProcessedTurnResult;
}

export interface WorldChanges {
  regionOwners?: Record<string, string>;
  regionColors?: Record<string, string>;
}

export interface SaveData {
  currentTurn: number;
  currentDate: string;
  players: PlayerInfo[];
  regions: [string, RegionState][]; // [regionId, state] pairs
  /** Реестр государств; в старых сейвах отсутствует — выводится из регионов */
  polities?: [string, PolityState][];
  /** Матрица отношений из старых сейвов — больше не читается */
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
  // Реестр государств мира (имя/цвет); регион ссылается на него через owner
  private polities: Map<string, PolityState> = new Map();

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
        polities: Object.fromEntries(this.polities),
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
    };
  }

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
        objects: region.objects || [],
        borders: region.borders,
        status: (region.status || 'active') as 'active' | 'occupied' | 'destroyed' | 'independent',
      });
    }

    this.loadPolities();

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
          objects: region.objects || [],
          borders: region.borders,
          status: (region.status || 'active') as 'active' | 'occupied' | 'destroyed' | 'independent',
        });
      }
    }

    this.loadPolities();

    // История ходов — из БД: без неё после рестарта сервера ИИ терял все прошлые события
    this.actions = gameRepository.getActions(this.id);
    this.results = gameRepository.getTurnResults(this.id);

    // Re-initialize game controller with current state
    this.gameController.initPromptEngine(this.buildGameData());

    this.gameController.setupWorld(this.worldBasePrompt);

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
   * Реестр государств из БД; старые миры (без world_polities) — из регионов:
   * имя и цвет первого региона владельца, как было до реестра.
   */
  private loadPolities(): void {
    const rows = worldRepository.getPolities(this.worldId);
    const list = rows.length > 0
      ? rows.map(r => ({
        id: r.id, name: r.name, color: r.color, flag: r.flag ?? null,
        ...(r.metadata?.description ? { description: String(r.metadata.description) } : {}),
      }))
      : politiesFromRegions(Array.from(this.regions.values()))
        .filter(p => p.id !== 'neutral')
        .map(p => ({ id: p.id, name: p.name, color: p.color || '#888888', flag: null }));
    this.polities = new Map(list.map(p => [p.id, p]));
  }

  /** Список государств (для API) */
  getPolities(): PolityState[] {
    return Array.from(this.polities.values());
  }

  /** Новое государство, созданное симуляцией: id = имя (так его адресует LLM) */
  private ensurePolity(id: string, name: string, color?: string): PolityState {
    let polity = this.polities.get(id);
    if (!polity) {
      polity = { id, name: name || id, color: color || colorFromCode(id), flag: null };
      this.polities.set(id, polity);
    }
    return polity;
  }

  /** Сменить владельца региона: цвет региона — цвет государства-владельца */
  private setRegionOwner(region: RegionState, polityId: string): void {
    region.owner = polityId;
    const polity = this.polities.get(polityId);
    if (polity) region.color = polity.color;
  }

  /** Перекрасить все регионы государства в его текущий цвет */
  private recolorPolity(polityId: string): void {
    const polity = this.polities.get(polityId);
    if (!polity) return;
    for (const region of this.regions.values()) {
      if (region.owner === polityId) region.color = polity.color;
    }
  }

  private politySnapshot(): Map<string, string> {
    return new Map([...this.polities].map(([id, p]) => [id, `${p.name}|${p.color}|${p.flag ?? ''}`]));
  }

  private polityDelta(before: Map<string, string>): PolityState[] {
    return [...this.polities.values()].filter(p => before.get(p.id) !== `${p.name}|${p.color}|${p.flag ?? ''}`);
  }

  /** Отпечаток видимого на карте состояния регионов (для диффа по событию) */
  private regionKey(r: RegionState): string {
    return `${r.owner}|${r.color}|${r.name}|${r.status}|${(r.objects || []).map((o: any) => o.id).join(',')}`;
  }

  private regionSnapshot(): Map<string, string> {
    const snap = new Map<string, string>();
    for (const [id, r] of this.regions) snap.set(id, this.regionKey(r));
    return snap;
  }

  /** Регионы, изменившиеся (или появившиеся) после снимка */
  private regionDelta(before: Map<string, string>): RegionDelta[] {
    const out: RegionDelta[] = [];
    for (const [id, r] of this.regions) {
      if (before.get(id) !== this.regionKey(r)) {
        out.push({ id, owner: r.owner, color: r.color, name: r.name, status: r.status, objects: r.objects || [] });
      }
    }
    return out;
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

  /** Приказы игрока по ходам */
  getActions(): ActionRecord[] {
    return this.actions;
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
      polities: new PolityResolver(Array.from(this.polities.values()), this.playerPolityId),
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
        const polityId = ownerResolution?.polityId || newOwner;
        const explicitColor = changes.regionColors?.[regionKey] || changes.regionColors?.[region.id];
        // Новое государство получает явный цвет из regionColors (если есть)
        if (ownerResolution?.isNew) this.ensurePolity(polityId, newOwner, explicitColor);
        this.setRegionOwner(liveRegion, polityId);
      }
    }

    // regionColors с именем государства — смена его цвета (смена режима)
    if (changes.regionColors) {
      for (const [key, color] of Object.entries(changes.regionColors)) {
        const polityId = resolvers.polities.resolveExact(key);
        const polity = polityId ? this.polities.get(polityId) : undefined;
        if (polity && color) {
          polity.color = color;
          this.recolorPolity(polity.id);
        }
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
        .map(r => ({ r, c: this.regionCenter(r) }))
        .filter((x): x is { r: RegionState; c: { lat: number; lng: number } } => !!x.c);
      if (withCentroid.length === 0) return pickDeterministic(all);
      withCentroid.sort((a, b) => {
        switch (dir) {
          case 'west': return a.c.lng - b.c.lng;
          case 'east': return b.c.lng - a.c.lng;
          case 'north': return b.c.lat - a.c.lat;
          case 'south': return a.c.lat - b.c.lat;
        }
      });
      return withCentroid[0].r;
    }

    return undefined;
  }

  /** Кэш геоцентроидов регионов: geojson тяжёлый, считаем один раз на сессию. */
  private geoCenterCache: Map<string, { lat: number; lng: number } | null> = new Map();

  /**
   * Центр региона в lat/lng по geojson-геометрии из БД — для маркеров
   * ({ id, type, name, lat, lng }) и выбора региона по стороне света.
   */
  private regionCenter(region: RegionState): { lat: number; lng: number } | null {
    if (!this.geoCenterCache.has(region.id)) {
      this.geoCenterCache.set(region.id, this.computeGeoCenter(region.id));
    }
    return this.geoCenterCache.get(region.id) ?? null;
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
    let resolvers = this.buildResolvers();

    for (const change of mapChanges) {
      // --- Операции над государством целиком (имя/цвет/роспуск/создание)
      const polityTarget = change.polityName
        ? resolvers.polities.resolveExisting(change.polityName)
        // Старый формат: update/delete с именем государства в regionName
        : (change.type === 'update' || change.type === 'delete')
          ? resolvers.polities.resolveExact(change.regionName)
          : undefined;

      if ((change.type === 'update_polity' || change.type === 'update') && polityTarget) {
        const polity = this.polities.get(polityTarget);
        if (polity) {
          if (change.newName) polity.name = change.newName;
          if (change.newColor) polity.color = change.newColor;
          this.recolorPolity(polity.id);
          resolvers = this.buildResolvers();
        }
        continue;
      }
      if ((change.type === 'dissolve_polity' || change.type === 'delete') && polityTarget) {
        for (const region of this.regions.values()) {
          if (region.owner === polityTarget) {
            region.owner = 'neutral';
            region.color = '#888888';
          }
        }
        continue;
      }
      if (change.type === 'create_polity' || change.type === 'create') {
        const name = (change.newOwner || change.newName || change.polityName || '').trim();
        if (!name) continue;
        // Существующим считается только точное совпадение: нечёткий поиск
        // превратил бы «Southern France» во France
        const polityId = resolvers.polities.resolveExact(name) ?? name;
        this.ensurePolity(polityId, name, change.newColor);
        const targets = [change.regionName, ...(change.regionNames ?? [])]
          .map(key => this.resolveRegionFlexible(key, resolvers.regions))
          .filter((r): r is RegionState => !!r);
        for (const region of targets) this.setRegionOwner(region, polityId);
        resolvers = this.buildResolvers();
        continue;
      }

      // --- Операции над регионами
      const regionKey = change.regionName || change.regionId;
      const liveRegion = this.resolveRegionFlexible(regionKey, resolvers.regions);
      if (!liveRegion) {
        console.warn('[GameSession] mapChange: region not resolved:', regionKey);
        continue;
      }

      switch (change.type) {
        case 'transfer': {
          const newOwner = change.newOwner?.trim();
          if (!newOwner) break;
          // Точное имя → существующее государство. Новый цвет без точного
          // совпадения — признак нового государства («Southern France» ≠ France).
          // Иначе нечёткий поиск (склонения: «Франции» → «Франция»).
          const exact = resolvers.polities.resolveExact(newOwner);
          const fuzzy = exact ?? (change.newColor ? undefined : resolvers.polities.resolveExisting(newOwner));
          const polityId = fuzzy ?? newOwner;
          if (!fuzzy) {
            this.ensurePolity(polityId, newOwner, change.newColor);
            resolvers = this.buildResolvers();
          }
          this.setRegionOwner(liveRegion, polityId);
          break;
        }
        case 'update': {
          // Переименование региона (имя/цвет государства — update_polity)
          if (change.newName) liveRegion.name = change.newName;
          break;
        }
        case 'delete': {
          liveRegion.owner = 'neutral';
          liveRegion.color = '#888888';
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
   * Sync all region changes to database.
   * Uses batch update for performance (single transaction for all regions).
   *
   * Пишет владельца, цвет, имя и объекты: mapChanges меняют их в памяти,
   * а БД должна совпадать с памятью после рестарта.
   */
  async syncRegionsToDB(): Promise<void> {
    const updates = Array.from(this.regions.values()).map(region => ({
      id: region.id,
      owner: region.owner,
      color: region.color,
      // mapChanges type=update может переименовать регион
      name: region.name,
      // Этап 4: маркеры на карте (столицы/батальоны) — передаём всегда,
      // иначе updateRegionsBatch их не сохранял и объекты терялись при рестарте
      objects: region.objects || [],
    }));
    worldRepository.updateRegionsBatch(updates);
    worldRepository.upsertPolities(this.worldId, Array.from(this.polities.values()));
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
      polities: Array.from(this.polities.entries()),
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
    // Реестр государств: из сейва; старые сейвы — из БД/регионов
    if (saveData.polities) {
      this.polities = new Map(saveData.polities);
    } else {
      this.loadPolities();
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
    // История в БД — как в сейве (сейв мог быть сделан в другой ветке времени)
    gameRepository.replaceHistory(this.id, this.actions, this.results);

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
      polities: Array.from(this.polities.entries()),
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
    return this.createPendingAction(text);
  }

  private createPendingAction(text: string): PendingAction {
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
    return (await this.withLock(async () => {
      const action = this.pendingActions.find(a => a.status === 'pending');
      if (!action) {
        console.log('[GameSession] No pending actions to process');
        return null;
      }
      await this._processTurnUnlocked([action], jumpDays);
      return action;
    })) as PendingAction | null;
  }

  /**
   * Execute one complete world round without taking the session lock.
   * `actionsToProcess` may be empty: that is a real autonomous time-skip,
   * not a synthetic player order. External callers must go through one of
   * the locked public methods below.
   */
  private async _processTurnUnlocked(
    actionsToProcess: PendingAction[],
    jumpDays: number = 30,
  ): Promise<ProcessedTurnResult> {
    for (const pending of actionsToProcess) pending.status = 'processing';
    console.log('[GameSession] Processing turn:', {
      actionCount: actionsToProcess.length,
      actionIds: actionsToProcess.map(a => a.id),
      autonomous: actionsToProcess.length === 0,
    });

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

      this.broadcast('turn_start', {
        turn: this.currentTurn,
        action: actionsToProcess[0]?.text ?? null,
        actions: actionsToProcess.map(a => a.text),
        autonomous: actionsToProcess.length === 0,
      });

      // Build game data for prompt engine
      const gameData = this.buildGameData();

      // Process turn with prompts (single action)
      const promptResult = await this.gameController.processTurnWithPrompts(
        gameData,
        actionsToProcess.map(a => a.text),
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
        let changedRegions: RegionDelta[] = [];
        let changedPolities: PolityState[] = [];
        if (event.mapChanges && event.mapChanges.length > 0) {
          const before = this.regionSnapshot();
          const politiesBefore = this.politySnapshot();
          this.applyMapChanges(event.mapChanges);
          changedRegions = this.regionDelta(before);
          changedPolities = this.polityDelta(politiesBefore);
        }
        appliedEvents.push(event);
        // changedRegions/changedPolities — итоговое состояние затронутого: фронт
        // перекрашивает карту и подписи прямо по ходу событий
        this.broadcast('jump_event', {
          turn: this.currentTurn, index: i, total: events.length, event, changedRegions, changedPolities,
        });
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

      // The shared world jump is the sole owner of non-player decisions.
      // Do not run a second per-polity NPC pass here: it duplicates LLM cost
      // and can contradict the events/map state the jump just produced.

      // Record every submitted order under the SAME turn. Previously each
      // queued order created a separate turn and advanced the date again.
      for (const pending of actionsToProcess) {
        const actionRecord: ActionRecord = {
          id: pending.id,
          playerId: player.id,
          turn: this.currentTurn,
          text: pending.text,
          createdAt: pending.createdAt,
        };
        this.actions.push(actionRecord);
        gameRepository.addAction({
          id: actionRecord.id,
          gameId: this.id,
          playerId: player.id,
          turn: this.currentTurn,
          text: pending.text,
        });
      }

      // Create turn result (заголовки только ПРИМЕНЁННЫХ событий + voided)
      const llmEventHeadlines = appliedEvents.map((e: any) => e.headline).filter(Boolean);
      const voidedHeadlines = voided.map(v => `⊘ Отклонено: ${v.action}${v.reason ? ` — ${v.reason}` : ''}`);
      if (intervened) llmEventHeadlines.push('⏸ Симуляция прервана игроком (Intervene)');
      const turnResult: TurnResultRecord = {
        id: shortId(),
        turn: this.currentTurn,
        narration: promptResult.narration,
        countryResponse: promptResult.convertedActions.map((a: any) => a.text).join('\n'),
        events: [...voidedHeadlines, ...llmEventHeadlines],
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

      // Remember the interval before advancing the shared world clock.
      const periodStart = this.currentDate;
      const timelineEvents: SimulationEvent[] = [
        ...voided.map(v => ({
          headline: `⊘ Отклонено: ${v.action}`,
          description: v.reason,
          date: periodStart,
          kind: 'reaction' as const,
          mapChanges: [],
        })),
        ...appliedEvents,
      ];

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

      const processedTurn: ProcessedTurnResult = {
        narration: turnResult.narration,
        countryResponse: turnResult.countryResponse,
        events: turnResult.events,
        timelineEvents,
        objects: playerRegion.objects,
        turn: turnResult.turn,
        periodStart,
        periodEnd: this.currentDate,
      };

      // Real queued orders share this result. An autonomous time-skip has no
      // PendingAction at all, so it cannot leak into player action history.
      for (const pending of actionsToProcess) {
        pending.status = 'completed';
        pending.result = processedTurn;
      }

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
        timelineEvents,
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

      console.log('[GameSession] Turn processed, new date:', this.currentDate);
      return processedTurn;

    } catch (e) {
      console.error('[GameSession] Error processing action:', e);
      for (const pending of actionsToProcess) pending.status = 'pending';
      throw e;
    }
  }

  /**
   * Process all pending actions as one atomic round and one world jump.
   * If another caller holds the session lock, this returns `[]` immediately.
   */
  async processAllPendingActions(jumpDays: number = 30): Promise<PendingAction[]> {
    const result = await this.withLock(async () => {
      const turnActions = this.pendingActions.filter(a => a.status === 'pending');
      if (turnActions.length === 0) return [];
      await this._processTurnUnlocked(turnActions, jumpDays);
      return turnActions;
    });
    return result ?? [];
  }

  /**
   * Process a time-skip atomically. Pending player orders, if any, are one
   * batch. With no orders, the exact same world simulator runs with an empty
   * action list: no converter call, no synthetic PendingAction, no action row.
   */
  async processTimeSkip(jumpDays: number = 30, actionTexts?: string[]): Promise<TimeSkipExecution | null> {
    return await this.withLock(async () => {
      if (actionTexts !== undefined) {
        // The client submits its complete visible draft with the jump. Replace
        // any stale legacy queue so removed UI items can never become ghost orders.
        this.pendingActions = this.pendingActions.filter(a => a.status === 'completed');
        for (const text of actionTexts) this.createPendingAction(text);
      }
      const turnActions = this.pendingActions.filter(a => a.status === 'pending');
      const result = await this._processTurnUnlocked(turnActions, jumpDays);
      return { actions: turnActions, result };
    });
  }
}
