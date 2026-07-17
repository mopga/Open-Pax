/**
 * Тесты Этапа 5 (пресет-пакеты, с заглушкой LLM):
 *   listPresets видит штатные пакеты (source='preset'),
 *   loadPreset парсит легаси-формат со строковыми country_codes,
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
          startChat: [],
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
      { id: `${WORLD_ID}_DEU`, name: 'ФРГ', color: '#FF0000', owner: 'DEU', population: 5000000, gdp: 200, militaryPower: 300, flag: 'DEU' },
      { id: `${WORLD_ID}_POL`, name: 'Польша', color: '#00FF00', owner: 'POL', population: 3000000, gdp: 100, militaryPower: 100, flag: 'POL' },
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
  it('listPresets видит штатные пакеты cold_war_1951 и modern_world как source=preset', () => {
    const presets = presetLoader.listPresets();
    const byId = new Map(presets.map(p => [p.id, p]));

    const coldWar = byId.get('cold_war_1951');
    const modern = byId.get('modern_world');

    expect(coldWar).toBeDefined();
    expect(modern).toBeDefined();
    expect(coldWar!.source).toBe('preset');
    expect(modern!.source).toBe('preset');
    // Пакет выигрывает у легаси-шаблона с тем же id — без дублей в списке
    expect(presets.filter(p => p.id === 'cold_war_1951')).toHaveLength(1);
    expect(presets.filter(p => p.id === 'modern_world')).toHaveLength(1);
    // rules.md и lore.md подхвачены пакетом
    expect(coldWar!.simulation_rules).toBeTruthy();
    expect(coldWar!.lore).toBeTruthy();
    expect(modern!.simulation_rules).toBeTruthy();
    expect(modern!.lore).toBeTruthy();
  });

  it('loadPreset парсит легаси-формат со строковыми country_codes', () => {
    // Временный легаси-шаблон в старом формате (country_codes — строка)
    const legacyId = 'test_legacy_string_codes';
    const legacyPath = path.join(presetLoader.LEGACY_TEMPLATES_DIR, `${legacyId}.json`);
    fs.writeFileSync(legacyPath, JSON.stringify({
      id: legacyId,
      name: 'Legacy String Codes',
      description: 'Проверка парсинга строковых кодов',
      country_codes: "['USA', 'RUS', 'DEU']",
      base_prompt: 'Легаси-мир для теста',
      start_date: '1951-01-01',
    }));

    try {
      const preset = presetLoader.loadPreset(legacyId);
      expect(preset).not.toBeNull();
      expect(preset!.source).toBe('legacy');
      expect(preset!.country_codes).toEqual(['USA', 'RUS', 'DEU']);
      expect(preset!.has_custom_map).toBe(false);
      expect(preset!.flags).toEqual([]);
    } finally {
      try { fs.rmSync(legacyPath); } catch { /* уже удалён */ }
    }
  });

  it('validatePresetJson отвергает битые preset.json', () => {
    const v = presetLoader.validatePresetJson;
    // Нет id
    expect(() => v({ name: 'X', country_codes: ['USA'], base_prompt: 'p' })).toThrow(/id/);
    // Пустые country_codes
    expect(() => v({ id: 'ok_id', name: 'X', country_codes: [], base_prompt: 'p' })).toThrow(/country_codes/);
    // Невалидный код страны (нужен ISO_A3 верхним регистром)
    expect(() => v({ id: 'ok_id', name: 'X', country_codes: ['usa'], base_prompt: 'p' })).toThrow(/код страны/);
    // Нет base_prompt
    expect(() => v({ id: 'ok_id', name: 'X', country_codes: ['USA'] })).toThrow(/base_prompt/);
    // Валидный минимум — проходит
    const ok = v({ id: 'ok_id', name: 'X', country_codes: ['USA'], base_prompt: 'p' });
    expect(ok.id).toBe('ok_id');
    expect(ok.country_codes).toEqual(['USA']);
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
        { id: `${WORLD_ID}_plain_DEU`, name: 'ФРГ', color: '#FF0000', owner: 'DEU', population: 5000000, gdp: 200, militaryPower: 300, flag: 'DEU' },
      ]
    );

    const { session } = getSessionRegistry().createSession(`${WORLD_ID}_plain`, 'Player', `${WORLD_ID}_plain_DEU`, '#FF0000');
    session.queueAction('Наблюдать');
    await session.processNextAction(30);

    expect(capturedPrompt).toContain('События развиваются логично. Учитывай экономику и военную мощь.');
    expect(capturedPrompt).not.toContain(CUSTOM_RULES);
  });
});
