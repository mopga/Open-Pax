/**
 * Open-Pax — Chat Repository
 * ==========================
 * Этап 3: дипломатические чаты игрока с политиями.
 * Один чат на пару (игра, полития) — UNIQUE(game_id, polity_id).
 */

import db from '../database';
import { shortId } from '../utils/short-id';

export type ChatRole = 'player' | 'polity';

export interface ChatRecord {
  id: string;
  gameId: string;
  polityId: string;
  polityName: string;
  polityColor: string;
  createdAt: string;
  lastMessageAt: string | null;
}

/** Чат для списка: с последним сообщением и счётчиком непрочитанных. */
export interface ChatSummary extends ChatRecord {
  lastMessage: string | null;
  unread: number;
}

export interface ChatMessageRecord {
  id: string;
  chatId: string;
  role: ChatRole;
  content: string;
  turn: number;
  read: boolean;
  createdAt: string;
}

function rowToChat(row: any): ChatRecord {
  return {
    id: row.id,
    gameId: row.game_id,
    polityId: row.polity_id,
    polityName: row.polity_name,
    polityColor: row.polity_color || '#888888',
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at || null,
  };
}

function rowToMessage(row: any): ChatMessageRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role as ChatRole,
    content: row.content,
    turn: row.turn ?? 0,
    read: !!row.read,
    createdAt: row.created_at,
  };
}

export const chatRepository = {
  /**
   * Создать чат (идемпотентно): если чат с этой политией уже есть — вернуть его.
   */
  createChat(chat: { id: string; gameId: string; polityId: string; polityName: string; polityColor?: string }): ChatRecord {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO chats (id, game_id, polity_id, polity_name, polity_color, created_at, last_message_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(game_id, polity_id) DO NOTHING
    `).run(chat.id, chat.gameId, chat.polityId, chat.polityName, chat.polityColor || '#888888', now);

    return chatRepository.getChatByGameAndPolity(chat.gameId, chat.polityId)!;
  },

  /** Список чатов игры, свежие сверху, с последним сообщением и unread. */
  getChatsByGame(gameId: string): ChatSummary[] {
    const rows = db.prepare(`
      SELECT
        c.*,
        (SELECT m.content FROM chat_messages m
          WHERE m.chat_id = c.id
          ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS last_message,
        (SELECT COUNT(*) FROM chat_messages m
          WHERE m.chat_id = c.id AND m.role = 'polity' AND m.read = 0) AS unread
      FROM chats c
      WHERE c.game_id = ?
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
    `).all(gameId) as any[];

    return rows.map(row => ({
      ...rowToChat(row),
      lastMessage: row.last_message || null,
      unread: Number(row.unread) || 0,
    }));
  },

  getChatById(chatId: string): ChatRecord | null {
    const row = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId) as any;
    return row ? rowToChat(row) : null;
  },

  getChatByGameAndPolity(gameId: string, polityId: string): ChatRecord | null {
    const row = db.prepare('SELECT * FROM chats WHERE game_id = ? AND polity_id = ?').get(gameId, polityId) as any;
    return row ? rowToChat(row) : null;
  },

  /** Сообщения чата в хронологическом порядке. */
  getMessages(chatId: string): ChatMessageRecord[] {
    const rows = db.prepare(
      'SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC'
    ).all(chatId) as any[];
    return rows.map(rowToMessage);
  },

  /** Добавить сообщение и обновить last_message_at чата. */
  addMessage(chatId: string, role: ChatRole, content: string, turn: number = 0): ChatMessageRecord {
    const id = shortId();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO chat_messages (id, chat_id, role, content, turn, read, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(id, chatId, role, content, turn, now);
    db.prepare('UPDATE chats SET last_message_at = ? WHERE id = ?').run(now, chatId);

    return { id, chatId, role, content, turn, read: false, createdAt: now };
  },

  /** Пометить все сообщения политии в чате прочитанными. */
  markRead(chatId: string): void {
    db.prepare("UPDATE chat_messages SET read = 1 WHERE chat_id = ? AND role = 'polity' AND read = 0").run(chatId);
  },
};
