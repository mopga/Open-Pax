# План интеграции референсных промптов в Open-Pax

## Обзор

Референсные промпты из `C:\Distrib\Code\*.md` должны стать ядром игровой логики:

| Файл | Назначение | Заменяет |
|------|-----------|----------|
| `time-rewind.md` | Основной движок симуляции мира | WorldAgent + CountryAgent |
| `advisor.md` | Интерактивный советник | AdvisorAgent (расширенный) |
| `actions.md` | Генератор подсказок/предложений | Новая функция |
| `desript-to-action.md` | Конвертер действий игрока | Новая функция (перед симуляцией) |

---

## Этап 1: Подготовка инфраструктуры промптов

### 1.1 Создать типы данных (`prompts/types.ts`)

```typescript
// Переменные для промптов (из оригинала)
export interface PromptVariables {
  // Даты
  STARTING_ROUND_DATE: string;       // "1951-01-01"
  ORIGIN_ROUND_DATE: string;         // Текущая дата
  TARGET_ROUND_DATE: string;          // Дата после прыжка
  ORIGIN_ROUND_GRAMMATICAL_DATE: string; // "1 января 1951"
  TARGET_ROUND_GRAMMATICAL_DATE: string;
  CURRENT_ROUND_NUMBER: number;      // 1, 2, 3...

  // Мир
  WORLD_BEFORE_ROUND_ONE_TEXT: string; // Лore до начала игры
  HISTORICAL_PRESET_SIMULATION_RULES: string; // Доп. правила

  // Игрок
  PLAYER_POLITY: string;             // "СССР"
  PLAYER_POLITY_REGIONS: string;     // Регионы игрока
  PLAYER_POLITY_BATTALION_SUMMARIES: string; // Юниты

  // Действия
  PLAYER_ACTIONS_THIS_ROUND: string; // Действия за этот раунд
  PLAYER_EVERY_ACTION_NOT_PREVIOUS: string; // Все прошлые действия

  // Карта
  GRAND_MAP_DESCRIPTION: string;     // Полное описание карты
  GRAND_MAP_DESCRIPTION_NO_CITY: string; // Без городов (для промптов)

  // События
  ALL_EVENTS_WITH_CONSOLIDATION: string; // История событий
  CHATS_NON_CONSOLIDATED_ROUNDS: string; // Дипломатия

  // Язык
  LANGUAGE: string;                  // "russian"
  DIFFICULTY_DESCRIPTION_JUMP_FORWARD: string;
}
```

### 1.2 Создать модуль промптов

**Структура файлов:**
```
backend-nest/src/
├── prompts/
│   ├── index.ts           # Экспорт
│   ├── types.ts          # Типы PromptVariables
│   ├── simulation.ts     # time-rewind.md → buildSimulationPrompt()
│   ├── advisor.ts        # advisor.md → buildAdvisorPrompt()
│   ├── suggestions.ts   # actions.md → buildSuggestionsPrompt()
│   └── converter.ts     # desript-to-action.md → buildConverterPrompt()
```

### 1.3 Функции построения промптов

Каждый модуль экспортирует:
- `buildPrompt(vars: PromptVariables): string` — основной промпт
- `parseResponse(response: string): ParsedResult` — парсинг ответа LLM

---

## Этап 2: Подготовка данных для промптов

### 2.1 Создать PromptBuilder сервис

`backend-nest/src/prompt-builder.ts`:

```typescript
export class PromptBuilder {
  constructor(private game: Game) {}

  // Построить полный набор переменных для любого промпта
  buildVariables(actionText?: string): PromptVariables

  // Описание карты (с юнитами, цветами, владельцами)
  buildMapDescription(): string

  // Описание карты без городов (для большинства промптов)
  buildMapDescriptionNoCity(): string

  // Регионы игрока
  buildPlayerRegions(): string

  // Юниты игрока
  buildPlayerBattalions(): string

  // История событий
  buildEventHistory(): string

  // Все действия игрока
  buildAllPlayerActions(): string
}
```

