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

Все действия принадлежат политии игрока ${vars.PLAYER_POLITY}. Переписывай ровно полученный приказ: НЕ приписывай приказы другим политиям и не добавляй действий, которых игрок не отдавал. Другие страны в тексте — цели и адресаты приказа, а не его субъект.

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

Все действия принадлежат политии игрока ${vars.PLAYER_POLITY}. Переписывай ровно полученные приказы: НЕ приписывай приказы другим политиям и не добавляй действий, которых игрок не отдавал. Другие страны в тексте — цели и адресаты приказа, а не его субъект.

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

Верни РОВНО столько элементов, сколько действий в списке, и сохрани в "index" номер действия из списка. Лишние элементы отбрасываются, поэтому элемент без пары ослабляет приказ игрока.

VERY IMPORTANT: Отвечай ТОЛЬКО валидным JSON массивом. Никакого дополнительного текста.`;
}

/**
 * Parse batch converter response - returns array of converted actions
 *
 * `sourceActions` — приказы игрока в порядке отправки. Когда он передан,
 * результат жёстко выравнивается по этим приказам. Это prompt guard, а НЕ
 * семантическая гарантия субъекта: элемент с корректным `index` всё ещё может
 * содержать в `text` чужой приказ, и никакая нормализация числа это не ловит.
 * Что гарантируется детерминированно:
 *  - `index` из ответа (1-based номер приказа из промпта) приоритетнее порядка массива;
 *  - элемент без валидного index НЕ подставляется на позицию приказа игрока
 *    (fail-closed): один malformed/missing index не переводит весь ответ в
 *    позиционный режим, а его слот падает на исходный текст игрока;
 *  - лишние элементы (index вне 1..N, повтор index) отбрасываются и не
 *    становятся новыми приказами игрока;
 *  - нестроковый `text` не пропускается: слот падает на исходный текст игрока;
 *  - полностью legacy ответ (index нет НИ У ОДНОГО элемента) разбирается
 *    позиционно — ограничение: при вставке/перестановке элементов моделью
 *    раскладка может приписать текст не тому слоту, гарантии нет.
 * Без `sourceActions` — прежнее поведение (все элементы как есть).
 */
export function parseBatchConverterResponse(
  text: string,
  sourceActions: string[] = [],
): ConvertedAction[] {
  try {
    const parsed = parseJsonLoose<any[]>(text);

    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    const items = parsed.filter(
      (item: any) => item && typeof item === 'object' && !Array.isArray(item)
    );
    if (items.length === 0) {
      throw new Error('Batch response has no usable items');
    }

    // Только непустая строка считается текстом: число/массив/объект/null из
    // ответа модели не должны доехать до симуляции как приказ игрока.
    const usableText = (value: any): string | null =>
      typeof value === 'string' && value.trim() !== '' ? value : null;

    const toConverted = (item: any, fallbackText: string): ConvertedAction => ({
      type: item.type === 'chat' ? 'chat' : 'action',
      text: usableText(item.text) ?? fallbackText,
      targetPolity: typeof item.targetPolity === 'string' ? item.targetPolity : undefined,
      chatMessage: typeof item.chatMessage === 'string' ? item.chatMessage : undefined,
    });

    if (sourceActions.length === 0) {
      return items.map((item: any) => toConverted(item, ''));
    }

    /**
     * Строгий разбор index: только целое >= 1 (число или числовая строка).
     * Возвращает null для missing/malformed — такой элемент считается
     * неадресуемым и НЕ привязывается к позиции приказа.
     */
    const indexOf = (item: any): number | null => {
      const raw = item.index;
      if (typeof raw !== 'number' && typeof raw !== 'string') return null;
      const idx = Number(raw);
      return Number.isInteger(idx) && idx >= 1 ? idx : null;
    };

    const indexed = items.filter((item: any) => indexOf(item) !== null);
    const unindexed = items.filter((item: any) => indexOf(item) === null);

    if (unindexed.length > 0 && indexed.length > 0) {
      console.warn(
        `[PARSER] Batch response mixes indexed (${indexed.length}) and unindexed (${unindexed.length}) items: ` +
          'unindexed items cannot be attributed to a player order and are dropped (fail-closed)'
      );
    }

    const byIndex = new Map<number, any>();
    for (const item of indexed) {
      const idx = indexOf(item)!;
      // Повтор index: выигрывает первый элемент, дубликат отбрасывается.
      // index вне 1..N — лишний элемент: приказом игрока не становится.
      if (idx <= sourceActions.length && !byIndex.has(idx)) byIndex.set(idx, item);
    }

    // Позиционная раскладка — только для полностью legacy ответа (ни у одного
    // элемента нет index). В mixed-ответе она запрещена: иначе элементы без
    // адресации и лишние «приказы» чужих стран разъезжаются по слотам игрока.
    const positional = indexed.length === 0;

    const result: ConvertedAction[] = [];
    for (let i = 0; i < sourceActions.length; i++) {
      const item = positional ? items[i] : byIndex.get(i + 1);
      result.push(
        item ? toConverted(item, sourceActions[i]) : { type: 'action', text: sourceActions[i] }
      );
    }
    return result;
  } catch (e) {
    console.error('[PARSER] Failed to parse batch converter response:', e);

    // Приказ игрока не должен исчезать из-за сбоя конвертера: падаем на
    // исходные тексты, чтобы симуляция получила ровно приказы игрока.
    return sourceActions.map(t => ({ type: 'action' as const, text: t }));
  }
}
