# Open-Pax — AI-Powered Alternate History Simulator

## Описание

Проект для создания и управления альтернативными мирами с помощью LLM агентов.

## Структура проекта

```
open-pax/
├── frontend/                 # React SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/         # Интерактивная карта
│   │   │   │   ├── MapView.tsx
│   │   │   │   ├── Region.tsx
│   │   │   │   └── MapObjects.tsx
│   │   │   ├── Game/        # Игровой интерфейс
│   │   │   │   ├── CountryPanel.tsx
│   │   │   │   ├── ActionInput.tsx
│   │   │   │   └── TurnResult.tsx
│   │   │   ├── Creator/     # Редактор карт
│   │   │   │   ├── MapEditor.tsx
│   │   │   │   └── RegionEditor.tsx
│   │   │   └── UI/          # Базовые компоненты
│   │   │       ├── Button.tsx
│   │   │       ├── Modal.tsx
│   │   │       └── Tooltip.tsx
│   │   ├── hooks/
│   │   │   ├── useMap.ts
│   │   │   ├── useGame.ts
│   │   │   └── useLLM.ts
│   │   ├── services/
│   │   │   ├── api.ts       # Backend API
│   │   │   └── mapParser.ts # SVG → JSON
│   │   ├── types/
│   │   │   └── index.ts     # TypeScript интерфейсы
│   │   ├── prompts/
│   │   │   └── system.md   # Промпт для LLM
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   │   └── maps/           # SVG карты
│   │       ├── default.json
│   │       └── default.svg
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── backend/                 # FastAPI
│   ├── app/
│   │   ├── api/
│   │   │   └── routes.py   # REST endpoints
│   │   ├── agents/
│   │   │   ├── __init__.py
│   │   │   ├── base.py     # BaseAgent класс
│   │   │   ├── country.py  # Agent страны
│   │   │   ├── advisor.py  # Agent советника
│   │   │   ├── world.py    # Agent мира
│   │   │   └── controller.py # Game controller
│   │   ├── core/
│   │   │   ├── config.py   # Настройки
│   │   │   └── prompts.py  # Промпты
│   │   ├── models/
│   │   │   ├── game.py     # Game state
│   │   │   ├── region.py   # Region model
│   │   │   └── world.py    # World model
│   │   ├── db/
│   │   │   ├── database.py
│   │   │   └── repositories/
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PROMPTS.md
│   └── WORLD_CREATION.md
│
└── README.md
```

## Быстрый старт

### Требования
- Python 3.10+
- Node.js 18+
- MiniMax API ключ

### Установка

```bash
# Backend
cd backend
cp .env.example .env
# Отредактируй .env с твоим MiniMax API ключом
pip install -r requirements.txt
python -m uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Конфигурация

### .env (backend)
```env
LLM_PROVIDER=minimax
MINIMAX_API_KEY=твой_ключ
MINIMAX_BASE_URL=https://api.minimax.io/v1
DATABASE_URL=sqlite:///./pax.db
DEBUG=true
```

## Лицензия

MIT
