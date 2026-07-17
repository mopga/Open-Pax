/**
 * Open-Pax — Chats Routes (Этап 3)
 * ================================
 * ОТКЛЮЧЕНО: переговоры.
 * Фича дипломатических чатов выключена решением владельца: роуты не
 * монтируются (см. routes/index.ts), GameSession не создаёт чаты и не
 * вызывает LLM-механику 'chat'. Код сохранён закомментированным для
 * возможного возврата фичи; таблицы chats/chat_messages в БД не тронуты.
 *
 * Дипломатические чаты игрока с политиями.
 * Монтируется под тем же префиксом /api/games, что и gamesRouter.
 */

// ОТКЛЮЧЕНО: переговоры
// import { Router } from 'express';
// import { getSessionRegistry } from '../session-registry';
// import { LLMError } from '../llm';
//
// export const chatsRouter = Router();
//
// /**
//  * Единый обработчик ошибок (тот же паттерн, что в games.routes):
//  * LLMError → 502, "not found" → 404, всё остальное → 500.
//  */
// function respondRouteError(res: any, e: any, fallback: string): void {
//   if (e instanceof LLMError) {
//     res.status(502).json({ error: `LLM (${e.provider}): ${e.message}` });
//   } else if (typeof e?.message === 'string' && e.message.includes('not found')) {
//     res.status(404).json({ error: e.message });
//   } else {
//     console.error('[Chats] Error:', e);
//     res.status(500).json({ error: fallback });
//   }
// }
//
// // Список чатов игры
// chatsRouter.get('/:id/chats', (req, res) => {
//   try {
//     const session = getSessionRegistry().getSessionOrThrow(req.params.id);
//     const chats = session.getChats().map(c => ({
//       id: c.id,
//       polityId: c.polityId,
//       polityName: c.polityName,
//       polityColor: c.polityColor,
//       lastMessage: c.lastMessage,
//       lastMessageAt: c.lastMessageAt,
//       unread: c.unread,
//     }));
//     res.json({ chats });
//   } catch (e: any) {
//     respondRouteError(res, e, 'Failed to get chats');
//   }
// });
//
// // Создать (или вернуть существующий) чат с политией — идемпотентно
// chatsRouter.post('/:id/chats', (req, res) => {
//   const { polityName } = req.body || {};
//   if (!polityName || typeof polityName !== 'string') {
//     res.status(400).json({ error: 'polityName is required' });
//     return;
//   }
//
//   try {
//     const session = getSessionRegistry().getSessionOrThrow(req.params.id);
//     const chat = session.ensureChat(polityName);
//     res.json({
//       chat: {
//         id: chat.id,
//         polityId: chat.polityId,
//         polityName: chat.polityName,
//         polityColor: chat.polityColor,
//         createdAt: chat.createdAt,
//         lastMessageAt: chat.lastMessageAt,
//       },
//     });
//   } catch (e: any) {
//     respondRouteError(res, e, 'Failed to create chat');
//   }
// });
//
// // Сообщения чата (+ пометить прочитанными)
// chatsRouter.get('/:id/chats/:chatId/messages', (req, res) => {
//   try {
//     const session = getSessionRegistry().getSessionOrThrow(req.params.id);
//     const messages = session.getChatMessages(req.params.chatId);
//     session.markChatRead(req.params.chatId);
//     res.json({
//       messages: messages.map(m => ({
//         id: m.id,
//         role: m.role,
//         content: m.content,
//         turn: m.turn,
//         createdAt: m.createdAt,
//       })),
//     });
//   } catch (e: any) {
//     respondRouteError(res, e, 'Failed to get chat messages');
//   }
// });
//
// // Отправить сообщение политии (ответ приходит от LLM)
// chatsRouter.post('/:id/chats/:chatId/messages', async (req, res) => {
//   const { content } = req.body || {};
//   if (!content || typeof content !== 'string') {
//     res.status(400).json({ error: 'content is required' });
//     return;
//   }
//
//   try {
//     const session = getSessionRegistry().getSessionOrThrow(req.params.id);
//     const { message, reply } = await session.sendChatMessage(req.params.chatId, content);
//     res.json({ message, reply });
//   } catch (e: any) {
//     respondRouteError(res, e, 'Failed to send chat message');
//   }
// });
