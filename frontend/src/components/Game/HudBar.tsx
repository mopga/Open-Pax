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
 *  - пресеты: 1–4 недели и 1–4 месяца;
 *  - кастомный прыжок: 1–9 недель или месяцев;
 *  - закрытие: клик по оверлею-ловцу, Esc, крестик или выбор пункта.
 *
 * Компонент самодостаточный: не ходит в API, только вызывает колбэки пропсов.
 * Стили — в конце frontend/src/index.css, секция «Этап 6: HUD-бар и таймлайн».
 */

import React, { useEffect, useState } from 'react';
import type { GameUsage } from '../../services/api';
import { MECHANIC_LABELS, formatTokens, formatUsd } from '../../utils/usageFormat';

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
  /** Панель периода контролируется родителем, чтобы открыть её из окна действий. */
  timelineOpen: boolean;
  onTimelineOpenChange: (open: boolean) => void;
  /** Расход токенов по игре (null — ещё не загружен) */
  usage?: GameUsage | null;
  /** Открыть окно «Модель ИИ» */
  onOpenSettings?: () => void;
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
  { label: '2 недели', days: 14 },
  { label: '3 недели', days: 21 },
  { label: '4 недели', days: 28 },
  { label: '1 месяц', days: 30 },
  { label: '2 месяца', days: 60 },
  { label: '3 месяца', days: 90 },
  { label: '4 месяца', days: 120 },
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
  const [customAmount, setCustomAmount] = useState('1');
  const [customUnit, setCustomUnit] = useState<'weeks' | 'months'>('weeks');

  const parsedCustom = parseInt(customAmount, 10);
  const customValid = Number.isFinite(parsedCustom) && parsedCustom >= 1 && parsedCustom <= 9;

  const submitCustom = () => {
    if (customValid && !loading) onTimeSkip(parsedCustom * (customUnit === 'weeks' ? 7 : 30));
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

      {/* Кастомный прыжок: 1–9 недель или месяцев */}
      <div className="hud-timeline-custom">
        <input
          className="hud-timeline-input"
          type="number"
          min={1}
          max={9}
          step={1}
          value={customAmount}
          disabled={loading}
          onChange={(e) => setCustomAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitCustom();
          }}
          aria-label="Количество недель или месяцев для прыжка"
        />
        <select
          className="hud-timeline-custom-label"
          value={customUnit}
          disabled={loading}
          onChange={(e) => setCustomUnit(e.target.value as 'weeks' | 'months')}
          aria-label="Единица периода"
        >
          <option value="weeks">недель</option>
          <option value="months">месяцев</option>
        </select>
        <button
          type="button"
          className="hud-timeline-custom-go"
          onClick={submitCustom}
          disabled={loading || !customValid}
          title="Прыжок на указанный период"
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
  timelineOpen,
  onTimelineOpenChange,
  usage,
  onOpenSettings,
}) => {
  const [usageOpen, setUsageOpen] = useState(false);

  /** Выбор пункта панели: закрываем её и проксируем прыжок наверх */
  const handleTimeSkip = (days: number) => {
    onTimelineOpenChange(false);
    onTimeSkip(days);
  };

  // Esc закрывает панель таймлайна
  useEffect(() => {
    if (!timelineOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onTimelineOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [timelineOpen, onTimelineOpenChange]);

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

      {/* Правая часть: расход токенов, настройки модели, пилюля даты (как в оригинале) */}
      <div className="hud-right">
        {usage && <UsageChip usage={usage} open={usageOpen} onToggle={() => setUsageOpen(o => !o)} />}
        {onOpenSettings && (
          <button type="button" className="hud-icon-btn" onClick={onOpenSettings} title="Модель ИИ" aria-label="Настройки модели ИИ">
            ⚙
          </button>
        )}
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
            onClick={() => onTimelineOpenChange(!timelineOpen)}
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
          <div className="hud-timeline-overlay" onClick={() => onTimelineOpenChange(false)} />
          <TimelinePanel
            dateISO={dateISO}
            loading={loading}
            onTimeSkip={handleTimeSkip}
            onClose={() => onTimelineOpenChange(false)}
          />
        </>
      )}
    </div>
  );
};

// ============================================================================
// Индикатор расхода (аналог баланса в шапке оригинала)
// ============================================================================

const UsageChip: React.FC<{ usage: GameUsage; open: boolean; onToggle: () => void }> = ({ usage, open, onToggle }) => {
  const t = usage.totals;
  const tokens = t.inputTokens + t.outputTokens;
  const paid = usage.billing === 'payg';
  const overBudget = paid && usage.budgetPerGameUsd != null && t.costUsd >= usage.budgetPerGameUsd;
  const main = paid && t.costUsd > 0 ? formatUsd(t.costUsd) : `${formatTokens(tokens)} ток.`;

  return (
    <div className="hud-usage">
      <button
        type="button"
        className={`hud-usage-chip${overBudget ? ' over' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
        title="Расход модели в этой игре"
      >
        <span className="hud-usage-main">{main}{paid && t.costIncomplete ? '+' : ''}</span>
        {paid && t.costUsd > 0 && <span className="hud-usage-sub">{formatTokens(tokens)} ток.</span>}
      </button>
      {open && (
        <>
          <div className="hud-timeline-overlay" onClick={onToggle} />
          <div className="hud-usage-popover" role="dialog" aria-label="Расход модели">
            <div className="hud-usage-title">Расход в этой игре</div>
            <div className="hud-usage-total">
              {formatTokens(t.inputTokens)} вход · {formatTokens(t.outputTokens)} выход
              {t.cachedInputTokens > 0 && ` · ${formatTokens(t.cachedInputTokens)} из кэша`}
            </div>
            <div className="hud-usage-total">
              {paid
                ? <>Стоимость: <b>{formatUsd(t.costUsd)}</b>{t.costIncomplete && ' + вызовы без известной цены'}</>
                : usage.billing === 'local' ? 'Локальная модель — бесплатно' : 'Подписка — оплачено тарифом'}
              {overBudget && <div className="hud-usage-warn">Бюджет {formatUsd(usage.budgetPerGameUsd!)} превышен</div>}
            </div>
            {usage.byMechanic.length > 0 && (
              <table className="hud-usage-table">
                <tbody>
                  {usage.byMechanic.map(m => (
                    <tr key={`${m.mechanic}-${m.model}`}>
                      <td>{MECHANIC_LABELS[m.mechanic] ?? m.mechanic}<small>{m.model}</small></td>
                      <td>{m.calls}×</td>
                      <td>{formatTokens(m.inputTokens + m.outputTokens)}</td>
                      {paid && <td>{formatUsd(m.costUsd)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {t.failedCalls > 0 && <div className="hud-usage-warn">Ошибок вызова: {t.failedCalls}</div>}
            {t.estimated && <div className="hud-usage-note">Часть токенов оценена по длине текста.</div>}
          </div>
        </>
      )}
    </div>
  );
};

export default HudBar;
