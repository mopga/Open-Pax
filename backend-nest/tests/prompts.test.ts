/**
 * Тесты промпт-слоя: парсер ответа симуляции и переменные промптов.
 * Регрессии бага №1 (лор мира не доходил до LLM, STARTING_ROUND_DATE «плыл»)
 * и бага №5 (LLM адресует регионы/политии по именам, не по id).
 */
import { describe, it, expect } from 'vitest';
import { parseSimulationResponse, buildSimulationPrompt } from '../src/prompts/simulation';
import { PromptBuilder } from '../src/prompt-builder';

describe('parseSimulationResponse', () => {
  it('парсит валидный JSON с событиями и mapChanges по именам', () => {
    const json = JSON.stringify({
      events: [
        {
          headline: 'Польша капитулировала',
          description: 'Войска ФРГ вошли в Варшаву.',
          date: '1951-02-01',
          mapChanges: [{ type: 'transfer', regionName: 'Польша', newOwner: 'ФРГ' }],
        },
      ],
      narration: 'Мир содрогнулся.',
      worldChanges: { regionOwners: { 'Польша': 'ФРГ' }, regionColors: {} },
    });

    const result = parseSimulationResponse(json);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].mapChanges[0].regionName).toBe('Польша');
    expect(result.narration).toBe('Мир содрогнулся.');
    expect(result.worldChanges.regionOwners['Польша']).toBe('ФРГ');
  });

  it('достаёт JSON из обёртки (markdown/текст вокруг)', () => {
    const text = 'Вот результат:\n```json\n{"events": [], "narration": "ok"}\n```';
    const result = parseSimulationResponse(text);
    expect(result.narration).toBe('ok');
  });

  it('на мусоре возвращает fallback, не падает', () => {
    const result = parseSimulationResponse('совсем не json');
    expect(result.events).toEqual([]);
    expect(typeof result.narration).toBe('string');
  });
});

describe('PromptBuilder.buildVariables (баг №1)', () => {
  const game: any = {
    id: 'g1',
    currentDate: '1952-06-15', // «текущая» дата отличается от стартовой
    currentTurn: 7,
    world: {
      name: 'Test World',
      basePrompt: 'LORE_MARKER: в этом мире СССР распался в 1949 году',
      startDate: '1951-01-01',
      regions: {
        w1_DEU: { id: 'w1_DEU', name: 'ФРГ', owner: 'DEU', color: '#FF0000', objects: [] },
        w1_POL: { id: 'w1_POL', name: 'Польша', owner: 'POL', color: '#00FF00', objects: [] },
      },
    },
    players: [{ id: 'p1', name: 'Player', regionId: 'w1_DEU', polityId: 'DEU' }],
    playerPolityId: 'DEU',
    actions: [],
    results: [],
  };

  const vars = new PromptBuilder(game).buildVariables();

  it('лор мира доходит до промпта (WORLD_BEFORE_ROUND_ONE_TEXT)', () => {
    expect(vars.WORLD_BEFORE_ROUND_ONE_TEXT).toContain('LORE_MARKER');
  });

  it('STARTING_ROUND_DATE зафиксирован на старте мира, а не «плывёт» за текущей датой', () => {
    expect(vars.STARTING_ROUND_DATE).toBe('1951-01-01');
    expect(vars.ORIGIN_ROUND_DATE).toBe('1952-06-15');
  });

  it('описание карты по именам с id-алиасами и пометкой игрока (баг №5)', () => {
    expect(vars.GRAND_MAP_DESCRIPTION_NO_CITY).toContain('Полития "ФРГ" [DEU] (ИГРОК)');
    expect(vars.GRAND_MAP_DESCRIPTION_NO_CITY).toContain('Полития "Польша" [POL]');
    expect(vars.GRAND_MAP_DESCRIPTION_NO_CITY).not.toContain('ai-');
  });

  it('полный промпт симуляции содержит лор и имена', () => {
    const prompt = buildSimulationPrompt(vars);
    expect(prompt).toContain('LORE_MARKER');
    expect(prompt).toContain('Польша');
    expect(prompt).toContain('regionName');
  });
});
