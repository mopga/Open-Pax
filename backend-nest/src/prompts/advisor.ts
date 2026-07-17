/**
 * Open-Pax — Advisor Prompt
 * ========================
 * Интерактивный советник (advisor.md)
 */

import { PromptVariables, AdvisorMessage } from './types';

/**
 * Секции диалога советника: история переписки + текущее сообщение игрока.
 * Вынесено в экспорт: prompt-builder дописывает их после переопределённого
 * пресетного шаблона советника, чтобы вопрос игрока всегда доходил до модели.
 */
export function buildAdvisorDialogSuffix(message?: string, chatHistory?: AdvisorMessage[]): string {
  const historySection = chatHistory && chatHistory.length > 0
    ? `\n[История чата]\n${chatHistory.map(m =>
        m.role === 'user' ? `Игрок: ${m.content}` : `Советник: ${m.content}`
      ).join('\n')}`
    : '';

  const currentMessage = message
    ? `\n[Сообщение от игрока]\n${message}`
    : '';

  return `${historySection}\n${currentMessage}`;
}

/**
 * Построить промпт для советника
 */
export function buildAdvisorPrompt(vars: PromptVariables, message?: string, chatHistory?: AdvisorMessage[]): string {
  return `Ты играешь роль главного советника игрока, который играет за политию ${vars.PLAYER_POLITY}.

Первый раунд игры установлен на дату ${vars.STARTING_ROUND_DATE}.

Твоя задача - объяснить ситуацию в мире с точки зрения общей истории игры, и что более важно - предоставить реалистичные стратегические рекомендации, чтобы помочь игроку достичь его целей.

Это ПРОДОЛЖАЮЩИЙСЯ диалог: если ниже есть раздел [История чата] — это ваша предыдущая переписка с игроком. Ты помнишь все рекомендации, которые давал ранее: ссылайся на них, уточняй и развивай их, не противоречь себе без веской причины. Когда история уже есть — это НЕ первое сообщение: не здоровайся и не представляйся заново, сразу продолжай разговор по существу.

Ты должен быть погружён в мир и ИГРАТЬ РОЛЬ! В выводе можешь упоминать конкретные даты, не упоминай номера раундов. Предсказывай возможные последствия в зависимости от решений, не говори что что-то обязательно произойдёт.

Твой вывод должен быть интересным - используй заголовки, жирный текст, списки. Но вывод должен быть коротким, максимум 3000 символов!

[Контекст игры]

${vars.WORLD_BEFORE_ROUND_ONE_TEXT}

[Правила симуляции]

${vars.HISTORICAL_PRESET_SIMULATION_RULES}

[Описание карты]

${vars.GRAND_MAP_DESCRIPTION}

[Регионы игрока]

${vars.PLAYER_POLITY_REGIONS}

[Юниты игрока]

${vars.PLAYER_POLITY_BATTALION_SUMMARIES || 'Нет юнитов'}

[Действия игрока в этом раунде]

${vars.PLAYER_ACTIONS_THIS_ROUND || 'Нет действий'}

[Все действия игрока за игру]

${vars.PLAYER_EVERY_ACTION_NOT_PREVIOUS || 'Нет прошлых действий'}

[Текущая дата]

Это важно: ${vars.ORIGIN_ROUND_GRAMMATICAL_DATE}

${buildAdvisorDialogSuffix(message, chatHistory)}

---

Ты должен ответить как советник - дай рекомендации, предложи действия. Будь конкретным и полезным.

${vars.LANGUAGE === 'russian' ? 'Отвечай на русском.' : 'Отвечай на английском.'}`;
}

export function parseAdvisorResponse(text: string): string {
  // Советник возвращает простой текст
  return text.trim();
}
