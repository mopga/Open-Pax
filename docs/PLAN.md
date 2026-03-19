# Open-Pax — Technical Plan
=========================

## Project Overview

**Open-Pax** — это open-source аналог paxhistoria.co с поддержкой кастомных карт. Позволяет создавать альтернативные миры на основе любых карт (книги, фильмы, игры).

### Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **LLM**: MiniMax API (расширяемо)

---

## Current State (as of 2026-03-18)

### ✅ Implemented

#### Frontend (`frontend/src/`)
- `App.tsx` — главное приложение с навигацией
- `components/Map/MapView.tsx` — отображение карты с SVG регионами, зум, панорамирование
- `components/Editor/MapEditor.tsx` — редактор карт со свободным рисованием, объектами, зумом
- `components/WorldBuilder/CreateWorld.tsx` — экран создания мира с настройками
- `services/api.ts` — API клиент
- `types/index.ts` — TypeScript типы

#### Backend (`backend-nest/src/`)
- `index.ts` — Express сервер (maps, worlds, games endpoints)
- `models.ts` — модели данных (MapRegion, GameWorld, Player, Game, Action, MapObject)
- `agents.ts` — AI агенты (CountryAgent, WorldAgent, AdvisorAgent, GameController)
- `npc-agents.ts` — NPC агенты с личностями (aggressive, diplomatic, neutral, isolationist)
- `llm.ts` — MiniMax LLM провайдер

### 🆕 Latest Changes (2026-03-19)

#### Phase 7: Mapbox GL JS Migration
**Mapbox GL JS** for world-scale visualization with real geographic data.

1. **MapboxMapView Component** (`frontend/src/components/Map/MapboxMapView.tsx`)
   - Mapbox GL JS integration with layers: fill, line, symbol, circle
   - Environment variable: `VITE_MAPBOX_TOKEN`
   - Supports selection, hover, changed regions highlighting
   - Object markers as custom HTML elements
   - Mercator 2D projection

2. **SVG to GeoJSON Conversion** (`backend-nest/src/utils/svg-to-geojson.ts`)
   - Converts SVG paths to GeoJSON polygons for Mapbox
   - Maps SVG coordinates to lng/lat (x→lng, y→lat)

3. **Database Migration**
   - Added `geojson` column to `world_regions` table
   - ALTER TABLE migration for existing databases

#### Phase 8: Countries & World Templates
**Real country data with World Templates (scenarios) on Mapbox base map.**

1. **Countries Registry** (`backend-nest/data/countries.json`)
   - ~200 countries with code, name, color
   - Runtime-loaded via `backend-nest/src/utils/countries.ts`

2. **World Templates** (`backend-nest/data/templates/`)
   - `cold_war_1951.json` — Cold War scenario
   - `modern_world.json` — Modern world scenario
   - Each template: id, name, description, country_codes[], base_prompt, start_date

3. **API Endpoints**
   - `GET /api/countries` — list all countries
   - `GET /api/countries/:code` — get country by code
   - `GET /api/templates` — list templates
   - `GET /api/templates/:id` — get template with countries

4. **Frontend Types & API**
   - `Country` and `WorldTemplate` types
   - `countriesApi` and `templatesApi` services

#### Phase 2: Country Selection UI
**Template and Country selector components for new game flow.**

1. **TemplateSelector Component** (`frontend/src/components/Game/TemplateSelector.tsx`)
   - Displays available world templates
   - Loads templates from API
   - Navigates to CountrySelector on selection

2. **CountrySelector Component** (`frontend/src/components/Game/CountrySelector.tsx`)
   - Displays countries from selected template
   - Shows country color, name, and code
   - Triggers game creation on country selection

3. **Menu Integration**
   - Added "🌀 Новая игра (шаблон)" button
   - New view flow: menu → select-template → select-country → game

---

#### Previous Changes (2026-03-18)

1. **Map Zoom/Pan** — зум колесом мыши и перетаскивание
   - Zoom levels: 0.2x - 5x
   - Zoom controls (+/-/reset)
   - Larger default map (2000x1500)

