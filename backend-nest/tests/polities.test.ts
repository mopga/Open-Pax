/**
 * M3: регионы мельче стран и реестр государств.
 *   - buildRegionWorld: государства пресета и фоновые, polity_members,
 *     столица в своём регионе, соседство;
 *   - операции симуляции над государствами (transfer к новому, update_polity,
 *     create_polity, dissolve_polity) и перекраска регионов;
 *   - реестр переживает сейв/лоад/rewind; старые миры без реестра работают;
 *   - промпты получают имя государства и все его регионы.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

const TEST_DB = path.join(os.tmpdir(), `open-pax-polities-${process.pid}-${Date.now()}.db`);
process.env.OPEN_PAX_DB_PATH = TEST_DB;

import { buildRegionWorld, pointInGeometry, type RegionFeature } from '../src/utils/region-world';

let db: any;
let worldRepository: any;
let getSessionRegistry: any;

/** Ответ «LLM» на прыжок — задаётся в каждом тесте */
let nextJump: any = null;
let lastSimulationPrompt = '';

const stubProvider: any = {
  consolidation: { startRound: 25, chunkSize: 5, keepRawTail: 10 },
  async generate(mechanic: string, system: string, user: string) {
    if (mechanic === 'converter') return { content: JSON.stringify([{ index: 1, type: 'action', text: 'Приказ' }]) };
    if (mechanic === 'jump') {
      lastSimulationPrompt = `${system}\n${user}`;
      return { content: JSON.stringify(nextJump ?? { events: [], narration: '', voided: [], worldChanges: {} }) };
    }
    return { content: '{}' };
  },
  async stream(mechanic: string, system: string, user: string, onToken: (n: number) => void) {
    const r = await this.generate(mechanic, system, user);
    onToken(r.content.length);
    return r;
  },
  clearCache() {},
};

const square = (x: number, y: number, s = 1): RegionFeature['geometry'] => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]],
});

/** Мир «как из buildRegionWorld»: две области Франции, Бельгия, Сербия и Хорватия (→ Югославия) */
function makeFeatures(): RegionFeature[] {
  const f = (id: string, iso3: string, en: string, ru: string, geometry: RegionFeature['geometry'], neighbors: string[]): RegionFeature =>
    ({ type: 'Feature', properties: { id, iso3, name: en, nameEn: en, nameRu: ru, neighbors }, geometry });
  return [
    f('FRA-1', 'FRA', 'Ile-de-France', 'Иль-де-Франс', square(2, 48), ['BEL-1', 'FRA-2']),
    f('FRA-2', 'FRA', 'Provence', 'Прованс', square(5, 43), ['FRA-1']),
    f('BEL-1', 'BEL', 'Belgium', 'Бельгия', square(4, 50), ['FRA-1']),
    f('SRB-1', 'SRB', 'Serbia', 'Сербия', square(20, 44), ['HRV-1']),
    f('HRV-1', 'HRV', 'Croatia', 'Хорватия', square(16, 45), ['SRB-1']),
  ];
}

beforeAll(async () => {
  const dbModule = await import('../src/database');
  db = dbModule.default;
  dbModule.initDatabase();
  worldRepository = (await import('../src/repositories')).worldRepository;
  const registry = await import('../src/session-registry');
  registry.initSessionRegistry(stubProvider);
  getSessionRegistry = registry.getSessionRegistry;
});

afterAll(() => {
  try {
    db?.close();
    for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(TEST_DB + suffix)) fs.rmSync(TEST_DB + suffix);
  } catch { /* tmp */ }
});

