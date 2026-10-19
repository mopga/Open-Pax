/**
 * Тесты Этапа 5 (пресет-пакеты, с заглушкой LLM):
 *   listPresets видит штатные пакеты формата 2,
 *   формат 1 приводится к формату 2,
 *   validatePresetJson отвергает битые preset.json,
 *   кастомные simulation_rules мира доезжают до промпта прыжка.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

const TEST_DB = path.join(os.tmpdir(), `open-pax-presets-${process.pid}-${Date.now()}.db`);
process.env.OPEN_PAX_DB_PATH = TEST_DB;

let db: any;
let worldRepository: any;
let initSessionRegistry: any;
let getSessionRegistry: any;
let presetLoader: typeof import('../src/utils/preset-loader');

/** Последний промпт симуляции, ушедший в «LLM» */
let capturedPrompt = '';

const WORLD_ID = 'presets_world';
// Уникальный маркер кастомных правил — ищем его в промпте симуляции
const CUSTOM_RULES = 'ПРАВИЛА_ТЕСТОВОГО_МИРА: никаких войн по чётным раундам';

const stubProvider: any = {
  consolidation: { startRound: 25, chunkSize: 5, keepRawTail: 10 },
  async generate(mechanic: string, system: string, user: string) {
    if (mechanic === 'jump') {
      capturedPrompt = `${system}\n${user}`;
      return {
        content: JSON.stringify({
          events: [],
          narration: 'Тихий месяц.',
          voided: [],
          worldChanges: { regionOwners: {}, regionColors: {} },
        }),
      };
    }
    if (mechanic === 'converter') {
      return { content: JSON.stringify({ type: 'action', text: 'Действие игрока' }) };
    }
    return { content: JSON.stringify({ type: 'develop', description: 'Развитие', priority: 5 }) };
  },
  async stream(mechanic: string, system: string, user: string, onToken: (chars: number) => void, options?: any) {
    const r = await this.generate(mechanic, system, user, options);
    onToken(r.content.length);
    return r;
  },
  clearCache() {},
};

beforeAll(async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.99);

  const dbModule = await import('../src/database');
  db = dbModule.default;
  dbModule.initDatabase();

  const repos = await import('../src/repositories');
  worldRepository = repos.worldRepository;

  const registryModule = await import('../src/session-registry');
  initSessionRegistry = registryModule.initSessionRegistry;
  getSessionRegistry = registryModule.getSessionRegistry;

  presetLoader = await import('../src/utils/preset-loader');

  // Мир с кастомными правилами симуляции — как будто сгенерирован из пресета с rules.md
  worldRepository.createWithRegions(
    { id: WORLD_ID, name: 'Presets World', description: '', startDate: '1951-01-01', basePrompt: 'Тестовый лор', historicalAccuracy: 0.8, simulationRules: CUSTOM_RULES },
    [
      { id: `${WORLD_ID}_DEU`, name: 'ФРГ', color: '#FF0000', owner: 'DEU', flag: 'DEU' },
      { id: `${WORLD_ID}_POL`, name: 'Польша', color: '#00FF00', owner: 'POL', flag: 'POL' },
    ]
  );

  initSessionRegistry(stubProvider);
});

afterAll(() => {
  vi.restoreAllMocks();
  try {
    db?.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const f = TEST_DB + suffix;
      if (fs.existsSync(f)) fs.rmSync(f);
    }
  } catch { /* tmp */ }
});

