/**
 * Short, collision-resistant identifier generator.
 *
 * Replaces the previous uuid().slice(0, 8) (4.3B keyspace, birthday
 * collision at ~65k keys) and uuid().slice(0, 4) (65k keyspace,
 * collision at ~256 keys) with a UUID-derived 12-hex-char id.
 *
 * Default length 12 chars -> 48 bits of entropy per id.
 * Birthday collision 50% threshold is then at ~2^24 (~16M) ids.
 */

import { randomUUID } from 'crypto';

const HEX = /^[0-9a-f]+$/;

/**
 * Generate a short random id.
 * @param length number of hex characters to keep (1..32). Default 12.
 */
export function shortId(length: number = 12): string {
  if (!Number.isInteger(length) || length < 1 || length > 32) {
    throw new RangeError(`shortId length must be 1..32, got ${length}`);
  }
  const hex = randomUUID().replace(/-/g, '');
  return hex.slice(0, length);
}

/** Test helper: validate that a string is purely hex of expected length. */
export function isHexId(s: string, length: number = 12): boolean {
  return typeof s === 'string' && s.length === length && HEX.test(s);
}
