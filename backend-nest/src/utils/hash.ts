/**
 * Simple string hash for cache keys
 */
export function hash(data: string): string {
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = Math.imul(31, h) + data.charCodeAt(i) | 0;
  }
  return h.toString(36);
}
