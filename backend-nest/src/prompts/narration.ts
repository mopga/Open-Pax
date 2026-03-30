/**
 * Open-Pax — Narration Prompt
 * ===========================
 * Generates narrative from deterministic simulation facts
 */

export interface NarrationVars {
  facts: string[];
  jumpDays: number;
  currentDate: string;
  targetDate: string;
  playerPolity: string;
  language: string;
}

/**
 * Build prompt for narration generation
 */
export function buildNarrationPrompt(vars: NarrationVars): string {
  const factsList = vars.facts.length > 0
    ? vars.facts.map(f => `- ${f}`).join('\n')
    : 'No significant events occurred.';

  const languageInstruction = vars.language === 'russian'
    ? 'Отвечай на русском языке.'
    : 'Respond in English.';

  return `Ты - исторический нарратор альтернативной истории.

Игрок управляет политией "${vars.playerPolity}".

Произошли следующие события за период ${vars.currentDate} → ${vars.targetDate} (${vars.jumpDays} дней):

${factsList}

${languageInstruction}

Напиши краткое повествование (3-5 предложений) о том, что произошло. Будь конкретен и упоминай конкретные регионы и страны.

Ответь ТОЛЬКО текстом нарратива, без заголовков, без списков.`;
}

export function parseNarrationResponse(text: string): string {
  // Just return the text as-is, stripped of markdown if any
  return text.replace(/^[\s\n]+|[\s\n]+$/g, '').substring(0, 500);
}
