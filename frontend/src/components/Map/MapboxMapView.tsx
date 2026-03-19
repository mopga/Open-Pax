/**
 * Open-Pax — Mapbox GL JS Map View
 * =================================
 * Renders game map using Mapbox GL JS instead of SVG.
 * Supports: region fills, borders, labels, selection, hover, object markers.
 */

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Region } from '../../types';
import type { MapObject } from '../../types';

interface MapboxMapViewProps {
  regions: Region[];
  selectedRegionId?: string;
  onRegionClick?: (regionId: string) => void;
  changedRegionIds?: string[];
}

const OBJECT_ICONS: Record<string, { color: string; label: string }> = {
  city: { color: '#ffffff', label: '●' },
  army: { color: '#ff4444', label: '▲' },
  fleet: { color: '#4488ff', label: '◆' },
  missile: { color: '#ff8800', label: '✈' },
  radar: { color: '#44ff44', label: '◎' },
  port: { color: '#4488ff', label: '⚓' },
  factory: { color: '#ffaa00', label: '⚙' },
  university: { color: '#aa44ff', label: '★' },
};

// Mapbox access token from env
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

export const MapboxMapView: React.FC<MapboxMapViewProps> = ({
  regions,
  selectedRegionId,
  onRegionClick,
  changedRegionIds = [],
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);

  // Calculate map bounds from regions
  const getBounds = () => {
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    regions.forEach(region => {
      if (!region.geojson) return;
      try {
        const geojson = JSON.parse(region.geojson);
        if (geojson.geometry?.coordinates?.[0]) {
          geojson.geometry.coordinates[0].forEach((coord: number[]) => {
            minLng = Math.min(minLng, coord[0]);
            maxLng = Math.max(maxLng, coord[0]);
            minLat = Math.min(minLat, coord[1]);
            maxLat = Math.max(maxLat, coord[1]);
          });
        }
      } catch (e) { /* skip invalid geojson */ }
    });

    if (!isFinite(minLng)) {
      return [[-180, -85], [180, 85]] as [[number, number], [number, number]];
    }

    // Add padding
    const padding = 0.1;
    const lngPad = (maxLng - minLng) * padding;
    const latPad = (maxLat - minLat) * padding;

    return [
      [minLng - lngPad, minLat - latPad],
      [maxLng + lngPad, maxLat + latPad]
    ] as [[number, number], [number, number]];
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    if (!MAPBOX_TOKEN) {
      console.error('Mapbox token not configured. Set VITE_MAPBOX_TOKEN in .env');
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [0, 20],
      zoom: 1,
      projection: 'mercator',
      attributionControl: false,
    });

    map.current.on('load', () => {
      setMapLoaded(true);
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Add/update regions source and layers
  useEffect(() => {
    if (!map.current || !mapLoaded || regions.length === 0) return;

    const geojsonFeatures: GeoJSON.Feature[] = [];

    regions.forEach(region => {
      if (!region.geojson) return;
      try {
        const parsed = JSON.parse(region.geojson);
        parsed.properties = {
          ...parsed.properties,
          id: region.id,
          name: region.name,
          color: region.color,
          isSelected: region.id === selectedRegionId,
          isHovered: hoveredRegionId === region.id,
          isChanged: changedRegionIds.includes(region.id),
        };
        geojsonFeatures.push(parsed);
      } catch (e) { /* skip */ }
    });

    const sourceId = 'regions';
    const fillLayerId = 'regions-fill';
    const lineLayerId = 'regions-line';
    const labelLayerId = 'regions-label';

    // Remove existing layers if any
    [labelLayerId, lineLayerId, fillLayerId].forEach(id => {
      if (map.current?.getLayer(id)) {
        map.current.removeLayer(id);
      }
    });

    // Remove existing source
    if (map.current?.getSource(sourceId)) {
      map.current.removeSource(sourceId);
    }

    // Add new source
    map.current.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: geojsonFeatures,
      },
    });

    // Add fill layer
    map.current.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': [
          'case',
          ['get', 'isSelected'], '#ffffff',
          ['get', 'color']
        ],
        'fill-opacity': [
          'case',
          ['get', 'isSelected'], 0.9,
          ['get', 'isHovered'], 0.95,
          0.85
        ],
      },
    });

    // Add line layer (borders)
    map.current.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': [
          'case',
          ['get', 'isSelected'], '#ffffff',
          ['get', 'isHovered'], '#666666',
          '#1a1a1a'
        ],
        'line-width': [
          'case',
          ['get', 'isSelected'], 3,
          2
        ],
      },
    });

    // Add label layer
    map.current.addLayer({
      id: labelLayerId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 14,
        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
        'text-anchor': 'center',
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 2,
      },
    });

    // Click handler for regions
    map.current.on('click', fillLayerId, (e) => {
      if (e.features && e.features[0]) {
        const props = e.features[0].properties;
        if (props?.id && onRegionClick) {
          onRegionClick(props.id);
        }
      }
    });

    // Hover handlers
    map.current.on('mouseenter', fillLayerId, () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = 'pointer';
      }
    });

    map.current.on('mouseleave', fillLayerId, () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = '';
      }
      setHoveredRegionId(null);
    });

    map.current.on('mousemove', fillLayerId, (e) => {
      if (e.features && e.features[0]) {
        const props = e.features[0].properties;
        setHoveredRegionId(props?.id || null);
      }
    });

    // Fit bounds
    const bounds = getBounds();
    map.current.fitBounds(bounds, { padding: 50, duration: 500 });

  }, [regions, mapLoaded, selectedRegionId, hoveredRegionId, changedRegionIds]);

  // Collect all objects for markers
  const allObjects: (MapObject & { regionName: string; regionColor: string })[] = [];
  regions.forEach(region => {
    if (region.objects) {
      region.objects.forEach((obj: MapObject) => {
        allObjects.push({
          ...obj,
          regionName: region.name,
          regionColor: region.color,
        });
      });
    }
  });

  // Add markers for objects
  useEffect(() => {
    if (!map.current || !mapLoaded || allObjects.length === 0) return;

    // Remove existing markers
    document.querySelectorAll('.mapbox-marker').forEach(el => el.remove());

    allObjects.forEach(obj => {
      if (obj.x === undefined || obj.y === undefined) return;

      // Convert SVG coordinates to lng/lat
      // Assuming 2000x1500 canvas mapped to -180 to 180 lng, 90 to -90 lat
      const lng = (obj.x / 2000) * 360 - 180;
      const lat = 90 - (obj.y / 1500) * 180;

      const icon = OBJECT_ICONS[obj.type] || OBJECT_ICONS.city;

      // Create custom marker element
      const el = document.createElement('div');
      el.className = 'mapbox-marker';
      el.style.cssText = `
        width: 24px;
        height: 24px;
        background: ${icon.color};
        border: 2px solid #1a1a1a;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      `;
      el.textContent = icon.label;

      new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 15 })
            .setHTML(`<div style="color:#333;padding:4px;"><b>${obj.name}</b><br/>${obj.type}</div>`)
        )
        .addTo(map.current!);
    });

  }, [allObjects, mapLoaded]);

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: '#0a0a0f',
        color: '#888',
        padding: '40px',
        textAlign: 'center',
      }}>
        <div>
          <h3>Mapbox Token Not Configured</h3>
          <p>Set <code>VITE_MAPBOX_TOKEN</code> in <code>frontend/.env</code></p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {!mapLoaded && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#667eea',
          fontSize: '1.2rem',
        }}>
          Loading map...
        </div>
      )}
    </div>
  );
};
