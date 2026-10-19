/**
 * Open-Pax — Country Selector Component
 * =====================================
 * Выбор государства после выбора пресета. Играть можно за любое государство
 * мира: рекомендуемые пресетом — первыми, остальные — по алфавиту, с поиском.
 * Слева карта мира (WorldSelectMap) в цветах государств, справа список.
 * Клик выделяет государство, кнопка «Играть» подтверждает выбор (onSelect).
 * Если /api/geo/countries недоступен — только список.
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
  // Выделенное (но ещё не подтверждённое) государство
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // false → геоданные не загрузились, показываем только список
  const [mapAvailable, setMapAvailable] = useState(true);

  const { codes, ownerOf, colorOf, nameOf } = useMemo(() => {
    const ownerOf: Record<string, string> = {};
    const colorOf: Record<string, string> = {};
    const nameOf: Record<string, string> = {};
    for (const c of countries) {
      colorOf[c.code] = c.color;
      nameOf[c.code] = c.name;
      for (const m of c.members ?? []) ownerOf[m] = c.code;
    }
    return { codes: countries.map(c => c.code), ownerOf, colorOf, nameOf };
  }, [countries]);

  const selectedCountry = countries.find((c) => c.code === selectedCode) ?? null;

  const q = query.trim().toLowerCase();
  const visible = q
    ? countries.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
    : countries;
  const recommended = visible.filter(c => c.recommended);
  const others = visible.filter(c => !c.recommended);

  /** Подтверждение выбора — только после клика по «Играть» */
  const confirmSelection = () => {
    if (selectedCode) onSelect(selectedCode);
  };

  const renderItem = (country: Country) => (
    <div
      key={country.code}
      className={`country-list-item${selectedCode === country.code ? ' selected' : ''}`}
      onClick={() => setSelectedCode(country.code)}
      title={country.description}
    >
      <div className="country-color" style={{ backgroundColor: country.color }} />
      <div className="country-name">
        {country.name}
        {country.members && country.members.length > 0 && (
          <div className="country-members">+ {country.members.length} стран карты</div>
        )}
      </div>
      <div className="country-code">{country.code}</div>
    </div>
  );

  return (
    <div className="country-selector">
      <div className="selector-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h2>Выберите государство: {template.name}</h2>
      </div>

      <div className="template-info">
        <p>{template.description}</p>
        <div className="start-date">Начальная дата: {template.start_date}</div>
      </div>

      <div className="country-selector-layout">
        {mapAvailable && (
          <div className="country-selector-map">
            <WorldSelectMap
              availableCodes={codes}
              selectedCode={selectedCode}
              ownerOf={ownerOf}
              colorOf={colorOf}
              nameOf={nameOf}
              onSelect={setSelectedCode}
              onError={() => setMapAvailable(false)}
            />
          </div>
        )}
        <div className="country-list">
          <input
            className="country-search"
            type="search"
            placeholder="Поиск государства…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {recommended.length > 0 && <div className="country-list-heading">Рекомендуемые</div>}
          {recommended.map(renderItem)}
          {others.length > 0 && <div className="country-list-heading">Все государства</div>}
          {others.map(renderItem)}
          {visible.length === 0 && <div className="country-list-heading">Ничего не найдено</div>}
        </div>
      </div>

      {/* Панель подтверждения выбора */}
      <div className="country-confirm-bar">
        <span className="country-confirm-label">
          {selectedCountry
            ? `Выбрано: ${selectedCountry.name} (${selectedCountry.code})`
            : 'Выберите государство на карте или в списке'}
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
