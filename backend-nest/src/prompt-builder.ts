/**
 * Open-Pax — Prompt Builder
 * =========================
 * Сервис для построения переменных промптов
 */

import { PromptVariables, SimulationResult, ConvertedAction, Suggestion, AdvisorMessage } from './prompts';
import { buildSimulationPrompt, parseSimulationResponse } from './prompts/simulation';
import { buildAdvisorPrompt, parseAdvisorResponse } from './prompts/advisor';
import { buildSuggestionsPrompt, parseSuggestionsResponse } from './prompts/suggestions';
import { buildConverterPrompt, parseConverterResponse } from './prompts/converter';
import { buildNarrationPrompt, parseNarrationResponse } from './prompts/narration';
import { MiniMaxProvider } from './llm';

interface GameData {
  id: string;
  currentDate: string;
  currentTurn: number;
  world: {
    name: string;
    basePrompt: string;
    startDate: string;
    regions: any; // может быть Map или объект
  };
  players: PlayerData[];
  actions: ActionData[];
  results: TurnResultData[];
}

interface RegionData {
  id: string;
  name: string;
  color: string;
  owner: string;
  population?: number;
  militaryPower?: number;
  objects?: any[];
}

interface PlayerData {
  id: string;
  name: string;
  regionId: string;
}

// Хелпер для работы с regions (может быть Map или объектом)
function getRegion(regions: any, regionId: string): RegionData | undefined {
  if (typeof regions.get === 'function') {
    return regions.get(regionId);
  }
  return regions[regionId];
}

function getAllRegions(regions: any): RegionData[] {
  if (typeof regions.values === 'function') {
    return Array.from(regions.values());
  }
  return Object.values(regions);
}

interface ActionData {
  id: string;
  playerId: string;
  turn: number;
  text: string;
  createdAt: string;
}

interface TurnResultData {
  id: string;
  turn: number;
  narration: string;
  events?: string[];
}

export class PromptBuilder {
  private game: GameData;
  private language: string = 'russian';

  constructor(game: GameData) {
    this.game = game;
  }

  // Построить полный набор переменных
  buildVariables(): PromptVariables {
    const player = this.game.players[0];
    const playerRegion = getRegion(this.game.world.regions, player.regionId);
    const playerPolityName = playerRegion?.name || player.name;

    return {
      STARTING_ROUND_DATE: this.game.world.startDate || '1951-01-01',
      ORIGIN_ROUND_DATE: this.game.currentDate,
      TARGET_ROUND_DATE: this.calculateTargetDate(this.game.currentDate, 30),
      ORIGIN_ROUND_GRAMMATICAL_DATE: this.toGrammaticalDate(this.game.currentDate),
      TARGET_ROUND_GRAMMATICAL_DATE: this.toGrammaticalDate(this.calculateTargetDate(this.game.currentDate, 30)),
      CURRENT_ROUND_NUMBER: this.game.currentTurn,

      WORLD_BEFORE_ROUND_ONE_TEXT: this.game.world.basePrompt || 'Альтернативная история',
      HISTORICAL_PRESET_SIMULATION_RULES: 'События развиваются логично. Учитывай экономику и военную мощь.',
      DIFFICULTY_DESCRIPTION_JUMP_FORWARD: 'Сложность игры отражается в сложности долгосрочных целей.',

      PLAYER_POLITY: playerPolityName,
      PLAYER_POLITY_REGIONS: this.buildPlayerRegions(player.regionId),
      PLAYER_POLITY_BATTALION_SUMMARIES: this.buildPlayerBattalions(player.regionId),

      PLAYER_ACTIONS_THIS_ROUND: this.buildCurrentActions(),
      PLAYER_EVERY_ACTION_NOT_PREVIOUS: this.buildAllPastActions(),

      GRAND_MAP_DESCRIPTION: this.buildMapDescription(),
      GRAND_MAP_DESCRIPTION_NO_CITY: this.buildMapDescriptionNoCity(),

      ALL_EVENTS_WITH_CONSOLIDATION: this.buildEventHistory(),
      CHATS_NON_CONSOLIDATED_ROUNDS: '',
      NON_CONSOLIDATED_ROUNDS_WITH_DATES: '',

      LANGUAGE: this.language,
      isBeta: true,
    };
  }

  // Построить переменные с конкретным действием для конвертера
  buildVariablesForAction(actionText: string): PromptVariables {
    return {
      ...this.buildVariables(),
      DESCRIPTION_ACTION_TEXT: actionText,
    };
  }

  // Описание карты (полное)
  private buildMapDescription(): string {
    const regions = getAllRegions(this.game.world.regions);
    const polities = this.groupRegionsByOwner(regions);

    let description = '';

    for (const [owner, regionList] of polities) {
      if (owner === 'neutral') continue;

      const capitals = regionList.filter(r => r.objects?.some((o: any) => o.type === 'capital'));
      const capitalsStr = capitals.length > 0
        ? capitals.map(r => `${r.name} (столица)`).join(', ')
        : '';

      description += `Полития "${owner}" (${regionList[0].color}):\n`;
      if (capitalsStr) description += `- ${capitalsStr}\n`;
      description += `- ${regionList.map(r => r.name).join(', ')}\n`;
      description += `\n`;
    }

    // Нейтральные регионы
    const neutral = regions.filter(r => r.owner === 'neutral');
    if (neutral.length > 0) {
      description += `Нейтральные регионы:\n`;
      description += `- ${neutral.map(r => r.name).join(', ')}\n`;
    }

    return description;
  }

