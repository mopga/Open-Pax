/**
 * Тесты переопределяемых промптов пресета (секция "prompts"):
 *   validatePresetJson принимает и валидирует prompts,
 *   renderPromptTemplate подставляет ${VAR} / {{VAR}} (в т.ч. lowercase),
 *   world.prompts имеет приоритет над дефолтным builder'ом (simulation,
 *   converter, suggestions, advisor), работает алиас "jump",
 *   ленивый DB-fallback достаёт prompts из worlds по id игры,
 *   отсутствие секции prompts не ломает дефолтные промпты,
 *   пресет modern_world несёт валидную секцию prompts,
 *   дефолтные промпты обогащены правилами оригинала (forward/desript/actions).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Путь к временной БД ДО импорта database.ts (он читает env при загрузке модуля)
const TEST_DB = path.join(os.tmpdir(), `open-pax-preset-prompts-${process.pid}-${Date.now()}.db`);
process.env.OPEN_PAX_DB_PATH = TEST_DB;

let db: any;
let worldRepository: any;
let gameRepository: any;
let presetLoader: typeof import('../src/utils/preset-loader');
let override: typeof import('../src/prompts/override');
let promptBuilderModule: typeof import('../src/prompt-builder');
let simulationModule: typeof import('../src/prompts/simulation');
let converterModule: typeof import('../src/prompts/converter');
let suggestionsModule: typeof import('../src/prompts/suggestions');

/** Вызовы «LLM»: механика + текст user-промпта */
const captured: { mechanic: string; prompt: string }[] = [];
const lastPrompt = (mechanic: string): string =>
  [...captured].reverse().find(c => c.mechanic === mechanic)?.prompt ?? '';

/** Заглушка LLM (сигнатура LLMRouter): запоминает промпты, отвечает валидным JSON */
const stubLlm: any = {
  consolidation: { startRound: 25, chunkSize: 5, keepRawTail: 10 },
  async generate(mechanic: string, _system: string, user: string) {
    captured.push({ mechanic, prompt: user });
    if (mechanic === 'converter') return { content: JSON.stringify({ type: 'action', text: 'Действие' }) };
    if (mechanic === 'suggestions') return { content: JSON.stringify({ suggestions: [] }) };
    return { content: 'Ответ советника' };
  },
  async stream(mechanic: string, _system: string, user: string, onToken: (chars: number) => void) {
    captured.push({ mechanic, prompt: user });
    onToken?.(user.length);
    return {
      content: JSON.stringify({
        events: [],
        narration: 'Тихо.',
        voided: [],
        startChat: [],
        worldChanges: { regionOwners: {}, regionColors: {} },
      }),
    };
  },
  clearCache() {},
};

/** Минимальный GameData для PromptEngine: мир из двух регионов, игрок — ФРГ */
function makeGame(opts: { id?: string; worldPrompts?: any; prompts?: any } = {}): any {
  return {
    id: opts.id ?? 'no-such-game',
    currentDate: '1951-01-01',
    currentTurn: 1,
    world: {
      name: 'Test World',
      basePrompt: 'Тестовый лор',
      startDate: '1951-01-01',
      regions: {
        w_DEU: { id: 'w_DEU', name: 'ФРГ', owner: 'DEU', color: '#FF0000', objects: [] },
        w_POL: { id: 'w_POL', name: 'Польша', owner: 'POL', color: '#00FF00', objects: [] },
      },
      ...(opts.worldPrompts !== undefined ? { prompts: opts.worldPrompts } : {}),
    },
    players: [{ id: 'p1', name: 'Player', regionId: 'w_DEU', polityId: 'DEU' }],
    playerPolityId: 'DEU',
    actions: [],
    results: [],
    ...(opts.prompts !== undefined ? { prompts: opts.prompts } : {}),
  };
}

