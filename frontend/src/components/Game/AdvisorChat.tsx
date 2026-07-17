/**
 * Open-Pax — Advisor Chat Component
 * ==================================
 * Этап 3: живой Советник — многоходовый чат со стримингом ответа.
 * История хранится в chatStore и шлётся с каждым запросом.
 * Проактивные сводки (SSE advisor_proactive) показываются в той же ленте
 * с бейджем «Сводка».
 */

import React, { useEffect, useRef, useState } from 'react';
import { advisorApi, type AdvisorHistoryItem } from '../../services/api';
import { useChatStore } from '../../stores';

interface AdvisorChatProps {
  gameId: string;
}

/** Сколько последних сообщений диалога отправляем как контекст */
const HISTORY_LIMIT = 20;

export const AdvisorChat: React.FC<AdvisorChatProps> = ({ gameId }) => {
  const {
    advisorMessages, advisorStreaming,
    addAdvisorMessage, appendToLastAdvisorMessage, setAdvisorStreaming,
  } = useChatStore();

  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Локальная игра без бэкенда — советник недоступен
  const isLocal = gameId.startsWith('local_');

  // Прокрутка ленты вниз при новых сообщениях и токенах стрима
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [advisorMessages]);

  // Отправить вопрос советнику со стримингом ответа
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || advisorStreaming || isLocal) return;
    setInputText('');

    // История: без проактивных сводок и пустых (стримящихся) сообщений
    const history: AdvisorHistoryItem[] = advisorMessages
      .filter(m => !m.proactive && m.content.trim())
      .slice(-HISTORY_LIMIT)
      .map(m => ({ role: m.role, content: m.content }));

    addAdvisorMessage({ role: 'user', content: text });
    addAdvisorMessage({ role: 'assistant', content: '' });
    setAdvisorStreaming(true);

    try {
      await advisorApi.askStream(gameId, text, history, (token) => {
        appendToLastAdvisorMessage(token);
      });
    } catch (e) {
      console.error('[AdvisorChat] Ошибка запроса к советнику:', e);
      appendToLastAdvisorMessage('⚠️ Советник сейчас недоступен. Попробуйте позже.');
    } finally {
      setAdvisorStreaming(false);
    }
  };

  if (isLocal) {
    return (
      <div className="advisor-chat">
        <div className="chats-empty">Советник доступен только в серверной игре</div>
      </div>
    );
  }

  return (
    <div className="advisor-chat">
      <div className="advisor-messages">
        {advisorMessages.length === 0 ? (
          <div className="chats-empty">
            Спросите советника о ситуации в мире, стратегии или последствиях решений.
          </div>
        ) : (
          advisorMessages.map((m, i) => {
            const isLast = i === advisorMessages.length - 1;
            const isStreamingThis = isLast && advisorStreaming && m.role === 'assistant';
            return (
              <div key={i} className={`advisor-bubble ${m.role}`}>
                {m.proactive && <span className="proactive-badge">Сводка</span>}
                {m.content}
                {isStreamingThis && <span className="stream-cursor">▌</span>}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-row">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Вопрос советнику..."
          rows={2}
          disabled={advisorStreaming}
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
          disabled={!inputText.trim() || advisorStreaming}
          title="Отправить"
        >
          {advisorStreaming ? '…' : '➤'}
        </button>
      </div>
    </div>
  );
};

export default AdvisorChat;
