/**
 * Open-Pax — Country Repository
 * ============================
 */

import { getAllCountries, getCountry, getCountriesByCodes, type Country } from '../utils/countries';

export const countryRepository = {
  getAll: (): Country[] => getAllCountries(),

  findByCode: (code: string): Country | undefined => getCountry(code),

  findByCodes: (codes: string[]): Country[] => getCountriesByCodes(codes),
};
