/**
 * Open-Pax — Prompt Types
 * ======================
 * Типы данных для промптов LLM
 */

export interface PromptVariables {
  // Даты
  STARTING_ROUND_DATE: string;
  ORIGIN_ROUND_DATE: string;
  TARGET_ROUND_DATE: string;
  ORIGIN_ROUND_GRAMMATICAL_DATE: string;
  TARGET_ROUND_GRAMMATICAL_DATE: string;
  CURRENT_ROUND_NUMBER: number;

  // Мир
  WORLD_BEFORE_ROUND_ONE_TEXT: string;
  HISTORICAL_PRESET_SIMULATION_RULES: string;
  DIFFICULTY_DESCRIPTION_JUMP_FORWARD: string;

  // Игрок
  PLAYER_POLITY: string;
  PLAYER_POLITY_REGIONS: string;
  PLAYER_POLITY_BATTALION_SUMMARIES: string;

  // Действия
  PLAYER_ACTIONS_THIS_ROUND: string;
  PLAYER_EVERY_ACTION_NOT_PREVIOUS: string;

  // Карта
  GRAND_MAP_DESCRIPTION: string;
  GRAND_MAP_DESCRIPTION_NO_CITY: string;

  // События
  ALL_EVENTS_WITH_CONSOLIDATION: string;
  CHATS_NON_CONSOLIDATED_ROUNDS: string;
  NON_CONSOLIDATED_ROUNDS_WITH_DATES: string;

  // Язык
  LANGUAGE: string;

  // Для конвертера действий
  DESCRIPTION_ACTION_TEXT?: string;
  isBeta?: boolean;
}

export interface SimulationEvent {
  headline: string;
  description: string;
  date: string;
  mapChanges: MapChange[];
}

export interface MapChange {
  type: 'transfer' | 'create' | 'update' | 'delete';
  regionId: string;
  newOwner?: string;
  newColor?: string;
  newName?: string;
  feature?: MapFeature;
}

export interface MapFeature {
  type: 'city' | 'battalion' | 'factory' | 'port' | 'base';
  name: string;
  x?: number;
  y?: number;
  metadata?: Record<string, any>;
}

export interface SimulationResult {
  events: SimulationEvent[];
  narration: string;
  diplomacy: DiplomacyChat[];
  worldChanges: WorldChanges;
}

export interface DiplomacyChat {
  round: number;
  participants: string[];
  messages: ChatMessage[];
}

export interface ChatMessage {
  from: string;
  text: string;
}

export interface WorldChanges {
  regionOwners: Record<string, string>;
  regionColors: Record<string, string>;
  newFeatures: MapFeature[];
  deletedFeatures: string[];
}

export interface ConvertedAction {
  type: 'action' | 'chat';
  text: string;
  targetPolity?: string;
  chatMessage?: string;
}

export interface Suggestion {
  topic: string;
  description: string;
  actions: {
    title: string;
    content: string;
  }[];
}

export interface AdvisorMessage {
  role: 'user' | 'assistant';
  content: string;
}
