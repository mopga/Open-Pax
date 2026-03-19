/**
 * Open-Pax — Time Jump Modal Component
 * ====================================
 * Unified modal for time jumps and action input.
 */

import React, { useState, useEffect } from 'react';

interface TimeJumpModalProps {
  isOpen: boolean;
  currentDate: string;
  suggestions?: string[];
  onSubmit: (action: string, jumpDays: number) => void;
  onClose: () => void;
  loading?: boolean;
}

const JUMP_OPTIONS = [
  { label: '1 неделя', days: 7 },
  { label: '1 месяц', days: 30 },
  { label: '3 месяца', days: 90 },
  { label: '6 месяцев', days: 180 },
  { label: '1 год', days: 365 },
];

export const TimeJumpModal: React.FC<TimeJumpModalProps> = ({
  isOpen,
  currentDate,
  suggestions = [],
  onSubmit,
  onClose,
  loading = false,
}) => {
  const [actionText, setActionText] = useState('');
  const [selectedDays, setSelectedDays] = useState(30);

  useEffect(() => {
    if (!isOpen) {
      setActionText('');
      setSelectedDays(30);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    onSubmit(actionText, selectedDays);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setActionText(suggestion);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content time-jump-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⏱ Временной скачок</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="date-display">
            📅 {currentDate} →
          </div>

          <div className="action-section">
            <label>Действие:</label>
            <textarea
              value={actionText}
              onChange={e => setActionText(e.target.value)}
              placeholder="Опишите действие вашей страны..."
              rows={3}
              disabled={loading}
            />
          </div>

          {suggestions.length > 0 && (
            <div className="suggestions-section">
              <label>Подсказки:</label>
              <div className="suggestions-grid">
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    className="suggestion-btn"
                    onClick={() => handleSuggestionClick(suggestion)}
                    disabled={loading}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="period-section">
            <label>Период:</label>
            <div className="period-buttons">
              {JUMP_OPTIONS.map(opt => (
                <button
                  key={opt.days}
                  className={`period-btn ${selectedDays === opt.days ? 'active' : ''}`}
                  onClick={() => setSelectedDays(opt.days)}
                  disabled={loading}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose} disabled={loading}>
            Отменить
          </button>
          <button className="btn-submit" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Думаю...' : '✓ Отправить'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimeJumpModal;
