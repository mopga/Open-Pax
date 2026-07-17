# Open-Pax

**AI-Powered Alternate History Simulator**

*Создавай альтернативные миры. Принимай решения. Наблюдай, как история пишется по-новому.*

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

---

## Что это?

Open-Pax — open-source симулятор альтернативной истории. Это的自由ная альтернатива [paxhistoria.co](https://paxhistoria.co) с поддержкой кастомных карт.

**Уникальность:** Любую карту — из книги, фильма, игры — можно превратить в мир, где страны имеют свои личности, экономики и армии. Описывай действия текстом, а AI превращает их в живую историю.

---

## Возможности

### 🗺️ Свободное создание карт
Рисуй регионы от руки. Назначай владельцев. Расставляй города, заводы, военные базы.

### 🤖 Живые AI-страны
NPC-агенты с уникальными личностями: экспансивные, дипломатичные, изолированные. Каждая страна играет по-своему.

### ✍️ Narration-Driven Gameplay
Описывай действия обычным текстом:
> *"Увеличить финансирование ядерных исследований"*
> *"Предложить мирный договор соседней стране"*

AI превращает их в полноценные исторические нарративы с последствиями.

### ⏱️ Time-Skip
Пропускай месяцы или годы. Наблюдай, как мир меняется без тебя — или управляй каждым днём.

### 💾 Сохранение в любой момент
Полная персистентность: регионы, экономика, дипломатия — всё сохраняется.

---

## Быстрый старт

```bash
# 1. Клонируй
git clone https://github.com/mopga/Open-Pax.git
cd Open-Pax

# 2. Добавь ключ
echo "MINIMAX_API_KEY=твой_ключ" > backend-nest/.env

# 3. Запусти
npm start
```

Открой **[http://localhost:5173](http://localhost:5173)** — и играй.

*Нужен API ключ? Получи на [platform.minimaxi.com](https://platform.minimaxi.com)*

---

## Настройка LLM

Бэкенд работает с любым OpenAI-совместимым API, а также с Anthropic. Настройка — через `backend-nest/llm.config.json` (пример — `backend-nest/llm.config.example.json`) или переменные окружения.

**Механики** (каждой можно назначить свою модель — аналог тиров Light/Pro/Max):
`jump` (симуляция прыжка, самая тяжёлая), `converter`, `advisor`, `suggestions`, `narration`, `npc`, `chat`, `consolidation`, `balance`.

### Ollama (всё локально)

```json
{
  "default": {
    "provider": "openai-compatible",
    "baseUrl": "http://localhost:11434/v1",
    "apiKey": "ollama",
    "model": "qwen2.5:14b"
  }
}
```

### OpenRouter

```json
{
  "default": {
    "provider": "openai-compatible",
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKey": "env:OPENROUTER_API_KEY",
    "model": "anthropic/claude-sonnet-4"
  }
}
```

### Смешанный: прыжки в облаке, чаты локально

```json
{
  "default": { "provider": "openai-compatible", "baseUrl": "http://localhost:11434/v1", "apiKey": "ollama", "model": "qwen2.5:7b" },
  "mechanics": {
    "jump": { "provider": "openai-compatible", "baseUrl": "https://openrouter.ai/api/v1", "apiKey": "env:OPENROUTER_API_KEY", "model": "anthropic/claude-sonnet-4" }
  }
}
```

**Без файла** работают env-переменные: `LLM_PROVIDER` / `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` (по умолчанию — MiniMax через `MINIMAX_API_KEY`, как раньше).

Текущую конфигурацию показывает `GET /api/llm/status`.

---

## Как выглядит

```
┌─────────────────────────────────────────────────────────┐
│  🗺️ Карта мира                     Январь 1951  [→]     │
│  ┌─────────────────────────────────────────────────────┐│
│  │                                                     ││
│  │      ████████                    ████████            ││
│  │      ██ СССР ██    ───────►     ██ ЕС ██            ││
│  │      ████████      [60 дней]   ████████            ││
│  │                                                     ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌─────────────────┐  📋 Подсказки        [−][×]        │
│  │ 📌 Экономика    │  ┌─────────────────────────────┐ │
│  │ Расширить СЭЗ   │  │ 🔄 Сгенерировать            │ │
│  │ 📌 Оборона      │  │                             │ │
│  │ Укрепить ПВО    │  │ Ожидают:                    │ │
│  └─────────────────┘  │ 1. Создать СЭЗ      [×]     │ │
│                       │ 2. Укрепитить ПВО   [×]     │ │
│                       │                             │ │
│                       │ [+ Добавить действие...]   │ │
│                       │                             │ │
│                       │ [Отправить 2 действия →]   │ │
│                       └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Roadmap

| Phase | Что | Статус |
|-------|-----|--------|
| 1 | Pending Actions UI | ✅ Готово |
| 2 | Sequential Processing | ✅ Готово |
| 3 | Event Display | ✅ Готово |
| 4 | Time-Skip Integration | ✅ Готово |
| 5 | Map Visual Improvements | ✅ Готово |
| 6 | World Presets & Custom Prompts | ✅ Готово |

[Полная дорожная карта →](./ROADMAP.md)

---

## Tech Stack

**Frontend:** React 18 + TypeScript + Vite
**Backend:** Node.js + Express + TypeScript
**Database:** SQLite (better-sqlite3)
**AI:** любой OpenAI-совместимый API (Ollama, LM Studio, OpenRouter), Anthropic или MiniMax — конфиг per-механика

---

## Contributing

Open-source проект. MIT лицензия.

Pull requests приветствуются. Для крупных изменений — открой issue для обсуждения.

---

## Лицензия

MIT © 2026 Open-Pax
