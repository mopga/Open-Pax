/**
 * Open-Pax — Chats Panel Component
 * =================================
 * Этап 3: панель дипломатических чатов.
 * Список чатов (цветной кружок, последнее сообщение, бейдж unread),
 * тред сообщений (player справа / polity слева), «Новый чат» — выбор политии.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { chatsApi } from '../../services/api';
import { useChatStore } from '../../stores';
import type { Region } from '../../types';

interface ChatsPanelProps {
  gameId: string;
  regions: Region[];
  /** polityId игрока — исключаем его из списка собеседников */
  playerPolityId: string;
}

/** Полития-собеседник, выведенная из регионов (owner = polityId) */
interface PolityOption {
  id: string;
  name: string;
  color: string;
}

export const ChatsPanel: React.FC<ChatsPanelProps> = ({ gameId, regions, playerPolityId }) => {
  const {
    chats, activeChatId, messagesByChat,
    refreshChats, upsertChat, setActiveChat, setMessages, appendMessage, markRead,
  } = useChatStore();

  const [showNewChat, setShowNewChat] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Локальная игра без бэкенда — чаты недоступны
  const isLocal = gameId.startsWith('local_');

  // Загрузка списка чатов при монтировании
  useEffect(() => {
    if (!isLocal) {
      refreshChats();
    }
  }, [gameId, isLocal, refreshChats]);

  // Прокрутка треда вниз при новых сообщениях
  const activeMessages = activeChatId ? (messagesByChat[activeChatId] || []) : [];
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, activeChatId]);

  // Политии из регионов: уникальные owner, кроме игрока и нейтралов
  const polities = useMemo<PolityOption[]>(() => {
    const byId = new Map<string, PolityOption>();
    for (const r of regions) {
      if (!r.owner || r.owner === 'neutral' || r.owner === playerPolityId) continue;
      if (!byId.has(r.owner)) {
        byId.set(r.owner, { id: r.owner, name: r.name, color: r.color });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [regions, playerPolityId]);

  // Открыть чат: загрузить сообщения (бэкенд помечает прочитанными) и сбросить unread
  const openChat = async (chatId: string) => {
    setActiveChat(chatId);
    setShowNewChat(false);
    if (isLocal) return;
    setLoadingMessages(true);
    try {
      const data = await chatsApi.messages(gameId, chatId);
      setMessages(chatId, data.messages || []);
      markRead(chatId);
    } catch (e) {
      console.error('[ChatsPanel] Не удалось загрузить сообщения:', e);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Создать новый чат с политией (идемпотентно на бэкенде)
  const handleCreateChat = async (polityName: string) => {
    try {
      const { chat } = await chatsApi.create(gameId, polityName);
      upsertChat(chat);
      await openChat(chat.id);
    } catch (e) {
      console.error('[ChatsPanel] Не удалось создать чат:', e);
    }
  };

  // Отправить сообщение; ответ политии приходит в reply
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !activeChatId || sending) return;
    setInputText('');
    setSending(true);
    try {
      const { message, reply } = await chatsApi.send(gameId, activeChatId, text);
      appendMessage(activeChatId, message);
      if (reply) {
        appendMessage(activeChatId, reply);
      }
      // Обновляем «последнее сообщение» в списке чатов
      refreshChats();
    } catch (e) {
      console.error('[ChatsPanel] Не удалось отправить сообщение:', e);
      setInputText(text); // вернуть текст в поле ввода
    } finally {
      setSending(false);
    }
  };

  if (isLocal) {
    return (
      <div className="chats-panel">
        <div className="chats-empty">Дипломатические чаты доступны только в серверной игре</div>
      </div>
    );
  }

  const activeChat = chats.find(c => c.id === activeChatId);

  // --- Тред сообщений ---
  if (activeChatId) {
    return (
      <div className="chats-panel">
        <div className="chat-thread-header">
          <button className="btn-chat-back" onClick={() => setActiveChat(null)} title="К списку чатов">
            ←
          </button>
          <span
            className="chat-color-dot"
            style={{ background: activeChat?.polityColor || '#888' }}
          />
          <span className="chat-thread-title">{activeChat?.polityName || 'Чат'}</span>
        </div>

        <div className="chat-messages">
          {loadingMessages && activeMessages.length === 0 ? (
            <div className="chats-empty">Загрузка сообщений...</div>
          ) : activeMessages.length === 0 ? (
            <div className="chats-empty">Сообщений пока нет — начните переговоры</div>
          ) : (
            activeMessages.map(m => (
              <div key={m.id || `${m.role}-${m.createdAt}`} className={`chat-bubble ${m.role}`}>
                {m.content}
              </div>
            ))
          )}
          {sending && (
            <div className="chat-bubble polity loading">печатает…</div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-row">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Сообщение политии..."
            rows={2}
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            className="btn-chat-send"
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            title="Отправить"
          >
            {sending ? '…' : '➤'}
          </button>
        </div>
      </div>
    );
  }

  // --- Список чатов ---
  return (
    <div className="chats-panel">
      <button className="btn-new-chat" onClick={() => setShowNewChat(v => !v)}>
        {showNewChat ? '✕ Отмена' : '＋ Новый чат'}
      </button>

      {showNewChat && (
        <div className="new-chat-picker">
          {polities.length === 0 ? (
            <div className="chats-empty">Нет доступных политий для переговоров</div>
          ) : (
            polities.map(p => (
              <div key={p.id} className="polity-pick-item" onClick={() => handleCreateChat(p.name)}>
                <span className="chat-color-dot" style={{ background: p.color }} />
                <span>{p.name}</span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="chats-list">
        {chats.length === 0 ? (
          <div className="chats-empty">
            Чатов пока нет.
            <br />
            Нажмите «Новый чат» или «Переговоры» в панели дипломатии.
          </div>
        ) : (
          chats.map(c => (
            <div key={c.id} className="chat-item" onClick={() => openChat(c.id)}>
              <span className="chat-color-dot" style={{ background: c.polityColor || '#888' }} />
              <div className="chat-item-main">
                <div className="chat-item-name">{c.polityName}</div>
                {c.lastMessage && <div className="chat-item-last">{c.lastMessage}</div>}
              </div>
              {c.unread > 0 && <span className="chat-unread-badge">{c.unread}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ChatsPanel;
