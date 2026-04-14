/**
 * Open-Pax — Relationship Matrix
 * ==============================
 * Tracks diplomatic relationships between countries (ally/neutral/hostile).
 * Relationships are directional but symmetric in practice (A→B = B→A for MVP).
 */

import { v4 as uuid } from 'uuid';

export type RelationshipType = 'ally' | 'neutral' | 'hostile';

export interface RelationshipEntry {
  from: string;
  to: string;
  type: RelationshipType;
}

export interface RelationshipMap {
  [regionId: string]: { [regionId: string]: string };
}

export class RelationshipMatrix {
  private matrix = new Map<string, Map<string, RelationshipType>>();

  /**
   * Set a relationship from one region to another
   */
  set(from: string, to: string, rel: RelationshipType): void {
    if (!this.matrix.has(from)) this.matrix.set(from, new Map());
    this.matrix.get(from)!.set(to, rel);
    // Symmetric for MVP
    if (!this.matrix.has(to)) this.matrix.set(to, new Map());
    this.matrix.get(to)!.set(from, rel);
  }

  /**
   * Get relationship from one region to another (defaults to 'neutral')
   */
  get(from: string, to: string): RelationshipType {
    return this.matrix.get(from)?.get(to) ?? 'neutral';
  }

  /**
   * Get all relationships for a given region
   */
  getFor(regionId: string): { id: string; relationship: RelationshipType }[] {
    const row = this.matrix.get(regionId);
    if (!row) return [];
    return Array.from(row.entries()).map(([id, rel]) => ({ id, relationship: rel }));
  }

  /**
   * Degrade relationship (neutral → hostile, ally → neutral)
   */
  degrade(from: string, to: string): void {
    const current = this.get(from, to);
    const next: RelationshipType =
      current === 'ally' ? 'neutral' :
      current === 'neutral' ? 'hostile' : 'hostile';
    this.set(from, to, next);
  }

  /**
   * Improve relationship (hostile → neutral, neutral → ally)
   */
  improve(from: string, to: string): void {
    const current = this.get(from, to);
    const next: RelationshipType =
      current === 'hostile' ? 'neutral' :
      current === 'neutral' ? 'ally' : 'ally';
    this.set(from, to, next);
  }

  /**
   * Serialize to plain object for JSON storage
   */
  toJSON(): RelationshipMap {
    const result: RelationshipMap = {};
    for (const [from, row] of this.matrix) {
      result[from] = Object.fromEntries(row);
    }
    return result;
  }

  /**
   * Load from a plain serialized object
   */
  static fromJSON(data: RelationshipMap): RelationshipMatrix {
    const matrix = new RelationshipMatrix();
    for (const [from, row] of Object.entries(data)) {
      for (const [to, rel] of Object.entries(row)) {
        matrix.set(from, to, rel as RelationshipType);
      }
    }
    return matrix;
  }
}
