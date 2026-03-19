# Open-Pax — Technical Roadmap

## Структура проекта

```
open-pax/
├── frontend/                        # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── Editor/
│   │   │   │   └── MapEditor.tsx    # Редактор карт
│   │   │   ├── Map/
│   │   │   │   └── MapView.tsx      # Компонент карты
│   │   │   └── WorldBuilder/
│   │   │       └── CreateWorld.tsx   # Мастер создания мира
│   │   ├── services/
│   │   │   └── api.ts               # API клиент
│   │   ├── types/
│   │   │   └── index.ts             # TypeScript типы
│   │   ├── App.tsx                  # Главное приложение
│   │   └── index.css                # Стили
│   ├── package.json
│   └── vite.config.ts
│
├── backend-nest/                     # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── index.ts                 # API сервер (Express)
│   │   ├── database.ts              # SQLite база данных
│   │   ├── models.ts                # TypeScript модели
│   │   ├── agents.ts                # AI агенты
│   │   ├── npc-agents.ts            # NPC агенты для стран
│   │   ├── llm.ts                   # MiniMax LLM провайдер
│   │   ├── prompt-builder.ts        # Построение промптов
│   │   ├── turn-controller.ts       # Управление ходами
│   │   ├── game-session.ts          # GameSession класс (per-game state)
│   │   ├── session-registry.ts      # SessionRegistry (управление сессиями)
│   │   ├── prompts/                  # Шаблоны промптов
│   │   │   ├── base.txt
│   │   │   ├── narration.txt
│   │   │   └── advisor.txt
│   │   └── repositories/             # Data Access Layer
│   │       ├── index.ts
│   │       ├── game.repository.ts    # CRUD для игр
│   │       ├── map.repository.ts      # CRUD для карт
│   │       └── world.repository.ts    # CRUD для миров
│   ├── data/                        # SQLite база (runtime)
│   ├── .env                         # Конфигурация (API ключ)
│   └── package.json
│
└── README.md
```

---

## Архитектура

### GameSession (per-game state)

Каждая игра инкапсулирована в объекте `GameSession`:

- `regions: Map<string, RegionState>` — состояние всех регионов
- `players`, `currentTurn`, `currentDate` — игровые данные
- `applyTurn()` — обработка хода
- `save()` / `loadFromSave()` — сохранение/загрузка
- `syncRegionsToDB()` — синхронизация регионов в БД

### SessionRegistry

Управляет всеми активными сессиями:

- `sessions: Map<gameId, GameSession>`
- Автоматически восстанавливает активные игры при рестарте сервера

### UI Flow (Pending Actions)

1. Игрок открывает панель "Подсказки" (📋)
2. Генерирует подсказки или добавляет действия вручную
3. Действия попадают в очередь "Pending Actions"
4. При Submit All — все действия отправляются на сервер
5. Time-skip (→) продвигает время

---

## API Endpoints

### Maps
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/maps` | Создать карту |
| GET | `/api/maps` | Список карт |
| GET | `/api/maps/:id` | Получить карту |
| DELETE | `/api/maps/:id` | Удалить карту |

### Worlds
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/worlds/from-map` | Создать мир из карты |
| GET | `/api/worlds/:id` | Получить мир |

### Games
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/games` | Начать игру |
| GET | `/api/games/:id` | Получить состояние игры |
| POST | `/api/games/:id/action` | Отправить действия (legacy) |
| GET | `/api/games/:id/suggestions` | Получить подсказки |
| GET | `/api/games/:id/advisor` | Получить совет |
| POST | `/api/games/:id/save` | Сохранить игру |
| POST | `/api/games/:id/load` | Загрузить сохранение |

### Pending Actions Queue (Phase 2)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/games/:id/actions/queue` | Добавить действие в очередь |
| GET | `/api/games/:id/actions/queue` | Получить очередь действий |
| POST | `/api/games/:id/actions/process` | Обработать одно действие |
| POST | `/api/games/:id/actions/process-all` | Обработать все действия |
| POST | `/api/games/:id/time-skip` | Time-skip с выбором периода |

