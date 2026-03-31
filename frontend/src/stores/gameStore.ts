/**
 * Open-Pax — Game Store (Zustand)
 * ===============================
 */

import { create } from 'zustand';
import type { Game, World } from '../types';

export interface HistoryItem {
  turn: number;
  action: string;
  result: string;
  events?: string[];
  periodStart?: string;
  periodEnd?: string;
  date?: string;
}

export interface PendingAction {
  id: string;
  text: string;
}

export interface GeneratedWorld {
  date: string;
  countries: Record<string, any>;
  regions: Record<string, any>;
  playerCountryCode: string;
}

type GameUpdater = (game: Game | null) => Game | null;

interface GameState {
  // Core game state
  currentGame: Game | null;
  currentWorld: World | null;
  selectedRegion: string | null;
  history: HistoryItem[];
  pendingActions: PendingAction[];
  changedRegions: string[];

  // Template-based world generation
  generatedWorld: GeneratedWorld | null;
  selectedCountry: string | null;

  // Actions
  setCurrentGame: (game: Game | null | GameUpdater) => void;
  setCurrentWorld: (world: World | null) => void;
  setSelectedRegion: (regionId: string | null) => void;
  setHistory: (history: HistoryItem[]) => void;
  addHistory: (item: HistoryItem) => void;
  setPendingActions: (actions: PendingAction[]) => void;
  addPendingAction: (action: PendingAction) => void;
  removePendingAction: (id: string) => void;
  clearPendingActions: () => void;
  setChangedRegions: (regions: string[]) => void;
  addChangedRegion: (regionId: string) => void;
  clearChangedRegions: () => void;
  setGeneratedWorld: (world: GeneratedWorld | null) => void;
  setSelectedCountry: (countryCode: string | null) => void;

  // Computed
  reset: () => void;
}

const initialState = {
  currentGame: null,
  currentWorld: null,
  selectedRegion: null,
  history: [] as HistoryItem[],
  pendingActions: [] as PendingAction[],
  changedRegions: [] as string[],
  generatedWorld: null,
  selectedCountry: null,
};

export const useGameStore = create<GameState>((set) => ({
  ...initialState,

  setCurrentGame: (gameOrUpdater) => set((state) => ({
    currentGame: typeof gameOrUpdater === 'function'
      ? gameOrUpdater(state.currentGame)
      : gameOrUpdater
  })),
  setCurrentWorld: (world) => set({ currentWorld: world }),
  setSelectedRegion: (regionId) => set({ selectedRegion: regionId }),

  setHistory: (history) => set({ history }),
  addHistory: (item) => set((state) => ({ history: [...state.history, item] })),

  setPendingActions: (actions) => set({ pendingActions: actions }),
  addPendingAction: (action) => set((state) => ({
    pendingActions: [...state.pendingActions, action]
  })),
  removePendingAction: (id) => set((state) => ({
    pendingActions: state.pendingActions.filter(a => a.id !== id)
  })),
  clearPendingActions: () => set({ pendingActions: [] }),

  setChangedRegions: (regions) => set({ changedRegions: regions }),
  addChangedRegion: (regionId) => set((state) => ({
    changedRegions: [...state.changedRegions, regionId]
  })),
  clearChangedRegions: () => set({ changedRegions: [] }),

  setGeneratedWorld: (world) => set({ generatedWorld: world }),
  setSelectedCountry: (countryCode) => set({ selectedCountry: countryCode }),

  reset: () => set(initialState),
}));
