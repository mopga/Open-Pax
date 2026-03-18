/**
 * Open-Pax — Turn Controller Agent
 * ===============================
 * Агент для объединения всех событий хода в единый нарратив.
 */

import { MiniMaxProvider } from './llm';

export interface TurnContext {
  turn: number;
  year: string;
  playerCountry: string;
  playerAction: string;
  playerResponse: string;
  npcActions: {
    country: string;
    action: string;
    description: string;
  }[];
  worldState: {
    totalRegions: number;
    totalCountries: number;
    blocs: string[];
  };
}

export class TurnControllerAgent {
  private provider: MiniMaxProvider;

  constructor(provider: MiniMaxProvider) {
    this.provider = provider;
  }

  /**
   * Сгенерировать нарратив хода, объединяющий все события
   */
  async generateTurnNarrative(context: TurnContext): Promise<{
    narration: string;
    events: string[];
    summary: string;
  }> {
    const system = `Ты — Нарратор хода в игре альтернативной истории.
Твоя задача — объединить все события хода в связный исторический нарратив.

Правила:
1. Начни с краткого введения (1 предложение о годе/событии)
2. Опиши основные события хода
3. Включи реакции стран и действия NPC
4. Заверши кратким итогом изменений в мире
5. Если есть захваты или конфликты — выдели их

Тон: историческая проза, эпический
Формат: Markdown с заголовками`;

    const npcActionsText = context.npcActions.length > 0
      ? context.npcActions.map(n => `- ${n.country}: ${n.description}`).join('\n')
      : 'Новых значимых событий не произошло.';

    const user = `Ход: ${context.turn}
Год: ${context.year}

## Действия игрока
Страна: ${context.playerCountry}
Действие: ${context.playerAction}
Реакция страны: ${context.playerResponse}

## Действия других стран
${npcActionsText}

## Состояние мира
- Всего регионов: ${context.worldState.totalRegions}
- Активных стран: ${context.worldState.totalCountries}
- Блоки: ${context.worldState.blocs.join(', ') || 'пока нет'}

Создай связный нарратив этого хода.`;

    const result = await this.provider.generate(system, user, {
      temperature: 0.8,
      maxTokens: 1500,
    });

    // Извлекаем события из нарратива
    const events = this.extractEvents(result.content, context);

    return {
      narration: result.content,
      events,
      summary: this.generateSummary(context),
    };
  }

  /**
   * Извлечь ключевые события из нарратива
   */
  private extractEvents(narration: string, context: TurnContext): string[] {
    const events: string[] = [];

    // Добавляем действие игрока как событие
    if (context.playerAction) {
      events.push(`Игрок (${context.playerCountry}): ${context.playerAction}`);
    }

    // Добавляем действия NPC
    for (const npc of context.npcActions) {
      if (npc.action === 'war') {
        events.push(`⚔️ ${npc.country} объявил войну`);
      } else if (npc.action === 'ally') {
        events.push(`🤝 ${npc.country} заключил союз`);
      } else if (npc.action === 'expand') {
        events.push(`🗺️ ${npc.country} расширил территорию`);
      } else if (npc.action === 'develop') {
        events.push(`📈 ${npc.country} развивает экономику`);
      }
    }

    return events;
  }

  /**
   * Сгенерировать краткую сводку
   */
  private generateSummary(context: TurnContext): string {
    const warCount = context.npcActions.filter(n => n.action === 'war').length;
    const allyCount = context.npcActions.filter(n => n.action === 'ally').length;

    let summary = `Ход ${context.turn}: `;

    if (warCount > 0) {
      summary += `${warCount} конфликт(ов), `;
    }
    if (allyCount > 0) {
      summary += `${allyCount} союз(ов), `;
    }
    if (warCount === 0 && allyCount === 0) {
      summary += ' мирное развитие';
    }

    return summary.replace(/, $/, '');
  }
}
