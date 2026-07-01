/**
 * Safe path resolver for filesystem reads.
 *
 * Confines user-supplied identifiers to a single base directory
 * by (1) validating the id against a strict whitelist regex, and
 * (2) confirming the resolved absolute path is a child of the
 * base directory.
 */

import path from 'path';
import fs from 'fs';

const VALID_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export interface SafeFileResult {
  ok: boolean;
  path?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Resolve a user-supplied id to a file inside `baseDir`.
 * Returns either a usable absolute path, or a 4xx error description.
 *
 * Example:
 *   resolveInside('data/templates', req.params.id, '.json')
 *   -> tries <cwd>/data/templates/<id>.json
 */
export function resolveInside(
  baseRel: string,
  userId: string,
  suffix: string,
): SafeFileResult {
  if (typeof userId !== 'string' || !VALID_ID.test(userId)) {
    return { ok: false, error: 'invalid id', statusCode: 400 };
  }

  const baseAbs = path.resolve(process.cwd(), baseRel);
  const candidate = path.resolve(baseAbs, `${userId}${suffix}`);

  // path.relative returns '' when both paths are equal; otherwise a path
  // starting with '..' means candidate escaped the base directory.
  const rel = path.relative(baseAbs, candidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'path escaped base dir', statusCode: 400 };
  }

  return { ok: true, path: candidate };
}

export function safeReadJson<T = unknown>(absPath: string): T | null {
  try {
    const raw = fs.readFileSync(absPath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
