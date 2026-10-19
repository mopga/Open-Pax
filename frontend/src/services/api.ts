/**
 * Open-Pax — API Service
 * =====================
 */

import type {
  CreateGameRequest,
  CreateGameResponse,
  Game,
  WorldTemplate
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
   * Обновить промпт мира
   */
  updatePrompt: (worldId: string, basePrompt: string): Promise<{ success: boolean; basePrompt: string }> => {
    return fetchApi(`/worlds/${worldId}/prompt`, {
      method: 'PATCH',
      body: JSON.stringify({ basePrompt }),
    });
  },

  /**
   * Создать мир из пресета
   */
  generateFromTemplate: (templateId: string, playerCountryCode: string): Promise<{
    templateId: string;
    worldId: string;
    date: string;
    countries: Record<string, any>;
    regions: Record<string, any>;
    regionIds?: Record<string, string>;
    playerCountryCode: string;
  }> => {
    return fetchApi('/worlds/generate', {
      method: 'POST',
      body: JSON.stringify({ templateId, playerCountryCode }),
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
  get: async (gameId: string): Promise<Game> => {
    const game = await fetchApi<any>(`/games/${gameId}`);
    // Сервер отдаёт регионы массивом; во фронте World.regions — словарь по id
    // (иначе поиск currentWorld.regions[id] молча промахивается)
    if (Array.isArray(game?.world?.regions)) {
      game.world.regions = Object.fromEntries(game.world.regions.map((r: any) => [r.id, r]));
    }
    if (Array.isArray(game?.world?.polities)) {
      game.world.polities = Object.fromEntries(game.world.polities.map((p: any) => [p.id, p]));
    }
    return game as Game;
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

  /**
   * Time-skip: process pending actions or simulate an autonomous world turn
   */
  timeSkip: (gameId: string, jumpDays?: number, actions?: string[]): Promise<{
    type: 'actions_processed' | 'world_simulated';
    processedCount?: number;
    actions?: any[];
    result?: {
      narration: string;
      countryResponse: string;
      events: string[];
      timelineEvents: Array<{
        headline: string;
        description: string;
        date: string;
        kind?: 'reaction' | 'independent' | 'world';
        mapChanges?: any[];
      }>;
      objects: any[];
      turn: number;
      periodStart: string;
      periodEnd: string;
    };
    newDate?: string;
    newTurn?: number;
    jumpDays?: number;
  }> => {
    return fetchApi(`/games/${gameId}/time-skip`, {
      method: 'POST',
      body: JSON.stringify({ jump_days: jumpDays ?? 30, actions }),
    });
  },

  /**
   * Этап 2: откат на ход назад
   */
  rewind: (gameId: string): Promise<{ type: string; newTurn: number; newDate: string }> => {
    return fetchApi(`/games/${gameId}/rewind`, { method: 'POST' });
  },

  /**
   * Этап 2: Intervene — прервать применение оставшихся событий пачки
   */
  intervene: (gameId: string): Promise<{ ok: boolean }> => {
    return fetchApi(`/games/${gameId}/intervene`, { method: 'POST' });
  },

};

// ============================================================================
// Advisor API (Этап 3: живой Советник)
// ============================================================================

/** Сообщение истории диалога с советником */
export interface AdvisorHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export const advisorApi = {
  /**
   * Спросить советника (многоходовый диалог — history шлём с каждым запросом)
   */
  ask: (gameId: string, message: string, history: AdvisorHistoryItem[]): Promise<{ reply: string }> => {
    return fetchApi(`/games/${gameId}/advisor`, {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    });
  },

  /**
   * Стриминг ответа советника (text/plain chunked).
   * onToken вызывается на каждый кусок текста; возвращает полный ответ.
   * При сетевой ошибке стрима — fallback на обычный POST /advisor.
   */
  askStream: async (
    gameId: string,
    message: string,
    history: AdvisorHistoryItem[],
    onToken: (token: string) => void
  ): Promise<string> => {
    const url = `${API_BASE}/games/${gameId}/advisor/stream`;
    const body = JSON.stringify({ message, history });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch (e) {
      // Сеть не дала открыть поток — откатываемся на обычный запрос
      console.warn('[Advisor] Стрим недоступен, fallback на POST /advisor:', e);
      const data = await advisorApi.ask(gameId, message, history);
      onToken(data.reply);
      return data.reply;
    }

    if (!response.ok || !response.body) {
      console.warn('[Advisor] Стрим вернул', response.status, '— fallback на POST /advisor');
      const data = await advisorApi.ask(gameId, message, history);
      onToken(data.reply);
      return data.reply;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          full += chunk;
          onToken(chunk);
        }
      }
    } catch (e) {
      // Обрыв посреди потока: если ничего не получили — fallback, иначе отдаём то, что есть
      if (!full) {
        console.warn('[Advisor] Поток оборвался, fallback на POST /advisor:', e);
        const data = await advisorApi.ask(gameId, message, history);
        onToken(data.reply);
        return data.reply;
      }
      console.warn('[Advisor] Поток оборвался на середине, используем частичный ответ:', e);
    }
    return full;
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
// Templates API
// ============================================================================

/** Информация о шаблоне в списке (Этап 5: пресеты как пакеты) */
export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  start_date: string;
  country_count: number;
  /** preset — пакет из data/presets, legacy — старый шаблон из data/templates */
  /** Есть ли кастомные правила симуляции */
  has_rules: boolean;
  /** Есть ли своя карта (map.geojson) */
  has_map: boolean;
  /** Количество флагов в пакете */
  flags_count: number;
}

export const templatesApi = {
  /**
   * Получить все шаблоны
   */
  list: (): Promise<{ templates: TemplateInfo[] }> => {
    return fetchApi('/templates');
  },

  /**
   * Получить шаблон по ID
   */
  get: (templateId: string): Promise<WorldTemplate> => {
    return fetchApi(`/templates/${templateId}`);
  },

  /**
   * Экспорт пресета как zip-архива: получаем blob и инициируем скачивание
   */
  exportPreset: async (templateId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/templates/${templateId}/export`);
    if (!response.ok) {
      const text = await response.text();
      console.error('[API Error]', response.status, `/templates/${templateId}/export`, text);
      throw new Error(text || `Ошибка экспорта (${response.status})`);
    }
    const blob = await response.blob();
    // Имя файла — из Content-Disposition, иначе <id>.zip
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/);
    const filename = match?.[1] || `${templateId}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  /**
   * Импорт пресета из zip-архива (тело — байты файла).
   * При 409 (уже существует) бросает ошибку с code === 'EXISTS' —
   * вызывающий код показывает confirm и повторяет с overwrite = true.
   */
  importPreset: async (file: File, overwrite = false): Promise<{ template: TemplateInfo }> => {
    const response = await fetch(
      `${API_BASE}/templates/import${overwrite ? '?overwrite=1' : ''}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: file,
      }
    );
    if (response.status === 409) {
      const error = new Error('Пресет с таким ID уже существует') as Error & { code?: string };
      error.code = 'EXISTS';
      throw error;
    }
    if (!response.ok) {
      const text = await response.text();
      console.error('[API Error]', response.status, '/templates/import', text);
      throw new Error(text || `Ошибка импорта (${response.status})`);
    }
    return response.json();
  },
};


// ============================================================================
// Geo API (Этап 4: реальная геометрия Natural Earth)
// ============================================================================

/** Свойства страны в GeoJSON от /api/geo/countries */
export interface GeoCountryProperties {
  code: string;
  name: string;
  nameEn?: string;
}

/** GeoJSON Feature одной страны (Polygon или MultiPolygon) */
export interface GeoCountryFeature {
  type: 'Feature';
  properties: GeoCountryProperties;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

/** GeoJSON FeatureCollection со странами мира */
export interface GeoCountriesCollection {
  type: 'FeatureCollection';
  features: GeoCountryFeature[];
}

export const geoApi = {
  /**
   * Реальные границы стран (Natural Earth) — GeoJSON FeatureCollection.
   * Бэкенд может вернуть коллекцию напрямую или обёрнутую в { countries }.
   */
  getCountries: async (): Promise<GeoCountriesCollection> => {
    const data = await fetchApi<GeoCountriesCollection | { countries: GeoCountriesCollection }>('/geo/countries');
    // Нормализуем: принимаем и голый FeatureCollection, и обёртку
    if ((data as GeoCountriesCollection).type === 'FeatureCollection') {
      return data as GeoCountriesCollection;
    }
    return (data as { countries: GeoCountriesCollection }).countries;
  },
};

// ============================================================================
// LLM Settings & Usage API — свой ключ / подписка / локальная модель
// ============================================================================

export type ProviderKind = 'openai-compatible' | 'anthropic' | 'minimax' | 'ollama';
export type BillingMode = 'payg' | 'subscription' | 'local';

export interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
  cachedInputPerM?: number;
}

export interface ProviderPreset {
  id: string;
  label: string;
  provider: ProviderKind;
  baseUrl: string;
  keyRequired: boolean;
  billing: BillingMode;
  model?: string;
  lightModel?: string;
  contextLength?: number;
  keyUrl?: string;
  hint?: string;
}

/** Сохранённые настройки без ключа (сервер отдаёт только маску) */
export interface PublicLLMSettings {
  presetId: string;
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  lightModel?: string;
  billing: BillingMode;
  pricing?: ModelPrice;
  lightPricing?: ModelPrice;
  contextLength?: number;
  budgetPerGameUsd?: number;
  hasApiKey: boolean;
  apiKeyMasked: string;
}

export interface UsageTotals {
  calls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costUsd: number;
  costIncomplete: boolean;
  estimated: boolean;
}

export interface LLMSettingsView {
  configured: boolean;
  source: 'settings' | 'file' | 'env';
  settings: PublicLLMSettings | null;
  presets: ProviderPreset[];
  effective: Record<'jump' | 'suggestions', { provider: string; model: string; baseUrl: string }>;
  usage: { allTime: UsageTotals; today: UsageTotals };
}

/** Тело запроса сохранения/проверки; пустой apiKey = оставить сохранённый */
export interface LLMSettingsInput {
  presetId: string;
  provider: ProviderKind;
  baseUrl: string;
  apiKey?: string;
  model: string;
  lightModel?: string;
  billing: BillingMode;
  pricing?: ModelPrice;
  lightPricing?: ModelPrice;
  contextLength?: number;
  budgetPerGameUsd?: number;
}

export interface ConnectionTestResult {
  ok: boolean;
  model: string;
  latencyMs: number;
  reply?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface RemoteModel {
  id: string;
  pricing?: ModelPrice;
}

export interface GameUsage {
  gameId: string;
  totals: UsageTotals;
  byMechanic: (UsageTotals & { mechanic: string; model: string })[];
  recent: {
    createdAt: string;
    mechanic: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    ok: boolean;
    error: string | null;
    costUsd: number | null;
  }[];
  billing: BillingMode;
  budgetPerGameUsd: number | null;
}

/** Как fetchApi, но достаёт человекочитаемое {error} из тела ответа */
async function fetchWithServerError<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error || `Ошибка сервера (HTTP ${response.status})`);
  }
  return data as T;
}

export const settingsApi = {
  getLLM: (): Promise<LLMSettingsView> => fetchWithServerError('/settings/llm'),

  saveLLM: (input: LLMSettingsInput): Promise<LLMSettingsView> =>
    fetchWithServerError('/settings/llm', { method: 'PUT', body: JSON.stringify(input) }),

  resetLLM: (): Promise<LLMSettingsView> =>
    fetchWithServerError('/settings/llm', { method: 'DELETE' }),

  testLLM: (input: LLMSettingsInput): Promise<{ ok: boolean; results: ConnectionTestResult[] }> =>
    fetchWithServerError('/settings/llm/test', { method: 'POST', body: JSON.stringify(input) }),

  listModels: (input: Partial<LLMSettingsInput>): Promise<{ models: RemoteModel[] }> =>
    fetchWithServerError('/settings/llm/models', { method: 'POST', body: JSON.stringify(input) }),
};

export const usageApi = {
  game: (gameId: string): Promise<GameUsage> => fetchWithServerError(`/games/${gameId}/usage`),
};
