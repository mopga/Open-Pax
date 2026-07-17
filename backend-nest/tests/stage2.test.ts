/**
 * Интеграционные тесты Этапа 2 (с заглушкой LLM):
 *   voided-действия попадают в ленту, rewind откатывает ход,
 *   Intervene обрывает пачку событий, консолидация истории,
 *   сложность доезжает до промпта, auto-jump берёт дату из targetDate.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

const TEST_DB = path.join(os.tmpdir(), `open-pax-stage2-${process.pid}-${Date.now()}.db`);
process.env.OPEN_PAX_DB_PATH = TEST_DB;

let db: any;
let worldRepository: any;
let initSessionRegistry: any;
let getSessionRegistry: any;

/** Последний промпт симуляции, ушедший в «LLM» */
let capturedPrompt = '';
/** Счётчик вызовов механики consolidation */
let consolidationCalls = 0;
/** Режим ответа заглушки на механику jump */
let jumpMode: 'normal' | 'voided' | 'auto' | 'intervene' = 'normal';

const WORLD_ID = 'stage2_world';

function jumpResponse(): any {
  switch (jumpMode) {
    case 'voided':
      return {
        events: [],
        narration: 'Советники отговорили правительство от безумной затеи.',
        voided: [{ action: 'Захватить весь мир за неделю', reason: 'Нереалистично для 1951 года' }],
        startChat: [],
        worldChanges: { regionOwners: {}, regionColors: {} },
      };
    case 'auto':
      return {
        events: [
          { headline: 'Подписан важный договор', description: 'Итог месяцев переговоров.', date: '1951-03-10', mapChanges: [] },
        ],
        narration: 'Время шло до значимого события.',
        voided: [],
        startChat: [],
        worldChanges: { regionOwners: {}, regionColors: {} },
        targetDate: '1951-03-10',
      };
    case 'intervene':
      return {
        events: [
          { headline: 'ФРГ аннексировала Польшу', description: 'Первое событие.', date: '1951-02-01', mapChanges: [{ type: 'transfer', regionName: 'Польша', newOwner: 'ФРГ' }] },
          { headline: 'ФРГ аннексировала Чехословакию', description: 'Второе событие.', date: '1951-02-10', mapChanges: [{ type: 'transfer', regionName: 'Чехословакия', newOwner: 'ФРГ' }] },
          { headline: 'ФРГ аннексировала Францию', description: 'Третье событие.', date: '1951-02-20', mapChanges: [{ type: 'transfer', regionName: 'Франция', newOwner: 'ФРГ' }] },
        ],
        narration: 'Стремительная экспансия.',
        voided: [],
        startChat: [],
        // Итоговые worldChanges при Intervene применяться НЕ должны
        worldChanges: { regionOwners: { 'Великобритания': 'ФРГ' }, regionColors: {} },
      };
    default:
      return {
        events: [
          { headline: 'Польша капитулировала', description: 'Короткая кампания.', date: '1951-01-20', mapChanges: [{ type: 'transfer', regionName: 'Польша', newOwner: 'ФРГ' }] },
        ],
        narration: 'Польша пала.',
        voided: [],
        startChat: [],
        worldChanges: { regionOwners: {}, regionColors: {} },
      };
  }
}