let idCounter = 0;
function createRegionWorld(worldId: string) {
  const built = buildRegionWorld({
    worldId,
    features: makeFeatures(),
    polities: new Map([
      ['FRA', { name: 'France', color: '#4466aa' }],
      ['YUG', { name: 'Yugoslavia', color: '#aa4444' }],
    ]),
    memberOf: { SRB: 'YUG', HRV: 'YUG' },
    fallbackPolity: code => ({ name: code === 'BEL' ? 'Belgium' : code, color: '#448844' }),
    capitals: { FRA: { capital: 'Paris', lat: 48.5, lng: 2.5 } },
    russianNames: false,
    makeId: () => `obj${++idCounter}`,
  });
  worldRepository.createWithRegions(
    { id: worldId, name: 'Regions', description: '', startDate: '1951-01-01', basePrompt: 'Лор', historicalAccuracy: 0.8 },
    built.regions,
    built.polities,
  );
  return built;
}

describe('buildRegionWorld', () => {
  it('государства из пресета, фоновые и составные; цвет региона — цвет владельца', () => {
    const built = createRegionWorld('rw_build');
    const owners = Object.fromEntries(built.regions.map(r => [r.id, r.owner]));
    expect(owners['rw_build_SRB-1']).toBe('YUG');
    expect(owners['rw_build_HRV-1']).toBe('YUG');
    expect(owners['rw_build_BEL-1']).toBe('BEL');
    expect(built.polities.map(p => p.id).sort()).toEqual(['BEL', 'FRA', 'YUG']);
    expect(built.regions.find(r => r.id === 'rw_build_HRV-1')!.color).toBe('#aa4444');
    expect(built.regions.find(r => r.id === 'rw_build_FRA-1')!.borders).toEqual(['rw_build_BEL-1', 'rw_build_FRA-2']);
  });

  it('столица — в регионе, где лежит её точка; домашний регион — он же', () => {
    const built = createRegionWorld('rw_cap');
    expect(built.homeRegion.FRA).toBe('rw_cap_FRA-1');
    expect(built.regions.find(r => r.id === 'rw_cap_FRA-1')!.objects[0]).toMatchObject({ type: 'capital', name: 'Paris' });
    expect(built.regions.find(r => r.id === 'rw_cap_FRA-2')!.objects).toEqual([]);
  });

  it('столица вне всех полигонов (упрощённый берег) — ближайший регион', () => {
    const built = buildRegionWorld({
      worldId: 'rw_coast',
      features: makeFeatures(),
      polities: new Map(),
      memberOf: {},
      fallbackPolity: code => ({ name: code, color: '#448844' }),
      // Чуть южнее Прованса (FRA-2: квадрат 5..6 × 43..44), в море
      capitals: { FRA: { capital: 'Marseille', lat: 42.9, lng: 5.4 } },
      russianNames: false,
      makeId: () => `obj${++idCounter}`,
    });
    expect(built.homeRegion.FRA).toBe('rw_coast_FRA-2');
  });

  it('pointInGeometry', () => {
    expect(pointInGeometry(2.5, 48.5, square(2, 48))).toBe(true);
    expect(pointInGeometry(9, 9, square(2, 48))).toBe(false);
  });
});

