/**
 * Open-Pax — HUD Bar + Timeline Panel
 * ===================================
 * Этап 6: верхний бар игры по референсам Pax Historia
 * (docs/ref/pax_game_hud.png, docs/ref/pax_action_sent.png, docs/ref/pax_jump2.png).
 *
 * Компоновка оригинала, тёмная тема Open-Pax:
 *  - слева: кнопка «← Меню» + лого «🗺️ Open-Pax»;
 *  - по центру: название мира + бейдж «ХОД N»;
 *  - справа: пилюля даты «◀ 📅 12 января 1951 ▶»
 *    (◀ — откат на ход назад, ▶ — выезжающая панель «Таймлайн»).
 *
 * Панель «Таймлайн» (TimelinePanel, экспортируется из этого же файла):
 *  - «⏭ До следующего крупного события» → onTimeSkip(0);
 *  - пресеты: 1 неделя (7), 1 месяц (30), 3 месяца (90), 6 месяцев (180), 12 месяцев (365);
 *  - кастомный прыжок: инпут числа + «дней» + кнопка ✓;
 *  - закрытие: клик по оверлею-ловцу, Esc, крестик или выбор пункта.
 *
 * Компонент самодостаточный: не ходит в API, только вызывает колбэки пропсов.
 * Стили — в конце frontend/src/index.css, секция «Этап 6: HUD-бар и таймлайн».
 */

import React, { useEffect, useState } from 'react';

// ============================================================================
// Типы
// ============================================================================

export interface HudBarProps {
  /** Название мира (по центру бара) */
  worldName: string;
  /** Текущий номер хода */
  turn: number;
  /** Текущая дата мира в ISO (YYYY-MM-DD) — форматируется внутри */
  dateISO: string;
  /** Идёт обработка хода — блокирует ◀ и кнопки панели */
  loading: boolean;
  /** Назад в меню */
  onBack: () => void;
  /** Откат на ход назад */
  onRewind: () => void;
  /** Тайм-скип: days = 0 → «до следующего крупного события», иначе прыжок на N дней */
  onTimeSkip: (days: number) => void;
}

export interface TimelinePanelProps {
  /** Текущая дата мира в ISO — для подзаголовка и расчёта дат пресетов */
  dateISO: string;
  /** Блокировка кнопок во время обработки */
  loading: boolean;
  /** Выбор прыжка (0 = до следующего крупного события) */
  onTimeSkip: (days: number) => void;
  /** Закрыть панель */
  onClose: () => void;
}

// ============================================================================
// Даты (русская локаль, без сдвига по часовому поясу)
// ============================================================================

