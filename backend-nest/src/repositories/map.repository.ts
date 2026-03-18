/**
 * Open-Pax — Map Repository
 * =========================
 */

import db from '../database';

export interface MapRecord {
  id: string;
  name: string;
  width: number;
  height: number;
  regions: any[];
  objects?: any[];
  created_at: string;
}

export const mapRepository = {
  create: (map: { id: string; name: string; width: number; height: number; regions: any[]; objects?: any[] }) => {
    const stmt = db.prepare(`
      INSERT INTO maps (id, name, width, height, regions, objects)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(map.id, map.name, map.width, map.height, JSON.stringify(map.regions), JSON.stringify(map.objects || []));
    return map;
  },

  findById: (id: string): MapRecord | null => {
    const stmt = db.prepare('SELECT * FROM maps WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      ...row,
      regions: JSON.parse(row.regions),
      objects: JSON.parse(row.objects || '[]'),
    };
  },

  findAll: (): (MapRecord & { regions_count: number })[] => {
    const stmt = db.prepare('SELECT id, name, width, height, regions, objects, created_at FROM maps ORDER BY created_at DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      ...row,
      regions: JSON.parse(row.regions),
      objects: JSON.parse(row.objects || '[]'),
      regions_count: JSON.parse(row.regions).length,
    }));
  },

  delete: (id: string) => {
    const stmt = db.prepare('DELETE FROM maps WHERE id = ?');
    stmt.run(id);
  },
};
