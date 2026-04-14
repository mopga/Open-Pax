/**
 * Open-Pax — Maps Routes
 * ======================
 */

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { mapRepository } from '../repositories';

export const mapsRouter = Router();

// Helper: convert points to SVG path
const pointsToPath = (points: { x: number; y: number }[]): string => {
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
};

mapsRouter.post('/', (req, res) => {
  const { name, width = 800, height = 600, regions, objects } = req.body;

  const map = {
    id: uuid().slice(0, 8),
    name,
    width,
    height,
    regions: regions.map((r: any) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      path: r.path || pointsToPath(r.points || []),
    })),
    objects: objects || [],
  };

  mapRepository.create(map);
  res.json({ id: map.id, name: map.name });
});

mapsRouter.get('/', (_req, res) => {
  const list = mapRepository.findAll().map(m => ({
    id: m.id,
    name: m.name,
    regions_count: m.regions_count,
    created_at: m.created_at,
  }));
  res.json(list);
});

mapsRouter.get('/:id', (req, res) => {
  const map = mapRepository.findById(req.params.id);
  if (!map) {
    res.status(404).json({ error: 'Map not found' });
    return;
  }
  res.json(map);
});

mapsRouter.delete('/:id', (req, res) => {
  const map = mapRepository.findById(req.params.id);
  if (!map) {
    res.status(404).json({ error: 'Map not found' });
    return;
  }
  mapRepository.delete(req.params.id);
  res.json({ status: 'deleted', id: req.params.id });
});
