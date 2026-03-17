/**
 * Open-Pax — API Service
 * =====================
 */

import type {
  CreateWorldRequest,
  CreateWorldResponse,
  CreateGameRequest,
  CreateGameResponse,
  SubmitActionRequest,
  SubmitActionResponse,
  AdvisorResponse,
  Game,
  World
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';


class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    throw new ApiError(response.status, `API Error: ${response.statusText}`);
  }
  
  return response.json();
}


// ============================================================================
// World API
// ============================================================================

export const worldApi = {
  /**
   * Создать новый мир
   */
  create: (data: CreateWorldRequest): Promise<CreateWorldResponse> => {
    return fetchApi('/worlds', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  /**
   * Получить мир по ID
   */
  get: (worldId: string): Promise<World> => {
    return fetchApi(`/worlds/${worldId}`);
  },
  
  /**
   * Добавить регион на карту мира
   */
  addRegion: (worldId: string, region: {
    id: string;
    name: string;
    svg_path: string;
    color: string;
  }): Promise<{ id: string; name: string }> => {
    return fetchApi(`/worlds/${worldId}/regions`, {
      method: 'POST',
      body: JSON.stringify(region),
    });
  },
};


// ============================================================================
// Game API
// ============================================================================

export const gameApi = {
  /**
   * Начать новую игру
   */
  create: (data: CreateGameRequest): Promise<CreateGameResponse> => {
    return fetchApi('/games', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  /**
   * Получить состояние игры
   */
  get: (gameId: string): Promise<Game> => {
    return fetchApi(`/games/${gameId}`);
  },
  
  /**
   * Отправить действие игрока
   */
  submitAction: (data: SubmitActionRequest): Promise<SubmitActionResponse> => {
    return fetchApi(`/games/${data.game_id}/action`, {
      method: 'POST',
      body: JSON.stringify({
        game_id: data.game_id,
        player_id: data.player_id,
        text: data.text,
      }),
    });
  },
  
  /**
   * Получить советы от советника
   */
  getAdvisor: (gameId: string, playerId: string): Promise<AdvisorResponse> => {
    return fetchApi(`/games/${gameId}/advisor?player_id=${playerId}`);
  },
};


// ============================================================================
// Health Check
// ============================================================================

export const healthApi = {
  check: (): Promise<{ status: string; timestamp: string }> => {
    return fetchApi('/health');
  },
};
