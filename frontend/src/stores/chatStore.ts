/**
 * Open-Pax — Chat Store (Zustand)
 * ================================
 * Этап 3: дипломатические чаты + живой Советник.
 * Хранит список чатов, сообщения по chatId, unread-счётчики
 * и ленту сообщений советника (включая проактивные сводки из SSE).
 */

import { create } from 'zustand';
import { chatsApi, type ChatSummaryData, type ChatMessageData } from '../services/api';

export type ChatSummary = ChatSummaryData;
export type ChatMessage = ChatMessageData;

/** Сообщение в ленте советника */
export interface AdvisorMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Проактивный комментарий советника после хода (SSE advisor_proactive) */
  proactive?: boolean;
}

/** Вкладки плавающей панели */
export type FloatingPanelTab = 'suggestions' | 'advisor' | 'chats';

interface ChatState {
  // Игра, к которой привязаны чаты (при смене игры стейт сбрасывается)
  gameId: string | null;

  // Дипломатические чаты
  chats: ChatSummary[];
  activeChatId: string | null;
  messagesByChat: Record<string, ChatMessage[]>;

  // Живой Советник
  advisorMessages: AdvisorMessage[];
  advisorStreaming: boolean;

  // Активная вкладка плавающей панели
  panelTab: FloatingPanelTab;

  // Actions
  setGameId: (gameId: string | null) => void;
  setPanelTab: (tab: FloatingPanelTab) => void;
  refreshChats: () => Promise<void>;
  upsertChat: (chat: ChatSummary) => void;
  setActiveChat: (chatId: string | null) => void;
  setMessages: (chatId: string, messages: ChatMessage[]) => void;
  appendMessage: (chatId: string, message: ChatMessage) => void;
  markRead: (chatId: string) => void;
  handleIncomingChatMessage: (payload: {
    chatId: string;
    polityId: string;
    polityName: string;
    message: ChatMessage;
  }) => void;
  addAdvisorMessage: (msg: AdvisorMessage) => void;
  appendToLastAdvisorMessage: (token: string) => void;
  setAdvisorStreaming: (streaming: boolean) => void;
  reset: () => void;
}

const initialState = {
  gameId: null as string | null,
  chats: [] as ChatSummary[],
  activeChatId: null as string | null,
  messagesByChat: {} as Record<string, ChatMessage[]>,
  advisorMessages: [] as AdvisorMessage[],
  advisorStreaming: false,
  panelTab: 'suggestions' as FloatingPanelTab,
};

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  // При смене игры сбрасываем чаты и ленту советника
  setGameId: (gameId) => set((state) => (
    state.gameId === gameId ? {} : { ...initialState, gameId, panelTab: state.panelTab }
  )),

  setPanelTab: (tab) => set({ panelTab: tab }),

  // Перезагрузить список чатов с сервера (ошибки глотаем — чаты не критичны)
  refreshChats: async () => {
    const { gameId } = get();
    if (!gameId || gameId.startsWith('local_')) return;
    try {
      const data = await chatsApi.list(gameId);
      set({ chats: data.chats || [] });
    } catch (e) {
      console.warn('[ChatStore] Не удалось загрузить чаты:', e);
    }
  },

  // Добавить чат или обновить существующий (после chatsApi.create)
  upsertChat: (chat) => set((state) => {
    const exists = state.chats.some(c => c.id === chat.id);
    return {
      chats: exists
        ? state.chats.map(c => (c.id === chat.id ? { ...c, ...chat } : c))
        : [chat, ...state.chats],
    };
  }),

  setActiveChat: (chatId) => set({ activeChatId: chatId }),

  setMessages: (chatId, messages) => set((state) => ({
    messagesByChat: { ...state.messagesByChat, [chatId]: messages },
  })),

  // Добавить сообщение в тред (с защитой от дублей по id — ответ POST и SSE могут прийти вместе)
  appendMessage: (chatId, message) => set((state) => {
    const existing = state.messagesByChat[chatId] || [];
    if (message.id && existing.some(m => m.id === message.id)) return {};
    return {
      messagesByChat: { ...state.messagesByChat, [chatId]: [...existing, message] },
    };
  }),

  // Сбросить unread у чата (после загрузки сообщений — бэкенд помечает прочитанными)
  markRead: (chatId) => set((state) => ({
    chats: state.chats.map(c => (c.id === chatId ? { ...c, unread: 0 } : c)),
  })),

  // Входящее сообщение от политии (SSE chat_message)
  handleIncomingChatMessage: (payload) => set((state) => {
    const { chatId, message } = payload;
    const existing = state.messagesByChat[chatId];
    const isDup = !!(existing && message.id && existing.some(m => m.id === message.id));
    const messagesByChat = existing && !isDup
      ? { ...state.messagesByChat, [chatId]: [...existing, message] }
      : state.messagesByChat;

    // Если чат сейчас открыт на вкладке «Дипломатия» — unread не наращиваем
    const isOpen = state.activeChatId === chatId && state.panelTab === 'chats';
    const chats = state.chats.map(c => (c.id === chatId
      ? {
          ...c,
          lastMessage: message.content,
          lastMessageAt: message.createdAt || new Date().toISOString(),
          unread: isOpen ? 0 : (c.unread || 0) + 1,
        }
      : c));

    return { messagesByChat, chats };
  }),

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

/** Суммарный unread по всем чатам (для бейджей) */
export const selectTotalUnread = (state: ChatState): number =>
  state.chats.reduce((sum, c) => sum + (c.unread || 0), 0);
