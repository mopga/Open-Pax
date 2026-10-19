/**
 * Open-Pax — Chat Store (Zustand)
 * ================================
 * Этап 3: живой Советник.
 * Хранит ленту сообщений советника (включая проактивные сводки из SSE)
 * и активную вкладку плавающей панели.
 */

import { create } from 'zustand';

/** Сообщение в ленте советника */
export interface AdvisorMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Проактивный комментарий советника после хода (SSE advisor_proactive) */
  proactive?: boolean;
}

/** Вкладки плавающей панели */
export type FloatingPanelTab = 'suggestions' | 'advisor';

interface ChatState {
  // Игра, к которой привязана лента (при смене игры стейт сбрасывается)
  gameId: string | null;

  // Живой Советник
  advisorMessages: AdvisorMessage[];
  advisorStreaming: boolean;

  // Активная вкладка плавающей панели
  panelTab: FloatingPanelTab;

  // Actions
  setGameId: (gameId: string | null) => void;
  setPanelTab: (tab: FloatingPanelTab) => void;
  addAdvisorMessage: (msg: AdvisorMessage) => void;
  appendToLastAdvisorMessage: (token: string) => void;
  setAdvisorStreaming: (streaming: boolean) => void;
  reset: () => void;
}

const initialState = {
  gameId: null as string | null,
  advisorMessages: [] as AdvisorMessage[],
  advisorStreaming: false,
  panelTab: 'suggestions' as FloatingPanelTab,
};

export const useChatStore = create<ChatState>((set) => ({
  ...initialState,

  // При смене игры сбрасываем ленту советника
  setGameId: (gameId) => set((state) => (
    state.gameId === gameId ? {} : { ...initialState, gameId, panelTab: state.panelTab }
  )),

  setPanelTab: (tab) => set({ panelTab: tab }),

  addAdvisorMessage: (msg) => set((state) => ({
    advisorMessages: [...state.advisorMessages, msg],
  })),

  // Дописать токен стрима к последнему сообщению ассистента
  appendToLastAdvisorMessage: (token) => set((state) => {
    const msgs = state.advisorMessages;
    if (msgs.length === 0) return {};
    const last = msgs[msgs.length - 1];
    if (last.role !== 'assistant') return {};
    const updated = [...msgs];
    updated[updated.length - 1] = { ...last, content: last.content + token };
    return { advisorMessages: updated };
  }),

  setAdvisorStreaming: (streaming) => set({ advisorStreaming: streaming }),

  reset: () => set(initialState),
}));
