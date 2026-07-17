/**
 * Open-Pax — Prompt Builder
 * =========================
 * Сервис для построения переменных промптов
 */

import { PromptVariables, SimulationResult, ConvertedAction, Suggestion, AdvisorMessage, difficultyPromptBlock, normalizeDifficulty } from './prompts';
import { buildSimulationPrompt, parseSimulationResponse, buildAutoJumpInstruction } from './prompts/simulation';
import { buildAdvisorPrompt, parseAdvisorResponse, buildAdvisorDialogSuffix } from './prompts/advisor';
import { buildSuggestionsPrompt, parseSuggestionsResponse } from './prompts/suggestions';
import { buildConverterPrompt, parseConverterResponse, buildBatchConverterPrompt, parseBatchConverterResponse } from './prompts/converter';
import { buildNarrationPrompt, parseNarrationResponse } from './prompts/narration';
import { getPromptOverride, renderPromptTemplate, PromptOverrides } from './prompts/override';
import { LLMRouter } from './llm';

interface GameData {
  id: string;
  currentDate: string;
  currentTurn: number;
  /** Сложность игры (Этап 2) */
  difficulty?: string;
  /** Консолидированная история ранних раундов (Этап 2) */
  consolidatedHistory?: string;
  /** Сколько последних раундов держать сырыми при консолидации */
  consolidationTail?: number;
  /** Этап 3: предформатированные транскрипты дипломатических чатов */
  chatTranscripts?: string;
  /** Этап 5: кастомные правила симуляции мира (rules.md пресет-пакета) */
  simulationRules?: string;
  /** Переопределённые промпты мира (секция "prompts" пресета; объект или JSON-строка) */
  prompts?: PromptOverrides | string | null;
  world: {
    name: string;
    basePrompt: string;
    startDate: string;
    regions: any; // может быть Map или объект
    /** Переопределённые промпты мира (приоритет над дефолтными builders) */
    prompts?: PromptOverrides | string | null;
  };
  players: PlayerData[];
  /** Полития игрока (polityId) — для пометки в описании карты */
  playerPolityId?: string;
  actions: ActionData[];
  results: TurnResultData[];
}

/** Нормализовать prompts-запись: объект или JSON-строка → чистый словарь. */
function normalizePrompts(raw: unknown): PromptOverrides | undefined {
  if (!raw) return undefined;
  let obj = raw;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return undefined;
    }
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return undefined;
  const out: PromptOverrides = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Переопределённые промпты мира (пресетная секция "prompts").
 *
 * Приоритет: GameData.world.prompts → GameData.prompts → ленивый lookup в БД
 * (games → worlds.prompts). Lookup нужен, потому что GameSession не знает о
 * колонке prompts; любая ошибка (нет игры, нет БД, битый JSON) молча
 * откатывает на дефолтные промпты.
 */
