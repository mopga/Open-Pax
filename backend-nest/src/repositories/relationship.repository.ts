/**
 * Open-Pax — Relationship Repository
 * ===================================
 */

import db from '../database';
import { v4 as uuid } from 'uuid';
import type { RelationshipType } from '../core/RelationshipMatrix';
import type { RelationshipChange } from '../core/simulation/types';

export interface RelationshipRow {
  id: string;
  world_id: string;
  from_region_id: string;
  to_region_id: string;
  relationship: RelationshipType;
}

export const relationshipRepository = {
  /**
   * Bulk insert or replace all relationships for a world
   */
  initForWorld(
    worldId: string,
    relationships: { from: string; to: string; type: RelationshipType }[]
  ): void {
    const existing = db.prepare('SELECT id FROM country_relationships WHERE world_id = ?').all(worldId) as { id: string }[];
    if (existing.length > 0) {
      db.prepare('DELETE FROM country_relationships WHERE world_id = ?').run(worldId);
    }

    const insert = db.prepare(`
      INSERT INTO country_relationships (id, world_id, from_region_id, to_region_id, relationship)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertAll = db.transaction((rels: typeof relationships) => {
      for (const rel of rels) {
        insert.run(uuid(), worldId, rel.from, rel.to, rel.type);
      }
    });

    insertAll(relationships);
  },

  /**
   * Load all relationships for a world
   */
  getForWorld(worldId: string): { from: string; to: string; type: RelationshipType }[] {
    const rows = db.prepare(
      'SELECT from_region_id, to_region_id, relationship FROM country_relationships WHERE world_id = ?'
    ).all(worldId) as RelationshipRow[];
    return rows.map(r => ({ from: r.from_region_id, to: r.to_region_id, type: r.relationship }));
  },

  /**
   * Bulk upsert relationship changes
   */
  bulkUpsert(worldId: string, changes: RelationshipChange[]): void {
    if (changes.length === 0) return;

    const upsert = db.prepare(`
      INSERT INTO country_relationships (id, world_id, from_region_id, to_region_id, relationship)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(world_id, from_region_id, to_region_id)
      DO UPDATE SET relationship = excluded.relationship
    `);

    const upsertAll = db.transaction((chs: RelationshipChange[]) => {
      for (const ch of chs) {
        upsert.run(uuid(), worldId, ch.from, ch.to, ch.newRelationship);
      }
    });

    upsertAll(changes);
  },
};
