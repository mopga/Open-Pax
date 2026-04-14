/**
 * Open-Pax — Countries Routes
 * ===========================
 */

import { Router } from 'express';
import { countryRepository } from '../repositories/country.repository';

export const countriesRouter = Router();

countriesRouter.get('/', (_req, res) => {
  const countries = countryRepository.getAll();
  res.json({ countries });
});

countriesRouter.get('/:code', (req, res) => {
  const country = countryRepository.findByCode(req.params.code);
  if (!country) {
    res.status(404).json({ error: 'Country not found' });
    return;
  }
  res.json(country);
});
