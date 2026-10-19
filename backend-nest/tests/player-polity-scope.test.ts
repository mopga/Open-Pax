/**
 * Scope-контракт для политии игрока (регрессия):
 *   Given player_country Germany
 *   When игрок отдаёт действие Германии
 *   Then прямые действия Германии разрешены;
 *        реакции других стран (simulation/event) разрешены;
 *        модель не создаёт player actions от их имени.
 *
 * Отдельно фиксируется, что это НЕ неприкосновенность территорий: события
 * других политий вправе отбирать/оккупировать регионы игрока (mapChanges
 * transfer региона игрока применяется), т.к. запрет касается только
 * *инициативы* политии игрока, а не целостности её территории.
 *
 * Гарантии (детерминированные, проверяются здесь):
 *   G1. Приказы игрока доходят до симуляции как его приказы.
 *   G2. Число конвертированных действий равно числу приказов игрока:
 *       лишние элементы ответа конвертера НЕ становятся приказами игрока.
 *   G3. В историю/БД попадают только исходные тексты игрока, а не текст,
 *       сгенерированный моделью (в т.ч. от имени другой страны).
 *   G4. Пропущенный конвертером приказ не теряется — падает на текст игрока.
 *   G5. Реакция другой политии (event/mapChanges) применяется к карте.
 *   G6. Fail-closed для mixed-ответа: элемент без валидного index (или с
 *       нестроковым text) НЕ подставляется на позицию приказа игрока — слот
 *       падает на исходный текст игрока.
 *
 * ВАЖНО — что эти гарантии НЕ означают: нормализация числа в `index` не даёт
 * семантической гарантии субъекта. Элемент с корректным `index` всё ещё может
 * содержать в `text` чужой приказ, и выравнивание по index — лишь prompt guard
 * (адресная подсказка модели + детерминированная обрезка лишнего), а не
 * семантическая проверка авторства. Смысловой контроль субъекта — зона
 * симуляции/промпта, а не этой функции.
 * Prompt-инструкции (недетерминированные, проверяется только наличие текста)
 *   вынесены в последний describe — они не являются гарантией поведения модели.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

const TEST_DB = path.join(os.tmpdir(), `open-pax-polity-scope-${process.pid}-${Date.now()}.db`);
process.env.OPEN_PAX_DB_PATH = TEST_DB;

let db: any;
let worldRepository: any;
let initSessionRegistry: any;
let getSessionRegistry: any;
let parseBatchConverterResponse: any;
let buildBatchConverterPrompt: any;
let buildSimulationPrompt: any;
let PromptEngine: any;

let worldSeq = 0;
const WORLD_PREFIX = 'polity_scope_world';

/** Ответ конвертера на батч-запрос (управляется тестом) */
let batchConverterResponse: any = null;
/** Захваченный user-промпт симуляции */
let capturedSimPrompt = '';
/** Механики, с которыми движок обращался к «LLM» */
const seenMechanics: string[] = [];

const SCOPE_LINE = 'Все действия принадлежат политии игрока';

