/**
 * Интеграционные тесты Этапа 4 — map features (с заглушкой LLM):
 *   (1) objects регионов переживают «перезапуск» сервера
 *       (syncRegionsToDB → новая registry → reloadActiveSessions);
 *   (2) spawn_battalion из ответа симуляции создаёт объект типа 'battalion'
 *       с lat/lng в регионе и персистит его в БД;
 *   (3) move_battalion перемещает батальон в целевой регион —
 *       по имени, а при наличии id — по id (id приоритетнее).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

const TEST_DB = path.join(os.tmpdir(), `open-pax-mapfeat-${process.pid}-${Date.now()}.db`);
process.env.OPEN_PAX_DB_PATH = TEST_DB;

let db: any;
let worldRepository: any;
let initSessionRegistry: any;
let getSessionRegistry: any;

const WORLD_ID = 'mapfeat_world';

/** Простая квадратная геометрия [lng, lat] — границы центроида легко проверить. */
function squareGeojson(lng1: number, lat1: number, lng2: number, lat2: number): string {
  return JSON.stringify({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[[lng1, lat1], [lng2, lat1], [lng2, lat2], [lng1, lat2], [lng1, lat1]]],
    },
  });
}

/** Ответ заглушки на механику jump: одно событие со spawn_battalion. */
function jumpResponse(): any {
  return {
    events: [
      {
        headline: 'Сформирован новый батальон',
        description: 'Мобилизация завершена.',
        date: '1951-02-01',
        mapChanges: [
          { type: 'spawn_battalion', regionName: 'ФРГ', feature: { type: 'battalion', name: '1-й гвардейский' } },
        ],
      },
    ],
    narration: 'Армия усилена.',
    voided: [],
    startChat: [],
    worldChanges: { regionOwners: {}, regionColors: {} },
  };
}

