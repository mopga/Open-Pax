/**
 * Open-Pax — Countries Utility
 * ============================
 * Loads and provides access to the countries registry.
 */

import path from 'path';

// Load countries at runtime (not at compile time)
function loadCountries() {
  const countriesPath = path.join(process.cwd(), 'data', 'countries.json');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const data = require(countriesPath);
  return data;
}

const countriesData = loadCountries();

export interface Country {
  code: string;
  name: string;
  color: string;
}

export function getAllCountries(): Country[] {
  return countriesData as Country[];
}

export function getCountry(code: string): Country | undefined {
  return (countriesData as Country[]).find(c => c.code === code);
}

export function getCountriesByCodes(codes: string[]): Country[] {
  return (countriesData as Country[]).filter(c => codes.includes(c.code));
}
