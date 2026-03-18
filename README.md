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
npm run start:dev
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