describe('Реестр государств в игре', () => {
  async function play(worldId: string, jump: any) {
    const { session } = getSessionRegistry().createSession(worldId, 'Player', `${worldId}_FRA-1`, '#FF0000');
    nextJump = jump;
    session.queueAction('Приказ');
    await session.processNextAction(30);
    return session;
  }
  const region = (session: any, id: string) => session.getRegion(id);
  const polity = (session: any, id: string) => session.getPolities().find((p: any) => p.id === id);

  it('промпт видит имя государства и все его регионы', async () => {
    createRegionWorld('rw_prompt');
    await play('rw_prompt', { events: [], narration: 'Тихо.', voided: [], worldChanges: {} });
    expect(lastSimulationPrompt).toContain('Полития "France" [FRA]');
    expect(lastSimulationPrompt).toContain('Полития "Yugoslavia" [YUG]');
    expect(lastSimulationPrompt).toMatch(/Ile-de-France, Provence|Provence, Ile-de-France/);
  });

  it('transfer к новому государству создаёт его; update_polity переименовывает и перекрашивает', async () => {
    createRegionWorld('rw_ops');
    const session = await play('rw_ops', {
      events: [
        {
          headline: 'Хорватия провозгласила независимость', description: '…', date: '1951-01-10',
          mapChanges: [{ type: 'transfer', regionName: 'Croatia', newOwner: 'Republic of Croatia', newColor: '#123456' }],
        },
        {
          headline: 'Югославия стала федерацией', description: '…', date: '1951-01-20',
          mapChanges: [{ type: 'update_polity', polityName: 'Yugoslavia', newName: 'SFR Yugoslavia', newColor: '#654321' }],
        },
      ],
      narration: '', voided: [], worldChanges: {},
    });
    expect(region(session, 'rw_ops_HRV-1')).toMatchObject({ owner: 'Republic of Croatia', color: '#123456' });
    expect(polity(session, 'Republic of Croatia')).toMatchObject({ name: 'Republic of Croatia', color: '#123456' });
    expect(polity(session, 'YUG')).toMatchObject({ name: 'SFR Yugoslavia', color: '#654321' });
    expect(region(session, 'rw_ops_SRB-1').color).toBe('#654321');
    // Реестр сохранён в БД
    expect(worldRepository.getPolities('rw_ops').find((p: any) => p.id === 'YUG').name).toBe('SFR Yugoslavia');
  });

  it('create_polity с несколькими регионами и dissolve_polity', async () => {
    createRegionWorld('rw_create');
    const session = await play('rw_create', {
      events: [
        {
          headline: 'Вишистский режим', description: '…', date: '1951-01-10',
          mapChanges: [{ type: 'create_polity', newOwner: 'Southern France', newColor: '#999900', regionName: 'Provence', regionNames: ['Belgium'] }],
        },
        {
          headline: 'Распад Югославии', description: '…', date: '1951-01-20',
          mapChanges: [{ type: 'dissolve_polity', polityName: 'Yugoslavia' }],
        },
      ],
      narration: '', voided: [], worldChanges: {},
    });
    expect(region(session, 'rw_create_FRA-2').owner).toBe('Southern France');
    expect(region(session, 'rw_create_BEL-1')).toMatchObject({ owner: 'Southern France', color: '#999900' });
    expect(region(session, 'rw_create_SRB-1').owner).toBe('neutral');
    expect(region(session, 'rw_create_HRV-1').owner).toBe('neutral');
  });

  it('реестр переживает rewind', async () => {
    createRegionWorld('rw_rewind');
    const session = await play('rw_rewind', {
      events: [{
        headline: 'Переименование', description: '…', date: '1951-01-10',
        mapChanges: [{ type: 'update_polity', polityName: 'France', newName: 'French Union' }],
      }],
      narration: '', voided: [], worldChanges: {},
    });
    expect(polity(session, 'FRA').name).toBe('French Union');
    expect(session.rewind()).not.toBeNull();
    expect(polity(session, 'FRA').name).toBe('France');
  });

  it('старый мир без реестра: государства выводятся из регионов', async () => {
    worldRepository.createWithRegions(
      { id: 'legacy_w', name: 'Legacy', description: '', startDate: '1951-01-01', basePrompt: '', historicalAccuracy: 0.8 },
      [
        { id: 'legacy_w_FRA', name: 'France', color: '#4466aa', owner: 'FRA' },
        { id: 'legacy_w_BEL', name: 'Belgium', color: '#448844', owner: 'BEL' },
      ],
    );
    const { session } = getSessionRegistry().createSession('legacy_w', 'Player', 'legacy_w_FRA', '#FF0000');
    nextJump = {
      events: [{ headline: 'Аннексия', description: '…', date: '1951-01-10', mapChanges: [{ type: 'transfer', regionName: 'Belgium', newOwner: 'France' }] }],
      narration: '', voided: [], worldChanges: {},
    };
    session.queueAction('Приказ');
    await session.processNextAction(30);
    expect(session.getRegion('legacy_w_BEL')).toMatchObject({ owner: 'FRA', color: '#4466aa' });
    expect(session.getPolities().map((p: any) => p.name).sort()).toEqual(['Belgium', 'France']);
  });
});
