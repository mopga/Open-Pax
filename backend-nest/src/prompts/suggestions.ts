/**
 * Open-Pax — Suggestions Prompt
 * =============================
 * Генератор подсказок/предложений (actions.md)
 */

import { PromptVariables, Suggestion } from './types';

/**
 * Построить промпт для генерации подсказок
 */
export function buildSuggestionsPrompt(vars: PromptVariables): string {
  return `Мы создаём пошаговую стратегическую игру. Игрок играет за политию ${vars.PLAYER_POLITY}.

[Твоя роль]

Твоя задача - предложить широкий массив возможных действий для игрока.

Сначала определи 6-9 "Тем для беспокойства", за которыми игрок должен следить. Это может быть восстание, экономический вопрос, отношения с другими политиками, внутренние дела - всё что угодно, что может волновать игрока. Некоторые должны касаться конкретных целей игрока.

Затем для каждой темы предложи 2-5 конкретных действий.

[Формат]

Для каждой "Темы для беспокойства":

Название: Короткое предложение (например, "Предотвращение переворота")

Описание: 2-3 предложения, объясняющих суть проблемы (15-25 слов).

Для каждого действия:
- Название: Название стратегии (например, "Заставить их раскрыться")
- Содержание: Конкретное описание действия (до 30 слов). Избегай общих советов - будь конкретным!

[Описание карты]

${vars.GRAND_MAP_DESCRIPTION_NO_CITY}

[Язык]

${vars.LANGUAGE === 'russian' ? 'Отвечай на русском.' : 'Отвечай на английском.'}

[История событий]

${vars.ALL_EVENTS_WITH_CONSOLIDATION || '(Событий пока нет)'}

[Недавняя дипломатия]

${vars.CHATS_NON_CONSOLIDATED_ROUNDS || '(Дипломатии не было)'}

Текущая дата: ${vars.ORIGIN_ROUND_GRAMMATICAL_DATE}

---

Твой вывод ДОЛЖЕН быть в формате JSON:
{
  "suggestions": [
    {
      "topic": "Название темы",
      "description": "Описание проблемы (15-25 слов)",
      "actions": [
        {
          "title": "Название стратегии",
          "content": "Описание действия (до 30 слов)"
        }
      ]
    }
  ]
}

VERY IMPORTANT: Отвечай ТОЛЬКО валидным JSON.`;
}

export function parseSuggestionsResponse(text: string): Suggestion[] {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.suggestions || [];
  } catch (e) {
    console.error('[PARSER] Failed to parse suggestions:', e);
    return [];
  }
}
