/**
 * Open-Pax — Simulation Core Types
 * =================================
 * Deterministic types for game simulation (no LLM)
 */

export interface RegionState {
  id: string;
  name: string;
  color: string;
  owner: string;
  population: number;
  gdp: number;
  militaryPower: number;
  objects: MapObject[];
  borders: string[];
  status: 'active' | 'occupied' | 'destroyed' | 'independent';
}

export interface MapObject {
  id: string;
  type: 'army' | 'factory' | 'university' | 'city' | 'fleet' | 'missile' | 'radar' | 'port';
  name: string;
  x: number;
  y: number;
  owner?: string;
  level: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  regionId: string;
  color: string;
}

/**
 * Represents a validated action that can be executed
 */
export interface ValidatedAction {
  type: 'attack' | 'develop' | 'trade' | 'diplomacy' | 'build';
  sourceRegionId: string;
  targetRegionId?: string;
  description: string;
  cost: ActionCost;
  expectedOutcome: ActionOutcome;
  /** Validation result - set by ActionParser when validate function is provided */
  validation?: { valid: boolean; reason?: string };
}

export interface ActionCost {
  gdp: number;        // Gold spent
  population: number; // Pop used
  militaryPower: number; // Troops committed
}

export interface ActionOutcome {
  successProbability: number; // 0-1
  expectedCaptures: string[];
  expectedLosses: ActionCost;
  duration: number; // days
}

/**
 * Result of a turn simulation
 */
export interface SimulationDelta {
  // Changes to apply
  regionChanges: RegionChange[];

  // Economic/military shifts
  gdpChanges: Record<string, number>;    // regionId -> delta
  populationChanges: Record<string, number>;
  militaryChanges: Record<string, number>;

  // New objects created
  newObjects: MapObject[];

  // Events that happened
  events: DeterministicEvent[];

  // What happened narratively (for LLM to flesh out)
  narrativeFacts: string[];
}

export interface RegionChange {
  regionId: string;
  newOwner?: string;
  newColor?: string;
  status?: 'active' | 'occupied' | 'destroyed';
}

export interface DeterministicEvent {
  type: 'battle' | 'economy' | 'diplomacy' | 'disaster' | 'discovery';
  headline: string;        // Short fact: "Battle of Berlin"
  involvedRegions: string[];
  outcome: string;         // "USA won", "GDP -5%"
}

/**
 * Configuration for simulation
 */
export interface SimulationConfig {
  // How aggressive is the AI (0-1)
  aggressionMultiplier: number;

  // Economic growth rate per month
  baseGrowthRate: number;

  // War costs
  warGdpCost: number;       // Per day
  warPopulationCost: number; // Per day

  // Combat formula constants
  defenderAdvantage: number; // Bonus for defending
  terrainPenalty: number;    // Penalty for attacking across borders
}