2. **Map Objects System** — объекты на карте
   - Типы: army, fleet, missile, radar, port, exchange, clearing, grouping, factory, university
   - Backend парсит действия игрока и создает объекты
   - Объекты отображаются как иконки с подписями

3. **Map Editor Enhancements**
   - Zoom/pan в редакторе
   - Размеры карт: 800x600, 1200x900, 2000x1500, 3000x2000
   - Размещение объектов (города, порты, заводы, военные базы, столицы)

4. **Fix: Objects Visibility**
   - Объекты теперь рендерятся поверх регионов
   - Белые обводки и фон подписей для видимости

5. **Country Lock** — игрок не может менять страну во время игры
   - Заменен выпадающий список на статическое отображение
   - Фиксированная привязка к региону игрока

6. **Visual Turn Changes** — подсветка измененных регионов
   - Пульсирующее свечение для регионов, изменивших владельца
   - Анимация затухает через 3 секунды

7. **Random Events** — случайные события (15% шанс за ход)
   - Типы: природные бедствия, экономический кризис, технологический прорыв, социальные волнения, эпидемия
   - Влияют на population, gdp, militaryPower

---

## Roadmap

### Phase 1: Core Game Loop (P0 — Critical)

#### 1.1 Create World Screen (Frontend)
**Описание**: UI для настройки параметров мира перед игрой

**Компоненты**:
- Форма выбора даты старта (год, месяц)
- Textarea для basePrompt (описание альтернативной истории)
- Slider для historicalAccuracy (0-100%)
- Настройка начального контроля регионов (кто кем владеет)
- Preview карты с названиями регионов

**Примеры полей**:
```
Дата старта: [1951-01-01]
Base Prompt: "В 1951 году США захватили Венесуэлу и Кубу. СССР ввело войска в Польшу..."
Историческая точность: [====----] 80%
```

**API эндпоинты**:
```
POST /api/worlds/from-map
  Body: { mapId, name, description, startDate, basePrompt, historicalAccuracy, initialOwners }
  Response: { world_id, name, regions: [...] }
```

---

#### 1.2 NPC Country Agents (Backend)
**Описание**: AI-агенты для каждого не-игрового региона

**Логика**:
- При создании мира из карты — создать CountryAgent для каждого региона
- На каждом ходу:
  1. Собрать контекст (соседи, ресурсы, последние события)
  2. Сгенерировать действие AI страны
  3. Применить изменения (если захват, союз и т.д.)

**Структура агента**:
```typescript
interface NPCCountryAgent {
  regionId: string;
  regionName: string;
  personality: string; // "aggressive", "neutral", "diplomatic"
  aggression: number; // 0-1

  async think(context: GameContext): Promise<NPCAction>
}
```

**Типы действий NPC**:
- `expand` — расширение территории
- `ally` — создание союза
- `war` — объявление войны
- `develop` — развитие экономики
- `neutral` — бездействие

---

#### 1.3 Turn Controller Agent (Backend)
**Описание**: Агент для объединения всех событий хода в единый нарратив

**Логика**:
- Получить от WorldAgent глобальные события
- Получить от CountryAgent реакции стран
- Получить от Player действие
- Сгенерировать связный нарратив

**System Prompt**:
```
Ты — Нарратор хода в игре альтернативной истории.
Твоя задача — объединить все события хода в связный исторический нарратив.

Структура ответа:
1. Краткое введение (1 предложение)
2. Основные события (2-3 предложения)
3. Реакция мира (1-2 предложения)
4. Изменения в мире (какие регионы изменились)

Тон: историческая проза, эпический
```

---

#### 1.4 Display Turn Results (Frontend)
**Описание**: UI для отображения результатов хода

**Компоненты**:
- Narration panel — основной текст
- Events list — список событий (захваты, союзы, катастрофы)
- Region changes — визуальное отображение изменений (цвета, границы)
- Country stats delta — изменение характеристик (population, gdp, military)

