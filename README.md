# Open-Pax — AI-Powered Alternate History Simulator

## Быстрый старт (Quick Start)

### Предварительные требования (Prerequisites)

Перед запуском убедитесь, что у вас установлено:

1. **Node.js 18+** — [скачать с nodejs.org](https://nodejs.org/)
2. **MiniMax API ключ** — получить на [platform.minimaxi.com](https://platform.minimaxi.com)

### Запуск одной командой

```bash
# Клонировать репозиторий
git clone https://github.com/mopga/Open-Pax.git
cd Open-Pax

# Создать файл конфигурации
echo "MINIMAX_API_KEY=ваш_ключ" > backend-nest/.env

# Запуск (одна команда!)
npm start
```

После запуска откройте **http://localhost:5173** в браузере.

### Остановка

Нажмите **Ctrl+C** в терминале для остановки серверов.

---

## Описание

Open-Pax — это open-source альтернатива [paxhistoria.co](https://paxhistoria.co) с поддержкой кастомных карт. Позволяет создавать альтернативные миры на основе любых карт (книги, фильмы, игры).

Игрок управляет одной страной, описывая свои действия текстом. LLM обрабатывает действия и генерирует реакцию мира и других стран.

## Особенности

- Создание кастомных карт с регионами (свободное рисование)
- Размещение объектов на карте (города, порты, заводы, военные базы)
- AI-агенты для не-игровых стран с разными личностями
- Зум и панорамирование карты
- Нарративная генерация событий
- Timeline с Time-skip для управления ходом времени
- Resizable панель подсказок с очередью действий
- Сохранение/загрузка игр

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

## Технологии

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Node.js, Express, TypeScript
- **Database**: SQLite (better-sqlite3)
- **LLM**: MiniMax API

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
# Установка зависимостей (выполняется автоматически)
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

### Логи

Логи сохраняются в директорию `/logs`:

```
logs/
├── open-pax-2026-03-18-15-30-00.log      # Основной лог
└── open-pax-errors-2026-03-18-15-30-00.log  # Ошибки
```

Каждый запуск создает новый файл лога с timestamp.

## API Endpoints

### Maps
- `POST /api/maps` — Создать карту
- `GET /api/maps` — Список карт
- `GET /api/maps/:id` — Получить карту
- `DELETE /api/maps/:id` — Удалить карту

### Worlds
- `POST /api/worlds/from-map` — Создать мир из карты
- `GET /api/worlds/:id` — Получить мир

### Games
- `POST /api/games` — Начать игру
- `GET /api/games/:id` — Получить состояние игры
- `POST /api/games/:id/action` — Отправить действия
- `GET /api/games/:id/suggestions` — Получить подсказки
- `GET /api/games/:id/advisor` — Получить совет
- `POST /api/games/:id/save` — Сохранить игру
- `POST /api/games/:id/load` — Загрузить сохранение

### Saves
- `GET /api/saves` — Список сохранений
- `DELETE /api/saves/:id` — Удалить сохранение

## Roadmap

### Phase 1: Pending Actions UI ✅
- Очередь действий в интерфейсе
- Панель подсказок с добавлением/удалением действий
- Кнопка Submit All

### Phase 2: Backend Queue Processing ⏳
- Бэкенд обрабатывает действия по одному
- Продвижение даты между действиями
- Отдельные результаты для каждого действия

### Phase 3: Event Display Redesign
- Каждое действие = отдельный блок с датой
- Раздельное отображение результатов игрока и NPC

### Phase 4: Time-Skip Integration
- Time-skip запускает обработку очереди
- Выбор периода (1 неделя, 1 месяц, etc.)

### Phase 5-8: Map Layers, World Presets, Flags, Navigation
- Дополнительные улучшения

## Геймплей

1. Создай карту в редакторе (свободное рисование)
2. Назначь владельцев регионов (игрок, AI)
3. Начни игру, выбрав страну
4. Открывай панель "Подсказки" (📋)
5. Описывай действия — добавляй в очередь или генерируй подсказки
6. Отправляй действия и смотри результаты
7. Используй Time-skip (→) для продвижения времени

## Лицензия

MIT
