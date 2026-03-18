/**
 * Open-Pax — Data Models
 * ======================
 */

export interface MapRegion {
  id: string;
  name: string;
  svgPath: string;
  color: string;
  owner: string;
  population: number;
  gdp: number;
  militaryPower: number;
  borders: string[];
  status: 'active' | 'occupied' | 'destroyed' | 'independent';
}

export interface GameWorld {
  id: string;
  name: string;
  description: string;
  startDate: string;
  basePrompt: string;
  historicalAccuracy: number;
  regions: Map<string, MapRegion>;
  createdAt: string;
  updatedAt: string;
}

export interface Player {
  id: string;
  name: string;
  regionId: string;
  color: string;
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

export interface Game {
  id: string;
  world: GameWorld;
  players: Player[];
  currentTurn: number;
  maxTurns: number;
  actions: Action[];
  results: TurnResult[];
  status: 'waiting' | 'playing' | 'finished';
  createdAt: string;
  updatedAt: string;
}

// API Request/Response types
export interface CreateWorldRequest {
  name: string;
  description: string;
  startDate: string;
  basePrompt: string;
  historicalAccuracy: number;
}

export interface CreateGameRequest {
  worldId: string;
  playerName: string;
  playerRegionId: string;
}

export interface SubmitActionRequest {
  gameId: string;
  playerId: string;
  text: string;
}

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  regions: {
    id: string;
    name: string;
    color: string;
    path: string;
  }[];
}
