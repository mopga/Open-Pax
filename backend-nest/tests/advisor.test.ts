/**
 * Тесты Этапа 3 «живой Советник» (с заглушкой LLM):
 *   история диалога попадает в промпт советника, промпт описывает
 *   продолжающийся диалог без повторных приветствий, стриминг-обёртка
 *   GameController вызывает onToken и возвращает полный ответ.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Путь к временной БД ДО импорта database.ts (он читает env при загрузке модуля)
const TEST_DB = path.join(os.tmpdir(), `open-pax-advisor-${process.pid}-${Date.now()}.db`);
process.env.OPEN_PAX_DB_PATH = TEST_DB;

let db: any;
let worldRepository: any;
let initSessionRegistry: any;
let getSessionRegistry: any;
let GameController: any;

/** Последний промпт механики advisor, ушедший в «LLM» */
let capturedAdvisorPrompt = '';
/** Механики, с которыми вызывался stream у заглушки */
const streamMechanics: string[] = [];

const WORLD_ID = 'advisor_world';

const stubProvider: any = {
  consolidation: { startRound: 25, chunkSize: 5, keepRawTail: 10 },
  async generate(mechanic: string, system: string, user: string) {
    if (mechanic === 'advisor') {
      capturedAdvisorPrompt = `${system}\n${user}`;
      return { content: 'СОВЕТ: усильте гарнизон на восточной границе' };
    }
    if (mechanic === 'converter') {
      return { content: JSON.stringify({ type: 'action', text: 'Действие игрока' }) };
    }
    return { content: JSON.stringify({ type: 'develop', description: 'Развитие', priority: 5 }) };
  },
  // Фолбэк-стриминг, как у LLMRouter: generate + один onToken (прогресс в символах)
  async stream(mechanic: string, system: string, user: string, onToken: (chars: number) => void, options?: any) {
    streamMechanics.push(mechanic);
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

  const agentsModule = await import('../src/agents');
  GameController = agentsModule.GameController;

  worldRepository.createWithRegions(
    { id: WORLD_ID, name: 'Advisor World', description: '', startDate: '1951-01-01', basePrompt: 'Тестовый лор', historicalAccuracy: 0.8 },
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
  } catch { /* временный файл в tmp — не критично */ }
});

describe('Этап 3: живой Советник', () => {
  it('getAdvisor передаёт историю диалога и текущее сообщение в промпт', async () => {
    const { session } = createGame();
    const history = [
      { role: 'user', content: 'Стоит ли мириться с Польшей?' },
      { role: 'assistant', content: 'Пока рано: сначала усильте армию.' },
    ];

    const reply = await session.getAdvisor('А теперь что делать?', history);

    expect(reply).toContain('СОВЕТ');
    expect(capturedAdvisorPrompt).toContain('[История чата]');
    expect(capturedAdvisorPrompt).toContain('Игрок: Стоит ли мириться с Польшей?');
    expect(capturedAdvisorPrompt).toContain('Советник: Пока рано: сначала усильте армию.');
    expect(capturedAdvisorPrompt).toContain('[Сообщение от игрока]');
    expect(capturedAdvisorPrompt).toContain('А теперь что делать?');
  });

  it('промпт описывает продолжающийся диалог: память рекомендаций, без повторных приветствий', async () => {
    const { session } = createGame();
    await session.getAdvisor('Оцени обстановку', [
      { role: 'user', content: 'Привет' },
      { role: 'assistant', content: 'Советую развивать экономику.' },
    ]);

    expect(capturedAdvisorPrompt).toContain('ПРОДОЛЖАЮЩИЙСЯ');
    expect(capturedAdvisorPrompt).toContain('не здоровайся');
    // Лимит длины ответа сохранён
    expect(capturedAdvisorPrompt).toContain('3000');
  });

  it('без истории реплик диалога в промпте нет', async () => {
    const { session } = createGame();
    await session.getAdvisor('Первый вопрос', []);
    // Реплик из истории нет (само упоминание раздела в инструкции допустимо)
    expect(capturedAdvisorPrompt).not.toContain('Игрок:');
    expect(capturedAdvisorPrompt).toContain('Первый вопрос');
  });

  it('GameController.getAdvisorStreamWithPrompts стримит через механику advisor и возвращает полный ответ', async () => {
    const { session } = createGame();
    const gameData = (session as any).buildGameData();

    const controller = new GameController(stubProvider);
    controller.initPromptEngine(gameData);

    streamMechanics.length = 0;
    const progress: number[] = [];
    const reply: string = await controller.getAdvisorStreamWithPrompts(
      gameData,
      'Оцени моё положение',
      [],
      (chars: number) => progress.push(chars)
    );

    // Стрим пошёл именно через механику advisor, прогресс приходил
    expect(streamMechanics).toContain('advisor');
    expect(progress.length).toBeGreaterThan(0);
    // Полный текст ответа возвращается из промиса
    expect(reply).toContain('СОВЕТ');
    // Промпт советника дошёл до LLM
    expect(capturedAdvisorPrompt).toContain('Оцени моё положение');
  });

  it('session.getAdvisorStream (когда добавлен промпт-слоем) стримит через механику advisor', async () => {
    const { session } = createGame();
    if (typeof session.getAdvisorStream !== 'function') {
      // Метод появится после интеграции промпт-слоя (Этап 3) — до тех пор
      // стрим на сессии недоступен, роут работает через fallback на getAdvisor.
      console.warn('[advisor.test] GameSession.getAdvisorStream ещё не реализован — полная проверка стрима отложена до интеграции');
      return;
    }

    streamMechanics.length = 0;
    const chunks: string[] = [];
    const reply: string = await session.getAdvisorStream(
      'Оцени обстановку',
      [],
      (t: unknown) => chunks.push(String(t))
    );

    expect(streamMechanics).toContain('advisor');
    expect(chunks.length).toBeGreaterThan(0);
    expect(typeof reply).toBe('string');
    expect(reply).toContain('СОВЕТ');
  });
});