const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** Парсинг YYYY-MM-DD как ЛОКАЛЬНОЙ полуночи (new Date('YYYY-MM-DD') дал бы UTC и съехал бы на день) */
function parseISODate(dateISO: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((dateISO || '').trim());
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const fallback = new Date(dateISO);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/** «12 января 1951»; при нечитаемой дате возвращает исходную строку */
export function formatDateRu(dateISO: string): string {
  const d = parseISODate(dateISO);
  if (!d) return dateISO;
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
}

/** Дата через days дней от dateISO, отформатированная по-русски; '' если дата нечитаема */
function formatDatePlusDays(dateISO: string, days: number): string {
  const d = parseISODate(dateISO);
  if (!d) return '';
  d.setDate(d.getDate() + days);
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
}

// ============================================================================
// Пресеты тайм-скипа (как в pax_jump2.png)
// ============================================================================

const TIME_PRESETS: { label: string; days: number }[] = [
  { label: '1 неделя', days: 7 },
  { label: '1 месяц', days: 30 },
  { label: '3 месяца', days: 90 },
  { label: '6 месяцев', days: 180 },
  { label: '12 месяцев', days: 365 },
];

// ============================================================================
// Панель «Таймлайн»
// ============================================================================

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  dateISO,
  loading,
  onTimeSkip,
  onClose,
}) => {
  const [customDays, setCustomDays] = useState('30');

  const parsedCustom = parseInt(customDays, 10);
  const customValid = Number.isFinite(parsedCustom) && parsedCustom > 0 && parsedCustom <= 36500;

  const submitCustom = () => {
    if (customValid && !loading) onTimeSkip(parsedCustom);
  };

  return (
    <div className="hud-timeline-panel" role="dialog" aria-label="Таймлайн">
      {/* Шапка: заголовок + текущая дата + крестик */}
      <div className="hud-timeline-header">
        <div className="hud-timeline-heading">
          <div className="hud-timeline-title">Таймлайн</div>
          <div className="hud-timeline-subtitle">Сейчас: {formatDateRu(dateISO)}</div>
        </div>
        <button
          type="button"
          className="hud-timeline-close"
          onClick={onClose}
          title="Закрыть"
          aria-label="Закрыть панель таймлайна"
        >
          ✕
        </button>
      </div>

      {/* Главное действие — прыжок до следующего крупного события */}
      <button
        type="button"
        className="hud-timeline-next-event"
        onClick={() => onTimeSkip(0)}
        disabled={loading}
      >
        ⏭ До следующего крупного события
      </button>

      <div className="hud-timeline-divider">
        <span>или</span>
      </div>

      {/* Пресеты: целевая дата крупно, подпись периода мелко (как в оригинале) */}
      <div className="hud-timeline-presets">
        {TIME_PRESETS.map((preset) => {
          const targetDate = formatDatePlusDays(dateISO, preset.days);
          return (
            <button
              type="button"
              key={preset.days}
              className="hud-timeline-preset"
              onClick={() => onTimeSkip(preset.days)}
              disabled={loading}
            >
              <span className="hud-timeline-preset-date">
                {targetDate || `+${preset.days} дн.`}
              </span>
              <span className="hud-timeline-preset-label">{preset.label}</span>
            </button>
          );
        })}
      </div>

      <div className="hud-timeline-divider" />

      {/* Кастомный прыжок на произвольное число дней */}
      <div className="hud-timeline-custom">
        <input
          className="hud-timeline-input"
          type="number"
          min={1}
          max={36500}
          step={1}
          value={customDays}
          disabled={loading}
          onChange={(e) => setCustomDays(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitCustom();
          }}
          aria-label="Количество дней для прыжка"
        />
        <span className="hud-timeline-custom-label">дней</span>
        <button
          type="button"
          className="hud-timeline-custom-go"
          onClick={submitCustom}
          disabled={loading || !customValid}
          title="Прыжок на указанное число дней"
          aria-label="Подтвердить прыжок"
        >
          ✓
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// Верхний HUD-бар
// ============================================================================

export const HudBar: React.FC<HudBarProps> = ({
  worldName,
  turn,
  dateISO,
  loading,
  onBack,
  onRewind,
  onTimeSkip,
}) => {
  const [timelineOpen, setTimelineOpen] = useState(false);

  /** Выбор пункта панели: закрываем её и проксируем прыжок наверх */
  const handleTimeSkip = (days: number) => {
    setTimelineOpen(false);
    onTimeSkip(days);
  };

  // Esc закрывает панель таймлайна
  useEffect(() => {
    if (!timelineOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTimelineOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [timelineOpen]);

  return (
    <div className={`hud-bar${loading ? ' hud-loading' : ''}`}>
      {/* Левая часть: назад + лого */}
      <div className="hud-left">
        <button type="button" className="hud-back-btn" onClick={onBack} title="Вернуться в главное меню">
          ← Меню
        </button>
        <div className="hud-logo">
          🗺️ <span className="hud-logo-text">Open-Pax</span>
        </div>
      </div>

      {/* Центр: название мира + бейдж хода */}
      <div className="hud-center">
        <div className="hud-world-name" title={worldName}>
          {worldName}
        </div>
        <div className="hud-turn-badge">ХОД {turn}</div>
      </div>

      {/* Правая часть: пилюля даты с навигацией (как в оригинале) */}
      <div className="hud-right">
        <div className="hud-date-pill">
          <button
            type="button"
            className="hud-date-nav"
            onClick={onRewind}
            disabled={loading}
            title="Откат на ход назад"
            aria-label="Откат на ход назад"
          >
            ◀
          </button>
          <div className="hud-date-display" title={dateISO}>
            📅 {formatDateRu(dateISO)}
          </div>
          <button
            type="button"
            className={`hud-date-nav hud-timeline-toggle${timelineOpen ? ' active' : ''}`}
            onClick={() => setTimelineOpen((v) => !v)}
            title="Тайм-скип"
            aria-label="Открыть панель таймлайна"
            aria-expanded={timelineOpen}
          >
            ▶
          </button>
        </div>
      </div>

      {/* Панель таймлайна + оверлей-ловец для закрытия по клику вне её */}
      {timelineOpen && (
        <>
          <div className="hud-timeline-overlay" onClick={() => setTimelineOpen(false)} />
          <TimelinePanel
            dateISO={dateISO}
            loading={loading}
            onTimeSkip={handleTimeSkip}
            onClose={() => setTimelineOpen(false)}
          />
        </>
      )}
    </div>
  );
};

export default HudBar;