beforeAll(async () => {
  const dbModule = await import('../src/database');
  db = dbModule.default;
  dbModule.initDatabase();

  const repos = await import('../src/repositories');
  worldRepository = repos.worldRepository;
  gameRepository = repos.gameRepository;

  presetLoader = await import('../src/utils/preset-loader');
  override = await import('../src/prompts/override');
  promptBuilderModule = await import('../src/prompt-builder');
  simulationModule = await import('../src/prompts/simulation');
  converterModule = await import('../src/prompts/converter');
  suggestionsModule = await import('../src/prompts/suggestions');
});

afterAll(() => {
  try {
    db?.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const f = TEST_DB + suffix;
      if (fs.existsSync(f)) fs.rmSync(f);
    }
  } catch { /* tmp */ }
});

describe('validatePresetJson: секция prompts', () => {
  const v = () => presetLoader.validatePresetJson;

  it('валидная секция prompts проходит и сохраняется', () => {
    const ok = v()({
      id: 'ok_id',
      name: 'X',
      country_codes: ['USA'],
      base_prompt: 'p',
      prompts: { simulation: 'текст с ${PLAYER_POLITY}', advisor: 'советник' },
    });
    expect(ok.prompts?.simulation).toContain('${PLAYER_POLITY}');
    expect(ok.prompts?.advisor).toBe('советник');
  });

  it('отсутствие секции prompts — норма', () => {
    const ok = v()({ id: 'ok_id', name: 'X', country_codes: ['USA'], base_prompt: 'p' });
    expect(ok.prompts).toBeUndefined();
  });

  it('мусорная секция prompts отвергается', () => {
    // Не объект
    expect(() => v()({ id: 'ok_id', name: 'X', country_codes: ['USA'], base_prompt: 'p', prompts: ['x'] })).toThrow(/prompts/);
    // Не-строковое значение
    expect(() => v()({ id: 'ok_id', name: 'X', country_codes: ['USA'], base_prompt: 'p', prompts: { simulation: 42 } })).toThrow(/prompts/);
    // Пустая строка
    expect(() => v()({ id: 'ok_id', name: 'X', country_codes: ['USA'], base_prompt: 'p', prompts: { simulation: '  ' } })).toThrow(/prompts/);
  });
});

describe('renderPromptTemplate / getPromptOverride', () => {
  const vars: any = {
    PLAYER_POLITY: 'СССР',
    LANGUAGE: 'russian',
    CURRENT_ROUND_NUMBER: 7,
  };

  it('подставляет ${VAR} и {{VAR}}, числа приводит к строке', () => {
    const out = override.renderPromptTemplate('${PLAYER_POLITY} против {{PLAYER_POLITY}}, раунд ${CURRENT_ROUND_NUMBER}', vars);
    expect(out).toBe('СССР против СССР, раунд 7');
  });

  it('lowercase-плейсхолдер находит переменную в верхнем регистре (${language})', () => {
    expect(override.renderPromptTemplate('язык: ${language}', vars)).toBe('язык: russian');
  });

  it('неизвестный плейсхолдер остаётся как есть', () => {
    expect(override.renderPromptTemplate('${UNKNOWN_THING}', vars)).toBe('${UNKNOWN_THING}');
  });

  it('getPromptOverride: алиас jump ↔ simulation, пустые значения игнорируются', () => {
    expect(override.getPromptOverride({ jump: 'J' }, 'simulation')).toBe('J');
    expect(override.getPromptOverride({ simulation: 'S', jump: 'J' }, 'simulation')).toBe('S');
    expect(override.getPromptOverride({ simulation: '  ' }, 'simulation')).toBeUndefined();
    expect(override.getPromptOverride(undefined, 'advisor')).toBeUndefined();
    expect(override.getPromptOverride({ simulation: 'S' }, 'advisor')).toBeUndefined();
  });
});

