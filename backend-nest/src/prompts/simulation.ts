/**
 * Open-Pax — Simulation Prompt
 * ============================
 * Основной движок симуляции (time-rewind.md)
 */

import { PromptVariables, SimulationResult } from './types';

/**
 * Построить промпт для симуляции хода
 */
export function buildSimulationPrompt(vars: PromptVariables): string {
  return `Ты симулируешь пошаговую стратегическую игру. Игрок играет за политию ${vars.PLAYER_POLITY}.

${vars.DIFFICULTY_DESCRIPTION_JUMP_FORWARD}

[Контекст игры]

Это описание временной шкалы и мира игры до начала игры:

${vars.WORLD_BEFORE_ROUND_ONE_TEXT}

[Правила симуляции]

${vars.HISTORICAL_PRESET_SIMULATION_RULES}

Каждая полития в этой игре имеет определённый цвет и название. НЕ меняй цвет политии случайно - только при смене режима.

[Структура игры]

В игре есть динамическая карта. Внимательно отнесись к передаче регионов.

*Понимание регионов.* В игре есть точно ${vars.GRAND_MAP_DESCRIPTION_NO_CITY.split('\n\n').length} регионов. Регионы - это не просто земля. Регионы включают моря и проливы.

*Батальоны.* Появляются на карте и могут перемещаться. Обязательно используй тег "battalion".

*Важные правила вывода:*
- Каждое событие имеет заголовок, описание и возможно изменения карты
- Заголовок - одно предложение
- Описание - качественные детали
- В среднем нужно 10-15 событий за ход
- Блокноты с цитатами: 0-3 события
- НЕ создавай события типа "Ничего не произошло" или "Конец года"
- Каждое событие должно быть значимым

[Правила редактирования карты]

- Создать новую политию - новое имя, цвет, регионы
- Удалить политию - все регионы становятся нейтральными
- Обновить политию - изменить имя/цвет существующей
- Передать регион - просто смена владельца

[Флаги]

Политии могут иметь флаги. Описывай новый флаг если это логично.

[Язык]

${vars.LANGUAGE === 'russian' ? 'Твой вывод должен быть на русском языке.' : 'Вывод на английском.'}

[История событий]

Вот история всего, что произошло в предыдущих раундах:

${vars.ALL_EVENTS_WITH_CONSOLIDATION || '(Событий пока нет - это первый раунд)'}

[Даты]

Начальная дата игры: ${vars.STARTING_ROUND_DATE}
Текущая дата (Origin Date): ${vars.ORIGIN_ROUND_DATE}
Целевая дата (Target Date): ${vars.TARGET_ROUND_DATE}

Раунд: ${vars.CURRENT_ROUND_NUMBER}

[Действия игрока]

Действия игрока в этом раунде:

${vars.PLAYER_ACTIONS_THIS_ROUND || '(Нет действий)'}

[Все прошлые действия]

${vars.PLAYER_EVERY_ACTION_NOT_PREVIOUS || '(Нет прошлых действий)'}

[Описание карты]

${vars.GRAND_MAP_DESCRIPTION_NO_CITY}

Вся эта информация отражает геополитическую ситуацию на дату: ${vars.ORIGIN_ROUND_DATE}

[Дипломатия]

${vars.CHATS_NON_CONSOLIDATED_ROUNDS || '(Дипломатии не было)'}

---

Теперь симулируй события между ${vars.ORIGIN_ROUND_DATE} и ${vars.TARGET_ROUND_DATE}.

Твой вывод ДОЛЖЕН быть в следующем JSON формате:
{
  "events": [
    {
      "headline": "Заголовок события",
      "description": "Описание события (2-4 предложения)",
      "date": "YYYY-MM-DD",
      "mapChanges": [
        {
          "type": "transfer|create|update|delete",
          "regionId": "id региона",
          "newOwner": "имя политии (если transfer)",
          "newColor": "#hex (если update)"
        }
      ]
    }
  ],
  "narration": "Общий нарратив о произошедшем за этот период (3-5 предложений)",
  "worldChanges": {
    "regionOwners": {},
    "regionColors": {}
  }
}

VERY IMPORTANT: Отвечай ТОЛЬКО валидным JSON, без markdown форматирования, без пояснений.`;
}

export function parseSimulationResponse(text: string): SimulationResult {
  try {
    // Найти JSON в ответе
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      events: parsed.events || [],
      narration: parsed.narration || 'Мир изменился...',
      diplomacy: parsed.diplomacy || [],
      worldChanges: parsed.worldChanges || {
        regionOwners: {},
        regionColors: {},
        newFeatures: [],
        deletedFeatures: [],
      },
    };
  } catch (e) {
    console.error('[PARSER] Failed to parse simulation response:', e);

    // Fallback: вернуть текст как нарратив
    return {
      events: [],
      narration: text.substring(0, 500),
      diplomacy: [],
      worldChanges: { regionOwners: {}, regionColors: {}, newFeatures: [], deletedFeatures: [] },
    };
  }
}
