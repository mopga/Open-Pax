/**
 * Open-Pax — World Repository
 * ===========================
 */

import db from '../database';

export interface WorldRecord {
  id: string;
  name: string;
  description: string;
  start_date: string;
  base_prompt: string;
  historical_accuracy: number;
  created_at: string;
  updated_at: string;
}

export interface RegionRecord {
  id: string;
  name: string;
  svgPath: string;
  geojson?: string;
  color: string;
  owner: string;
  population: number;
  gdp: number;
  militaryPower: number;
  borders: string[];
  objects: any[];
  status: string;
}

export const worldRepository = {
  create: (world: { id: string; name: string; description?: string; startDate?: string; basePrompt?: string; historicalAccuracy?: number }) => {
    const stmt = db.prepare(`
      INSERT INTO worlds (id, name, description, start_date, base_prompt, historical_accuracy)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      world.id,
      world.name,
      world.description || '',
      world.startDate || '1951-01-01',
      world.basePrompt || 'Альтернативная история',
      world.historicalAccuracy ?? 0.8
    );
    return world;
  },

  findById: (id: string): (WorldRecord & { regions: RegionRecord[] }) | null => {
    const stmt = db.prepare('SELECT * FROM worlds WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    const regions = worldRepository.getRegions(id);
    return {
      ...row,
      regions,
    };
  },

  getRegions: (worldId: string): RegionRecord[] => {
    const stmt = db.prepare('SELECT * FROM world_regions WHERE world_id = ?');
    const rows = stmt.all(worldId) as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      svgPath: row.svg_path,
      geojson: row.geojson,
      color: row.color,
      owner: row.owner,
      population: row.population,
      gdp: row.gdp,
      militaryPower: row.military_power,
      borders: JSON.parse(row.borders),
      objects: JSON.parse(row.objects || '[]'),
      status: row.status,
    }));
  },

  addRegion: (region: { id: string; worldId: string; name: string; svgPath?: string; geojson?: string; color?: string; owner?: string; population?: number; gdp?: number; militaryPower?: number }) => {
    const stmt = db.prepare(`
      INSERT INTO world_regions (id, world_id, name, svg_path, geojson, color, owner, population, gdp, military_power)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      region.id,
      region.worldId,
      region.name,
      region.svgPath || '',
      region.geojson || null,
      region.color || '#888888',
      region.owner || 'neutral',
      region.population || 1000000,
      region.gdp || 100,
      region.militaryPower || 100
    );
    return region;
  },

  updateRegion: (regionId: string, updates: Partial<{
    name: string; color: string; owner: string; population: number; gdp: number; militaryPower: number; objects: any[]; geojson: string
  }>) => {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color); }
    if (updates.owner !== undefined) { fields.push('owner = ?'); values.push(updates.owner); }
    if (updates.population !== undefined) { fields.push('population = ?'); values.push(updates.population); }
    if (updates.gdp !== undefined) { fields.push('gdp = ?'); values.push(updates.gdp); }
    if (updates.militaryPower !== undefined) { fields.push('military_power = ?'); values.push(updates.militaryPower); }
    if (updates.objects !== undefined) { fields.push('objects = ?'); values.push(JSON.stringify(updates.objects)); }
    if (updates.geojson !== undefined) { fields.push('geojson = ?'); values.push(updates.geojson); }

    if (fields.length === 0) return;

    values.push(regionId);
    const stmt = db.prepare(`UPDATE world_regions SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  },

  update: (worldId: string, updates: Partial<{
    name: string;
    description: string;
    startDate: string;
    basePrompt: string;
    historicalAccuracy: number;
  }>) => {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.startDate !== undefined) { fields.push('start_date = ?'); values.push(updates.startDate); }
    if (updates.basePrompt !== undefined) { fields.push('base_prompt = ?'); values.push(updates.basePrompt); }
    if (updates.historicalAccuracy !== undefined) { fields.push('historical_accuracy = ?'); values.push(updates.historicalAccuracy); }

    if (fields.length === 0) return;

    values.push(worldId);
    const stmt = db.prepare(`UPDATE worlds SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  },

  createWithRegions: (world: { id: string; name: string; description?: string; startDate?: string; basePrompt?: string; historicalAccuracy?: number }, regions: any[]) => {
    const createWorld = db.transaction(() => {
      worldRepository.create(world);
      for (const region of regions) {
        worldRepository.addRegion({
          id: region.id,
          worldId: world.id,
          name: region.name,
          svgPath: region.svgPath,
          geojson: region.geojson,
          color: region.color,
          owner: region.owner,
          population: region.population,
          gdp: region.gdp,
          militaryPower: region.militaryPower,
        });
      }
    });
    createWorld();
    return worldRepository.findById(world.id);
  },
};
