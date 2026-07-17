/**
 * Дым-тест этапа 0 (интеграционный, с заглушкой LLM):
 *   создание мира → создание игры → действие из очереди → mapChanges ПО ИМЕНАМ
 *   применяются к карте → дата/ход персистятся → «рестарт сервера» не сбрасывает
 *   дату → матрица дипломатии работает (bulkUpsert).
 *
 * Покрывает регрессии багов №1 (лор в промпте), №2 (дата при рестарте),
 * №3 (UNIQUE-индекс отношений), №4 (polityId), №5 (mapChanges по именам).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Путь к временной БД ДО импорта database.ts (он читает env при загрузке модуля)
const TEST_DB = path.join(os.tmpdir(), `open-pax-test-${process.pid}-${Date.now()}.db`);
process.env.OPEN_PAX_DB_PATH = TEST_DB;

let db: any;
let initDatabase: any;
let worldRepository: any;
let gameRepository: any;
let relationshipRepository: any;
let initSessionRegistry: any;
let getSessionRegistry: any;

/** Промпт, который движок реально отправил в «LLM» при симуляции */
let capturedSimulationPrompt = '';

/** Механики, с которыми движок вызывал LLM */
const seenMechanics: string[] = [];

/** Когда true — stub бросает LLMError на симуляции (тест восстановления очереди) */
let failJump = false;

/** Заглушка LLM: детерминированные ответы по механике (сигнатура LLMRouter) */
const stubProvider: any = {
  async generate(mechanic: string, system: string, user: string) {
    seenMechanics.push(mechanic);
    if (mechanic === 'converter') {
      return { content: JSON.stringify({ type: 'action', text: 'Вторжение в Польшу силами ФРГ' }) };
    }
    if (mechanic === 'jump') {
      if (failJump) {
        const { LLMError } = await import('../src/llm');
        throw new LLMError('test-provider: таймаут запроса (1мс)', { provider: 'test-provider', retriable: true });
      }
      capturedSimulationPrompt = `${system}\n${user}`;
      return {
        content: JSON.stringify({
          events: [
            {
              headline: 'Польша капитулировала перед ФРГ',
              description: 'После короткой кампании Варшава подписала капитуляцию.',
              date: '1951-01-20',
              mapChanges: [{ type: 'transfer', regionName: 'Польша', newOwner: 'ФРГ' }],
            },
          ],
          narration: 'Польша пала, Чехословакия присоединилась добровольно.',
          worldChanges: { regionOwners: { 'Чехословакия': 'ФРГ' }, regionColors: {} },
        }),
      };
    }
    // NPC-агенты и прочие механики
    return { content: JSON.stringify({ type: 'develop', description: 'Внутреннее развитие', priority: 5 }) };
  },
  // Фолбэк-стриминг, как у LLMRouter: generate + один onToken
  async stream(mechanic: string, system: string, user: string, onToken: (chars: number) => void, options?: any) {
    const r = await this.generate(mechanic, system, user, options);
    onToken(r.content.length);
    return r;
  },
  clearCache() {},
};

const WORLD_ID = 'test_world_smoke';
const LORE = 'LORE_MARKER: в этом мире ГДР никогда не существовало';

beforeAll(async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // никаких случайных событий

  const dbModule = await import('../src/database');
  db = dbModule.default;
  initDatabase = dbModule.initDatabase;
  initDatabase();

  const repos = await import('../src/repositories');
  worldRepository = repos.worldRepository;
  gameRepository = repos.gameRepository;
  relationshipRepository = repos.relationshipRepository;

  const registryModule = await import('../src/session-registry');
  initSessionRegistry = registryModule.initSessionRegistry;
  getSessionRegistry = registryModule.getSessionRegistry;

  // Мир как из шаблона: owner = код страны (единая конвенция polityId)
  worldRepository.createWithRegions(
    {
      id: WORLD_ID,
      name: 'Smoke World',
      description: '',
      startDate: '1951-01-01',
      basePrompt: LORE,
      historicalAccuracy: 0.8,
    },
    [
      { id: `${WORLD_ID}_DEU`, name: 'ФРГ', color: '#FF0000', owner: 'DEU', population: 5000000, gdp: 200, militaryPower: 300, flag: 'DEU' },
      { id: `${WORLD_ID}_POL`, name: 'Польша', color: '#00FF00', owner: 'POL', population: 3000000, gdp: 100, militaryPower: 100, flag: 'POL' },
      { id: `${WORLD_ID}_CZE`, name: 'Чехословакия', color: '#0000FF', owner: 'CZE', population: 2000000, gdp: 90, militaryPower: 80, flag: 'CZE' },
    ]
  );

  relationshipRepository.initForWorld(WORLD_ID, [
    { from: 'DEU', to: 'CZE', type: 'ally' },
    { from: 'DEU', to: 'POL', type: 'hostile' },
  ]);
});

afterAll(() => {
  vi.restoreAllMocks();
  try {
    db?.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const f = TEST_DB + suffix;
      if (fs.existsSync(f)) fs.rmSync(f);
    }
  } catch {
    /* временный файл в tmp — не критично */
  }
});

