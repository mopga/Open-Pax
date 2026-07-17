/**
 * Open-Pax — World Select Map Component (Этап 4)
 * ==============================================
 * SVG-карта мира на реальной геометрии Natural Earth (без внешних зависимостей).
 * Equirectangular-проекция: x = (lng + 180) / 360 * width,
 *                           y = (90 - lat) / 180 * height.
 * Клик по доступной стране → onSelect(code).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { geoApi } from '../../services/api';
import type { GeoCountryFeature } from '../../services/api';

/** Логические размеры viewBox карты */
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;

/** Проекция lng/lat → координаты SVG */
function project(lng: number, lat: number): [number, number] {
  return [((lng + 180) / 360) * MAP_WIDTH, ((90 - lat) / 180) * MAP_HEIGHT];
}

/** Кольцо полигона (массив [lng, lat]) → фрагмент path */
function ringToPath(ring: number[][]): string {
  let d = '';
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = project(ring[i][0], ring[i][1]);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d + 'Z';
}

/** Геометрия страны (Polygon/MultiPolygon) → атрибут d для <path> */
function geometryToPath(geometry: GeoCountryFeature['geometry']): string {
  if (geometry.type === 'Polygon') {
    return (geometry.coordinates as number[][][]).map(ringToPath).join('');
  }
  return (geometry.coordinates as number[][][][])
    .map((polygon) => polygon.map(ringToPath).join(''))
    .join('');
}

interface WorldSelectMapProps {
  /** Коды стран, доступных для выбора (ISO_A3) */
  availableCodes: string[];
  /** Текущий выделенный код (подсвечивается на карте) */
  selectedCode?: string | null;
  /** true — кликабельны все страны, false — только availableCodes */
  allowAll?: boolean;
  /** Клик по стране (выделение; подтверждение — кнопкой у родителя) */
  onSelect: (code: string) => void;
  /** Ошибка загрузки геоданных — родитель покажет fallback-вид */
  onError?: () => void;
}

interface TooltipState {
  name: string;
  x: number;
  y: number;
}

export const WorldSelectMap: React.FC<WorldSelectMapProps> = ({
  availableCodes,
  selectedCode = null,
  allowAll = false,
  onSelect,
  onError,
}) => {
  const [features, setFeatures] = useState<GeoCountryFeature[] | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Защита от повторных onError (например, при StrictMode с двойным эффектом)
  const errorReportedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    geoApi
      .getCountries()
      .then((collection) => {
        if (cancelled) return;
        if (!collection || !Array.isArray(collection.features)) {
          throw new Error('Некорректный ответ /api/geo/countries');
        }
        setFeatures(collection.features);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[WorldSelectMap] Геоданные недоступны, показываем fallback:', err);
        if (!errorReportedRef.current) {
          errorReportedRef.current = true;
          onError?.();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onError]);

  // Множество доступных кодов — для быстрой проверки
  const availableSet = useMemo(() => new Set(availableCodes), [availableCodes]);

  // Заранее строим path для каждой страны
  const paths = useMemo(() => {
    if (!features) return [];
    return features.map((feature) => ({
      code: feature.properties.code,
      name: feature.properties.name,
      d: geometryToPath(feature.geometry),
    }));
  }, [features]);

  if (!features) {
    return (
      <div className="world-select-map">
        <div className="world-select-map-loading">Загрузка карты мира…</div>
      </div>
    );
  }

  /** Координаты курсора внутри контейнера карты — для тултипа */
  const updateTooltip = (e: React.MouseEvent, name: string) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ name, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div className="world-select-map" ref={containerRef}>
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Карта мира"
      >
        {paths.map(({ code, name, d }) => {
          const isAvailable = allowAll || availableSet.has(code);
          const isSelected = selectedCode === code;
          const className = [
            'world-country',
            isAvailable ? 'available' : 'disabled',
            isSelected ? 'selected' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <path
              key={code}
              d={d}
              className={className}
              onMouseMove={(e) => updateTooltip(e, name)}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => {
                if (isAvailable) onSelect(code);
              }}
            />
          );
        })}
      </svg>
      {tooltip && (
        <div
          className="world-select-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.name}
        </div>
      )}
    </div>
  );
};

export default WorldSelectMap;
