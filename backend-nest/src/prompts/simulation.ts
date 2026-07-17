/**
 * Open-Pax — Simulation Prompt
 * ============================
 * Основной движок симуляции (time-rewind.md)
 */

import { PromptVariables, SimulationResult, SimulationEvent, VoidedAction } from './types';
import { parseJsonLoose } from '../utils/json-repair';

/**
 * Построить промпт для симуляции хода
 * @param opts.autoJump — режим «к следующему важному событию»: модель сама
 *   выбирает фактическую целевую дату и возвращает её в targetDate.
 */
export function buildSimulationPrompt(vars: PromptVariables, opts?: { autoJump?: boolean }): string {
  const autoJumpInstruction = opts?.autoJump
    ? `\nПравила auto-jump:
- Игрок попросил промотать время ДО СЛЕДУЮЩЕГО ВАЖНОГО СОБЫТИЯ (в пределах горизонта до ${vars.TARGET_ROUND_DATE}).
- Останови симуляцию на первом по-настоящему значимом событии и верни его дату в поле "targetDate" (YYYY-MM-DD).
- Событий может быть мало (1-3) — это нормально для этого режима.`
    : '';
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
- ВАЖНО: регионы и политии адресуй ТОЛЬКО по именам, в точности как они
  перечислены в [Описание карты] ниже (например "Германия", "США").
  Никаких id, координат или выдуманных названий.

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
          "type": "transfer|create|update|delete|spawn_battalion|move_battalion|create_polity",
          "regionName": "ИМЯ региона из описания карты",
          "newOwner": "ИМЯ политии из описания карты (если transfer/create)",
          "newColor": "#hex (если update или новая полития)"
        }
      ]
    }
  ],
  "narration": "Общий нарратив о произошедшем за этот период (3-5 предложений)",
  "voided": [
    { "action": "текст действия игрока", "reason": "почему оно нереалистично" }
  ],
  "startChat": [
    { "polityName": "ИМЯ политии", "topic": "что она хочет обсудить" }
  ],
  "worldChanges": {
    "regionOwners": { "ИМЯ региона": "ИМЯ политии" },
    "regionColors": { "ИМЯ региона": "#hex" }
  }
}

Правила mapChanges:
- "type": "transfer" (передать регион), "create"/"update"/"delete" (политии),
  "spawn_battalion" (появление батальона в регионе),
  "move_battalion" (с targetRegionName), "create_polity" (новая полития).
- "regionName" и "newOwner" — ТОЛЬКО имена из [Описание карты] (или имя новой
  политии, если ты её создаёшь). НЕ используй id и координаты.
- Если границы не менялись — оставляй "mapChanges" пустым массивом.
- "worldChanges.regionOwners" дублирует итоговые смены владельцев по именам.

Правила voided:
- Если действие игрока нереалистично для этого мира и периода (например,
  "захватить весь мир за неделю", технологии из будущего) — НЕ выполняй его,
  а добавь в "voided" с понятным игроку объяснением. Остальные действия
  выполняй как обычно. Если всё реалистично — "voided": [].
- "startChat": если какая-то полития по итогам событий хочет вступить в
  переговоры с игроком — укажи её. Если нет — "startChat": [].
${autoJumpInstruction}

VERY IMPORTANT: Отвечай ТОЛЬКО валидным JSON, без markdown форматирования, без пояснений.`;
}

export function parseSimulationResponse(text: string): SimulationResult {
  const emptyWorldChanges = { regionOwners: {}, regionColors: {}, newFeatures: [], deletedFeatures: [] };
  try {
    const parsed = parseJsonLoose<any>(text);

    // Строгая нормализация событий: мусорные элементы выбрасываем, а не падаем
    const events: SimulationEvent[] = [];
    for (const raw of Array.isArray(parsed.events) ? parsed.events : []) {
      if (!raw || typeof raw.headline !== 'string' || raw.headline.trim() === '') continue;
      events.push({
        headline: String(raw.headline),
        description: typeof raw.description === 'string' ? raw.description : '',
        date: typeof raw.date === 'string' ? raw.date : '',
        mapChanges: (Array.isArray(raw.mapChanges) ? raw.mapChanges : []).filter(
          (mc: any) => mc && typeof mc === 'object' && typeof mc.type === 'string'
        ),
      });
    }

    const voided: VoidedAction[] = [];
    for (const raw of Array.isArray(parsed.voided) ? parsed.voided : []) {
      if (!raw || typeof raw.action !== 'string') continue;
      voided.push({ action: raw.action, reason: typeof raw.reason === 'string' ? raw.reason : '' });
    }

    const startChat = (Array.isArray(parsed.startChat) ? parsed.startChat : [])
      .filter((c: any) => c && typeof c.polityName === 'string')
      .map((c: any) => ({ polityName: String(c.polityName), topic: String(c.topic ?? '') }));

    return {
      events,
      narration: typeof parsed.narration === 'string' ? parsed.narration : 'Мир изменился...',
      diplomacy: Array.isArray(parsed.diplomacy) ? parsed.diplomacy : [],
      worldChanges: { ...emptyWorldChanges, ...(parsed.worldChanges ?? {}) },
      voided,
      startChat,
      targetDate: typeof parsed.targetDate === 'string' ? parsed.targetDate : undefined,
    };
  } catch (e) {
    console.error('[PARSER] Failed to parse simulation response:', e);

    // Fallback: вернуть текст как нарратив
    return {
      events: [],
      narration: text.substring(0, 500),
      diplomacy: [],
      worldChanges: emptyWorldChanges,
      voided: [],
    };
  }
}
