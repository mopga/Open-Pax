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

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';


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
    const errorText = await response.text();
    console.error('[API Error]', response.status, endpoint, errorText);
    throw new ApiError(response.status, `API Error: ${response.statusText} - ${errorText}`);
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
   * Создать мир из карты
   */
  createFromMap: (data: {
    mapId: string;
    name: string;
    description?: string;
    startDate?: string;
    basePrompt?: string;
    historicalAccuracy?: number;
    initialOwners?: { id: string; owner: string }[];
  }): Promise<{
    world_id: string;
    name: string;
    regions_count: number;
    regions: { id: string; name: string; color: string; owner: string }[];
  }> => {
    return fetchApi('/worlds/from-map', {
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

  /**
   * Получить подсказки (actions.md)
   */
  getSuggestions: (gameId: string): Promise<{ suggestions: any[] }> => {
    return fetchApi(`/games/${gameId}/suggestions`);
  },

  /**
   * Сохранить игру
   */
  saveGame: (gameId: string, name?: string): Promise<any> => {
    return fetchApi(`/games/${gameId}/save`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  /**
   * Загрузить сохранённую игру
   */
  loadSave: (saveId: string): Promise<any> => {
    return fetchApi(`/saves/${saveId}/load`, {
      method: 'POST',
    });
  },

  // =========================================================================
  // Pending Actions Queue (Phase 2)
  // =========================================================================

  /**
   * Add action to queue (without processing)
   */
  queueAction: (gameId: string, text: string): Promise<{
    id: string;
    text: string;
    status: string;
    createdAt: string;
  }> => {
    return fetchApi(`/games/${gameId}/actions/queue`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  /**
   * Get pending actions
   */
  getPendingActions: (gameId: string): Promise<{ pendingActions: any[] }> => {
    return fetchApi(`/games/${gameId}/actions/queue`);
  },

  /**
   * Process one action from queue
   */
  processNextAction: (gameId: string, jumpDays?: number): Promise<{
    id: string;
    text: string;
    status: string;
    result?: {
      narration: string;
      countryResponse: string;
      events: string[];
      objects: any[];
      turn: number;
      periodStart: string;
      periodEnd: string;
    };
  }> => {
    return fetchApi(`/games/${gameId}/actions/process`, {
      method: 'POST',
      body: JSON.stringify({ jump_days: jumpDays || 30 }),
    });
  },

  /**
   * Process all pending actions
   */
  processAllActions: (gameId: string, jumpDays?: number): Promise<{
    processedCount: number;
    actions: any[];
  }> => {
    return fetchApi(`/games/${gameId}/actions/process-all`, {
      method: 'POST',
      body: JSON.stringify({ jump_days: jumpDays || 30 }),
    });
  },
};

// ============================================================================
// Saves API
// ============================================================================

export const savesApi = {
  /**
   * Получить список сохранений
   */
  list: (): Promise<{ saves: any[] }> => {
    return fetchApi('/saves');
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


// ============================================================================
// Map API
// ============================================================================

export interface MapRegionData {
  id: string;
  name: string;
  color: string;
  path: string;
}

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  regions: MapRegionData[];
}

export interface MapListItem {
  id: string;
  name: string;
  regions_count: number;
  created_at: string;
}

export const mapApi = {
  /**
   * Создать новую карту
   */
  create: (data: {
    name: string;
    width: number;
    height: number;
    regions: MapRegionData[];
  }): Promise<{ id: string; name: string }> => {
    return fetchApi('/maps', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Список всех карт
   */
  list: (): Promise<MapListItem[]> => {
    return fetchApi('/maps');
  },

  /**
   * Получить карту по ID
   */
  get: (mapId: string): Promise<MapData> => {
    return fetchApi(`/maps/${mapId}`);
  },

  /**
   * Удалить карту
   */
  delete: (mapId: string): Promise<{ status: string; id: string }> => {
    return fetchApi(`/maps/${mapId}`, {
      method: 'DELETE',
    });
  },
};
