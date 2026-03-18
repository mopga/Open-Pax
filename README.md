# Open-Pax — AI-Powered Alternate History Simulator

## Описание

Open-Pax — это open-source альтернатива [paxhistoria.co](https://paxhistoria.co) с поддержкой кастомных карт. Позволяет создавать альтернативные миры на основе любых карт (книги, фильмы, игры).

Игрок управляет одной страной, описывая свои действия текстом. LLM обрабатывает действия и генерирует реакцию мира и других стран.

## Особенности

- Создание кастомных карт с регионами
- Размещение объектов на карте (города, порты, заводы, военные базы)
- AI-агенты для не-игровых стран с разными личностями
- Зум и панорамирование карты
- Нарративная генерация событий
- Советник с подсказками

## Структура проекта

```
open-pax/
├── frontend/                    # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/          # Компоненты карты
│   │   │   │   └── MapView.tsx
│   │   │   ├── Editor/       # Редактор карт
│   │   │   │   └── MapEditor.tsx
│   │   │   └── WorldBuilder/  # Создание мира
│   │   │       └── CreateWorld.tsx
│   │   ├── services/
│   │   │   └── api.ts        # API клиент
│   │   ├── types/
│   │   │   └── index.ts       # TypeScript типы
│   │   ├── App.tsx           # Главное приложение
│   │   └── index.css          # Стили
│   ├── package.json
│   └── vite.config.ts
│
├── backend-nest/               # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── index.ts          # API сервер
│   │   ├── database.ts       # SQLite база данных
│   │   ├── models.ts         # TypeScript модели
│   │   ├── agents.ts         # AI агенты
│   │   ├── npc-agents.ts    # NPC агенты
│   │   ├── llm.ts           # MiniMax LLM провайдер
│   │   └── turn-controller.ts
│   ├── data/                 # SQLite база
│   └── package.json
│
├── docs/
│   └── PLAN.md              # Технический план
│
└── README.md
```

## Технологии

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Node.js, Express, TypeScript
- **Database**: SQLite (better-sqlite3)
- **LLM**: MiniMax API

## Быстрый старт

### Требования

- Node.js 18+
- MiniMax API ключ

### Установка

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend (отдельный терминал)
cd backend-nest
npm install
npm run dev
```

### Конфигурация

Создай файл `backend-nest/.env`:

```env
MINIMAX_API_KEY=твой_ключ_minimax
PORT=8000
```

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
- `POST /api/games/:id/action` — Отправить действие
- `GET /api/games/:id/advisor` — Получить совет

## Геймплей

1. Создай карту в редакторе (или используй существующую)
2. Назначь владельцев регионов (игрок, AI)
3. Начни игру, выбрав страну
4. Описывай действия текстом (например: "Построить завод в Москве")
5. LLM генерирует реакцию мира
6. AI страны также делают ходы

## Лицензия

MIT
