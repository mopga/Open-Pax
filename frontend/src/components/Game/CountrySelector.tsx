/**
 * Open-Pax — Country Selector Component
 * =====================================
 * Allows user to select a country to play as after selecting a template.
 */

import React, { useState, useEffect } from 'react';
import type { WorldTemplate, Country } from '../../types';

interface CountrySelectorProps {
  template: WorldTemplate;
  onSelect: (countryCode: string) => void;
  onBack: () => void;
}

export const CountrySelector: React.FC<CountrySelectorProps> = ({ template, onSelect, onBack }) => {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (template.countries) {
      setCountries(template.countries);
      setLoading(false);
    }
  }, [template]);

  if (loading) {
    return (
      <div className="country-selector">
        <div className="loading">Loading countries...</div>
      </div>
    );
  }

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

      <div className="country-grid">
        {countries.map(country => (
          <div
            key={country.code}
            className="country-card"
            onClick={() => onSelect(country.code)}
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
  );
};

export default CountrySelector;