describe('world.prompts имеет приоритет над дефолтными промптами', () => {
  it('simulation: пресетный шаблон заменяет дефолтный промпт прыжка', async () => {
    const engine = new promptBuilderModule.PromptEngine(stubLlm);
    const game = makeGame({ worldPrompts: { simulation: 'КАСТОМ_СИМУЛЯЦИЯ: ${PLAYER_POLITY} с ${ORIGIN_ROUND_DATE} по ${TARGET_ROUND_DATE}' } });

    await engine.runSimulation(game, ['Развивать экономику'], 30);

    const prompt = lastPrompt('jump');
    expect(prompt).toContain('КАСТОМ_СИМУЛЯЦИЯ: ФРГ с 1951-01-01 по 1951-01-31');
    expect(prompt).not.toContain('Ты симулируешь пошаговую стратегическую игру');
  });

  it('simulation: ключ "jump" тоже переопределяет (алиас)', async () => {
    const engine = new promptBuilderModule.PromptEngine(stubLlm);
    await engine.runSimulation(makeGame({ worldPrompts: { jump: 'КАСТОМ_ЧЕРЕЗ_JUMP' } }), [], 30);
    expect(lastPrompt('jump')).toContain('КАСТОМ_ЧЕРЕЗ_JUMP');
  });

  it('converter: переопределение применяется к одиночной конвертации', async () => {
    const engine = new promptBuilderModule.PromptEngine(stubLlm);
    const game = makeGame({ worldPrompts: { converter: 'КАСТОМ_КОНВЕРТЕР: ${DESCRIPTION_ACTION_TEXT}' } });

    await engine.convertAction(game, 'Вторгнуться в Польшу');

    const prompt = lastPrompt('converter');
    expect(prompt).toContain('КАСТОМ_КОНВЕРТЕР: Вторгнуться в Польшу');
    expect(prompt).not.toContain('Ты конвертируешь решение игрока');
  });

  it('converter: batch с переопределением деградирует в последовательные одиночные конвертации', async () => {
    const engine = new promptBuilderModule.PromptEngine(stubLlm);
    const game = makeGame({ worldPrompts: { converter: 'КАСТОМ_КОНВЕРТЕР: ${DESCRIPTION_ACTION_TEXT}' } });
    const before = captured.length;

    const results = await engine.convertActionsBatch(game, ['Действие А', 'Действие Б']);

    const calls = captured.slice(before).filter(c => c.mechanic === 'converter');
    expect(results).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(calls[0].prompt).toContain('Действие А');
    expect(calls[1].prompt).toContain('Действие Б');
  });

  it('suggestions: переопределение применяется', async () => {
    const engine = new promptBuilderModule.PromptEngine(stubLlm);
    await engine.getSuggestions(makeGame({ worldPrompts: { suggestions: 'КАСТОМ_ПОДСКАЗКИ для ${PLAYER_POLITY}' } }));
    expect(lastPrompt('suggestions')).toContain('КАСТОМ_ПОДСКАЗКИ для ФРГ');
  });

  it('advisor: к пресетному шаблону дописываются история и текущий вопрос игрока', async () => {
    const engine = new promptBuilderModule.PromptEngine(stubLlm);
    const game = makeGame({ worldPrompts: { advisor: 'КАСТОМ_СОВЕТНИК ${PLAYER_POLITY}' } });

    await engine.getAdvisor(game, 'Что делать с Польшей?', [{ role: 'user', content: 'Привет' }]);

    const prompt = lastPrompt('advisor');
    expect(prompt).toContain('КАСТОМ_СОВЕТНИК ФРГ');
    expect(prompt).toContain('[Сообщение от игрока]');
    expect(prompt).toContain('Что делать с Польшей?');
    expect(prompt).toContain('[История чата]');
  });

  it('prompts на верхнем уровне GameData тоже работают', async () => {
    const engine = new promptBuilderModule.PromptEngine(stubLlm);
    await engine.runSimulation(makeGame({ prompts: { simulation: 'КАСТОМ_ВЕРХНИЙ_УРОВЕНЬ' } }), [], 30);
    expect(lastPrompt('jump')).toContain('КАСТОМ_ВЕРХНИЙ_УРОВЕНЬ');
  });
});

