/**
 * Open-Pax — Settings Repository
 * ==============================
 * Простое key → JSON хранилище настроек приложения.
 */

import db from '../database';

export const settingsRepository = {
  get<T>(key: string): T | null {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  },

  set(key: string, value: unknown): void {
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, JSON.stringify(value));
  },

  delete(key: string): void {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
  },
};
