/**
 * Open-Pax — Country Selector Component
 * =====================================
 * Выбор страны после выбора шаблона.
 * Этап 4: двухколоночный лейаут — слева карта мира (WorldSelectMap),
 * справа компактный список стран. Клик выделяет страну,
 * кнопка «Играть» подтверждает выбор (onSelect).
 * Если /api/geo/countries недоступен — fallback на старую сетку country-grid.
 */

import React, { useMemo, useState } from 'react';
import type { WorldTemplate, Country } from '../../types';
import { WorldSelectMap } from './WorldSelectMap';

interface CountrySelectorProps {
  template: WorldTemplate;
  onSelect: (countryCode: string) => void;
  onBack: () => void;
}

export const CountrySelector: React.FC<CountrySelectorProps> = ({ template, onSelect, onBack }) => {
  const countries: Country[] = useMemo(() => template.countries ?? [], [template]);
  // Выделенная (но ещё не подтверждённая) страна
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  // false → геоданные не загрузились, показываем fallback-сетку без карты
  const [mapAvailable, setMapAvailable] = useState(true);

  // Коды стран шаблона — доступные для клика на карте
  const availableCodes = useMemo(() => countries.map((c) => c.code), [countries]);
  const selectedCountry = countries.find((c) => c.code === selectedCode) ?? null;

  /** Подтверждение выбора — только после клика по «Играть» */
  const confirmSelection = () => {
    if (selectedCode) onSelect(selectedCode);
  };

  return (
    <div className="country-selector">
      <div className="selector-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h2>Выберите страну: {template.name}</h2>
      </div>

      <div className="template-info">
        <p>{template.description}</p>
        <div className="start-date">Начальная дата: {template.start_date}</div>
      </div>

      {mapAvailable ? (
        /* Основной режим: карта мира + компактный список */
        <div className="country-selector-layout">
          <div className="country-selector-map">
            <WorldSelectMap
              availableCodes={availableCodes}
              selectedCode={selectedCode}
              onSelect={setSelectedCode}
              onError={() => setMapAvailable(false)}
            />
          </div>
          <div className="country-list">
            {countries.map((country) => (
              <div
                key={country.code}
                className={`country-list-item${selectedCode === country.code ? ' selected' : ''}`}
                onClick={() => setSelectedCode(country.code)}
              >
                <div
                  className="country-color"
                  style={{ backgroundColor: country.color }}
                />
                <div className="country-name">{country.name}</div>
                <div className="country-code">{country.code}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Fallback: старая сетка карточек без карты */
        <div className="country-grid">
          {countries.map((country) => (
            <div
              key={country.code}
              className={`country-card${selectedCode === country.code ? ' selected' : ''}`}
              onClick={() => setSelectedCode(country.code)}
            >
              <div
                className="country-color"
                style={{ backgroundColor: country.color }}
              />
              <div className="country-name">{country.name}</div>
              <div className="country-code">{country.code}</div>
            </div>
          ))}
        </div>
      )}

      {/* Панель подтверждения выбора */}
      <div className="country-confirm-bar">
        <span className="country-confirm-label">
          {selectedCountry
            ? `Выбрано: ${selectedCountry.name} (${selectedCountry.code})`
            : 'Выберите страну на карте или в списке'}
        </span>
        <button
          className="btn-play"
          disabled={!selectedCode}
          onClick={confirmSelection}
        >
          Играть
        </button>
      </div>
    </div>
  );
};

export default CountrySelector;
