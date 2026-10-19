declare module 'polylabel' {
  /** Полюс недоступности многоугольника: [x, y] (+ distance) */
  export default function polylabel(polygon: number[][][], precision?: number, debug?: boolean): number[] & { distance: number };
}