  // Описание карты без городов
  private buildMapDescriptionNoCity(): string {
    const regions = getAllRegions(this.game.world.regions);
    const polities = this.groupRegionsByOwner(regions);

    let description = '';

    for (const [owner, regionList] of polities) {
      if (owner === 'neutral') {
        description += `Нейтральные регионы:\n`;
        description += regionList.map(r => r.name).join(', ');
        continue;
      }

      description += `Полития "${owner}" (${regionList[0].color}):\n`;
      description += regionList.map(r => r.name).join(', ');
      description += '\n\n';
    }

    return description;
  }

  // Регионы игрока
  private buildPlayerRegions(playerRegionId: string): string {
    const playerRegion = getRegion(this.game.world.regions, playerRegionId);
    if (!playerRegion) return 'Нет регионов';

    return playerRegion.name;
  }

  // Батальоны игрока
  private buildPlayerBattalions(playerRegionId: string): string {
    const region = getRegion(this.game.world.regions, playerRegionId);
    if (!region?.objects) return 'Нет юнитов';

    const battalions = region.objects.filter((o: any) => o.type === 'battalion');
    if (battalions.length === 0) return 'Нет юнитов';

    return `${battalions.length} юнитов`;
  }

  // Действия за текущий раунд
  private buildCurrentActions(): string {
    const currentActions = this.game.actions.filter(a => a.turn === this.game.currentTurn);
    if (currentActions.length === 0) return '';

    return currentActions.map(a => `- ${a.text}`).join('\n');
  }

  // Все прошлые действия
  private buildAllPastActions(): string {
    const pastActions = this.game.actions.filter(a => a.turn < this.game.currentTurn);
    if (pastActions.length === 0) return 'Нет прошлых действий';

    const byTurn: Record<number, string[]> = {};
    for (const action of pastActions) {
      if (!byTurn[action.turn]) byTurn[action.turn] = [];
      byTurn[action.turn].push(action.text);
    }

    let result = '';
    for (const turn of Object.keys(byTurn).sort((a, b) => Number(a) - Number(b))) {
      result += `Раунд ${turn}: ${byTurn[Number(turn)].join(', ')}\n`;
    }

    return result;
  }

  // История событий
  private buildEventHistory(): string {
    if (this.game.results.length === 0) return '';

    return this.game.results.map(r =>
      `Раунд ${r.turn}: ${r.narration}`
    ).join('\n\n');
  }

  // Группировка регионов по владельцам
  private groupRegionsByOwner(regions: RegionData[]): Map<string, RegionData[]> {
    const polities = new Map<string, RegionData[]>();

    for (const region of regions) {
      const owner = region.owner || 'neutral';
      if (!polities.has(owner)) {
        polities.set(owner, []);
      }
      polities.get(owner)!.push(region);
    }

    return polities;
  }

  // Расчёт целевой даты
  private calculateTargetDate(startDate: string, days: number): string {
    const date = new Date(startDate);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  // Дата в грамматическом формате
  private toGrammaticalDate(dateStr: string): string {
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    const date = new Date(dateStr);
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }
}

// Класс для работы с LLM через промпты
export class PromptEngine {
  private llm: MiniMaxProvider;

  constructor(llm: MiniMaxProvider) {
    this.llm = llm;
  }

  async runSimulation(game: GameData, actions: string[], jumpDays: number): Promise<SimulationResult> {
    const builder = new PromptBuilder(game);

    // Обновляем целевую дату
    const vars = builder.buildVariables();
    vars.TARGET_ROUND_DATE = this.calculateTargetDate(game.currentDate, jumpDays);
    vars.TARGET_ROUND_GRAMMATICAL_DATE = this.toGrammaticalDate(vars.TARGET_ROUND_DATE);
    vars.PLAYER_ACTIONS_THIS_ROUND = actions.join('\n');

    const prompt = buildSimulationPrompt(vars);
    const response = await this.llm.generate(prompt, '', { temperature: 0.7 });

    return parseSimulationResponse(response.content);
  }

  async convertAction(game: GameData, actionText: string): Promise<ConvertedAction> {
    const builder = new PromptBuilder(game);
    const vars = builder.buildVariablesForAction(actionText);

    const prompt = buildConverterPrompt(vars);
    const response = await this.llm.generate(prompt, '', { temperature: 0.5 });

    return parseConverterResponse(response.content);
  }

  async getAdvisor(game: GameData, message: string, history: AdvisorMessage[] = []): Promise<string> {
    const builder = new PromptBuilder(game);
    const vars = builder.buildVariables();

    const prompt = buildAdvisorPrompt(vars, message, history);
    const response = await this.llm.generate(prompt, '', { temperature: 0.7 });

    return parseAdvisorResponse(response.content);
  }

  async getSuggestions(game: GameData): Promise<Suggestion[]> {
    const builder = new PromptBuilder(game);
    const vars = builder.buildVariables();

    const prompt = buildSuggestionsPrompt(vars);
    const response = await this.llm.generate(prompt, '', { temperature: 0.8 });

    return parseSuggestionsResponse(response.content);
  }

  async generateNarration(
    facts: string[],
    jumpDays: number,
    currentDate: string,
    playerPolity: string,
    language: string = 'russian'
  ): Promise<string> {
    const targetDate = this.calculateTargetDate(currentDate, jumpDays);

    const prompt = buildNarrationPrompt({
      facts,
      jumpDays,
      currentDate,
      targetDate,
      playerPolity,
      language,
    });

    const response = await this.llm.generate(prompt, '', { temperature: 0.7 });

    return parseNarrationResponse(response.content);
  }

  private calculateTargetDate(startDate: string, days: number): string {
    const date = new Date(startDate);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  private toGrammaticalDate(dateStr: string): string {
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    const date = new Date(dateStr);
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }
}
