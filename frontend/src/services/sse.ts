/**
 * Open-Pax — SSE Hook
 * ====================
 * React hook for SSE real-time updates
 */

import { useEffect, useRef, useCallback } from 'react';

export interface SSEEvent {
  type: string;
  data: any;
}

interface UseSSEOptions {
  onTurnStart?: (data: any) => void;
  onTurnComplete?: (data: any) => void;
  onGeneratingNarration?: (data: any) => void;
  onLLMProgress?: (data: { mechanic: string; chars: number }) => void;
  onJumpEvent?: (data: { index: number; total: number; event: any }) => void;
  onActionVoided?: (data: { action: string; reason: string }) => void;
  // Этап 3: входящее сообщение дипломатического чата
  onChatMessage?: (data: { chatId: string; polityId: string; polityName: string; message: any }) => void;
  // Этап 3: проактивный комментарий советника после хода
  onAdvisorProactive?: (data: { content: string }) => void;
  onError?: (error: any) => void;
  onConnected?: () => void;
}

export function useSSE(gameId: string | null, options: UseSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!gameId) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Базовый URL API из env (без хардкода), тот же что и в services/api.ts
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
    const url = `${apiBase}/games/${gameId}/events`;
    console.log('[SSE] Connecting to:', url);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[SSE] Connected to game:', gameId);
      options.onConnected?.();
    };

    eventSource.onerror = (error) => {
      console.error('[SSE] Error:', error);
      options.onError?.(error);

      // Reconnect after 5 seconds
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[SSE] Reconnecting...');
        connect();
      }, 5000);
    };

    // Handle specific events
    eventSource.addEventListener('connected', (e) => {
      console.log('[SSE] Received connected event:', e);
    });

    eventSource.addEventListener('turn_start', (e) => {
      console.log('[SSE] Turn start:', e.data);
      try {
        const data = JSON.parse(e.data);
        options.onTurnStart?.(data);
      } catch (err) {
        console.error('[SSE] Failed to parse turn_start:', err);
      }
    });

    eventSource.addEventListener('turn_complete', (e) => {
      console.log('[SSE] Turn complete:', e.data);
      try {
        const data = JSON.parse(e.data);
        options.onTurnComplete?.(data);
      } catch (err) {
        console.error('[SSE] Failed to parse turn_complete:', err);
      }
    });

    eventSource.addEventListener('generating_narration', (e) => {
      console.log('[SSE] Generating narration:', e.data);
      options.onGeneratingNarration?.({});
    });

    eventSource.addEventListener('processing_npcs_complete', (e) => {
      console.log('[SSE] NPCs processed:', e.data);
    });

    eventSource.addEventListener('narration_generated', (e) => {
      console.log('[SSE] Narration generated:', e.data);
    });

    eventSource.addEventListener('llm_progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        options.onLLMProgress?.(data);
      } catch (err) {
        console.error('[SSE] Failed to parse llm_progress:', err);
      }
    });

    eventSource.addEventListener('jump_event', (e) => {
      try {
        const data = JSON.parse(e.data);
        options.onJumpEvent?.(data);
      } catch (err) {
        console.error('[SSE] Failed to parse jump_event:', err);
      }
    });

    eventSource.addEventListener('action_voided', (e) => {
      try {
        const data = JSON.parse(e.data);
        options.onActionVoided?.(data);
      } catch (err) {
        console.error('[SSE] Failed to parse action_voided:', err);
      }
    });

    eventSource.addEventListener('ping', () => {
      // Keep-alive, no action needed
    });

    // Этап 3: дипломатические чаты + живой Советник
    eventSource.addEventListener('chat_message', (e) => {
      try {
        const data = JSON.parse(e.data);
        options.onChatMessage?.(data);
      } catch (err) {
        console.error('[SSE] Failed to parse chat_message:', err);
      }
    });

    eventSource.addEventListener('advisor_proactive', (e) => {
      try {
        const data = JSON.parse(e.data);
        options.onAdvisorProactive?.(data);
      } catch (err) {
        console.error('[SSE] Failed to parse advisor_proactive:', err);
      }
    });

  }, [gameId]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return {
    reconnect: connect,
  };
}
