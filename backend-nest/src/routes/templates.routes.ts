/**
 * Open-Pax — Templates Routes
 * ===========================
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { countryRepository } from '../repositories/country.repository';
import { resolveInside, safeReadJson } from '../utils/safe-path';

export const templatesRouter = Router();

templatesRouter.get('/', (_req, res) => {
  const templatesDir = path.join(process.cwd(), 'data', 'templates');

  let templates: any[] = [];
  try {
    if (fs.existsSync(templatesDir)) {
      const files = fs.readdirSync(templatesDir).filter((f: string) => f.endsWith('.json'));
      templates = files.map((file: string) => {
        const content = safeReadJson<any>(path.join(templatesDir, file));
        if (!content) return null;
        return {
          id: content.id,
          name: content.name,
          description: content.description,
          start_date: content.start_date,
          country_count: content.country_codes?.length || 0,
        };
      }).filter((x): x is NonNullable<typeof x> => x !== null);
    }
  } catch (e) {
    console.error('[Templates] Error reading templates:', e);
  }

  res.json({ templates });
});

templatesRouter.get('/:id', (req, res) => {
  // Confine the user-supplied id to data/templates; reject anything with
  // path separators or that escapes the base dir.
  const resolved = resolveInside('data/templates', req.params.id, '.json');
  if (!resolved.ok || !resolved.path) {
    res.status(resolved.statusCode ?? 400).json({ error: resolved.error });
    return;
  }

  const template = safeReadJson<any>(resolved.path);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  const countries = countryRepository.findByCodes(template.country_codes || []);

  res.json({
    ...template,
    countries,
  });
});
