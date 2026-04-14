/**
 * Open-Pax — Templates Routes
 * ===========================
 */

import { Router } from 'express';
import { countryRepository } from '../repositories/country.repository';

export const templatesRouter = Router();

templatesRouter.get('/', (_req, res) => {
  const fs = require('fs');
  const path = require('path');
  const templatesDir = path.join(process.cwd(), 'data', 'templates');

  let templates: any[] = [];
  try {
    if (fs.existsSync(templatesDir)) {
      const files = fs.readdirSync(templatesDir).filter((f: string) => f.endsWith('.json'));
      templates = files.map((file: string) => {
        const content = JSON.parse(fs.readFileSync(path.join(templatesDir, file), 'utf-8'));
        return {
          id: content.id,
          name: content.name,
          description: content.description,
          start_date: content.start_date,
          country_count: content.country_codes?.length || 0,
        };
      });
    }
  } catch (e) {
    console.error('[Templates] Error reading templates:', e);
  }

  res.json({ templates });
});

templatesRouter.get('/:id', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const templatePath = path.join(process.cwd(), 'data', 'templates', `${req.params.id}.json`);

  try {
    if (!fs.existsSync(templatePath)) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
    const countries = countryRepository.findByCodes(template.country_codes || []);

    res.json({
      ...template,
      countries,
    });
  } catch (e) {
    console.error('[Template] Error:', e);
    res.status(500).json({ error: 'Failed to load template' });
  }
});