describe('ленивый DB-fallback: prompts мира по id игры', () => {
  const WORLD_ID = 'prompts_world';
  const GAME_ID = 'prompts_game';

  it('worldRepository сохраняет и отдаёт prompts (create → findById → update)', () => {
    worldRepository.createWithRegions(
      {
        id: WORLD_ID,
        name: 'Prompts World',
        description: '',
        startDate: '1951-01-01',
        basePrompt: 'лор',
        historicalAccuracy: 0.8,
        prompts: JSON.stringify({ simulation: 'DB_ШАБЛОН: ${PLAYER_POLITY} → ${TARGET_ROUND_DATE}' }),
      },
      [{ id: `${WORLD_ID}_DEU`, name: 'ФРГ', color: '#FF0000', owner: 'DEU', population: 1, gdp: 1, militaryPower: 1, flag: 'DEU' }]
    );

    expect(worldRepository.findById(WORLD_ID).prompts).toContain('DB_ШАБЛОН');

    worldRepository.update(WORLD_ID, { prompts: JSON.stringify({ advisor: 'A' }) });
    expect(worldRepository.findById(WORLD_ID).prompts).toBe(JSON.stringify({ advisor: 'A' }));

    worldRepository.update(WORLD_ID, { prompts: null });
    expect(worldRepository.findById(WORLD_ID).prompts).toBeNull();

    // Возвращаем для следующего теста
    worldRepository.update(WORLD_ID, { prompts: JSON.stringify({ simulation: 'DB_ШАБЛОН: ${PLAYER_POLITY} → ${TARGET_ROUND_DATE}' }) });
  });

  it('GameData без world.prompts: prompts подтягиваются из БД по games → worlds', async () => {
    gameRepository.create({ id: GAME_ID, worldId: WORLD_ID });

    const engine = new promptBuilderModule.PromptEngine(stubLlm);
    // world.prompts в GameData НЕТ — только id игры, по которому живёт мир
    await engine.runSimulation(makeGame({ id: GAME_ID }), ['наблюдать'], 30);

    expect(lastPrompt('jump')).toContain('DB_ШАБЛОН: ФРГ → 1951-01-31');
  });

  it('мир без prompts (NULL) не ломает дефолтный промпт', async () => {
    worldRepository.createWithRegions(
      { id: `${WORLD_ID}_plain`, name: 'Plain', description: '', startDate: '1951-01-01', basePrompt: 'лор', historicalAccuracy: 0.8 },
      [{ id: `${WORLD_ID}_plain_DEU`, name: 'ФРГ', color: '#FF0000', owner: 'DEU', population: 1, gdp: 1, militaryPower: 1, flag: 'DEU' }]
    );
    gameRepository.create({ id: `${GAME_ID}_plain`, worldId: `${WORLD_ID}_plain` });

    const engine = new promptBuilderModule.PromptEngine(stubLlm);
    await engine.runSimulation(makeGame({ id: `${GAME_ID}_plain` }), [], 30);

    expect(lastPrompt('jump')).toContain('Ты симулируешь пошаговую стратегическую игру');
  });
});

describe('дефолтные промпты без секции prompts', () => {
  it('runSimulation: дефолтный промпт прыжка', async () => {
    const engine = new promptBuilderModule.PromptEngine(stubLlm);
    await engine.runSimulation(makeGame(), [], 30);
    expect(lastPrompt('jump')).toContain('Ты симулируешь пошаговую стратегическую игру');
  });

  it('getSuggestions: дефолтный промпт', async () => {
    const engine = new promptBuilderModule.PromptEngine(stubLlm);
    await engine.getSuggestions(makeGame());
    expect(lastPrompt('suggestions')).toContain('Тем для беспокойства');
  });
});