describe('Этап 0: сквозной дым-тест', () => {
  let gameId: string;
  let session: any;

  it('создаёт игру: polityId игрока = код страны, матрица по кодам (баг №4)', async () => {
    initSessionRegistry(stubProvider);
    const created = getSessionRegistry().createSession(WORLD_ID, 'Player', `${WORLD_ID}_DEU`);
    gameId = created.gameId;
    session = created.session;
    await new Promise(r => setImmediate(r));

    expect(session.getPlayer().polityId).toBe('DEU');
    const rels = session.getRelationships();
    expect(rels['DEU']?.['CZE']).toBe('ally');
    expect(rels['DEU']?.['POL']).toBe('hostile');
  });

  it('bulkUpsert отношений не падает и обновляет, а не дублирует (баг №3)', () => {
    relationshipRepository.bulkUpsert(WORLD_ID, [
      { from: 'DEU', to: 'CZE', newRelationship: 'hostile', reason: 'test' },
    ]);
    relationshipRepository.bulkUpsert(WORLD_ID, [
      { from: 'DEU', to: 'CZE', newRelationship: 'ally', reason: 'test-again' },
    ]);

    const rows = db
      .prepare('SELECT * FROM country_relationships WHERE world_id = ? AND from_region_id = ? AND to_region_id = ?')
      .all(WORLD_ID, 'DEU', 'CZE');
    expect(rows).toHaveLength(1);
    expect(rows[0].relationship).toBe('ally');
  });

  it('ход из очереди: лор в промпте (№1), mapChanges по именам применяются (№5)', async () => {
    session.queueAction('Атаковать Польшу и аннексировать её');
    const action = await session.processNextAction(30);

    expect(action).not.toBeNull();
    expect(action.status).toBe('completed');

    // Баг №1: кастомный лор мира дошёл до LLM
    expect(capturedSimulationPrompt).toContain('LORE_MARKER');
    // Описание карты — по именам, без внутренних id
    expect(capturedSimulationPrompt).toContain('Полития "ФРГ" [DEU] (ИГРОК)');
    expect(capturedSimulationPrompt).not.toContain('ai-');

    // Баг №5: transfer ПО ИМЕНИ применился — владелец и цвет изменились
    const poland = session.getRegion(`${WORLD_ID}_POL`);
    expect(poland.owner).toBe('DEU');
    expect(poland.color).toBe('#FF0000'); // унаследован от политии ФРГ

    // worldChanges по имени — тоже применились
    const czech = session.getRegion(`${WORLD_ID}_CZE`);
    expect(czech.owner).toBe('DEU');

    // События из LLM попали в ленту
    const results = session.getResults();
    expect(results[0].events).toContain('Польша капитулировала перед ФРГ');

    // Дата продвинулась и персистилась
    expect(session.getCurrentDate()).toBe('1951-01-31');
    // NB: SELECT * — голый `current_date` в select-списке SQLite это ключевое слово!
    const row = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
    expect(row.current_date).toBe('1951-01-31');
    expect(row.current_turn).toBe(2);
  });

  it('изменения владельцев сохранены в БД (syncRegionsToDB)', () => {
    const row = db.prepare('SELECT owner, color FROM world_regions WHERE id = ?').get(`${WORLD_ID}_POL`);
    expect(row.owner).toBe('DEU');
    expect(row.color).toBe('#FF0000');
  });

  it('«рестарт сервера» не сбрасывает дату (баг №2)', async () => {
    // Новая registry поверх той же БД — аналог рестарта процесса
    initSessionRegistry(stubProvider);
    getSessionRegistry().reloadActiveSessions();
    await new Promise(r => setImmediate(r));

    const restored = getSessionRegistry().getSession(gameId);
    expect(restored).not.toBeNull();
    expect(restored.getCurrentDate()).toBe('1951-01-31');
    expect(restored.getCurrentTurn()).toBe(2);
    expect(restored.getRegion(`${WORLD_ID}_POL`).owner).toBe('DEU');
    expect(restored.getPlayer().polityId).toBe('DEU');
  });

  it('сейв/лоад сохраняет состояние полностью', async () => {
    const restored = getSessionRegistry().getSession(gameId);
    const { saveId } = restored.save('smoke-save');

    // «Портим» состояние в памяти
    restored.getRegion(`${WORLD_ID}_POL`).owner = 'POL';

    const loaded = getSessionRegistry().loadSavedGame(saveId);
    expect(loaded).not.toBeNull();
    expect(loaded.getCurrentDate()).toBe('1951-01-31');
    expect(loaded.getRegion(`${WORLD_ID}_POL`).owner).toBe('DEU');
  });

  it('движок вызывает LLM с правильными механиками (Этап 1)', () => {
    expect(seenMechanics).toContain('converter');
    expect(seenMechanics).toContain('jump');
    expect(seenMechanics).toContain('npc');
  });

  it('падение LLM на прыжке: действие возвращается в pending, ошибка пробрасывается', async () => {
    const restored = getSessionRegistry().getSession(gameId);
    restored.queueAction('Провальный прыжок');
    const before = restored.getPendingActions().length;

    failJump = true;
    try {
      await expect(restored.processNextAction(30)).rejects.toThrow(/таймаут запроса/);
    } finally {
      failJump = false;
    }

    // Действие НЕ потеряно и не зависло в 'processing'
    const pending = restored.getPendingActions();
    expect(pending.length).toBe(before);
    expect(pending[pending.length - 1].status).toBe('pending');
    // Дата/ход не продвинулись
    expect(restored.getCurrentDate()).toBe('1951-01-31');
  });
});