const stubProvider: any = {
  consolidation: { startRound: 25, chunkSize: 5, keepRawTail: 10 },
  async generate(mechanic: string, system: string, user: string) {
    if (mechanic === 'converter') {
      return { content: JSON.stringify({ type: 'action', text: 'Действие игрока' }) };
    }
    if (mechanic === 'consolidation') {
      consolidationCalls++;
      return { content: 'КОНСПЕКТ: сжатая история первых раундов' };
    }
    if (mechanic === 'jump') {
      capturedPrompt = `${system}\n${user}`;
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

function createGame(difficulty?: string): { gameId: string; session: any } {
  const created = getSessionRegistry().createSession(WORLD_ID, 'Player', `${WORLD_ID}_DEU`, '#FF0000', difficulty);
  return created;
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
    { id: WORLD_ID, name: 'Stage2 World', description: '', startDate: '1951-01-01', basePrompt: 'Тестовый лор', historicalAccuracy: 0.8 },
    [
      { id: `${WORLD_ID}_DEU`, name: 'ФРГ', color: '#FF0000', owner: 'DEU', population: 5000000, gdp: 200, militaryPower: 300, flag: 'DEU' },
      { id: `${WORLD_ID}_POL`, name: 'Польша', color: '#00FF00', owner: 'POL', population: 3000000, gdp: 100, militaryPower: 100, flag: 'POL' },
      { id: `${WORLD_ID}_CZE`, name: 'Чехословакия', color: '#0000FF', owner: 'CZE', population: 2000000, gdp: 90, militaryPower: 80, flag: 'CZE' },
      { id: `${WORLD_ID}_FRA`, name: 'Франция', color: '#FFFF00', owner: 'FRA', population: 4000000, gdp: 180, militaryPower: 200, flag: 'FRA' },
      { id: `${WORLD_ID}_GBR`, name: 'Великобритания', color: '#FF00FF', owner: 'GBR', population: 4500000, gdp: 190, militaryPower: 250, flag: 'GBR' },
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

describe('Этап 2: voided-действия', () => {
  it('отклонённое симуляцией действие попадает в ленту с пометкой', async () => {
    jumpMode = 'voided';
    const { session } = createGame();
    session.queueAction('Захватить весь мир за неделю');
    const action = await session.processNextAction(30);

    expect(action.status).toBe('completed');
    const events = action.result.events as string[];
    expect(events.some(e => e.includes('⊘ Отклонено') && e.includes('Захватить весь мир за неделю'))).toBe(true);
    expect(events.some(e => e.includes('Нереалистично для 1951 года'))).toBe(true);
    jumpMode = 'normal';
  });
});

describe('Этап 2: rewind', () => {
  it('откат возвращает владельцев, дату и ход; повторный откат невозможен', async () => {
    jumpMode = 'normal';
    const { gameId, session } = createGame();
    const dateBefore = session.getCurrentDate();
    const turnBefore = session.getCurrentTurn();

    session.queueAction('Атаковать Польшу');
    await session.processNextAction(30);

    // Ход применился
    expect(session.getRegion(`${WORLD_ID}_POL`).owner).toBe('DEU');
    expect(session.getCurrentDate()).not.toBe(dateBefore);
    expect(session.canRewind()).toBe(true);

    const rewound = session.rewind();
    expect(rewound).not.toBeNull();
    expect(rewound.date).toBe(dateBefore);
    expect(rewound.turn).toBe(turnBefore);
    expect(session.getRegion(`${WORLD_ID}_POL`).owner).toBe('POL');
    expect(session.getCurrentDate()).toBe(dateBefore);
    expect(session.getCurrentTurn()).toBe(turnBefore);

    // Записи откаченного хода вычищены из БД
    const actions = db.prepare('SELECT COUNT(*) AS n FROM actions WHERE game_id = ?').get(gameId);
    const results = db.prepare('SELECT COUNT(*) AS n FROM turn_results WHERE game_id = ?').get(gameId);
    expect(actions.n).toBe(0);
    expect(results.n).toBe(0);

    // Снапшот потреблён — второй откат подряд невозможен
    expect(session.canRewind()).toBe(false);
    expect(session.rewind()).toBeNull();
  });
});

describe('Этап 2: Intervene', () => {
  it('обрывает пачку: применяется только первое событие, worldChanges игнорируются, дата — по последнему событию', async () => {
    jumpMode = 'intervene';
    const { session } = createGame();

    // Фейковый SSE-канал: на первом событии жмём Intervene (и включаем паузы между событиями)
    session.setSSEBroadcaster((type: string, data: any) => {
      if (type === 'jump_event' && data.index === 0) session.requestIntervene();
    });

    session.queueAction('Экспансия на запад');
    const action = await session.processNextAction(30);
    expect(action.status).toBe('completed');

    // Первое событие применилось, остальные — нет
    expect(session.getRegion(`${WORLD_ID}_POL`).owner).toBe('DEU');
    expect(session.getRegion(`${WORLD_ID}_CZE`).owner).toBe('CZE');
    expect(session.getRegion(`${WORLD_ID}_FRA`).owner).toBe('FRA');
    // Итоговые worldChanges при Intervene не применяются
    expect(session.getRegion(`${WORLD_ID}_GBR`).owner).toBe('GBR');

    // Дата — по последнему ПРИМЕНЁННОМУ событию, а не +30 дней
    expect(session.getCurrentDate()).toBe('1951-02-01');

    const events = action.result.events as string[];
    expect(events).toContain('ФРГ аннексировала Польшу');
    expect(events).not.toContain('ФРГ аннексировала Францию');
    expect(events.some(e => e.includes('Intervene'))).toBe(true);
    jumpMode = 'normal';
  });
});

describe('Этап 2: auto-jump «к следующему событию»', () => {
  it('дата берётся из targetDate ответа LLM, а не +365 дней', async () => {
    jumpMode = 'auto';
    const { session } = createGame();
    session.queueAction('Ждать важных новостей');
    await session.processNextAction(0); // jumpDays <= 0 — auto-режим

    expect(session.getCurrentDate()).toBe('1951-03-10');
    jumpMode = 'normal';
  });
});

describe('Этап 2: сложность', () => {
  it('блок сложности доезжает до промпта симуляции', async () => {
    const { session } = createGame('hard');
    session.queueAction('Обычное действие');
    await session.processNextAction(30);
    expect(capturedPrompt).toContain('Сложность: Сложно');
  });

  it('без явной сложности — Обычная', async () => {
    const { session } = createGame();
    session.queueAction('Обычное действие');
    await session.processNextAction(30);
    expect(capturedPrompt).toContain('Сложность: Обычная');
  });

  it('мусорная сложность нормализуется в Обычную', async () => {
    const { session } = createGame('impossible-mode');
    session.queueAction('Обычное действие');
    await session.processNextAction(30);
    expect(capturedPrompt).toContain('Сложность: Обычная');
  });
});

describe('Этап 2: консолидация истории', () => {
  it('сжимает старые раунды через LLM и персистит результат; повтор без новых раундов — no-op', async () => {
    const { gameId, session } = createGame();

    // Симулируем 26 прожитых раундов без реальных ходов
    (session as any).currentTurn = 27;
    (session as any).results = Array.from({ length: 26 }, (_, i) => ({
      id: `r${i + 1}`,
      turn: i + 1,
      narration: `Раунд ${i + 1}: что-то произошло`,
      countryResponse: '',
      events: [],
    }));
    (session as any).consolidatedUpTo = 0;
    (session as any).consolidatedHistory = '';

    consolidationCalls = 0;
    await (session as any).maybeConsolidate();

    expect(consolidationCalls).toBe(1);
    expect((session as any).consolidatedHistory).toContain('КОНСПЕКТ');
    expect((session as any).consolidatedUpTo).toBe(26);

    const row = db.prepare('SELECT consolidated_history, consolidated_up_to FROM games WHERE id = ?').get(gameId);
    expect(row.consolidated_history).toContain('КОНСПЕКТ');
    expect(row.consolidated_up_to).toBe(26);

    // Новых раундов нет — повторный вызов ничего не делает
    await (session as any).maybeConsolidate();
    expect(consolidationCalls).toBe(1);
  });

  it('до startRound консолидация не запускается', async () => {
    const { session } = createGame();
    (session as any).currentTurn = 10;
    (session as any).results = Array.from({ length: 9 }, (_, i) => ({
      id: `x${i}`, turn: i + 1, narration: 'n', countryResponse: '', events: [],
    }));
    (session as any).consolidatedUpTo = 0;

    consolidationCalls = 0;
    await (session as any).maybeConsolidate();
    expect(consolidationCalls).toBe(0);
  });
});