### 2.2 Формат карты для промптов

```
Полития "СCCP" (красный #FF0000):
- Москва (столица)
- Западная Сибирь
- Урал
Войска: 5 батальонов

Полития "Нацистская Германия" (чёрный #000000):
- Восточная Пруссия
- Берлин (столица)
Войска: 10 батальонов

Нейтральные регионы:
- Северное море
- Атлантический океан
```

---

## Этап 3: Обновление GameController

### 3.1 Текущая архитектура

```
handleSubmitAction()
  ├── WorldAgent.think() → нарратив
  ├── CountryAgent.think() → реакция страны
  └── TurnControllerAgent.process() → события
```

### 3.2 Новая архитектура

```
handleSubmitAction(actions: string[], jumpDays: number)
  │
  ├──► converter.buildPrompt() ──► LLM ──► convertedAction
  │       (desript-to-action.md)
  │
  └──► simulation.buildPrompt() ──► LLM ──► events + mapChanges
          (time-rewind.md)
              │
              ├── Parse: events[]
              ├── Parse: mapChanges[]
              ├── Parse: narration
              └── Save to DB
```

### 3.3 Изменения в game-controller.ts

```typescript
export class GameController {
  // ... existing code ...

  async processTurn(playerActions: string[], jumpDays: number): Promise<TurnResult> {
    // 1. Конвертируем действия через desript-to-action.md
    const convertedActions = await Promise.all(
      playerActions.map(action =>
        this.convertAction(action)
      )
    );

    // 2. Запускаем симуляцию через time-rewind.md
    const simulationResult = await this.runSimulation(
      convertedActions,
      jumpDays
    );

    // 3. Парсим и сохраняем результат
    return this.saveTurnResult(simulationResult);
  }

  private async convertAction(action: string): Promise<ConvertedAction> {
    const prompt = buildConverterPrompt({
      ...this.promptVars,
      DESCRIPTION_ACTION_TEXT: action,
    });
    const response = await this.llm.generate(prompt);
    return parseConverterResponse(response);
  }

  private async runSimulation(actions: ConvertedAction[], jumpDays: number): Promise<SimulationResult> {
    const prompt = buildSimulationPrompt({
      ...this.promptVars,
      PLAYER_ACTIONS_THIS_ROUND: actions.map(a => a.text).join('\n'),
      TARGET_ROUND_DATE: calculateTargetDate(this.game.currentDate, jumpDays),
    });
    const response = await this.llm.generate(prompt);
    return parseSimulationResponse(response);
  }
}
```

---

## Этап 4: Обновление Advisor

### 4.1 Текущий endpoint

`GET /api/games/:id/advisor` → использует простой промпт

### 4.2 Новый endpoint

Использует `advisor.md`:
- Полная информация о мире
- История событий
- Контекст игры
- Предыдущие сообщения с советником

```typescript
app.get('/api/games/:id/advisor', async (req, res) => {
  const { playerId, message } = req.query;

  // Построить промпт через advisor.ts
  const prompt = buildAdvisorPrompt({
    ...promptVars,
    ALL_ADVISOR_MESSAGES: chatHistory, // История чата
  });

  const response = await llm.generate(prompt);

  res.json({ advice: response.content });
});
```

---

## Этап 5: Новая функция Suggestions

### 5.1 Новый endpoint

`GET /api/games/:id/suggestions` — предлагает действия игроку

Использует `actions.md`:
- Анализ текущей ситуации
- 6-9 "Тем для беспокойства"
- По 2-5 действий на тему

```typescript
app.get('/api/games/:id/suggestions', async (req, res) => {
  const { playerId } = req.query;

  const prompt = buildSuggestionsPrompt(promptVars);
  const response = await llm.generate(prompt);

  res.json({ suggestions: parseSuggestionsResponse(response) });
});
```

---

## Этап 6: Обработка ответов LLM

### 6.1 Формат ответа time-rewind.md (simulation)