describe('обогащение дефолтных промптов материалом оригинала', () => {
  const vars: any = {
    PLAYER_POLITY: 'ФРГ',
    LANGUAGE: 'russian',
    DIFFICULTY_DESCRIPTION_JUMP_FORWARD: 'Сложность: нормальная',
    WORLD_BEFORE_ROUND_ONE_TEXT: 'лор',
    HISTORICAL_PRESET_SIMULATION_RULES: 'правила',
    GRAND_MAP_DESCRIPTION_NO_CITY: 'Полития "ФРГ" [DEU]:\nФРГ',
    GRAND_MAP_DESCRIPTION: 'карта',
    ALL_EVENTS_WITH_CONSOLIDATION: '',
    CHATS_NON_CONSOLIDATED_ROUNDS: '',
    STARTING_ROUND_DATE: '1951-01-01',
    ORIGIN_ROUND_DATE: '1951-01-01',
    TARGET_ROUND_DATE: '1951-01-31',
    ORIGIN_ROUND_GRAMMATICAL_DATE: '1 января 1951',
    TARGET_ROUND_GRAMMATICAL_DATE: '31 января 1951',
    CURRENT_ROUND_NUMBER: 1,
    PLAYER_POLITY_REGIONS: 'ФРГ',
    PLAYER_POLITY_BATTALION_SUMMARIES: '',
    PLAYER_ACTIONS_THIS_ROUND: '',
    PLAYER_EVERY_ACTION_NOT_PREVIOUS: '',
    NON_CONSOLIDATED_ROUNDS_WITH_DATES: '',
    DESCRIPTION_ACTION_TEXT: 'тест',
  };

  it('simulation: правила forward.txt (нет действий за игрока, Regime Change, запреты, лимит событий, фронт)', () => {
    const prompt = simulationModule.buildSimulationPrompt(vars);
    expect(prompt).toContain('НИКОГДА не выполняй действия ЗА игрока');
    expect(prompt).toContain('Regime Change');
    expect(prompt).toContain('(fictional)');
    expect(prompt).toContain('Player Polity');
    expect(prompt).toContain('25-30');
    expect(prompt).toContain('линии фронта');
    expect(prompt).toContain('правительство в изгнании');
  });

  it('converter: правила desript_to_act.txt (тон конкретного действия, +50%, 650, не удалять намерение)', () => {
    const prompt = converterModule.buildConverterPrompt(vars);
    expect(prompt).toContain('тон ИМЕННО ЭТОГО действия');
    expect(prompt).toContain('650 символов');
    expect(prompt).toContain('НИЧЕГО не удаляй из намерения игрока');
  });

  it('suggestions: правила actions.txt (6-9 тем, ≤25 слов, 2-5 действий, ≤30 слов, привязка к карте)', () => {
    const prompt = suggestionsModule.buildSuggestionsPrompt(vars);
    expect(prompt).toContain('6-9');
    expect(prompt).toContain('25 слов');
    expect(prompt).toContain('2-5');
    expect(prompt).toContain('30 слов');
    expect(prompt).toContain('иммерсивное название стратегии');
  });
});

describe('пресет modern_world несёт секцию prompts', () => {
  it('loadPreset отдаёт prompts с simulation и suggestions; шаблон рендерится переменными', () => {
    const preset = presetLoader.loadPreset('modern_world');
    expect(preset).not.toBeNull();
    expect(preset!.prompts?.simulation).toBeTruthy();
    expect(preset!.prompts?.suggestions).toBeTruthy();

    // Рендер шаблона пресета реальными переменными игры
    const vars = new promptBuilderModule.PromptBuilder(makeGame()).buildVariables();
    const rendered = override.renderPromptTemplate(preset!.prompts!.simulation, vars);

    // Все плейсхолдеры шаблона — известные переменные, ничего не осталось
    expect(rendered).not.toMatch(/\$\{[A-Z_]+\}/);
    expect(rendered).toContain('ФРГ'); // подставленный PLAYER_POLITY
    expect(rendered).toContain('информационная война'); // специфика современности
    expect(rendered).toContain('"events"'); // JSON-контракт сохранён
  });
});
