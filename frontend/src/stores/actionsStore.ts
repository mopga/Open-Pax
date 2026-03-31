/**
 * Open-Pax — Actions Store (Zustand)
 * ====================================
 * Stores suggestions and manual action input
 */

import { create } from 'zustand';

interface ActionsState {
  // Suggestions from API
  suggestions: any[];

  // Manual action text input
  newActionText: string;

  // Actions
  setSuggestions: (suggestions: any[]) => void;
  setNewActionText: (text: string) => void;
  clearSuggestions: () => void;

  // Computed
  reset: () => void;
}

const initialState = {
  suggestions: [],
  newActionText: '',
};

export const useActionsStore = create<ActionsState>((set) => ({
  ...initialState,

  setSuggestions: (suggestions) => set({ suggestions }),
  setNewActionText: (text) => set({ newActionText: text }),
  clearSuggestions: () => set({ suggestions: [] }),

  reset: () => set(initialState),
}));
