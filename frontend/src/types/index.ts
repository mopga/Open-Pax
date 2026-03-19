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

export enum BlocType {
  MILITARY = "military",
  ECONOMIC = "economic",
  POLITICAL = "political",
  NEUTRAL = "neutral"
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
export interface Country {
  code: string;
  name: string;
  color: string;
}

// World Template
export interface WorldTemplate {
  id: string;
  name: string;
  description: string;
  country_codes: string[];
  base_prompt: string;
  start_date: string;
  countries?: Country[];
}

export interface MapObject {
  id: string;
  type: "army" | "factory" | "university" | "city";
  name: string;
  x: number;
  y: number;
  owner?: string;
  level: number;
  metadata: Record<string, any>;
}

export interface Region {
  id: string;
  name: string;
  svgPath?: string;  // SVG path d attribute (fallback)
  geojson?: string;  // GeoJSON polygon (for Mapbox)
  color: string;    // Current color (hex)
  owner: string;    // Player ID or "neutral"
  population: number;
  gdp: number;
  militaryPower: number;
  objects: MapObject[];
  borders: string[];  // Neighbor IDs
  status: RegionStatus;
  metadata: Record<string, any>;
}

export interface Bloc {
  id: string;
  name: string;
  type: BlocType;
  members: string[];  // Region IDs
  leader?: string;
  color: string;
  description: string;
}

// ============================================================================
// Game Models
// ============================================================================

export interface World {
  id: string;
  name: string;
  description: string;
  startDate: string;
  basePrompt: string;
  historicalAccuracy: number;
  regions: Record<string, Region>;
  blocs: Record<string, Bloc>;
}

export interface Player {
  id: string;
  name: string;
  regionId: string;
  color: string;
}

export interface Game {
  id: string;
  world: World;
  players: Player[];
  currentTurn: number;
  currentDate?: string;
  maxTurns: number;
  status: GameStatus;
}

export interface Action {
  id: string;
  playerId: string;
  turn: number;
  text: string;
  createdAt: string;
}

export interface TurnResult {
  turn: number;
  narration: string;
  countryResponse: string;
  events: string[];
}

// ============================================================================
// API Requests/Responses
// ============================================================================

export interface CreateWorldRequest {
  name: string;
  description: string;
  start_date: string;
  base_prompt: string;
  historical_accuracy: number;
}

export interface CreateWorldResponse {
  id: string;
  name: string;
}

export interface CreateGameRequest {
  world_id: string;
  player_name: string;
  player_region_id: string;
}

export interface CreateGameResponse {
  game_id: string;
  player_id: string;
  region: {
    id: string;
    name: string;
  };
}

export interface SubmitActionRequest {
  game_id: string;
  player_id: string;
  text: string;
}

export interface SubmitActionResponse {
  turn: number;
  narration: string;
  country_response: string;
  events?: string[];
  objects?: MapObject[];
}

export interface AdvisorResponse {
  tips: string[];
}

// ============================================================================
// Map Editor Types
// ============================================================================

export interface RegionEdit {
  id: string;
  name: string;
  path: string;
  color: string;
}

export interface MapData {
  id: string;
  name: string;
  regions: RegionEdit[];
  width: number;
  height: number;
}
