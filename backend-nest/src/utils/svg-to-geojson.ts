/**
 * SVG Path to GeoJSON Polygon Converter
 * =====================================
 * Converts SVG path strings to GeoJSON Feature objects.
 *
 * Supported commands: M (move), L (line), Z (close)
 * Coordinate system: Maps SVG coordinates to lng/lat
 */

export interface SvgToGeoJSONOptions {
  /** Width of the SVG canvas (for coordinate mapping) */
  width: number;
  /** Height of the SVG canvas (for coordinate mapping) */
  height: number;
}

/**
 * Convert SVG coordinates to GeoJSON coordinates (lng, lat)
 * SVG: (0,0) top-left → (width, height) bottom-right
 * GeoJSON: (-180, 90) top-left → (180, -90) bottom-right
 */
function svgToGeoCoords(x: number, y: number, width: number, height: number): [number, number] {
  const lng = (x / width) * 360 - 180;
  const lat = 90 - (y / height) * 180;
  return [lng, lat];
}

/**
 * Parse SVG path string to array of [x, y] coordinates
 * Handles M, L, Z commands and their variants
 */
function parseSvgPath(path: string): number[][] {
  const coordinates: number[][] = [];

  // Match SVG path commands with their numeric arguments
  // Handles: M x y, L x y, Z (and lowercase variants)
  const regex = /([MLZmlz])\s*([-\d.]+(?:\s+[-\d.]+)*)*/g;

  let match;
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;

  while ((match = regex.exec(path)) !== null) {
    const command = match[1];
    const argsStr = match[2] || '';
    const args = argsStr.trim().split(/\s+/).map(parseFloat).filter(n => !isNaN(n));

    switch (command) {
      case 'M': // Move to (absolute)
        currentX = args[0];
        currentY = args[1];
        startX = currentX;
        startY = currentY;
        coordinates.push([currentX, currentY]);
        break;

      case 'm': // Move to (relative)
        currentX += args[0];
        currentY += args[1];
        startX = currentX;
        startY = currentY;
        coordinates.push([currentX, currentY]);
        break;

      case 'L': // Line to (absolute)
        currentX = args[0];
        currentY = args[1];
        coordinates.push([currentX, currentY]);
        break;

      case 'l': // Line to (relative)
        currentX += args[0];
        currentY += args[1];
        coordinates.push([currentX, currentY]);
        break;

      case 'Z': // Close path
      case 'z':
        currentX = startX;
        currentY = startY;
        coordinates.push([startX, startY]);
        break;
    }
  }

  return coordinates;
}

/**
 * Convert SVG path string to GeoJSON Feature<Polygon>
 *
 * @param svgPath - SVG path d attribute string
 * @param options - Canvas dimensions for coordinate mapping
 * @returns GeoJSON Feature with Polygon geometry, or null if conversion fails
 */
export function svgPathToGeoJSON(
  svgPath: string,
  options: SvgToGeoJSONOptions = { width: 2000, height: 1500 }
): GeoJSON.Feature<GeoJSON.Polygon> | null {
  if (!svgPath || typeof svgPath !== 'string') {
    return null;
  }

  const rawCoords = parseSvgPath(svgPath);

  if (rawCoords.length < 3) {
    // Need at least 3 points for a valid polygon
    return null;
  }

  // Convert SVG coordinates to GeoJSON coordinates [lng, lat]
  const ring: [number, number][] = rawCoords.map(([x, y]) =>
    svgToGeoCoords(x, y, options.width, options.height)
  );

  // Ensure polygon is closed (first point == last point)
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first]);
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [ring]
    }
  };
}

/**
 * Convert multiple SVG paths to GeoJSON FeatureCollection
 */
export function svgPathsToGeoJSON(
  regions: Array<{ id: string; svgPath: string; name: string; color: string }>,
  options: SvgToGeoJSONOptions = { width: 2000, height: 1500 }
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

  for (const region of regions) {
    const feature = svgPathToGeoJSON(region.svgPath, options);
    if (feature) {
      feature.properties = {
        id: region.id,
        name: region.name,
        color: region.color
      };
      features.push(feature);
    }
  }

  return {
    type: 'FeatureCollection',
    features
  };
}