const stubProvider: any = {
  consolidation: { startRound: 25, chunkSize: 5, keepRawTail: 10 },
  async generate(mechanic: string, _system: string, _user: string) {
    if (mechanic === 'converter') {
      return { content: JSON.stringify({ type: 'action', text: 'Действие игрока' }) };
    }
    if (mechanic === 'consolidation') {
      return { content: 'КОНСПЕКТ: сжатая история первых раундов' };
    }
    if (mechanic === 'jump') {
      return { content: JSON.stringify(jumpResponse()) };
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

function createGame(): { gameId: string; session: any } {
  return getSessionRegistry().createSession(WORLD_ID, 'Player', `${WORLD_ID}_DEU`, '#FF0000');
}

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

  worldRepository.createWithRegions(
    { id: WORLD_ID, name: 'MapFeat World', description: '', startDate: '1951-01-01', basePrompt: 'Тестовый лор', historicalAccuracy: 0.8 },
    [
      {
        id: `${WORLD_ID}_DEU`, name: 'ФРГ', color: '#FF0000', owner: 'DEU',
        population: 5000000, gdp: 200, militaryPower: 300, flag: 'DEU',
        geojson: squareGeojson(10, 40, 20, 50),
        // Сидированный объект: заодно проверяет, что addRegion персистит objects
        objects: [{ id: 'obj_seed_city', type: 'city', name: 'Кёльн', lat: 50.9, lng: 6.9 }],
      },
      {
        id: `${WORLD_ID}_POL`, name: 'Польша', color: '#00FF00', owner: 'POL',
        population: 3000000, gdp: 100, militaryPower: 100, flag: 'POL',
        geojson: squareGeojson(30, 40, 40, 50),
      },
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

describe('Этап 4: персистентность map features', () => {
  it('objects переживают «рестарт»: sync → новая registry → reloadActiveSessions', async () => {
    const { gameId, session } = createGame();

    // Сидированный при создании мира объект доехал до сессии (addRegion → getRegions)
    const seeded = session.getRegion(`${WORLD_ID}_DEU`).objects.find((o: any) => o.id === 'obj_seed_city');
    expect(seeded).toBeDefined();
    expect(seeded.type).toBe('city');

    // Кладём в регион новый маркер (как это делают mapChanges хода)
    const marker = { id: 'obj_capital_deu', type: 'capital', name: 'Бонн', lat: 50.7, lng: 7.1 };
    session.getRegion(`${WORLD_ID}_DEU`).objects.push(marker);
    await session.syncRegionsToDB();

    // Объект записан в БД (раньше updateRegionsBatch игнорировал objects)
    const dbRegion = worldRepository.getRegions(WORLD_ID).find((r: any) => r.id === `${WORLD_ID}_DEU`);
    expect(dbRegion.objects.some((o: any) => o.id === 'obj_capital_deu')).toBe(true);

    // «Перезапуск сервера»: новая registry (пустой кэш сессий) + восстановление из БД
    initSessionRegistry(stubProvider);
    getSessionRegistry().reloadActiveSessions();

    const restored = getSessionRegistry().getSession(gameId);
    expect(restored).not.toBeNull();
    const obj = restored.getRegion(`${WORLD_ID}_DEU`).objects.find((o: any) => o.id === 'obj_capital_deu');
    expect(obj).toBeDefined();
    expect(obj.type).toBe('capital');
    expect(obj.name).toBe('Бонн');
    expect(obj.lat).toBeCloseTo(50.7);
    expect(obj.lng).toBeCloseTo(7.1);
  });

  it('spawn_battalion из ответа симуляции создаёт объект battalion с lat/lng и персистит его', async () => {
    const { session } = createGame();

    session.queueAction('Сформировать новый батальон');
    const action = await session.processNextAction(30);
    expect(action.status).toBe('completed');

    const region = session.getRegion(`${WORLD_ID}_DEU`);
    const battalion = region.objects.find((o: any) => o.type === 'battalion');
    expect(battalion).toBeDefined();
    expect(battalion.name).toBe('1-й гвардейский');
    expect(typeof battalion.lat).toBe('number');
    expect(typeof battalion.lng).toBe('number');
    // Координаты — центроид квадрата ФРГ (lng 10..20, lat 40..50)
    expect(battalion.lng).toBeGreaterThanOrEqual(10);
    expect(battalion.lng).toBeLessThanOrEqual(20);
    expect(battalion.lat).toBeGreaterThanOrEqual(40);
    expect(battalion.lat).toBeLessThanOrEqual(50);

    // Персистенс: батальон доехал до БД
    const dbRegion = worldRepository.getRegions(WORLD_ID).find((r: any) => r.id === `${WORLD_ID}_DEU`);
    expect(dbRegion.objects.some((o: any) => o.type === 'battalion' && o.name === '1-й гвардейский')).toBe(true);
  });

  it('move_battalion перемещает батальон в целевой регион по имени, id приоритетнее имени', async () => {
    const { session } = createGame();

    (session as any).applyMapChanges([
      { type: 'spawn_battalion', regionName: 'ФРГ', feature: { type: 'battalion', name: '2-й танковый' } },
    ]);
    const deu = session.getRegion(`${WORLD_ID}_DEU`);
    const spawned = deu.objects.find((o: any) => o.name === '2-й танковый');
    expect(spawned).toBeDefined();
    expect(spawned.type).toBe('battalion');

    // Перемещение ПО ИМЕИ батальона (id не передан)
    (session as any).applyMapChanges([
      { type: 'move_battalion', regionName: 'ФРГ', targetRegionName: 'Польша', feature: { type: 'battalion', name: '2-й танковый' } },
    ]);
    expect(session.getRegion(`${WORLD_ID}_DEU`).objects.some((o: any) => o.name === '2-й танковый')).toBe(false);
    const pol = session.getRegion(`${WORLD_ID}_POL`);
    const moved = pol.objects.find((o: any) => o.name === '2-й танковый');
    expect(moved).toBeDefined();
    expect(moved.type).toBe('battalion');
    // Тот же объект, а не пересозданный
    expect(moved.id).toBe(spawned.id);
    // Координаты обновились под центроид Польши (lng 30..40, lat 40..50)
    expect(moved.lng).toBeGreaterThanOrEqual(30);
    expect(moved.lng).toBeLessThanOrEqual(40);
    expect(moved.lat).toBeGreaterThanOrEqual(40);
    expect(moved.lat).toBeLessThanOrEqual(50);

    // Обратно — ПО ID (имя заведомо неверное: id должен победить)
    (session as any).applyMapChanges([
      { type: 'move_battalion', regionName: 'Польша', targetRegionName: 'ФРГ', feature: { type: 'battalion', id: spawned.id, name: 'несуществующее имя' } },
    ]);
    expect(session.getRegion(`${WORLD_ID}_POL`).objects.some((o: any) => o.name === '2-й танковый')).toBe(false);
    expect(session.getRegion(`${WORLD_ID}_DEU`).objects.some((o: any) => o.id === spawned.id)).toBe(true);

    // Персистенс перемещения
    await session.syncRegionsToDB();
    const dbDeu = worldRepository.getRegions(WORLD_ID).find((r: any) => r.id === `${WORLD_ID}_DEU`);
    const dbPol = worldRepository.getRegions(WORLD_ID).find((r: any) => r.id === `${WORLD_ID}_POL`);
    expect(dbDeu.objects.some((o: any) => o.id === spawned.id)).toBe(true);
    expect(dbPol.objects.some((o: any) => o.id === spawned.id)).toBe(false);
  });
});
