/**
 * Интеграционные тесты Этапа 3 (с заглушкой LLM):
 *   дипломатические чаты — хранение сообщений, LLM-initiated startChat,
 *   транскрипты в промпте симуляции, проактивный советник.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

const TEST_DB = path.join(os.tmpdir(), `open-pax-chats-${process.pid}-${Date.now()}.db`);
process.env.OPEN_PAX_DB_PATH = TEST_DB;

let db: any;
let worldRepository: any;
let initSessionRegistry: any;
let getSessionRegistry: any;

/** Последний промпт симуляции, ушедший в «LLM» */
let capturedPrompt = '';
/** Ответ заглушки на механику chat */
let chatReply = 'Ответ Польши: мы готовы к переговорам.';
/** startChat, который вернёт симуляция */
let stubStartChat: { polityName: string; topic: string }[] = [];

const WORLD_ID = 'chats_world';

function jumpResponse(): any {
  return {
    events: [
      { headline: 'Прошёл саммит', description: 'Лидеры обсудили разрядку.', date: '1951-02-01', mapChanges: [] },
    ],
    narration: 'Напряжённый, но мирный месяц.',
    voided: [],
    startChat: stubStartChat,
    worldChanges: { regionOwners: {}, regionColors: {} },
  };
}

const stubProvider: any = {
  consolidation: { startRound: 25, chunkSize: 5, keepRawTail: 10 },
  async generate(mechanic: string, system: string, user: string) {
    if (mechanic === 'converter') {
      return { content: JSON.stringify({ type: 'action', text: 'Действие игрока' }) };
    }
    if (mechanic === 'consolidation') {
      return { content: 'КОНСПЕКТ: сжатая история первых раундов' };
    }
    if (mechanic === 'jump') {
      capturedPrompt = `${system}\n${user}`;
      return { content: JSON.stringify(jumpResponse()) };
    }
    if (mechanic === 'chat') {
      return { content: chatReply };
    }
    if (mechanic === 'advisor') {
      return { content: 'Комментарий советника к итогам периода.' };
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
    { id: WORLD_ID, name: 'Chats World', description: '', startDate: '1951-01-01', basePrompt: 'Тестовый лор', historicalAccuracy: 0.8 },
    [
      { id: `${WORLD_ID}_DEU`, name: 'ФРГ', color: '#FF0000', owner: 'DEU', population: 5000000, gdp: 200, militaryPower: 300, flag: 'DEU' },
      { id: `${WORLD_ID}_POL`, name: 'Польша', color: '#00FF00', owner: 'POL', population: 3000000, gdp: 100, militaryPower: 100, flag: 'POL' },
      { id: `${WORLD_ID}_CZE`, name: 'Чехословакия', color: '#0000FF', owner: 'CZE', population: 2000000, gdp: 90, militaryPower: 80, flag: 'CZE' },
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

describe('Этап 3: дипломатические чаты', () => {
  it('sendChatMessage сохраняет сообщение игрока и ответ политии от LLM', async () => {
    const { session } = createGame();

    const chat = session.ensureChat('Польша');
    expect(chat.polityId).toBe('POL');
    expect(chat.polityName).toBe('Польша');
    // Идемпотентность: повторный ensureChat возвращает тот же чат
    expect(session.ensureChat('Польша').id).toBe(chat.id);

    const { message, reply } = await session.sendChatMessage(chat.id, 'Предлагаем пакт о ненападении');

    expect(message.role).toBe('player');
    expect(message.content).toBe('Предлагаем пакт о ненападении');
    expect(reply.role).toBe('polity');
    expect(reply.content).toBe(chatReply);

    // Оба сообщения в истории
    const messages = session.getChatMessages(chat.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('player');
    expect(messages[1].role).toBe('polity');

    // В списке чатов видно последнее сообщение и непрочитанное
    const chats = session.getChats();
    expect(chats).toHaveLength(1);
    expect(chats[0].lastMessage).toBe(chatReply);
    expect(chats[0].unread).toBe(1);

    // Пометка прочитанными сбрасывает счётчик
    session.markChatRead(chat.id);
    expect(session.getChats()[0].unread).toBe(0);
  });

  it('ensureChat для чужой/несуществующей политии — not found', async () => {
    const { session } = createGame();
    expect(() => session.ensureChat('Атлантида')).toThrow(/not found/);
    // Чат с самим собой не создаётся
    expect(() => session.ensureChat('ФРГ')).toThrow(/not found/);
  });

  it('startChat из ответа симуляции создаёт чат, сообщение политии и SSE-событие', async () => {
    stubStartChat = [{ polityName: 'Польша', topic: 'Требуем объяснений' }];
    const { session } = createGame();

    const sseEvents: { type: string; data: any }[] = [];
    session.setSSEBroadcaster((type: string, data: any) => sseEvents.push({ type, data }));

    session.queueAction('Укреплять границы');
    const action = await session.processNextAction(30);
    expect(action.status).toBe('completed');

    // Чат создан, первое сообщение — от политии с темой из startChat
    const chats = session.getChats();
    expect(chats).toHaveLength(1);
    expect(chats[0].polityName).toBe('Польша');

    const messages = session.getChatMessages(chats[0].id);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('polity');
    expect(messages[0].content).toBe('Требуем объяснений');

    // chat_message транслировался
    const chatEvent = sseEvents.find(e => e.type === 'chat_message');
    expect(chatEvent).toBeTruthy();
    expect(chatEvent.data.polityName).toBe('Польша');
    expect(chatEvent.data.chatId).toBe(chats[0].id);
    expect(chatEvent.data.message.content).toBe('Требуем объяснений');

    stubStartChat = [];
  });

  it('транскрипты чатов попадают в промпт следующего прыжка', async () => {
    const { session } = createGame();

    const chat = session.ensureChat('Польша');
    await session.sendChatMessage(chat.id, 'Как насчёт торгового договора?');

    session.queueAction('Развивать экономику');
    await session.processNextAction(30);

    expect(capturedPrompt).toContain('Переговоры с Польша');
    expect(capturedPrompt).toContain('Как насчёт торгового договора?');
  });

  it('проактивный советник транслируется после успешного хода', async () => {
    const { session } = createGame();

    const sseEvents: { type: string; data: any }[] = [];
    session.setSSEBroadcaster((type: string, data: any) => sseEvents.push({ type, data }));

    session.queueAction('Наблюдать за миром');
    await session.processNextAction(30);

    // advisor_proactive — fire-and-forget, ждём микротаски
    await new Promise(r => setTimeout(r, 50));

    const proactive = sseEvents.find(e => e.type === 'advisor_proactive');
    expect(proactive).toBeTruthy();
    expect(proactive.data.content).toBe('Комментарий советника к итогам периода.');
  });
});