**Визуализация**:
```
┌─────────────────────────────────────┐
│  ХОД 5                              │
├─────────────────────────────────────┤
│  📜 Нарратив                        │
│  "В 1955 году напряжение между      │
│   сверхдержавами достигло пика..." │
│                                     │
│  📊 События                         │
│  • СССР провел испытания ядерного   │
│    оружия в Казахстане             │
│  • США усилили флот в Средиземном  │
│    море                            │
│                                     │
│  🗺️ Изменения                       │
│  [СССР: population +5%, mil +10%]  │
│  [США: gdp -3%]                    │
└─────────────────────────────────────┘
```

---

### Phase 2: Persistence (P1 — Important)

#### 2.1 Database Setup
**Технология**: SQLite (для простоты) / PostgreSQL (для production)

**Схема таблиц**:
```sql
-- Maps
CREATE TABLE maps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  regions JSON NOT NULL,
  created_at TEXT
);

-- Worlds
CREATE TABLE worlds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date TEXT,
  base_prompt TEXT,
  historical_accuracy REAL,
  created_at TEXT,
  updated_at TEXT
);

-- Games
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  world_id TEXT REFERENCES worlds(id),
  current_turn INTEGER,
  max_turns INTEGER,
  status TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- Players
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  game_id TEXT REFERENCES games(id),
  name TEXT,
  region_id TEXT,
  color TEXT
);

-- Actions
CREATE TABLE actions (
  id TEXT PRIMARY KEY,
  game_id TEXT REFERENCES games(id),
  player_id TEXT,
  turn INTEGER,
  text TEXT,
  created_at TEXT
);

-- Turn Results
CREATE TABLE turn_results (
  id TEXT PRIMARY KEY,
  game_id TEXT REFERENCES games(id),
  turn INTEGER,
  narration TEXT,
  country_response TEXT,
  events JSON,
  changes JSON
);
```

---

#### 2.2 Backend Repository Layer
**Файлы**:
```
backend-nest/src/repositories/
  ├── map.repository.ts
  ├── world.repository.ts
  ├── game.repository.ts
  └── action.repository.ts
```

---

### Phase 3: Multiplayer & AI Expansion (P1)

#### 3.1 Multiplayer Support
- REST API для игры нескольких игроков
- Очередь ходов (все игроки делают ход → мир обрабатывает → следующий раунд)
- Состояния игры: `waiting_for_players`, `playing`, `finished`

#### 3.2 Additional LLM Providers
**Провайдеры**:
- OpenAI (GPT-4, GPT-4o)
- Anthropic (Claude 3.5 Sonnet)
- Ollama (локальные модели)

**Интерфейс**:
```typescript
interface LLMProvider {
  generate(system: string, user: string, options?: GenerateOptions): Promise<LLMResponse>;
}

interface GenerateOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}
```

---

### Phase 4: World Builder Features (P2)

#### 4.1 Border Detection
**Описание**: Автоматическое определение соседей по SVG path

**Алгоритм**:
1. Получить SVG path для каждого региона
2. Использовать point-in-polygon или line-intersection
3. Заполнить поле `borders` для каждого региона

---

#### 4.2 Bloc/Coalition System
**Модель**:
```typescript
interface Bloc {
  id: string;
  name: string;
  type: 'military' | 'economic' | 'political';
  members: string[]; // region IDs
  leader?: string;
  color: string;
}
```

**UI**:
- Отображение блоков разными цветами/стилями
- Создание/вступление в блоки через действия

---

#### 4.3 Map Import/Export
- Импорт из JSON
- Экспорт в JSON
- Предустановленные карты (Earth, Fantasy World, Book Universes)

---

### Phase 5: Polish (P3)

#### 5.1 Advisor Panel UI
- Кнопка "Получить совет" в игровом экране
- Отображение 3-5 предложений от AdvisorAgent

#### 5.2 Random Events System
- Случайные события на каждый ход (вероятность 10-20%)
- Шаблоны: природные катастрофы, революции, открытия

#### 5.3 Error Handling & Validation
- Валидация ввода
- Retry логика для LLM вызовов
- Graceful degradation