const stubProvider: any = {
  consolidation: { startRound: 25, chunkSize: 5, keepRawTail: 10 },
  async generate(mechanic: string, system: string, user: string) {
    seenMechanics.push(mechanic);
    if (mechanic === 'converter') {
      // Батч-промпт отличается заголовком списка приказов.
      if (user.includes('Действия игрока для конвертации:')) {
        return { content: JSON.stringify(batchConverterResponse) };
      }
      return { content: JSON.stringify({ type: 'action', text: 'ФРГ уточняет приказ по линии ведомств' }) };
    }
    if (mechanic === 'jump') {
      capturedSimPrompt = `${system}\n${user}`;
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

/** Ответ симуляции (управляется тестом) */
let simEvents: any[] = [];
let simWorldChanges: any = { regionOwners: {}, regionColors: {} };
function jumpResponse(): any {
  return {
    events: simEvents,
    narration: 'Мир изменился.',
    voided: [],
    startChat: [],
    worldChanges: simWorldChanges,
  };
}

/** Отдельный мир на каждый тест — состояние регионов не утекает между тестами. */
function makeWorld(): string {
  const wid = `${WORLD_PREFIX}_${++worldSeq}`;
  worldRepository.createWithRegions(
    {
      id: wid,
      name: 'Scope World',
      description: '',
      startDate: '1951-01-01',
      basePrompt: 'Тестовый лор: ФРГ и её соседи',
      historicalAccuracy: 0.8,
    },
    [
      { id: `${wid}_DEU`, name: 'ФРГ', color: '#FF0000', owner: 'DEU', population: 5000000, gdp: 200, militaryPower: 300, flag: 'DEU' },
      { id: `${wid}_POL`, name: 'Польша', color: '#00FF00', owner: 'POL', population: 3000000, gdp: 100, militaryPower: 100, flag: 'POL' },
      { id: `${wid}_CZE`, name: 'Чехословакия', color: '#0000FF', owner: 'CZE', population: 2000000, gdp: 90, militaryPower: 80, flag: 'CZE' },
    ]
  );
  return wid;
}

function createGame(): { wid: string; gameId: string; session: any } {
  const wid = makeWorld();
  const created = getSessionRegistry().createSession(wid, 'Player', `${wid}_DEU`, '#FF0000');
  return { wid, gameId: created.gameId, session: created.session };
}

function actionRows(gameId: string): any[] {
  return db.prepare('SELECT text, turn FROM actions WHERE game_id = ? ORDER BY rowid').all(gameId);
}

/** Секция [Действия игрока] промпта симуляции — что реально ушло в мир */
function playerActionsSection(prompt: string): string {
  const start = prompt.indexOf('Действия игрока в этом раунде:');
  const end = prompt.indexOf('[Все прошлые действия]');
  if (start === -1) return '';
  return prompt.slice(start, end === -1 ? undefined : end);
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

  const converterModule = await import('../src/prompts/converter');
  parseBatchConverterResponse = converterModule.parseBatchConverterResponse;
  buildBatchConverterPrompt = converterModule.buildBatchConverterPrompt;

  const simulationModule = await import('../src/prompts/simulation');
  buildSimulationPrompt = simulationModule.buildSimulationPrompt;

  const pbModule = await import('../src/prompt-builder');
  PromptEngine = pbModule.PromptEngine;

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
  } catch {
    /* временный файл в tmp — не критично */
  }
});

describe('Given player_country=Германия: прямые действия Германии разрешены', () => {
  it('G1: приказ игрока-Германии доходит до мировой симуляции и записан в историю', async () => {
    simEvents = [];
    simWorldChanges = { regionOwners: {}, regionColors: {} };
    batchConverterResponse = null;

    const { wid, gameId, session } = createGame();
    session.queueAction('Мобилизовать промышленность Рейнланда и Рура');

    const action = await session.processNextAction(30);

    expect(action.status).toBe('completed');
    // Симуляция получила именно приказ игрока-Германии
    const section = playerActionsSection(capturedSimPrompt);
    expect(section).toContain('ФРГ уточняет приказ по линии ведомств');
    // Полития игрока помечена как игрок, а не как «Player Polity»
    expect(capturedSimPrompt).toContain('Полития "ФРГ" [DEU] (ИГРОК)');
    // Результат хода — ответ страны, а не пустота
    expect(action.result.countryResponse).toContain('ФРГ уточняет приказ по линии ведомств');

    // G3: в БД — исходный текст игрока, модельный текст приказом не стал
    const rows = actionRows(gameId);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('Мобилизовать промышленность Рейнланда и Рура');
    expect(session.getRegion(`${wid}_DEU`).owner).toBe('DEU');
  });
});

describe('Then реакция другой страны (event) разрешена, включая потерю региона игрока', () => {
  it('G5: событие другой политии отбирает регион игрока — территориальной неприкосновенности нет', async () => {
    batchConverterResponse = null;
    simEvents = [
      {
        headline: 'Польша вторгается в восточные земли ФРГ',
        description: 'Польские дивизии занимают приграничные районы.',
        date: '1951-01-15',
        kind: 'independent',
        mapChanges: [{ type: 'transfer', regionName: 'ФРГ', newOwner: 'Польша' }],
      },
    ];
    simWorldChanges = { regionOwners: {}, regionColors: {} };

    const { wid, gameId, session } = createGame();
    session.queueAction('Укрепить оборону Эльбы');
    const action = await session.processNextAction(30);

    expect(action.status).toBe('completed');
    // Регион игрока перешёл к другой политии — событие применилось
    const germanRegion = session.getRegion(`${wid}_DEU`);
    expect(germanRegion.owner).toBe('POL');
    // Событие другой страны попало в ленту хода
    const results = session.getResults();
    expect(results[0].events).toContain('Польша вторгается в восточные земли ФРГ');
    // При этом приказ игрока не «переписан» под чужую страну
    const rows = actionRows(gameId);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('Укрепить оборону Эльбы');
  });

  it('G5b: reaction на приказ игрока приходит событием другой страны и не становится приказом игрока', async () => {
    batchConverterResponse = null;
    simEvents = [
      {
        headline: 'Польша отвечает на мобилизацию ФРГ',
        description: 'Варшава объявляет о собственных военных приготовлениях.',
        date: '1951-01-18',
        kind: 'reaction',
        mapChanges: [],
      },
    ];
    simWorldChanges = { regionOwners: {}, regionColors: {} };

    const { gameId, session } = createGame();
    session.queueAction('Мобилизовать промышленность Рейнланда');
    const action = await session.processNextAction(30);

    expect(action.status).toBe('completed');
    const kinds = action.result.timelineEvents.map((e: any) => e.kind);
    expect(kinds).toContain('reaction');
    // Реакция другой страны — событие, а не player action
    const rows = actionRows(gameId);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('Мобилизовать промышленность Рейнланда');
    // и она не попала в секцию приказов игрока
    expect(playerActionsSection(capturedSimPrompt)).not.toContain('Варшава объявляет');
  });
});

describe('And модель не создаёт player actions от имени других стран', () => {
  it('G2: лишний элемент ответа конвертера (приказ от имени другой страны) не становится приказом игрока', async () => {
    simEvents = [];
    simWorldChanges = { regionOwners: {}, regionColors: {} };
    batchConverterResponse = [
      { index: 1, type: 'action', text: 'ФРГ укрепляет промышленность Рура' },
      { index: 2, type: 'action', text: 'ФРГ предлагает Чехословакии торговый договор' },
      { index: 3, type: 'action', text: 'Польша объявляет всеобщую мобилизацию против ФРГ' },
    ];

    const { gameId, session } = createGame();
    session.queueAction('Укрепить промышленность');
    session.queueAction('Предложить соседям торговый договор');

    const processed = await session.processAllPendingActions(30);
    expect(processed).toHaveLength(2);
    expect(processed.every((a: any) => a.status === 'completed')).toBe(true);

    const section = playerActionsSection(capturedSimPrompt);
    expect(section).toContain('ФРГ укрепляет промышленность Рура');
    expect(section).toContain('ФРГ предлагает Чехословакии торговый договор');
    // Именно это раньше утекало в симуляцию как приказ игрока
    expect(section).not.toContain('Польша объявляет всеобщую мобилизацию');

    // В историю попали только исходные приказы игрока
    const rows = actionRows(gameId);
    expect(rows.map((r: any) => r.text)).toEqual([
      'Укрепить промышленность',
      'Предложить соседям торговый договор',
    ]);
  });

  it('G4: пропущенный конвертером приказ сохраняется текстом игрока, а не исчезает', async () => {
    simEvents = [];
    simWorldChanges = { regionOwners: {}, regionColors: {} };
    batchConverterResponse = [{ index: 1, type: 'action', text: 'ФРГ укрепляет промышленность Рура' }];

    const { session } = createGame();
    session.queueAction('Укрепить промышленность');
    session.queueAction('Провести мобилизацию резервистов');

    const processed = await session.processAllPendingActions(30);
    expect(processed).toHaveLength(2);

    const section = playerActionsSection(capturedSimPrompt);
    expect(section).toContain('ФРГ укрепляет промышленность Рура');
    expect(section).toContain('Провести мобилизацию резервистов');
  });
});

describe('Unit: выравнивание батч-ответа конвертера по приказам игрока', () => {
  const ACTIONS = ['Приказ А', 'Приказ Б'];

  it('обрезает лишние элементы (в т.ч. написанные от имени другой страны)', () => {
    const text = JSON.stringify([
      { index: 1, type: 'action', text: 'A1' },
      { index: 2, type: 'action', text: 'B1' },
      { index: 3, type: 'action', text: 'Польша действует' },
    ]);
    const out = parseBatchConverterResponse(text, ACTIONS);
    expect(out).toHaveLength(2);
    expect(out.map((a: any) => a.text)).toEqual(['A1', 'B1']);
  });

  it('восстанавливает соответствие по index, а не по порядку массива', () => {
    const text = JSON.stringify([
      { index: 2, type: 'action', text: 'B1' },
      { index: 1, type: 'action', text: 'A1' },
    ]);
    const out = parseBatchConverterResponse(text, ACTIONS);
    expect(out.map((a: any) => a.text)).toEqual(['A1', 'B1']);
  });

  it('пропущенный приказ заполняется исходным текстом игрока', () => {
    const out = parseBatchConverterResponse(JSON.stringify([{ index: 1, type: 'action', text: 'A1' }]), ACTIONS);
    expect(out.map((a: any) => a.text)).toEqual(['A1', 'Приказ Б']);
  });

  it('MIXED: элемент без index НЕ подставляется на позицию приказа игрока (fail-closed)', () => {
    // Один malformed элемент раньше переключал ВЕСЬ ответ в позиционный режим:
    // чужой элемент со 2-й позиции становился приказом игрока №2.
    const text = JSON.stringify([
      { index: 1, type: 'action', text: 'A1' },
      { type: 'action', text: 'Польша объявляет мобилизацию' },
    ]);
    const out = parseBatchConverterResponse(text, ACTIONS);
    expect(out.map((a: any) => a.text)).toEqual(['A1', 'Приказ Б']);
    expect(out.map((a: any) => a.text).join(' ')).not.toContain('Польша объявляет');
  });

  it('MIXED: валидный index сохраняется, слоты без валидного index падают на текст игрока', () => {
    const text = JSON.stringify([
      { type: 'action', text: 'чужое без index' },
      { index: 2, type: 'action', text: 'B1' },
    ]);
    const out = parseBatchConverterResponse(text, ACTIONS);
    expect(out.map((a: any) => a.text)).toEqual(['Приказ А', 'B1']);
    expect(out.map((a: any) => a.text).join(' ')).not.toContain('чужое без index');
  });

  it('MIXED: невалидные index (0, отрицательный, дробный, строка, null) не отравляют весь ответ', () => {
    for (const bad of [0, -1, 1.5, 'abc', null, '', {}, []]) {
      const text = JSON.stringify([{ index: 1, type: 'action', text: 'A1' }, { index: bad, type: 'action', text: 'чужое' }]);
      const out = parseBatchConverterResponse(text, ACTIONS);
      expect(out.map((a: any) => a.text)).toEqual(['A1', 'Приказ Б']);
      expect(out.map((a: any) => a.text).join(' ')).not.toContain('чужое');
    }
  });

  it('DUPLICATE index: первый элемент выигрывает, дубликат приказом игрока не становится', () => {
    const text = JSON.stringify([
      { index: 1, type: 'action', text: 'A1' },
      { index: 2, type: 'action', text: 'B1' },
      { index: 2, type: 'action', text: 'дубль от чужой страны' },
    ]);
    const out = parseBatchConverterResponse(text, ACTIONS);
    expect(out.map((a: any) => a.text)).toEqual(['A1', 'B1']);
    expect(out.map((a: any) => a.text).join(' ')).not.toContain('дубль');
  });

  it('DUPLICATE index в mixed-ответе тоже отбрасывается, а не уезжает на свободный слот', () => {
    const text = JSON.stringify([
      { index: 2, type: 'action', text: 'B1' },
      { index: 2, type: 'action', text: 'дубль' },
      { type: 'action', text: 'чужое без index' },
    ]);
    const out = parseBatchConverterResponse(text, ACTIONS);
    expect(out.map((a: any) => a.text)).toEqual(['Приказ А', 'B1']);
  });

  it('нестроковый text не доходит до симуляции (слот падает на текст игрока)', () => {
    const text = JSON.stringify([
      { index: 1, type: 'action', text: 42 },
      { index: 2, type: 'action', text: { toString: 'evil' } },
    ]);
    const out = parseBatchConverterResponse(text, ACTIONS);
    expect(out.map((a: any) => a.text)).toEqual(['Приказ А', 'Приказ Б']);
    expect(out.every((a: any) => typeof a.text === 'string')).toBe(true);
  });

  it('нестроковый text не просачивается через PromptEngine.convertActionsBatch (граница симуляции)', async () => {
    const engine = new PromptEngine(stubProvider);
    batchConverterResponse = [
      { index: 1, type: 'action', text: ['массив вместо строки'] },
      { index: 2, type: 'action', text: 7 },
    ];
    const game: any = {
      id: 'unit-game-nonstring',
      currentDate: '1951-01-01',
      currentTurn: 1,
      world: {
        name: 'Unit',
        basePrompt: 'лор',
        startDate: '1951-01-01',
        regions: {
          u_DEU: { id: 'u_DEU', name: 'ФРГ', owner: 'DEU', color: '#FF0000', objects: [] },
          u_POL: { id: 'u_POL', name: 'Польша', owner: 'POL', color: '#00FF00', objects: [] },
        },
      },
      players: [{ id: 'p1', name: 'Player', regionId: 'u_DEU', polityId: 'DEU' }],
      playerPolityId: 'DEU',
      actions: [],
      results: [],
    };

    const out = await engine.convertActionsBatch(game, ACTIONS);
    expect(out.map((a: any) => a.text)).toEqual(['Приказ А', 'Приказ Б']);
    expect(out.every((a: any) => typeof a.text === 'string')).toBe(true);
  });

  it('полностью legacy ответ (index нет ни у кого) разбирается позиционно — с явным ограничением', () => {
    const text = JSON.stringify([
      { type: 'action', text: 'A1' },
      { type: 'action', text: 'B1' },
    ]);
    const out = parseBatchConverterResponse(text, ACTIONS);
    expect(out.map((a: any) => a.text)).toEqual(['A1', 'B1']);
  });

  it('битый ответ конвертера не приводит к потере приказов игрока', () => {
    const out = parseBatchConverterResponse('это не JSON', ACTIONS);
    expect(out.map((a: any) => a.text)).toEqual(ACTIONS);
  });

  it('без списка приказов сохраняется прежнее поведение (все элементы)', () => {
    const text = JSON.stringify([
      { type: 'action', text: 'A1' },
      { type: 'chat', text: 'B1' },
    ]);
    const out = parseBatchConverterResponse(text);
    expect(out).toHaveLength(2);
    expect(out.map((a: any) => a.type)).toEqual(['action', 'chat']);
  });

  it('PromptEngine.convertActionsBatch отдаёт ровно по одному действию на приказ', async () => {
    const engine = new PromptEngine(stubProvider);
    batchConverterResponse = [
      { index: 2, type: 'action', text: 'B1' },
      { index: 1, type: 'action', text: 'A1' },
      { index: 3, type: 'action', text: 'чужое' },
    ];
    const game: any = {
      id: 'unit-game',
      currentDate: '1951-01-01',
      currentTurn: 1,
      world: {
        name: 'Unit',
        basePrompt: 'лор',
        startDate: '1951-01-01',
        regions: {
          u_DEU: { id: 'u_DEU', name: 'ФРГ', owner: 'DEU', color: '#FF0000', objects: [] },
          u_POL: { id: 'u_POL', name: 'Польша', owner: 'POL', color: '#00FF00', objects: [] },
        },
      },
      players: [{ id: 'p1', name: 'Player', regionId: 'u_DEU', polityId: 'DEU' }],
      playerPolityId: 'DEU',
      actions: [],
      results: [],
    };

    const out = await engine.convertActionsBatch(game, ACTIONS);
    expect(out.map((a: any) => a.text)).toEqual(['A1', 'B1']);
  });
});

describe('Prompt-инструкции (недетерминированы: проверяется только наличие требования)', () => {
  it('конвертер прямо запрещает приписывать приказы другим политиям', () => {
    const prompt = buildBatchConverterPrompt({ PLAYER_POLITY: 'ФРГ' } as any, ['Приказ А', 'Приказ Б']);
    expect(prompt).toContain(SCOPE_LINE);
    expect(prompt).toContain('НЕ приписывай приказы другим политиям');
    expect(prompt).toContain('сохрани в "index"');
  });

  it('симуляция отделяет инициативу игрока от неприкосновенности его территорий', () => {
    const prompt = buildSimulationPrompt({ PLAYER_POLITY: 'ФРГ', GRAND_MAP_DESCRIPTION_NO_CITY: 'ФРГ' } as any);
    expect(prompt).toContain('НИКОГДА не выполняй действия ЗА игрока');
    expect(prompt).toContain('не делает её территории неприкосновенными');
    expect(prompt).toContain('отбирать её регионы');
  });

  it('движок не зовёт NPC-механики в обход общего jump', () => {
    expect(seenMechanics).toContain('converter');
    expect(seenMechanics).toContain('jump');
    expect(seenMechanics).not.toContain('npc');
  });
});
