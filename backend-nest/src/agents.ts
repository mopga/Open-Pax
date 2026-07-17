/**
 * Open-Pax — Game Agents
 * ======================
 * GameController: фасад над PromptEngine (конвертер действий, симуляция,
 * советник, подсказки) и NPC-агентами.
 *
 * Legacy-агенты (CountryAgent/WorldAgent/AdvisorAgent/TurnControllerAgent и
 * детерминированный processTurn) удалены на этапе стабилизации: они не
 * вызывались ниоткуда, кроме самих себя.
 */

import { LLMRouter } from './llm';
import { NPCCountryAgent, NPCCountryContext, createNPCCountries, type NPCAction } from './npc-agents';
import { PromptEngine } from './prompt-builder';
import type { SimulationEvent } from './prompts/types';

export class GameController {
  private provider: LLMRouter;
  private npcAgents: Map<string, NPCCountryAgent> = new Map();
  private worldPrompt: string = '';
  private promptEngine: PromptEngine | null = null;

  constructor(provider: LLMRouter) {
    this.provider = provider;
  }

  /**
   * Инициализировать PromptEngine для игры
   */
  initPromptEngine(gameData: any): void {
    this.promptEngine = new PromptEngine(this.provider);
    console.log('[GameController] PromptEngine initialized');
  }

  /**
   * Обработать ход используя промпты (converter → simulation time-rewind)
   */
  async processTurnWithPrompts(
    gameData: any,
    actions: string[],
    jumpDays: number,
    onProgress?: (charsSoFar: number) => void,
    autoJump?: boolean
  ): Promise<{
    narration: string;
    events: SimulationEvent[];
    worldChanges: any;
    convertedActions: any[];
    voided?: { action: string; reason: string }[];
    startChat?: { polityName: string; topic: string }[];
    targetDate?: string;
  }> {
    if (!this.promptEngine) {
      this.initPromptEngine(gameData);
    }

    console.log('[GameController] Processing turn with prompts:', { actions, jumpDays, count: actions.length });

    // 1. Конвертируем действия (batch — 1 LLM-вызов вместо N)
    const convertedActions = await this.promptEngine!.convertActionsBatch(gameData, actions);
    console.log('[GameController] Converted', convertedActions.length, 'actions via batch LLM call');

    // 2. Запускаем симуляцию (time-rewind) со стримингом прогресса генерации
    const simulationResult = await this.promptEngine!.runSimulation(
      gameData,
      convertedActions.map(a => a.text),
      jumpDays,
      onProgress,
      autoJump
    );

    console.log('[GameController] Simulation result:', simulationResult.narration.substring(0, 100));

    return {
      narration: simulationResult.narration,
      // Полные события (с mapChanges) — движок применяет их к карте
      events: simulationResult.events,
      worldChanges: simulationResult.worldChanges,
      convertedActions,
      voided: simulationResult.voided,
      startChat: simulationResult.startChat,
      targetDate: simulationResult.targetDate,
    };
  }

  /**
   * Получить советы через advisor.md
   */
  async getAdvisorWithPrompts(gameData: any, message: string, history: any[] = []): Promise<string> {
    if (!this.promptEngine) {
      this.initPromptEngine(gameData);
    }

    return this.promptEngine!.getAdvisor(gameData, message, history);
  }

  /**
   * Стриминговая версия советника (Этап 3): прогресс генерации приходит
   * в onToken (счётчик символов, конвенция LLMRouter.stream),
   * возвращается полный текст ответа.
   */
  async getAdvisorStreamWithPrompts(
    gameData: any,
    message: string,
    history: any[] = [],
    onToken: (charsSoFar: number) => void
  ): Promise<string> {
    if (!this.promptEngine) {
      this.initPromptEngine(gameData);
    }

    return this.promptEngine!.getAdvisorStream(gameData, message, history, onToken);
  }

  /**
   * Получить предложения через actions.md
   */
  async getSuggestionsWithPrompts(gameData: any): Promise<any[]> {
    if (!this.promptEngine) {
      this.initPromptEngine(gameData);
    }

    return this.promptEngine!.getSuggestions(gameData);
  }

  setupWorld(worldPrompt: string): void {
    this.worldPrompt = worldPrompt;
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
}
