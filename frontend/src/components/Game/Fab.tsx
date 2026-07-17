/**
 * Open-Pax — FAB Component
 * =========================
 * Этап 6: группа плавающих круглых кнопок снизу-слева, как в
 * docs/ref/pax_action_sent.png оригинальной Pax Historia (чат, молния, поиск).
 * Кнопки 44px, тёмный фон, hover-подсветка градиентом, опциональный красный
 * бейдж непрочитанного.
 *
 * Использование:
 *   <Fab items={[
 *     { icon: '💬', title: 'Чаты', badge: unread, onClick: openChats },
 *     { icon: '⚡', title: 'Действия', onClick: openActions },
 *     { icon: '🔍', title: 'Поиск', onClick: openSearch },
 *   ]} />
 */

import React from 'react';

export interface FabItem {
  /** Эмодзи или символ иконки */
  icon: string;
  /** Подпись в тултипе (title/aria-label) */
  title: string;
  /** Счётчик непрочитанного; 0/undefined — бейдж скрыт */
  badge?: number;
  onClick: () => void;
}

export interface FabProps {
  items: FabItem[];
}

export const Fab: React.FC<FabProps> = ({ items }) => {
  if (!items || items.length === 0) return null;

  return (
    <div className="fab-group">
      {items.map((item, i) => (
        <button
          key={`${item.title}-${i}`}
          type="button"
          className="fab-btn"
          title={item.title}
          aria-label={item.title}
          onClick={item.onClick}
        >
          <span className="fab-icon" aria-hidden="true">
            {item.icon}
          </span>
          {typeof item.badge === 'number' && item.badge > 0 && (
            <span className="fab-badge">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

export default Fab;
