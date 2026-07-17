/**
 * Open-Pax — Chat Prompt (Этап 3)
 * ===============================
 * Дипломатический чат игрока с политией: LLM играет роль лидера/МИД
 * державы и отвечает от её первого лица с учётом отношений и контекста мира.
 */

export interface ChatPromptVars {
  /** Отображаемое имя политии-собеседника */
  polityName: string;
  /** Лор мира (base_prompt) */
  worldContext: string;
  /** Компактное описание карты (полития: регионы) */
  mapContext: string;
  /** Текущая внутриигровая дата (YYYY-MM-DD) */
  date: string;
  /** Отношения политии с игроком: 'ally' | 'hostile' | 'neutral' */
  relationship: string;
  /** История переписки (role: 'player' — игрок, 'polity' — полития) */
  history: { role: string; content: string }[];
  /** Новое сообщение игрока, на которое нужно ответить */
  playerMessage: string;
}

const RELATIONSHIP_TEXT: Record<string, string> = {
  ally: 'союзные (мы союзники, доверяем друг другу, но у нас есть свои интересы)',
  hostile: 'враждебные (мы противники, говорим жёстко и настороженно)',
  neutral: 'нейтральные (сдержанная дипломатическая вежливость)',
};

/**
 * Построить промпт для дипломатического чата.
 */
export function buildChatPrompt(vars: ChatPromptVars): string {
  const relationshipText = RELATIONSHIP_TEXT[vars.relationship] || RELATIONSHIP_TEXT.neutral;

  const historySection = vars.history.length > 0
    ? vars.history
        .map(m => (m.role === 'player' ? `Игрок: ${m.content}` : `${vars.polityName}: ${m.content}`))
        .join('\n')
    : '(Переговоры только начинаются)';

  return `Ты играешь роль лидера и министерства иностранных дел политии ${vars.polityName} в стратегической игре об альтернативной истории.

Говори ОТ ПЕРВОГО ЛИЦА своей державы («мы», «наше правительство»). Помни о своих национальных интересах: ты можешь договариваться, торговаться, выдвигать условия, угрожать или льстить — в зависимости от ситуации. Не выходи из роли, не упоминай, что ты ИИ.

Текущие отношения с политией игрока: ${relationshipText}.

Текущая дата в мире игры: ${vars.date}. Учитывай её и последние события: не говори о вещах, которых твоя держава не могла бы знать.

[Контекст мира]

${vars.worldContext}

[Текущая карта мира]

${vars.mapContext}

[История переговоров]

${historySection}

[Новое сообщение от игрока]

${vars.playerMessage}

---

Ответь на сообщение игрока как ${vars.polityName}. Ответ должен быть кратким — до 1500 символов, живым и по существу. Отвечай на русском.`;
}

/**
 * Разбор ответа политии: обычный текст, просто чистим пробелы.
 */
export function parseChatResponse(text: string): string {
  return (text || '').trim();
}