describe('Этап 5: каталог пресетов', () => {
  it('listPresets видит штатные пакеты cold_war_1951 и modern_world в формате 2', () => {
    const presets = presetLoader.listPresets();
    const byId = new Map(presets.map(p => [p.id, p]));

    const coldWar = byId.get('cold_war_1951');
    const modern = byId.get('modern_world');

    expect(coldWar).toBeDefined();
    expect(modern).toBeDefined();
    expect(presets.filter(p => p.id === 'cold_war_1951')).toHaveLength(1);
    // rules.md и lore.md подхвачены пакетом
    expect(coldWar!.simulation_rules).toBeTruthy();
    expect(coldWar!.lore).toBeTruthy();
    expect(modern!.simulation_rules).toBeTruthy();
    expect(modern!.lore).toBeTruthy();
    // Государства пресета: СССР собран из союзных республик
    expect(coldWar!.language).toBe('ru');
    expect(coldWar!.polities.RUS).toMatchObject({ name: 'СССР' });
    expect(coldWar!.polities.RUS.members).toContain('UKR');
    expect(coldWar!.recommended[0]).toBe('USA');
    expect(coldWar!.recommended).not.toContain('UKR');
    expect(modern!.recommended).toContain('CHN');
  });

  it('формат 1 приводится к формату 2', () => {
    const p = presetLoader.validatePresetJson({
      id: 'old_fmt', name: 'X', base_prompt: 'p',
      country_codes: ['USA', 'RUS'],
      countries: [{ code: 'USA', name: 'Штаты', color: '#112233' }],
      country_colors: { RUS: '#A83A32' },
      polity_members: { RUS: ['UKR'] },
    });
    expect(p.recommended).toEqual(['USA', 'RUS']);
    expect(p.polities.USA).toEqual({ name: 'Штаты', color: '#112233' });
    expect(p.polities.RUS).toEqual({ color: '#A83A32', members: ['UKR'] });
    expect(p.language).toBe('ru');
  });

  it('validatePresetJson отвергает битые preset.json', () => {
    const v = presetLoader.validatePresetJson;
    // Нет id
    expect(() => v({ name: 'X', polities: {}, base_prompt: 'p' })).toThrow(/id/);
    // Формат 1: пустые country_codes
    expect(() => v({ id: 'ok_id', name: 'X', country_codes: [], base_prompt: 'p' })).toThrow(/country_codes/);
    // Невалидный код государства (нужен ISO_A3 верхним регистром)
    expect(() => v({ id: 'ok_id', name: 'X', polities: { usa: {} }, base_prompt: 'p' })).toThrow(/код/);
    expect(() => v({ id: 'ok_id', name: 'X', polities: { USA: { color: 'blue' } }, base_prompt: 'p' })).toThrow(/color/);
    expect(() => v({ id: 'ok_id', name: 'X', recommended: ['usa'], base_prompt: 'p' })).toThrow(/recommended/);
    // Страна в двух государствах
    expect(() => v({
      id: 'ok_id', name: 'X', base_prompt: 'p',
      polities: { RUS: { members: ['UKR'] }, POL: { members: ['UKR'] } },
    })).toThrow(/UKR/);
    // Нет base_prompt
    expect(() => v({ id: 'ok_id', name: 'X', polities: {} })).toThrow(/base_prompt/);
    // Валидный минимум — проходит; без polities все страны карты — сами по себе
    const ok = v({ id: 'ok_id', name: 'X', base_prompt: 'p' });
    expect(ok.id).toBe('ok_id');
    expect(ok.polities).toEqual({});
    expect(ok.recommended).toEqual([]);
  });
});

describe('Этап 5: правила симуляции мира', () => {
  it('worldRepository пробрасывает simulation_rules: create → findById → update', () => {
    const row = worldRepository.findById(WORLD_ID);
    expect(row.simulation_rules).toBe(CUSTOM_RULES);

    worldRepository.update(WORLD_ID, { simulationRules: 'НОВЫЕ_ПРАВИЛА' });
    expect(worldRepository.findById(WORLD_ID).simulation_rules).toBe('НОВЫЕ_ПРАВИЛА');

    // Возвращаем обратно, чтобы не влиять на интеграционный тест ниже
    worldRepository.update(WORLD_ID, { simulationRules: CUSTOM_RULES });
    expect(worldRepository.findById(WORLD_ID).simulation_rules).toBe(CUSTOM_RULES);
  });

  it('кастомные simulation_rules мира попадают в промпт прыжка (HISTORICAL_PRESET_SIMULATION_RULES)', async () => {
    const { session } = getSessionRegistry().createSession(WORLD_ID, 'Player', `${WORLD_ID}_DEU`, '#FF0000');
    session.queueAction('Развивать экономику');
    const action = await session.processNextAction(30);

    expect(action.status).toBe('completed');
    expect(capturedPrompt).toContain(CUSTOM_RULES);
  });

  it('мир без simulation_rules получает дефолтные правила в промпте', async () => {
    worldRepository.createWithRegions(
      { id: `${WORLD_ID}_plain`, name: 'Plain World', description: '', startDate: '1951-01-01', basePrompt: 'Обычный мир', historicalAccuracy: 0.8 },
      [
        { id: `${WORLD_ID}_plain_DEU`, name: 'ФРГ', color: '#FF0000', owner: 'DEU', flag: 'DEU' },
      ]
    );

    const { session } = getSessionRegistry().createSession(`${WORLD_ID}_plain`, 'Player', `${WORLD_ID}_plain_DEU`, '#FF0000');
    session.queueAction('Наблюдать');
    await session.processNextAction(30);

    expect(capturedPrompt).toContain('События развиваются логично. Учитывай экономику и военную мощь.');
    expect(capturedPrompt).not.toContain(CUSTOM_RULES);
  });
});