```json
{
  "events": [
    {
      "headline": "Завод чипов построен",
      "description": "В Москве завершено строительство...",
      "date": "1951-03-15",
      "mapChanges": [
        { "type": "addFeature", "regionId": "...", "feature": { "type": "factory" } }
      ]
    }
  ],
  "narration": "Общий текст о произошедшем...",
  "diplomacy": []
}
```

### 6.2 Парсеры

Создать модуль `prompts/parsers.ts`:
- `parseSimulationResponse(text: string): SimulationResult`
- `parseAdvisorResponse(text: string): string`
- `parseSuggestionsResponse(text: string): Suggestion[]`
- `parseConverterResponse(text: string): ConvertedAction`

---

## Детальная реализация

### Файл: backend-nest/src/prompts/types.ts

```typescript
export interface PromptVariables {
  // Даты
  STARTING_ROUND_DATE: string;
  ORIGIN_ROUND_DATE: string;
  TARGET_ROUND_DATE: string;
  ORIGIN_ROUND_GRAMMATICAL_DATE: string;
  TARGET_ROUND_GRAMMATICAL_DATE: string;
  CURRENT_ROUND_NUMBER: number;

  // Мир
  WORLD_BEFORE_ROUND_ONE_TEXT: string;
  HISTORICAL_PRESET_SIMULATION_RULES: string;
  DIFFICULTY_DESCRIPTION_JUMP_FORWARD: string;

  // Игрок
  PLAYER_POLITY: string;
  PLAYER_POLITY_REGIONS: string;
  PLAYER_POLITY_BATTALION_SUMMARIES: string;

  // Действия
  PLAYER_ACTIONS_THIS_ROUND: string;
  PLAYER_EVERY_ACTION_NOT_PREVIOUS: string;

  // Карта
  GRAND_MAP_DESCRIPTION: string;
  GRAND_MAP_DESCRIPTION_NO_CITY: string;

  // События
  ALL_EVENTS_WITH_CONSOLIDATION: string;
  CHATS_NON_CONSOLIDATED_ROUNDS: string;
  NON_CONSOLIDATED_ROUNDS_WITH_DATES: string;

  // Язык
  LANGUAGE: string;
}

export interface SimulationEvent {
  headline: string;
  description: string;
  date: string;
  mapChanges: MapChange[];
}

export interface MapChange {
  type: 'transfer' | 'create' | 'update' | 'delete';
  regionId: string;
  newOwner?: string;
  newColor?: string;
  feature?: MapFeature;
}

export interface MapFeature {
  type: 'city' | 'battalion' | 'factory' | 'port';
  name: string;
  x?: number;
  y?: number;
}

export interface SimulationResult {
  events: SimulationEvent[];
  narration: string;
  diplomacy: DiplomacyChat[];
}

export interface ConvertedAction {
  type: 'action' | 'chat';
  text: string;
  targetPolity?: string;
  chatMessage?: string;
}

export interface Suggestion {
  topic: string;
  description: string;
  actions: {
    title: string;
    content: string;
  }[];
}
```

---

## Зависимости между этапами

```
Этап 1 (Подготовка)
    │
    ├─► types.ts ──────────────┐
    ├─► simulation.ts ────────┤
    ├─► advisor.ts ──────────┤
    ├─► suggestions.ts ──────┤
    └─► converter.ts ────────┘
                              │
Этап 2 (Данные)              │
    └─► prompt-builder.ts ────┘
                              │
Этап 3 (GameController)       │
    └─► game-controller.ts ──┘
                              │
Этап 4 (Advisor)              │
    └─► /api/games/:id/advisor
                              │
Этап 5 (Suggestions)         │
    └─► /api/games/:id/suggestions
```

---

## Приоритеты реализации

1. **Критично** — Этап 1 + 2 + 3 (основной gameplay)
2. **Важно** — Этап 4 (советник)
3. **Дополнительно** — Этап 5 (подсказки)

---

## Тестирование

После реализации проверить:
1. Отправка действия → нарратив от LLM
2. Советник → релевантные советы
3. Подсказки → 6-9 тем с действиями
4. Сохранение в БД корректных данных