---

## File Structure (Target)

```
open-pax/
├── frontend/                    # React + TypeScript
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/
│   │   │   │   ├── MapView.tsx
│   │   │   │   └── MapTooltip.tsx
│   │   │   ├── Editor/
│   │   │   │   ├── MapEditor.tsx
│   │   │   │   └── RegionProperties.tsx
│   │   │   ├── Game/
│   │   │   │   ├── GameScreen.tsx
│   │   │   │   ├── TurnResults.tsx
│   │   │   │   ├── CountryStats.tsx
│   │   │   │   └── AdvisorPanel.tsx
│   │   │   └── WorldBuilder/
│   │   │       ├── CreateWorld.tsx
│   │   │       └── RegionAssignment.tsx
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── hooks/
│   │   │   └── useGame.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   └── App.tsx
│   └── package.json
│
├── backend-nest/               # Node.js + TypeScript
│   ├── src/
│   │   ├── agents/
│   │   │   ├── base.agent.ts
│   │   │   ├── country.agent.ts      # NPC countries
│   │   │   ├── world.agent.ts
│   │   │   ├── advisor.agent.ts
│   │   │   ├── turn-controller.ts   # Narrator
│   │   │   └── game.controller.ts
│   │   ├── llm/
│   │   │   ├── base.provider.ts
│   │   │   ├── minimax.provider.ts
│   │   │   ├── openai.provider.ts
│   │   │   └── anthropic.provider.ts
│   │   ├── repositories/
│   │   │   ├── map.repository.ts
│   │   │   ├── world.repository.ts
│   │   │   └── game.repository.ts
│   │   ├── routes/
│   │   │   ├── maps.routes.ts
│   │   │   ├── worlds.routes.ts
│   │   │   └── games.routes.ts
│   │   ├── models.ts
│   │   └── index.ts
│   └── package.json
│
└── docs/
    ├── PROMPTS.md              # System prompts for agents
    ├── WORLD_CREATION.md       # How to create custom worlds
    └── ARCHITECTURE.md         # This file
```

---

## Dependencies

### Frontend
```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vite": "^5.x",
    "@types/react": "^18.x"
  }
}
```

### Backend
```json
{
  "dependencies": {
    "express": "^4.x",
    "cors": "^2.x",
    "uuid": "^9.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsx": "^4.x",
    "@types/node": "^20.x"
  }
}
```

---

## Priority Order

### Phase 1: Core Game Loop ✅ COMPLETE
- 1.1-1.4: All done

### Phase 2: Persistence (P1)

| Phase | Task | Priority | Est. Time |
|-------|------|----------|-----------|
| 2.1 | Database Setup (SQLite) | P1 | 2-3h |
| 2.2 | Repository Layer | P1 | 2h |

### Phase 3: Game Features (P2)

| Phase | Task | Priority | Est. Time |
|-------|------|----------|-----------|
| 3.1 | Visual Turn Changes | P2 | 2h |
| 3.2 | Country Lock | P2 | 1h |
| 3.3 | Random Events | ✅ | P2 | 2h |
| 3.4 | Improved Object System | P2 | 2h |
| 3.5 | Bloc/Coalition System | P2 | 3h |
| 3.6 | Map Import/Export | P2 | 1h |
| 3.7 | Border Detection | P2 | 2h |

### Phase 4: Polish (P3)

| Phase | Task | Priority | Est. Time |
|-------|------|----------|-----------|
| 4.1 | Advisor Panel UI | P3 | 1h |
| 4.2 | Error Handling | P3 | 1h |

### REMOVED
- 3.1 Multiplayer Support (solo game only)
- 3.2 Additional LLM Providers (only MiniMax needed)

---

## Next Steps

1. **Start with Phase 1.1**: Create World Screen — UI для настройки параметров мира
2. **Then Phase 1.2**: NPC Country Agents — AI для не-игровых стран
3. **Then Phase 1.3-1.4**: Turn Controller + Display Results

After these 4 tasks, the core game loop will be functional.