### Saves
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/saves` | Список сохранений |
| DELETE | `/api/saves/:id` | Удалить сохранение |

---

## Roadmap Phases

### Phase 1: Pending Actions UI ✅

**Статус:** Завершено (be47e28)

**Функционал:**
- Очередь действий в интерфейсе
- Панель подсказок с добавлением/удалением действий
- Кнопка Submit All
- Resizable панель

**Файлы:**
- `frontend/src/App.tsx` — UI компоненты
- `frontend/src/index.css` — стили

---

### Phase 2: Backend Queue Processing ✅

**Статус:** Завершено (abfce48)

**Цель:** Бэкенд обрабатывает действия по одному

**Функционал:**
- `PendingAction` interface и queue state в GameSession
- `queueAction(text)` — добавляет в очередь без обработки
- `processNextAction(jumpDays)` — обрабатывает одно действие
- `processAllPendingActions(jumpDays)` — обрабатывает все
- Новые API endpoints для queue operations
- Каждое действие продвигает дату отдельно

**Backend файлы:**
- `backend-nest/src/game-session.ts` — queue methods
- `backend-nest/src/index.ts` — new API endpoints

**Frontend файлы:**
- `frontend/src/services/api.ts` — queue API methods
- `frontend/src/App.tsx` — integrated queue flow

---

### Phase 3: Event Display Redesign ✅

**Статус:** Завершено (202fb7a)

**Цель:** Каждое действие = отдельный блок с датой

**Функционал:**
- `PendingAction.result` включает `periodStart` и `periodEnd`
- `processNextAction` отслеживает дату до/после каждого действия
- `formatDateRange()` для красивого отображения ( напр. "15 Янв — 15 Фев 1951")
- История показывает date range для каждого действия
- Fallback на legacy `date` для совместимости

**Frontend файлы:**
- `frontend/src/App.tsx` — formatDateRange, history display
- `frontend/src/services/api.ts` — updated types

---

### Phase 4: Time-Skip Integration ✅

**Статус:** Завершено (94220d0)

**Цель:** Time-skip запускает обработку очереди

**Функционал:**
- `advanceDate(jumpDays)` в GameSession - продвигает дату без обработки действий
- `POST /api/games/:id/time-skip` endpoint
  - Если есть pending actions → обрабатывает все последовательно
  - Если нет pending actions → просто продвигает дату
  - Возвращает `{ type: 'actions_processed' | 'date_advanced', ... }`
- `handleTimeSkip()` на фронтенде
- Dropdown кнопки вызывают time-skip напрямую

**Backend файлы:**
- `backend-nest/src/game-session.ts` — advanceDate method
- `backend-nest/src/index.ts` — /time-skip endpoint

**Frontend файлы:**
- `frontend/src/App.tsx` — handleTimeSkip, dropdown handlers
- `frontend/src/services/api.ts` — timeSkip method

---

### Phase 5: Map Visual Improvements ✅

**Статус:** Завершено (1c34483)

**Цель:** Paxhistoria-like appearance

**Функционал:**
- City markers: white circles with letter inside (like paxhistoria)
- Country labels: larger (18px), bolder (700), full opacity
- Borders: darker (#1a1a1a), wider (2px)
- Fill opacity: 85-100% (vs 50%)
- City detection: "город", "city", "capital", "столица"
- Cities positioned at region centroid

**Frontend файлы:**
- `frontend/src/components/Map/MapView.tsx` — city markers, label improvements

**Backend файлы:**
- `backend-nest/src/game-session.ts` — city detection, centroid positioning

---

### Phase 6: World Presets with Custom Prompts ✅

**Статус:** Завершено

**Цель:** Пользователь может задать кастомный промпт мира, определяющий события и поведение NPC

**Функционал:**
- Улучшенный редактор промпта в CreateWorld с примерами и подсказками
- In-game редактор промпта (кнопка "📝 Промпт" в игре)
- API endpoint `PATCH /api/worlds/:id/prompt` для обновления промпта
- Промпт хранится в базе и используется для NPC поведения

**Backend файлы:**
- `backend-nest/src/index.ts` — PATCH /api/worlds/:id/prompt endpoint
- `backend-nest/src/repositories/world.repository.ts` — update method

**Frontend файлы:**
- `frontend/src/components/WorldBuilder/CreateWorld.tsx` — улучшенный редактор с примерами
- `frontend/src/App.tsx` — in-game редактор промпта
- `frontend/src/services/api.ts` — worldApi.updatePrompt method
- `frontend/src/index.css` — стили для модального окна

---

## Performance Improvements

### 1. Loading Indicator ✅ (Low priority)
- Add visible loading state on "Submit All" button during LLM processing
- Show progress: "Думаю... X из Y" with spinner
- Prevent double-submit while processing

### 2. LLM Response Caching (Medium)
- Cache LLM responses by action hash
- Skip LLM call if same action was processed recently (within 5 min)
- Store cached responses in memory or Redis
- Invalidated on world prompt change

---

### Phase 7: Flag System

**Статус:** Запланирован (Easy-Medium)

**Возможности:**
- Загрузка/выбор флагов для стран
- Отображение флагов на карте

---

### Phase 8: Navigation

**Статус:** Запланирован (Medium)

**Возможности:**
- Bookmarks для избранных регионов
- Быстрый переход между странами
- Мини-карта для навигации

---

## Установка и запуск

### 1. Клонирование

```bash
git clone https://github.com/mopga/Open-Pax.git
cd Open-Pax
```

### 2. Конфигурация

Создайте файл `backend-nest/.env`:

```env
MINIMAX_API_KEY=ваш_ключ_minimax_здесь
PORT=8000
```

**Где получить API ключ:**
1. Зарегистрируйтесь на [platform.minimaxi.com](https://platform.minimaxi.com)
2. Перейдите в раздел API Keys
3. Создайте новый ключ
4. Скопируйте его в файл `.env`

### 3. Запуск

```bash
# Установка зависимостей
npm run install:all

# Запуск обоих серверов
npm start
```

Скрипт запуска автоматически:
- Установит зависимости (если нужно)
- Запустит backend на порту 8000
- Запустит frontend на порту 5173
- Откроет игру в браузере

### Режим разработки

```bash
npm run dev          # Backend (tsx watch)
npm run dev:frontend # Frontend (vite)
```

---

## Логи

Логи сохраняются в директорию `/logs`:

```
logs/
├── open-pax-2026-03-18-15-30-00.log
└── open-pax-errors-2026-03-18-15-30-00.log
```

Каждый запуск создает новый файл лога с timestamp.

---

## Геймплей

1. Создай карту в редакторе (свободное рисование)
2. Назначь владельцев регионов (игрок, AI)
3. Начни игру, выбрав страну
4. Открывай панель "Подсказки" (📋)
5. Описывай действия — добавляй в очередь или генерируй подсказки
6. Отправляй действия и смотри результаты
7. Используй Time-skip (→) для продвижения времени
