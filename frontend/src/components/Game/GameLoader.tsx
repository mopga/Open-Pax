/**
 * Open-Pax — Game Loader Component
 * =================================
 * Этап 6: полноэкранный лоадер по референсам pax_game_ui.png / pax_ingame.png /
 * pax_game_ui3.png оригинальной Pax Historia: центрированный «глобус» с
 * пульсирующим кольцом, текст этапа под ним и тонкий прогресс-бар.
 * Тёмная тема сохранена: фон #0a0a0f, градиентные акценты #667eea → #f093fb.
 *
 * Использование:
 *   <GameLoader title="Создаём вашу игру…" phase={WORLD_GEN_PHASES[i]} />
 *   <GameLoader title="Загрузка мира…" phase="Генерация географии…" progress={0.6} />
 */

import React from 'react';

export interface GameLoaderProps {
  /** Крупная строка под глобусом (например, «Создаём вашу игру…») */
  title?: string;
  /** Мелкая строка этапа под прогресс-баром */
  phase?: string;
  /** Прогресс 0..1; если не передан — indeterminate-анимация полосы */
  progress?: number;
}

/**
 * Правдоподобные этапы генерации мира — координатор крутит их по таймеру,
 * передавая в prop `phase`.
 */
export const WORLD_GEN_PHASES: string[] = [
  'Подключение к модели…',
  'Генерация политий мира…',
  'Балансировка сил…',
  'Формирование географии…',
  'Написание летописи…',
  'Финальные штрихи…',
];

export const GameLoader: React.FC<GameLoaderProps> = ({
  title = 'Загрузка…',
  phase,
  progress,
}) => {
  const determinate = typeof progress === 'number' && Number.isFinite(progress);
  const pct = determinate ? Math.min(1, Math.max(0, progress as number)) : 0;

  return (
    <div className="gl-loader" role="status" aria-live="polite">
      {/* Звёздный фон: два слоя точек с разным циклом мерцания */}
      <div className="gl-stars gl-stars--a" />
      <div className="gl-stars gl-stars--b" />

      <div className="gl-content">
        {/* Глобус: пульсирующее кольцо + сфера с меридианами */}
        <div className="gl-globe-wrap">
          <div className="gl-globe-halo" />
          <div className="gl-globe">
            <div className="gl-globe-meridian gl-globe-meridian--eq" />
            <div className="gl-globe-meridian gl-globe-meridian--n1" />
            <div className="gl-globe-meridian gl-globe-meridian--n2" />
            <div className="gl-globe-meridian gl-globe-meridian--v1" />
            <div className="gl-globe-meridian gl-globe-meridian--v2" />
          </div>
        </div>

        <div className="gl-title">{title}</div>

        <div
          className={
            'gl-progress' + (determinate ? '' : ' gl-progress--indeterminate')
          }
        >
          {determinate ? (
            <div
              className="gl-progress-fill"
              style={{ width: `${Math.round(pct * 100)}%` }}
            />
          ) : (
            <div className="gl-progress-runner" />
          )}
        </div>

        {phase && <div className="gl-phase">{phase}</div>}
      </div>
    </div>
  );
};

export default GameLoader;
