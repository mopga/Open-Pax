/**
 * Open-Pax — Action Converter Prompt
 * ==================================
 * Конвертер действий игрока (desript-to-action.md)
 */

import { PromptVariables, ConvertedAction } from './types';
import { parseJsonLoose } from '../utils/json-repair';

/**
 * Построить промпт для конвертации действия
 */
export function buildConverterPrompt(vars: PromptVariables): string {
  const actionText = vars.DESCRIPTION_ACTION_TEXT || '';

  return `Ты конвертируешь решение игрока в понятное для симуляции действие.

Игрок играет за политию ${vars.PLAYER_POLITY}.

Почти каждое действие должно быть преобразовано в тип "ACTION".
Тип "CHAT" (дипломатия) - только если игрок явно упоминает дипломатические переговоры.

Типы действий (ВСЕГДА action):
- Attacking (атака)
- Constructing (строительство)
- Researching (исследования)
- Consolidating (укрепление)
- Mobilizing (мобилизация)
- Industrializing (индустриализация)
- Rearming (перевооружение)
- Militarizing (милитаризация)
- Disarming (разоружение)
- Affirming (подтверждение)
- Negating (отрицание)

Дипломатия ТОЛЬКО если игрок хочет открыть чат с другой политией.

[Контекст игры]

${vars.WORLD_BEFORE_ROUND_ONE_TEXT}

[Правила симуляции]

${vars.HISTORICAL_PRESET_SIMULATION_RULES}

[Описание карты]

${vars.GRAND_MAP_DESCRIPTION_NO_CITY}

[Другие действия игрока в этом раунде]

${vars.PLAYER_ACTIONS_THIS_ROUND || '(Нет других действий)'}

(Они даны только для понимания общего замысла игрока. Тон и длину копируй с КОНКРЕТНОГО конвертируемого действия, а не с этих.)

[Игровые даты]

${vars.ORIGIN_ROUND_DATE}

---

Действие игрока для конвертации:

${actionText}

Твоя задача:
1. Определить тип: action или chat
2. Если action — перепиши текст игрока подробнее: добавь конкретные детали исполнения — ссылки на реальные механизмы, ведомства, программы, отрасли, регионы из описания карты, — чтобы симулятор понял, КАК исполнять приказ
3. НИЧЕГО не удаляй из намерения игрока — только дополняй. Даже хорошо написанное действие улучши и уточни
4. Тон вывода повторяет тон ИМЕННО ЭТОГО действия: разговорный к разговорному, ролевой к ролевому, от первого лица к первому лицу
5. Длина вывода — примерно на 50% длиннее текста игрока, но не более 650 символов. Если текст игрока уже длинный — не раздувай, лишь уплотни и уточни
6. Если chat — сформулируй первое сообщение чата от лица игрока: оно суммирует, чего он хочет добиться от переговоров, и тоже повторяет его тон

${vars.LANGUAGE === 'russian' ? 'Отвечай на русском.' : 'Отвечай на английском.'}

---

Твой вывод ДОЛЖЕН быть в формате JSON:
{
  "type": "action|chat",
  "text": "Уточнённое описание действия",
  "targetPolity": "имя политии (только для chat)",
  "chatMessage": "первое сообщение (только для chat)"
}

VERY IMPORTANT: Отвечай ТОЛЬКО валидным JSON.`;
}

export function parseConverterResponse(text: string): ConvertedAction {
  try {
    const parsed = parseJsonLoose<any>(text);

    return {
      type: parsed.type === 'chat' ? 'chat' : 'action',
      text: parsed.text || text,
      targetPolity: parsed.targetPolity,
      chatMessage: parsed.chatMessage,
    };
  } catch (e) {
    console.error('[PARSER] Failed to parse converter response:', e);

    // Fallback: вернуть как действие
    return {
      type: 'action',
      text: text.substring(0, 650),
    };
  }
}

/**
 * Build prompt for batch action conversion (multiple actions in one LLM call)
 */
export function buildBatchConverterPrompt(vars: PromptVariables, actions: string[]): string {
  const actionsList = actions.map((action, i) => `${i + 1}. ${action}`).join('\n');

  return `Ты конвертируешь решения игрока в понятные для симуляции действия.

Игрок играет за политию ${vars.PLAYER_POLITY}.

Почти каждое действие должно быть преобразовано в тип "ACTION".
Тип "CHAT" (дипломатия) - только если игрок явно упоминает дипломатические переговоры.

Типы действий (ВСЕГДА action):
- Attacking (атака)
- Constructing (строительство)
- Researching (исследования)
- Consolidating (укрепление)
- Mobilizing (мобилизация)
- Industrializing (индустриализация)
- Rearming (перевооружение)
- Militarizing (милитаризация)
- Disarming (разоружение)
- Affirming (подтверждение)
- Negating (отрицание)

Дипломатия ТОЛЬКО если игрок хочет открыть чат с другой политией.

[Контекст игры]

${vars.WORLD_BEFORE_ROUND_ONE_TEXT}

[Правила симуляции]

${vars.HISTORICAL_PRESET_SIMULATION_RULES}

[Описание карты]

${vars.GRAND_MAP_DESCRIPTION_NO_CITY}

[Игровые даты]

${vars.ORIGIN_ROUND_DATE}

---

Действия игрока для конвертации:

${actionsList}

Твоя задача для КАЖДОГО действия:
1. Определить тип: action или chat
2. Если action — перепиши текст игрока подробнее: добавь конкретные детали исполнения — ссылки на реальные механизмы, ведомства, программы, отрасли, регионы из описания карты, — чтобы симулятор понял, КАК исполнять приказ
3. НИЧЕГО не удаляй из намерения игрока — только дополняй. Даже хорошо написанное действие улучши и уточни
4. Тон вывода повторяет тон ИМЕННО ЭТОГО действия: разговорный к разговорному, ролевой к ролевому, от первого лица к первому лицу
5. Длина вывода — примерно на 50% длиннее текста игрока, но не более 650 символов. Если текст игрока уже длинный — не раздувай, лишь уплотни и уточни
6. Если chat — сформулируй первое сообщение чата от лица игрока: оно суммирует, чего он хочет добиться от переговоров, и тоже повторяет его тон

${vars.LANGUAGE === 'russian' ? 'Отвечай на русском.' : 'Отвечай на английском.'}

---

Твой вывод ДОЛЖЕН быть в формате JSON массива:
[
  {
    "index": 1,
    "type": "action|chat",
    "text": "Уточнённое описание действия",
    "targetPolity": "имя политии (только для chat)",
    "chatMessage": "первое сообщение (только для chat)"
  },
  {
    "index": 2,
    ...
  }
]

VERY IMPORTANT: Отвечай ТОЛЬКО валидным JSON массивом. Никакого дополнительного текста.`;
}

/**
 * Parse batch converter response - returns array of converted actions
 */
export function parseBatchConverterResponse(text: string): ConvertedAction[] {
  try {
    const parsed = parseJsonLoose<any[]>(text);

    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    return parsed.map((item: any) => ({
      type: item.type === 'chat' ? 'chat' : 'action',
      text: item.text || '',
      targetPolity: item.targetPolity,
      chatMessage: item.chatMessage,
    }));
  } catch (e) {
    console.error('[PARSER] Failed to parse batch converter response:', e);

    // Fallback: вернуть каждое действие как action с оригинальным текстом
    return [];
  }
}
