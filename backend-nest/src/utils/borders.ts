/**
 * Вычисление соседства регионов по геометрии (turf).
 * O(n²) с bbox-префильтром — для сотен регионов выполняется за секунды,
 * вызывается один раз при генерации мира.
 */
import booleanIntersects from '@turf/boolean-intersects';
import bbox from '@turf/bbox';

interface GeoLike {
  type: string;
  coordinates: unknown;
}

/**
 * Принимает карту `code -> GeoJSON geometry/feature`, возвращает `code -> codes соседей`.
 * Ошибки кривой геометрии (self-intersection и т.п.) не валят генерацию — пара пропускается.
 */
export function computeBorders(geometries: Record<string, GeoLike>): Record<string, string[]> {
  const codes = Object.keys(geometries);
  const result: Record<string, string[]> = {};
  for (const c of codes) result[c] = [];

  const bboxes: Record<string, [number, number, number, number] | null> = {};
  for (const c of codes) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bboxes[c] = bbox(geometries[c] as any) as [number, number, number, number];
    } catch {
      bboxes[c] = null;
    }
  }

  for (let i = 0; i < codes.length; i++) {
    const a = codes[i];
    const ba = bboxes[a];
    if (!ba) continue;
    for (let j = i + 1; j < codes.length; j++) {
      const b = codes[j];
      const bb = bboxes[b];
      if (!bb) continue;
      // Быстрый bbox-отсев
      if (ba[0] > bb[2] || bb[0] > ba[2] || ba[1] > bb[3] || bb[1] > ba[3]) continue;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (booleanIntersects(geometries[a] as any, geometries[b] as any)) {
          result[a].push(b);
          result[b].push(a);
        }
      } catch {
        // кривая геометрия — пара не считается соседями
      }
    }
  }
  return result;
}
