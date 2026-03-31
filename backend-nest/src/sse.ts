/**
 * Open-Pax — SSE (Server-Sent Events)
 * ====================================
 * Real-time event streaming for game updates
 */

import { Response } from 'express';

export interface SSEClient {
  id: string;
  response: Response;
}

export interface SSEEvent {
  type: 'turn_progress' | 'turn_complete' | 'error' | 'ping';
  data: any;
  timestamp: number;
}

// In-memory client registry (per-game)
const gameClients = new Map<string, Set<SSEClient>>();

export function addSSEClient(gameId: string, client: SSEClient): void {
  if (!gameClients.has(gameId)) {
    gameClients.set(gameId, new Set());
  }
  gameClients.get(gameId)!.add(client);
  console.log(`[SSE] Client connected to game ${gameId}. Total clients: ${gameClients.get(gameId)!.size}`);
}

export function removeSSEClient(gameId: string, clientId: string): void {
  const clients = gameClients.get(gameId);
  if (clients) {
    for (const client of clients) {
      if (client.id === clientId) {
        clients.delete(client);
        console.log(`[SSE] Client disconnected from game ${gameId}. Remaining: ${clients.size}`);
        break;
      }
    }
    if (clients.size === 0) {
      gameClients.delete(gameId);
    }
  }
}

export function emitSSEEvent(gameId: string, event: SSEEvent): void {
  const clients = gameClients.get(gameId);
  if (!clients || clients.size === 0) {
    console.log(`[SSE] No clients for game ${gameId}, event dropped: ${event.type}`);
    return;
  }

  const message = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;

  for (const client of clients) {
    client.response.write(message);
  }
}

export function broadcastToGame(gameId: string, eventType: string, data: any): void {
  emitSSEEvent(gameId, {
    type: eventType as any,
    data,
    timestamp: Date.now(),
  });
}
