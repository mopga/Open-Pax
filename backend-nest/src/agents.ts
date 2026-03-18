/**
 * Open-Pax — Game Agents
 * ======================
 */

import { MiniMaxProvider } from './llm';
import { NPCCountryAgent, NPCCountryContext, createNPCCountries, type NPCAction } from './npc-agents';

export class CountryAgent {
  private provider: MiniMaxProvider;
  private regionId: string;
  private regionName: string;

  constructor(provider: MiniMaxProvider, regionId: string, regionName: string) {
    this.provider = provider;
    this.regionId = regionId;
    this.regionName = regionName;
  }

  async think(context: any, userInput: string): Promise<string> {
    const system = `Ты — руководитель страны в альтернативной истории.
Твоя задача — анализировать действия игрока и предлагать реакцию страны.

Правила:
1. Действуй логично и рационально
2. Учитывай экономические и военные ресурсы
3. Реагируй на действия других стран
4. Описывай события в историческом стиле

Отвечай кратко и по делу.`;

    const user = `Страна: ${this.regionName}
Текущее состояние:
${JSON.stringify(context.state || {}, null, 2)}

Действие игрока:
${userInput}

Опиши реакцию страны на это действие.`;

    const result = await this.provider.generate(system, user, { temperature: 0.7 });
    return result.content;
  }
}

export class WorldAgent {
  private provider: MiniMaxProvider;
  private worldPrompt: string;

  constructor(provider: MiniMaxProvider, worldPrompt: string) {
    this.provider = provider;
    this.worldPrompt = worldPrompt;
  }

  async think(context: any, events: string): Promise<string> {
    const system = `Ты — Мир в альтернативной истории.
Твоя задача — следить за глобальным балансом сил и генерировать исторические события.

Правила:
1. Соблюдай логику исторического развития
2. Учитывай действия всех стран
3. Генерируй интересные события
4. Поддерживай консистентность мира

Будешь описывать события как исторический нарратив.`;

    const user = `Мир: ${this.worldPrompt}

Глобальное состояние:
${JSON.stringify(context.globalState || {}, null, 2)}

Ход номер: ${context.turn || 1}

События этого хода:
${events}

Опиши как мир отреагировал на эти события.`;

    const result = await this.provider.generate(system, user, { temperature: 0.8 });
    return result.content;
  }
}

export class AdvisorAgent {
  private provider: MiniMaxProvider;

  constructor(provider: MiniMaxProvider) {
    this.provider = provider;
  }

  async think(context: any): Promise<string[]> {
    const system = `Ты — Интерактивный Советник игрока.
Твоя задача — анализировать ситуацию и предлагать 3-5 конкретных действий.

Правила:
1. Предлагай только реалистичные действия
2. Учитывай текущие ресурсы игрока
3. Действия должны быть разнообразными
4. Кратко и по делу

Формат ответа:
- Предложение 1: ...
- Предложение 2: ...`;

    const user = `Ситуация игрока:
${JSON.stringify(context.playerState || {}, null, 2)}

Мир вокруг:
${JSON.stringify(context.worldState || {}, null, 2)}

Проанализируй текущую ситуацию и предложи действия.`;

    const result = await this.provider.generate(system, user, { temperature: 0.9 });
    return result.content
      .split('\n')
      .filter(line => line.trim() && (line.trim().startsWith('-') || /^\d+\./.test(line.trim())))
      .slice(0, 5);
  }
}

export class GameController {
  private provider: MiniMaxProvider;
  private worldAgent: WorldAgent | null = null;
  private advisorAgent: AdvisorAgent;
  private countryAgents: Map<string, CountryAgent> = new Map();
  private npcAgents: Map<string, NPCCountryAgent> = new Map();

  constructor(provider: MiniMaxProvider) {
    this.provider = provider;
    this.advisorAgent = new AdvisorAgent(provider);
  }

  setupWorld(worldPrompt: string): void {
    this.worldAgent = new WorldAgent(this.provider, worldPrompt);
  }

  addCountry(regionId: string, regionName: string): void {
    this.countryAgents.set(regionId, new CountryAgent(this.provider, regionId, regionName));
  }

  /**
   * Setup NPC countries from world configuration
   */
  setupNPCCountries(regionConfigs: { id: string; name: string; owner: string }[]): void {
    this.npcAgents = createNPCCountries(this.provider, regionConfigs);
  }

  /**
   * Process turn for a single NPC country
   */
  async processNPCTurn(
    regionId: string,
    context: NPCCountryContext
  ): Promise<NPCAction | null> {
    const npcAgent = this.npcAgents.get(regionId);
    if (!npcAgent) {
      return null;
    }

    return npcAgent.think(context);
  }

  /**
   * Get all NPC countries
   */
  getNPCCountries(): string[] {
    return Array.from(this.npcAgents.keys());
  }

  async processTurn(
    playerRegionId: string,
    playerAction: string,
    gameContext: any
  ): Promise<{ countryResponse: string; worldResponse: string }> {
    const countryAgent = this.countryAgents.get(playerRegionId);
    if (!countryAgent) {
      return { countryResponse: 'Country agent not found', worldResponse: '' };
    }

    // 1. Process player action through country agent
    const countryResponse = await countryAgent.think(gameContext, playerAction);

    // 2. Process through world agent
    let worldResponse = '';
    if (this.worldAgent) {
      worldResponse = await this.worldAgent.think(
        gameContext,
        `Страна: ${countryResponse}`
      );
    }

    return { countryResponse, worldResponse };
  }

  async getAdvisorTips(gameContext: any): Promise<string[]> {
    return this.advisorAgent.think(gameContext);
  }
}
