/**
 * Open-Pax — Этап 6: Landing (стартовый экран-лендинг)
 * =====================================================
 * Референс: docs/ref/pax_home.png — звёздное небо, горизонт планеты,
 * крупный заголовок и центральная градиентная CTA-кнопка.
 *
 * Самодостаточный компонент: сам загружает список сохранений (savesApi.list),
 * сам фильтрует служебные снапшоты отката (`__rewind__`).
 * Стили: конец frontend/src/index.css, секция «Этап 6: Landing».
 */

import { useEffect, useState } from 'react';
import { savesApi, type LLMSettingsView } from '../../services/api';

export interface LandingProps {
  /** Переход к созданию новой игры */
  onNewGame: () => void;
  /** Продолжить игру из сохранения (объект из savesApi.list) */
  onResumeSave: (save: any) => void;
  /** Текущие настройки модели ИИ (null — ещё грузятся или сервер недоступен) */
  llmView?: LLMSettingsView | null;
  /** Открыть окно «Модель ИИ» */
  onOpenSettings?: () => void;
}

/** «1951-01-01» → «1 января 1951» */
function formatGameDate(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Дата/время сохранения → «12 января 2025 г., 14:32» */
function formatSavedAt(value?: string): string {
  if (!value) return '';
  // SQLite datetime('now') хранит UTC без суффикса — трактуем как UTC
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Landing(props: LandingProps) {
  const { onNewGame, onResumeSave, llmView, onOpenSettings } = props;
  const jumpModel = llmView?.effective?.jump;
  const presetLabel = llmView?.presets.find(p => p.id === llmView.settings?.presetId)?.label;

  const [saves, setSaves] = useState<any[]>([]);

  // Загружаем сохранения при монтировании; пустое состояние/ошибка — секция скрыта
  useEffect(() => {
    let cancelled = false;
    savesApi
      .list()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.saves) ? data.saves : [];
        // `__rewind__` — служебный снапшот отката хода, не показываем как сейв
        setSaves(list.filter((s: any) => s && s.name !== '__rewind__'));
      })
      .catch((e) => {
        console.warn('[Landing] Не удалось загрузить сохранения:', e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="landing">
      {/* ===== Hero: звёздное небо + горизонт планеты (pax_home.png) ===== */}
      <div className="landing-hero">
        {onOpenSettings && (
          <button
            type="button"
            className={`landing-model-btn${llmView && !llmView.configured ? ' warn' : ''}`}
            onClick={onOpenSettings}
            title="Модель ИИ: ключ, подписка или локальный сервер"
          >
            {!llmView
              ? '⚙ Модель ИИ'
              : llmView.configured
                ? `⚙ ${presetLabel ?? jumpModel?.provider ?? 'Модель'} · ${jumpModel?.model ?? ''}`
                : '⚠ Подключите модель ИИ'}
          </button>
        )}
        <div className="landing-stars" />
        <div className="landing-planet" />

        <div className="landing-hero-content">
          <h1 className="landing-title">Open-Pax</h1>
          <p className="landing-subtitle">Симулятор альтернативной истории</p>

          <div className="landing-cta-row">
            <button className="landing-cta" onClick={onNewGame}>
              Новая игра <span className="landing-cta-arrow">→</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===== Секции под hero ===== */}
      {saves.length > 0 && (
        <div className="landing-sections">
          <section className="landing-section">
            <h2 className="landing-section-title">📂 Продолжить игру</h2>
            <div className="landing-saves-grid">
              {saves.map((save: any) => (
                <div key={save.id} className="landing-save-card">
                  <div className="landing-save-name">{save.name || 'Сохранение'}</div>
                  <div className="landing-save-meta">
                    {typeof save.current_turn === 'number' && (
                      <span className="landing-save-turn">Ход {save.current_turn}</span>
                    )}
                    {save.current_date && <span>{formatGameDate(save.current_date)}</span>}
                  </div>
                  {save.saved_at && (
                    <div className="landing-save-date">Сохранено: {formatSavedAt(save.saved_at)}</div>
                  )}
                  <button className="landing-save-play" onClick={() => onResumeSave(save)}>
                    ▶ Играть
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
