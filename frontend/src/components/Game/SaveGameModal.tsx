/**
 * Open-Pax — Этап 6: SaveGameModal
 * =================================
 * Модалка сохранения игры (замена prompt()).
 * Затемнённый оверлей, инпут названия, «Сохранить»/«Отмена».
 * Enter — сохранить, Escape / клик по оверлею — отмена.
 * Стили: конец frontend/src/index.css, секция «Этап 6: Landing».
 */

import { useEffect, useRef, useState } from 'react';

export interface SaveGameModalProps {
  /** Видимость модалки */
  open: boolean;
  /** Название по умолчанию, напр. `Игра 12.01.2025` */
  defaultName: string;
  /** Подтверждение с введённым (обрезанным) названием */
  onSave: (name: string) => void;
  /** Закрытие без сохранения */
  onClose: () => void;
}

export function SaveGameModal({ open, defaultName, onSave, onClose }: SaveGameModalProps) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  // При открытии — сбрасываем название на defaultName и фокусируем инпут
  useEffect(() => {
    if (open) {
      setName(defaultName || `Игра ${new Date().toLocaleDateString('ru-RU')}`);
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [open, defaultName]);

  // Escape закрывает модалку
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = name.trim();
  const submit = () => {
    if (trimmed) onSave(trimmed);
  };

  return (
    <div className="save-modal-overlay" onClick={onClose}>
      <div
        className="save-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Сохранить игру"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="save-modal-header">
          <h3>Сохранить игру</h3>
          <button className="save-modal-close" onClick={onClose} title="Закрыть" aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className="save-modal-body">
          <label className="save-modal-label" htmlFor="save-modal-name">
            Название сохранения
          </label>
          <input
            id="save-modal-name"
            ref={inputRef}
            className="save-modal-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder={`Игра ${new Date().toLocaleDateString('ru-RU')}`}
            maxLength={80}
          />
        </div>

        <div className="save-modal-footer">
          <button className="save-modal-cancel" onClick={onClose}>
            Отмена
          </button>
          <button className="save-modal-submit" onClick={submit} disabled={!trimmed}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
