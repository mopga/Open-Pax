/**
 * Open-Pax — UI Store (Zustand)
 * ==============================
 */

import { create } from 'zustand';
import type { WorldTemplate } from '../types';

export type ViewType = 'menu' | 'select-template' | 'select-country' | 'game';

interface UIState {
  // Navigation
  currentView: ViewType;
  loading: boolean;

  // Панель «Таймлайн» (выбор периода хода)
  showJumpMenu: boolean;

  // Prompt editor
  showPromptEditor: boolean;
  editingPrompt: string;

  // Actions panel
  showActions: boolean;
  actionsMaximized: boolean;
  actionsSize: { width: number; height: number };
  isResizing: boolean;

  // Template selection
  selectedTemplate: WorldTemplate | null;

  // Actions
  setCurrentView: (view: ViewType) => void;
  setLoading: (loading: boolean) => void;
  setShowJumpMenu: (show: boolean) => void;
  setShowPromptEditor: (show: boolean) => void;
  setEditingPrompt: (prompt: string) => void;
  setShowActions: (show: boolean) => void;
  setActionsMaximized: (maximized: boolean) => void;
  setActionsSize: (size: { width: number; height: number }) => void;
  setIsResizing: (resizing: boolean) => void;
  setSelectedTemplate: (template: WorldTemplate | null) => void;

  // Computed
  resetUI: () => void;
}

const initialState = {
  currentView: 'menu' as ViewType,
  loading: false,
  showJumpMenu: false,
  showPromptEditor: false,
  editingPrompt: '',
  showActions: false,
  actionsMaximized: false,
  actionsSize: { width: 400, height: 500 },
  isResizing: false,
  selectedTemplate: null,
};

export const useUIStore = create<UIState>((set) => ({
  ...initialState,

  setCurrentView: (view) => set({ currentView: view }),
  setLoading: (loading) => set({ loading }),
  setShowJumpMenu: (show) => set({ showJumpMenu: show }),
  setShowPromptEditor: (show) => set({ showPromptEditor: show }),
  setEditingPrompt: (prompt) => set({ editingPrompt: prompt }),
  setShowActions: (show) => set({ showActions: show }),
  setActionsMaximized: (maximized) => set({ actionsMaximized: maximized }),
  setActionsSize: (size) => set({ actionsSize: size }),
  setIsResizing: (resizing) => set({ isResizing: resizing }),
  setSelectedTemplate: (template) => set({ selectedTemplate: template }),

  resetUI: () => set(initialState),
}));
