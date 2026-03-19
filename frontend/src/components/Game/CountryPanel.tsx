/**
 * Open-Pax — Country Panel Component
 * ==================================
 * Displays selected country info and time jump controls.
 */

import React from 'react';
import type { CountryState } from '../../types';

interface CountryPanelProps {
  country: CountryState;
  currentDate: string;
  onTimeJump: () => void;
}

export const CountryPanel: React.FC<CountryPanelProps> = ({
  country,
  currentDate,
  onTimeJump,
}) => {
  return (
    <div className="country-panel">
      <div className="country-flag" style={{ backgroundColor: country.color }} />

      <div className="country-code">{country.code}</div>
      <div className="country-name">{country.name}</div>

      {country.ideology && (
        <div className="country-ideology">{country.ideology}</div>
      )}

      <div className="country-divider" />

      <div className="country-status">
        {country.status === 'superpower' && '🔥 Сверхдержава'}
        {country.status === 'major' && '⭐ Крупная держава'}
        {country.status === 'regional' && '🌐 Региональная'}
        {country.status === 'minor' && '📍 Малая'}
      </div>

      <div className="country-date">
        📅 {currentDate}
      </div>

      <button className="btn-time-jump" onClick={onTimeJump}>
        ⏱ Время →
      </button>
    </div>
  );
};

export default CountryPanel;
