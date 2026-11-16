/**
 * Open-Pax — TypeScript Types
 * ===========================
 */

// ============================================================================
// Enums
// ============================================================================

export enum RegionStatus {
  ACTIVE = "active",
  OCCUPIED = "occupied",
  DESTROYED = "destroyed",
  INDEPENDENT = "independent"
}

export enum GameStatus {
  WAITING = "waiting",
  PLAYING = "playing",
  FINISHED = "finished"
}

// ============================================================================
// Core Models
// ============================================================================

// Country (from countries.json)
/** Государство, за которое можно играть (каталог пресета) */
export interface Country {
  code: string;
  name: string;
  color: string;
  /** Рекомендовано пресетом */
  recommended?: boolean;
  /** Страны карты, входящие в государство (СССР: UKR, KAZ, …) */
  members?: string[];
  description?: string;
}

// World Template
export interface WorldTemplate {
  id: string;
  name: string;
  description: string;
  base_prompt: string;
  start_date: string;
  /** Все государства мира, рекомендуемые первыми */
  countries?: Country[];
}

export interface MapObject {
  id: string;
  type: "army" | "factory" | "university" | "city" | "capital" | "battalion" | "fleet" | "missile" | "radar" | "port";
  name: string;
  /** Легаси: SVG-координаты канвы 2000×1500 */
  x?: number;
  y?: number;
  /** Географические координаты (столицы, объекты Natural Earth) */
  lat?: number;
  lng?: number;
  owner?: string;
  level?: number;
  metadata?: Record<string, any>;
}

export interface Region {
  id: string;
  name: string;
  geojson?: string;  // GeoJSON polygon (for Mapbox)
  color: string;    // Current color (hex)
  owner: string;    // polityId владельца (код страны / 'player' / 'ai-N') или "neutral"
  objects: MapObject[];
  borders: string[];  // Neighbor IDs
  status: RegionStatus;
  metadata: Record<string, any>;
}

// ============================================================================
// Game Models
// ============================================================================

/** Государство: владеет регионами; имя и цвет живут здесь */
export interface Polity {
  id: string;
  name: string;
  color: string;
  flag?: string | null;
}

export interface World {
  id: string;
  name: string;
  description: string;
  startDate: string;
  basePrompt: string;
  historicalAccuracy: number;
  regions: Record<string, Region>;
  /** Реестр государств по id (с сервера приходит массивом, нормализуется в gameApi.get) */
  polities?: Record<string, Polity>;
}

export interface Player {
  id: string;
  name: string;
  regionId: string;
  color: string;
  /** Полития игрока (код страны для шаблонов, 'player' для кастомных карт) */
  polityId?: string;
}

export interface Game {
  id: string;
  world: World;
  players: Player[];
  currentTurn: number;
  currentDate?: string;
  maxTurns: number;
  status: GameStatus;
  /** История ходов с сервера (для ленты после загрузки сейва) */
  history?: { turn: number; action: string; result: string; events?: string[] }[];
}

// ============================================================================
// API Requests/Responses
// ============================================================================

export interface CreateGameRequest {
  world_id: string;
  player_name: string;
  player_region_id: string;
  difficulty?: string;
}

export interface CreateGameResponse {
  game_id: string;
  player_id: string;
  region: {
    id: string;
    name: string;
  };
}
