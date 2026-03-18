/**
 * Open-Pax — NPC Country Agents
 * =============================
 * AI agents for non-player countries with personality traits.
 */

import { MiniMaxProvider } from './llm';

export type NPCPersonality = 'aggressive' | 'diplomatic' | 'neutral' | 'isolationist';

export interface NPCCountry {
  regionId: string;
  regionName: string;
  personality: NPCPersonality;
  aggression: number; // 0-1, how likely to start conflicts
  resources: number; // 0-1, economic/military strength
}

export interface NPCAction {
  type: 'expand' | 'ally' | 'war' | 'develop' | 'neutral' | 'trade' | 'defense';
  targetRegionId?: string;
  description: string;
  priority: number; // 1-10
}

export class NPCCountryAgent {
  private provider: MiniMaxProvider;
  private country: NPCCountry;

  constructor(provider: MiniMaxProvider, country: NPCCountry) {
    this.provider = provider;
    this.country = country;
  }

  get regionId(): string {
    return this.country.regionId;
  }

  get personality(): NPCPersonality {
    return this.country.personality;
  }

  private getPersonalitySystemPrompt(): string {
    switch (this.country.personality) {
      case 'aggressive':
        return `Ты — лидер агрессивной военной державы.
Твоя цель — расширение влияния и территории.
Ты постоянно ищешь возможности для военных действий.
Ты используешь силу для достижения целей.
Предпочитаешь быстрые решения.
Отвечай кратко, уверенно, по-военному.`;

      case 'diplomatic':
        return `Ты — лидер дипломатического государства.
Ты предпочитаешь переговоры и союзы военным действиям.
Ты ищешь компромиссы и взаимовыгодные соглашения.
Ты строить сети союзников.
Предпочитаешь мирное развитие.
Отвечай дипломатично, взвешенно.`;

      case 'neutral':
        return `Ты — лидер нейтрального государства.
Ты балансируешь между великими державами.
Ты защищаешь свои интересы, но не лезешь в чужие конфликты.
Ты прагматик — действуешь по ситуации.
Отвечай прагматично, осторожно.`;

      case 'isolationist':
        return `Ты — лидер изолированного государства.
Ты не интересуешься внешней политикой.
Ты сосредоточен на внутреннем развитии.
Ты избегаешь любых союзов и конфликтов.
Отвечай кратко, по делу.`;

      default:
        return `Ты — лидер страны в альтернативной истории.
Действуй логично и рационально.`;
    }
  }

  async think(context: NPCCountryContext): Promise<NPCAction> {
    const system = this.getPersonalitySystemPrompt();

    const neighborsInfo = context.neighbors
      .map(n => `- ${n.name}: сила=${n.militaryPower}, ВВП=${n.gdp}, владелец=${n.owner}`)
      .join('\n');

    const recentEvents = context.recentEvents
      .map(e => `- ${e}`)
      .join('\n') || 'Пока ничего не произошло';

    const user = `Страна: ${this.country.regionName}
Тип личности: ${this.country.personality}
Агрессивность: ${this.country.aggression}

Текущее состояние:
- Население: ${context.population}
- ВВП: ${context.gdp}
- Военная мощь: ${context.militaryPower}

Соседи:
${neighborsInfo}

Последние события в мире:
${recentEvents}

Текущий ход: ${context.turn}

Проанализируй ситуацию и реши, какое действие предпринять.
Верни ответ в формате JSON:
{
  "type": "expand|ally|war|develop|neutral|trade|defense",
  "targetRegionId": "id_региона_если_нужно",
  "description": "описание действия",
  "priority": 1-10
}

Выбери ОДНО действие которое наиболее соответствует твоей личности и текущей ситуации.`;

    try {
      const result = await this.provider.generate(system, user, {
        temperature: 0.7,
        maxTokens: 500,
      });

      // Parse JSON from response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const action = JSON.parse(jsonMatch[0]) as NPCAction;
        return {
          type: action.type || 'neutral',
          targetRegionId: action.targetRegionId,
          description: action.description || 'Бездействие',
          priority: action.priority || 5,
        };
      }

      // Fallback: generate default action based on personality
      return this.getDefaultAction(context);
    } catch (error) {
      console.error('NPC agent error:', error);
      return this.getDefaultAction(context);
    }
  }

  private getDefaultAction(context: NPCCountryContext): NPCAction {
    // Fallback actions based on personality
    switch (this.country.personality) {
      case 'aggressive':
        // Find weakest neighbor to attack
        const weakNeighbor = context.neighbors
          .filter(n => n.owner !== this.country.regionId)
          .sort((a, b) => a.militaryPower - b.militaryPower)[0];

        if (weakNeighbor && this.country.aggression > 0.5) {
          return {
            type: 'war',
            targetRegionId: weakNeighbor.id,
            description: `Военная экспансия против ${weakNeighbor.name}`,
            priority: 8,
          };
        }
        return {
          type: 'develop',
          description: 'Укрепление военной мощи',
          priority: 6,
        };

      case 'diplomatic':
        // Try to ally with strongest neighbor
        const strongNeighbor = context.neighbors
          .sort((a, b) => b.militaryPower - a.militaryPower)[0];

        if (strongNeighbor) {
          return {
            type: 'ally',
            targetRegionId: strongNeighbor.id,
            description: `Предложение союза ${strongNeighbor.name}`,
            priority: 7,
          };
        }
        return {
          type: 'trade',
          description: 'Развитие торговли',
          priority: 5,
        };

      case 'isolationist':
        return {
          type: 'develop',
          description: 'Внутреннее развитие',
          priority: 8,
        };

      default:
        return {
          type: 'neutral',
          description: 'Наблюдение за ситуацией',
          priority: 5,
        };
    }
  }
}

export interface NPCCountryContext {
  turn: number;
  population: number;
  gdp: number;
  militaryPower: number;
  neighbors: {
    id: string;
    name: string;
    owner: string;
    militaryPower: number;
    gdp: number;
  }[];
  recentEvents: string[];
}

/**
 * Create NPC countries from world configuration
 */
export function createNPCCountries(
  provider: MiniMaxProvider,
  regionConfigs: {
    id: string;
    name: string;
    owner: string;
  }[]
): Map<string, NPCCountryAgent> {
  const npcAgents = new Map<string, NPCCountryAgent>();

  // Personality presets for different owner types
  const personalityMap: Record<string, NPCPersonality> = {
    'ai-1': 'aggressive',
    'ai-2': 'diplomatic',
    'ai-3': 'neutral',
    'ai-4': 'isolationist',
  };

  const aggressionMap: Record<string, number> = {
    'ai-1': 0.9,
    'ai-2': 0.2,
    'ai-3': 0.5,
    'ai-4': 0.1,
  };

  for (const config of regionConfigs) {
    if (config.owner.startsWith('ai-')) {
      const personality = personalityMap[config.owner] || 'neutral';
      const aggression = aggressionMap[config.owner] || 0.5;

      const country: NPCCountry = {
        regionId: config.id,
        regionName: config.name,
        personality,
        aggression,
        resources: 0.5, // Could be calculated from region stats
      };

      npcAgents.set(config.id, new NPCCountryAgent(provider, country));
    }
  }

  return npcAgents;
}