export async function resolveWorldPrompts(game: GameData): Promise<PromptOverrides | undefined> {
  const direct = normalizePrompts(game.world?.prompts) ?? normalizePrompts(game.prompts);
  if (direct) return direct;

  try {
    // Ленивый dynamic import: repositories тянут database (better-sqlite3) —
    // не хотим открывать БД при импорте prompt-builder в средах без неё.
    const { gameRepository } = await import('./repositories');
    const row = gameRepository.findById(game.id);
    return normalizePrompts(row?.world?.prompts);
  } catch {
    return undefined;
  }
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
  polityId?: string;
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
      // Этап 5: правила симуляции пресета переопределяют дефолт
      HISTORICAL_PRESET_SIMULATION_RULES: this.game.simulationRules ?? 'События развиваются логично. Учитывай экономику и военную мощь.',
      DIFFICULTY_DESCRIPTION_JUMP_FORWARD: difficultyPromptBlock(normalizeDifficulty(this.game.difficulty)),

      PLAYER_POLITY: playerPolityName,
      PLAYER_POLITY_REGIONS: this.buildPlayerRegions(player.regionId),
      PLAYER_POLITY_BATTALION_SUMMARIES: this.buildPlayerBattalions(player.regionId),

      PLAYER_ACTIONS_THIS_ROUND: this.buildCurrentActions(),
      PLAYER_EVERY_ACTION_NOT_PREVIOUS: this.buildAllPastActions(),

      GRAND_MAP_DESCRIPTION: this.buildMapDescription(),
      GRAND_MAP_DESCRIPTION_NO_CITY: this.buildMapDescriptionNoCity(),

      ALL_EVENTS_WITH_CONSOLIDATION: this.buildEventHistory(),
      CHATS_NON_CONSOLIDATED_ROUNDS: this.game.chatTranscripts ?? '',
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

  /**
   * Отображаемое имя политии для LLM: имя «главного» региона (для шаблонов
   * это название страны). Раньше LLM видел внутренние id ('ai-USA'), а не
   * имена — и не мог осмысленно адресовать политии в mapChanges.
   */
  private polityDisplayName(owner: string, regionList: RegionData[]): string {
    return regionList[0]?.name || owner;
  }

  private polityHeader(owner: string, regionList: RegionData[]): string {
    const displayName = this.polityDisplayName(owner, regionList);
    const playerMark = owner === this.game.playerPolityId ? ' (ИГРОК)' : '';
    // Показываем и имя, и id-алиас: LLM адресует политию по имени,
    // движок резолвит и то, и другое (см. utils/name-resolver).
    return `Полития "${displayName}" [${owner}]${playerMark} (цвет ${regionList[0].color}):`;
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

      description += `${this.polityHeader(owner, regionList)}\n`;
      if (capitalsStr) description += `- ${capitalsStr}\n`;
      description += `- Регионы: ${regionList.map(r => r.name).join(', ')}\n`;
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
        description += '\n\n';
        continue;
      }

      description += `${this.polityHeader(owner, regionList)}\n`;
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

  // История событий: консолидированное саммари ранних раундов + сырой хвост
  private buildEventHistory(): string {
    if (this.game.results.length === 0 && !this.game.consolidatedHistory) return '';

    const consolidated = this.game.consolidatedHistory?.trim();
    if (!consolidated) {
      return this.game.results.map(r =>
        `Раунд ${r.turn}: ${r.narration}`
      ).join('\n\n');
    }

    const tail = this.game.consolidationTail ?? 10;
    const rawTail = this.game.results.slice(-tail);
    let out = `[Консолидированная история ранних раундов]\n${consolidated}`;
    if (rawTail.length > 0) {
      out += `\n\n[Последние раунды — подробно]\n` +
        rawTail.map(r => `Раунд ${r.turn}: ${r.narration}`).join('\n\n');
    }
    return out;
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
  private llm: LLMRouter;

  constructor(llm: LLMRouter) {
    this.llm = llm;
  }

  async runSimulation(
    game: GameData,
    actions: string[],
    jumpDays: number,
    onProgress?: (charsSoFar: number) => void,
    autoJump?: boolean
  ): Promise<SimulationResult> {
    const builder = new PromptBuilder(game);

    // Обновляем целевую дату
    const vars = builder.buildVariables();
    vars.TARGET_ROUND_DATE = this.calculateTargetDate(game.currentDate, jumpDays);
    vars.TARGET_ROUND_GRAMMATICAL_DATE = this.toGrammaticalDate(vars.TARGET_ROUND_DATE);
    vars.PLAYER_ACTIONS_THIS_ROUND = actions.join('\n');

    const promptOverride = getPromptOverride(await resolveWorldPrompts(game), 'simulation');
    // Пресетный шаблон заменяет дефолтный промпт целиком; правила auto-jump
    // (если режим включён) дописываем после него, чтобы механика не ломалась.
    const prompt = promptOverride
      ? renderPromptTemplate(promptOverride, vars) + (autoJump ? buildAutoJumpInstruction(vars) : '')
      : buildSimulationPrompt(vars, { autoJump });
    // system — короткая ролевая инструкция, user — большой промпт.
    // Раньше весь промпт шёл в system, а user был пустым: часть моделей
    // (особенно локальные) на это реагирует заметно хуже.
    const response = await this.llm.stream(
      'jump',
      'Ты — симулятор альтернативной истории. Строго следуй формату ответа из инструкции.',
      prompt,
      onProgress ?? (() => {}),
      { temperature: 0.7 }
    );

    return parseSimulationResponse(response.content);
  }

  async convertAction(game: GameData, actionText: string): Promise<ConvertedAction> {
    const builder = new PromptBuilder(game);
    const vars = builder.buildVariablesForAction(actionText);

    const promptOverride = getPromptOverride(await resolveWorldPrompts(game), 'converter');
    const prompt = promptOverride ? renderPromptTemplate(promptOverride, vars) : buildConverterPrompt(vars);
    const response = await this.llm.generate(
      'converter',
      'Ты — аналитик приказов в глобальной стратегической игре. Отвечай только JSON.',
      prompt,
      { temperature: 0.5 }
    );

    return parseConverterResponse(response.content);
  }

  /**
   * Convert multiple actions in a single LLM call (batch processing)
   * Significantly reduces API calls when processing multiple pending actions
   */
  async convertActionsBatch(game: GameData, actionTexts: string[]): Promise<ConvertedAction[]> {
    if (actionTexts.length === 0) return [];
    if (actionTexts.length === 1) {
      // Fall back to single conversion for single action
      return [await this.convertAction(game, actionTexts[0])];
    }

    // Пресетный шаблон конвертера рассчитан на одно действие: с ним
    // конвертируем последовательно — корректность важнее экономии вызовов.
    if (getPromptOverride(await resolveWorldPrompts(game), 'converter')) {
      const converted: ConvertedAction[] = [];
      for (const text of actionTexts) {
        converted.push(await this.convertAction(game, text));
      }
      return converted;
    }

    const builder = new PromptBuilder(game);
    const vars = builder.buildVariables();

    const prompt = buildBatchConverterPrompt(vars, actionTexts);
    const response = await this.llm.generate(
      'converter',
      'Ты — аналитик приказов в глобальной стратегической игре. Отвечай только JSON.',
      prompt,
      { temperature: 0.5 }
    );

    return parseBatchConverterResponse(response.content);
  }

  async getAdvisor(game: GameData, message: string, history: AdvisorMessage[] = []): Promise<string> {
    const builder = new PromptBuilder(game);
    const vars = builder.buildVariables();

    // Пресетный шаблон советника: роль/стиль из пресета, но историю диалога
    // и текущий вопрос игрока всегда дописываем — иначе советник «оглохнет».
    const promptOverride = getPromptOverride(await resolveWorldPrompts(game), 'advisor');
    const prompt = promptOverride
      ? renderPromptTemplate(promptOverride, vars) + buildAdvisorDialogSuffix(message, history)
      : buildAdvisorPrompt(vars, message, history);
    const response = await this.llm.generate(
      'advisor',
      'Ты — мудрый советник лидера государства в альтернативной истории.',
      prompt,
      { temperature: 0.7 }
    );

    return parseAdvisorResponse(response.content);
  }

  /**
   * Этап 3: стриминговый вариант советника (живой Советник на фронте).
   * Контракт как у getAdvisor, но токены летят в onToken.
   */
  async getAdvisorStream(
    game: GameData,
    message: string,
    history: AdvisorMessage[] = [],
    onToken: (charsSoFar: number) => void
  ): Promise<string> {
    const builder = new PromptBuilder(game);
    const vars = builder.buildVariables();

    const promptOverride = getPromptOverride(await resolveWorldPrompts(game), 'advisor');
    const prompt = promptOverride
      ? renderPromptTemplate(promptOverride, vars) + buildAdvisorDialogSuffix(message, history)
      : buildAdvisorPrompt(vars, message, history);
    const response = await this.llm.stream(
      'advisor',
      'Ты — мудрый советник лидера государства в альтернативной истории.',
      prompt,
      onToken,
      { temperature: 0.7 }
    );

    return response.content;
  }

  async getSuggestions(game: GameData): Promise<Suggestion[]> {
    const builder = new PromptBuilder(game);
    const vars = builder.buildVariables();

    const promptOverride = getPromptOverride(await resolveWorldPrompts(game), 'suggestions');
    const prompt = promptOverride ? renderPromptTemplate(promptOverride, vars) : buildSuggestionsPrompt(vars);
    const response = await this.llm.generate(
      'suggestions',
      'Ты — штабной аналитик, предлагающий варианты действий. Отвечай только JSON.',
      prompt,
      { temperature: 0.8 }
    );

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

    const response = await this.llm.generate(
      'narration',
      'Ты — летописец альтернативной истории. Пиши живым, но сдержанным стилем.',
      prompt,
      { temperature: 0.7 }
    );

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
