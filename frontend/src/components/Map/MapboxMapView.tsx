/**
 * Open-Pax — игровая карта на MapLibre GL
 * =======================================
 * Компонент сохранил историческое имя MapboxMapView (используется в App.tsx),
 * но внутри работает на MapLibre GL — без токена и без внешних серверов.
 *
 * Слои (снизу вверх), в духе карты PaxHistoria:
 *  - тёмно-синий океан;
 *  - заливки регионов цветом владельца (feature-state: геометрия грузится
 *    один раз, смена владельца — это только смена состояния);
 *  - офлайн-рельеф Natural Earth поверх заливок (тени/света тонируют цвет;
 *    тайлы собирает `npm run map:relief`, без них слой просто не добавляется);
 *  - тонкие контуры регионов и толстые границы государств (общие рёбра
 *    соседей с разными владельцами + берега);
 *  - подписи государств serif-шрифтом из локальных глифов (`npm run map:glyphs`)
 *    вдоль изогнутых линий меток по главной оси страны: капс, разрядка под
 *    длину линии, размер от габаритов, приоритет крупным при коллизиях.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type { StyleSpecification, ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Region, MapObject } from '../../types';
import {
  MIN_LABEL_PX, buildBorderEdges, buildPolityLabels, largestPartBounds, muteColor, polityFocusBounds, parseRegionFeatures, type RegionFeature, type BorderEdge,
} from './mapData';

interface MapboxMapViewProps {
  regions: Region[];
  selectedRegionId?: string;
  onRegionClick?: (regionId: string) => void;
  onRegionHover?: (regionId: string | null) => void;
  changedRegionIds?: string[];
  playerCountryCode?: string;
  /** Реестр государств: id → имя (подписи, тултип). Нет — имя по «домашнему» региону */
  polities?: Record<string, { name: string; color?: string }>;
}

// Иконки игровых объектов на карте
const OBJECT_ICONS: Record<string, { color: string; label: string }> = {
  city: { color: '#ffffff', label: '●' },
  capital: { color: '#ffd700', label: '★' },
  army: { color: '#ff4444', label: '▲' },
  battalion: { color: '#ff4444', label: '▲' },
  fleet: { color: '#4488ff', label: '◆' },
  missile: { color: '#ff8800', label: '✈' },
  radar: { color: '#44ff44', label: '◎' },
  port: { color: '#4488ff', label: '⚓' },
  factory: { color: '#ffaa00', label: '⚙' },
  university: { color: '#aa44ff', label: '★' },
};

const OCEAN_COLOR = '#0c0d30';
const LABEL_FONT = ['PT Serif Regular'];
const MAX_LABEL_PX = 72;

const REGIONS_SOURCE = 'regions';
const BORDERS_SOURCE = 'polity-borders';
const LABELS_SOURCE = 'polity-labels';
const RELIEF_SOURCE = 'relief';

const FILL_LAYER = 'regions-fill';
const RELIEF_LAYER = 'relief';
const OVERLAY_LAYER = 'regions-overlay';
const REGION_LINE_LAYER = 'regions-line';
const BORDER_LAYER = 'polity-borders';
const CHANGED_LAYER = 'regions-changed';
const PLAYER_LAYER = 'regions-player';
const SELECTED_LAYER = 'regions-selected';
const LABEL_LAYER = 'polity-labels';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const buildStyle = (): StyleSpecification => ({
  version: 8,
  name: 'open-pax',
  // Глифы лежат в frontend/public/glyphs — офлайн, без внешнего glyph-сервера
  glyphs: `${window.location.origin}/glyphs/{fontstack}/{range}.pbf`,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': OCEAN_COLOR } }],
});

/**
 * Подписи — набор слоёв по полуинтервалам зума. Кегль в каждом зависит
 * только от данных: MapLibre проверяет, влезает ли подпись в линию, по
 * кеглю на зуме 18, и при кегле «зум × данные» отбрасывает почти все
 * подписи. В начале интервала текст заполняет линию (size0 посчитан для
 * мира 256 px на зуме 0, а у MapLibre мир 512 px — отсюда 2^(z+1)).
 */
const LABEL_BAND_STEP = 0.5;
const LABEL_BAND_MAX_ZOOM = 12;
const labelBands = (): { id: string; minzoom: number; maxzoom: number; scale: number }[] => {
  const bands = [];
  for (let z = 0; z < LABEL_BAND_MAX_ZOOM; z += LABEL_BAND_STEP) {
    bands.push({
      id: `${LABEL_LAYER}-${z.toFixed(1)}`,
      minzoom: z,
      maxzoom: z + LABEL_BAND_STEP >= LABEL_BAND_MAX_ZOOM ? 24 : z + LABEL_BAND_STEP,
      scale: 2 ** (z + 1),
    });
  }
  return bands;
};

const stateFlag = (key: string): ExpressionSpecification => ['boolean', ['feature-state', key], false];

// Предел Web Mercator по широте
const MAX_MERCATOR_LAT = 85;

const clampLngLat = (p: [number, number]): [number, number] => {
  let [lng, lat] = p;
  if (!isFinite(lng)) lng = 0;
  if (!isFinite(lat)) lat = 0;
  lng = Math.max(-180, Math.min(180, lng));
  lat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  return [lng, lat];
};

/** Bbox набора фич (обход всех координат) */
const featuresBounds = (features: RegionFeature[]): [[number, number], [number, number]] | null => {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') {
      const [lng, lat] = c as number[];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    c.forEach(walk);
  };
  features.forEach(f => walk(f.geometry.coordinates));
  if (!isFinite(minLng)) return null;
  return [clampLngLat([minLng, minLat]), clampLngLat([maxLng, maxLat])];
};

export const MapboxMapView: React.FC<MapboxMapViewProps> = ({
  regions,
  selectedRegionId,
  onRegionClick,
  onRegionHover,
  changedRegionIds = [],
  playerCountryCode,
  polities,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const objectMarkers = useRef<maplibregl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  // Карта показывается, когда легли заливки владельцев и камера встала на игрока:
  // иначе на старте видна голая Земля с рельефом без государств
  const [ready, setReady] = useState(false);
  const [tooltipInfo, setTooltipInfo] = useState<{ x: number; y: number; name: string; owner: string | null } | null>(null);

  // Актуальные значения для обработчиков карты (регистрируются один раз)
  const regionsRef = useRef(regions);
  regionsRef.current = regions;
  const politiesRef = useRef(polities);
  politiesRef.current = polities;
  const onRegionClickRef = useRef(onRegionClick);
  onRegionClickRef.current = onRegionClick;
  const onRegionHoverRef = useRef(onRegionHover);
  onRegionHoverRef.current = onRegionHover;

  // Статичная геометрия текущего мира и производные
  const featuresRef = useRef<RegionFeature[]>([]);
  const edgesRef = useRef<BorderEdge[]>([]);
  const geometryKey = useRef('');
  const hoveredId = useRef<string | null>(null);
  const appliedFlags = useRef<{ selected: Set<string>; changed: Set<string> }>({ selected: new Set(), changed: new Set() });

  /** Имя государства: из реестра; у старых миров — имя «домашнего» региона (id `${worldId}_${owner}`) */
  const polityName = useCallback((owner: string): string => {
    const fromRegistry = politiesRef.current?.[owner]?.name;
    if (fromRegistry) return fromRegistry;
    const list = regionsRef.current;
    return list.find(r => r.owner === owner && r.id.endsWith(`_${owner}`))?.name
      ?? list.find(r => r.id.endsWith(`_${owner}`))?.name
      ?? list.find(r => r.owner === owner)?.name
      ?? owner;
  }, []);

  /** Камера на своё государство (как у PaxHistoria), без игрока — весь мир */
  const fitToPlayerOrWorld = useCallback((animate = true) => {
    const m = map.current;
    if (!m) return;
    const ownerOf = (id: string) => regionsRef.current.find(r => r.id === id)?.owner;
    const playerFeatures = playerCountryCode
      ? featuresRef.current.filter(f => ownerOf(f.properties.id) === playerCountryCode)
      : [];
    // Основная территория — крупнейший кусок общего контура (без заморских владений)
    const bounds = playerFeatures.length > 0
      ? polityFocusBounds(edgesRef.current, ownerOf, playerCountryCode!) ?? largestPartBounds(playerFeatures)
      : featuresBounds(featuresRef.current);
    if (bounds) {
      const { clientWidth: w, clientHeight: h } = m.getContainer();
      const padding = Math.round(Math.max(24, Math.min(120, Math.min(w, h) * 0.12)));
      m.fitBounds(bounds, { padding, duration: animate ? 500 : 0, maxZoom: playerFeatures.length > 0 ? 4 : 2 });
    }
  }, [playerCountryCode]);

  const zoomIn = useCallback(() => { map.current?.zoomIn({ duration: 300 }); }, []);
  const zoomOut = useCallback(() => { map.current?.zoomOut({ duration: 300 }); }, []);
  const resetView = useCallback(() => { fitToPlayerOrWorld(true); }, [fitToPlayerOrWorld]);

  // Клавиатурная навигация: + / - / 0 / стрелки
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!map.current) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const pan: Record<string, [number, number]> = {
        ArrowUp: [0, -100], ArrowDown: [0, 100], ArrowLeft: [-100, 0], ArrowRight: [100, 0],
      };
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
      else if (e.key === '-') { e.preventDefault(); zoomOut(); }
      else if (e.key === '0') { e.preventDefault(); resetView(); }
      else if (pan[e.key]) { e.preventDefault(); map.current.panBy(pan[e.key], { duration: 200 }); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, resetView]);

  // Инициализация карты и слоёв (один раз)
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: buildStyle(),
      center: [20, 35],
      zoom: 1.5,
      attributionControl: false,
      renderWorldCopies: true,
    });
    map.current = m;
    // Отладка в dev: карта доступна из консоли как window.__openPaxMap
    if (import.meta.env.DEV) (window as any).__openPaxMap = m;

    m.on('load', () => {
      m.addSource(REGIONS_SOURCE, { type: 'geojson', data: EMPTY_FC, promoteId: 'id' });
      m.addSource(BORDERS_SOURCE, { type: 'geojson', data: EMPTY_FC, promoteId: 'eid' });
      m.addSource(LABELS_SOURCE, { type: 'geojson', data: EMPTY_FC });

      m.addLayer({
        id: FILL_LAYER,
        type: 'fill',
        source: REGIONS_SOURCE,
        paint: {
          'fill-color': ['coalesce', ['feature-state', 'color'], '#5a5a66'] as ExpressionSpecification,
          'fill-opacity': 0.92,
        },
      });

      // Подсветка выбора/hover поверх рельефа
      m.addLayer({
        id: OVERLAY_LAYER,
        type: 'fill',
        source: REGIONS_SOURCE,
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': ['case', stateFlag('selected'), 0.18, stateFlag('hovered'), 0.08, 0] as ExpressionSpecification,
        },
      });

      // Тонкие контуры регионов: на дальнем зуме скрыты, проявляются при
      // приближении («диапазон затухания границ» у PaxHistoria)
      m.addLayer({
        id: REGION_LINE_LAYER,
        type: 'line',
        source: REGIONS_SOURCE,
        paint: {
          'line-color': 'rgb(12, 10, 24)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.3, 6, 0.9] as ExpressionSpecification,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0, 3.5, 0.3, 6, 0.45] as ExpressionSpecification,
        },
      });

      // Границы государств и берега
      m.addLayer({
        id: BORDER_LAYER,
        type: 'line',
        source: BORDERS_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#100c1c',
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 4, 1.4, 7, 2.4] as ExpressionSpecification,
          'line-opacity': ['case', stateFlag('diff'), 0.9, 0] as ExpressionSpecification,
        },
      });

      // Обводка своего государства — по рёбрам, где игрок только с одной стороны
      m.addLayer({
        id: PLAYER_LAYER,
        type: 'line',
        source: BORDERS_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#f5ecd2',
          'line-width': 1.4,
          'line-opacity': ['case', stateFlag('player'), 0.7, 0] as ExpressionSpecification,
        },
      });

      m.addLayer({
        id: CHANGED_LAYER,
        type: 'line',
        source: REGIONS_SOURCE,
        paint: {
          'line-color': '#ffd24a',
          'line-width': 2.6,
          'line-opacity': ['case', stateFlag('changed'), 1, 0] as ExpressionSpecification,
        },
      });

      m.addLayer({
        id: SELECTED_LAYER,
        type: 'line',
        source: REGIONS_SOURCE,
        paint: {
          'line-color': '#ffffff',
          'line-width': 2.4,
          'line-opacity': ['case', stateFlag('selected'), 1, 0] as ExpressionSpecification,
        },
      });

      // Подписи государств (слой на каждый полуинтервал зума, см. labelBands)
      for (const band of labelBands()) m.addLayer({
        id: band.id,
        type: 'symbol',
        source: LABELS_SOURCE,
        minzoom: band.minzoom,
        maxzoom: band.maxzoom,
        // Слишком мелкие на этом зуме подписи не показываем
        filter: ['>=', ['*', ['get', 'size0'], band.scale], MIN_LABEL_PX] as ExpressionSpecification,
        layout: {
          'text-field': ['get', 'name'] as ExpressionSpecification,
          'text-font': LABEL_FONT,
          'text-transform': 'uppercase',
          // Подпись вдоль линии метки (дуга по главной оси страны)
          'symbol-placement': 'line-center',
          'text-rotation-alignment': 'map',
          'text-keep-upright': true,
          'text-max-angle': 32,
          'text-letter-spacing': ['get', 'letterSpacing'] as ExpressionSpecification,
          'text-size': ['min', MAX_LABEL_PX, ['*', ['get', 'size0'], band.scale]] as ExpressionSpecification,
          'text-padding': 2,
          'symbol-sort-key': ['-', 0, ['get', 'area0']] as ExpressionSpecification,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#f3ead7',
          'text-halo-color': 'rgba(22, 16, 12, 0.85)',
          'text-halo-width': 1.3,
          'text-halo-blur': 0.4,
          'text-opacity': 0.96,
        },
      });

      // Офлайн-рельеф — только если тайлы собраны (npm run map:relief)
      fetch('/tiles/relief/0/0/0.webp', { method: 'HEAD' })
        .then(res => {
          if (!res.ok || !map.current || map.current.getSource(RELIEF_SOURCE)) return;
          map.current.addSource(RELIEF_SOURCE, {
            type: 'raster',
            tiles: [`${window.location.origin}/tiles/relief/{z}/{x}/{y}.webp`],
            tileSize: 256,
            maxzoom: 6,
          });
          map.current.addLayer({
            id: RELIEF_LAYER,
            type: 'raster',
            source: RELIEF_SOURCE,
            paint: { 'raster-opacity': 0.85, 'raster-contrast': 0.25, 'raster-fade-duration': 0 },
          }, OVERLAY_LAYER);
        })
        .catch(() => { /* без рельефа */ });

      // Клик и hover
      m.on('click', FILL_LAYER, e => {
        const id = e.features?.[0]?.properties?.id;
        if (id) onRegionClickRef.current?.(id);
      });

      m.on('mousemove', FILL_LAYER, e => {
        const id: string | null = e.features?.[0]?.properties?.id ?? null;
        m.getCanvas().style.cursor = id ? 'pointer' : '';
        if (hoveredId.current !== id) {
          if (hoveredId.current) m.setFeatureState({ source: REGIONS_SOURCE, id: hoveredId.current }, { hovered: false });
          if (id) m.setFeatureState({ source: REGIONS_SOURCE, id }, { hovered: true });
          hoveredId.current = id;
          onRegionHoverRef.current?.(id);
        }
        const region = id ? regionsRef.current.find(r => r.id === id) : undefined;
        if (!region) {
          setTooltipInfo(null);
          return;
        }
        const ownerName = region.owner && region.owner !== 'neutral' ? polityName(region.owner) : null;
        setTooltipInfo({
          x: e.point.x,
          y: e.point.y,
          name: region.name,
          owner: ownerName && ownerName !== region.name ? ownerName : null,
        });
      });

      m.on('mouseleave', FILL_LAYER, () => {
        m.getCanvas().style.cursor = '';
        if (hoveredId.current) m.setFeatureState({ source: REGIONS_SOURCE, id: hoveredId.current }, { hovered: false });
        hoveredId.current = null;
        onRegionHoverRef.current?.(null);
        setTooltipInfo(null);
      });

      setMapLoaded(true);
    });

    return () => {
      // Новая карта при повторном монтировании ещё не загружена — эффекты
      // с setFeatureState должны дождаться её события load
      setMapLoaded(false);
      setReady(false);
      geometryKey.current = '';
      m.remove();
      map.current = null;
    };
  }, [polityName]);

  // Геометрия: пересобирается только при смене набора регионов (новый мир)
  useEffect(() => {
    const m = map.current;
    // Источники появляются в обработчике load: до него (в т.ч. при повторном
    // монтировании, когда mapLoaded ещё «старый») трогать карту нельзя
    if (!m || !mapLoaded || !m.getSource(REGIONS_SOURCE)) return;
    const key = regions.map(r => `${r.id}:${r.geojson ? 1 : 0}`).join('|');
    if (key === geometryKey.current) return;
    geometryKey.current = key;

    const features = parseRegionFeatures(regions);
    featuresRef.current = features;
    (m.getSource(REGIONS_SOURCE) as maplibregl.GeoJSONSource | undefined)
      ?.setData({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection);

    const edges = buildBorderEdges(features);
    edgesRef.current = edges;
    (m.getSource(BORDERS_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: edges.map((e, i) => ({
        type: 'Feature',
        properties: { eid: i },
        geometry: { type: 'MultiLineString', coordinates: e.lines },
      })),
    });
    appliedFlags.current = { selected: new Set(), changed: new Set() };
    // Первый кадр — сразу на своём государстве, без пролёта от вида на весь мир
    fitToPlayerOrWorld(false);
    if (features.length > 0) setReady(true);
  }, [regions, mapLoaded, fitToPlayerOrWorld]);

  // Владельцы и цвета: feature-state заливок, границы государств, подписи
  useEffect(() => {
    const m = map.current;
    // Источники появляются в обработчике load: до него (в т.ч. при повторном
    // монтировании, когда mapLoaded ещё «старый») трогать карту нельзя
    if (!m || !mapLoaded || !m.getSource(REGIONS_SOURCE)) return;
    const ownerById = new Map<string, string | null | undefined>();
    for (const r of regions) {
      ownerById.set(r.id, r.owner);
      m.setFeatureState({ source: REGIONS_SOURCE, id: r.id }, { color: muteColor(r.color || '#5a5a66') });
    }
    const isPlayer = (id: string | null) => !!id && !!playerCountryCode && ownerById.get(id) === playerCountryCode;
    edgesRef.current.forEach((e, i) => {
      const diff = e.b === null || ownerById.get(e.a) !== ownerById.get(e.b) || !ownerById.get(e.a);
      const player = isPlayer(e.a) !== isPlayer(e.b);
      m.setFeatureState({ source: BORDERS_SOURCE, id: i }, { diff, player });
    });

    // Подписи — по общему контуру государства (его регионы склеиваются по рёбрам)
    const labels = buildPolityLabels(regions, featuresRef.current, polityName, edgesRef.current);
    (m.getSource(LABELS_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: labels.map(l => ({
        type: 'Feature',
        properties: { name: l.name, size0: l.size0, area0: l.area0, minZoom: l.minZoom, letterSpacing: l.letterSpacing },
        geometry: { type: 'LineString', coordinates: l.line },
      })),
    });
  }, [regions, mapLoaded, playerCountryCode, polityName, polities]);

  // Выбор и подсветка изменённых — диффом, без перерисовки данных
  useEffect(() => {
    const m = map.current;
    // Источники появляются в обработчике load: до него (в т.ч. при повторном
    // монтировании, когда mapLoaded ещё «старый») трогать карту нельзя
    if (!m || !mapLoaded || !m.getSource(REGIONS_SOURCE)) return;
    const apply = (key: 'selected' | 'changed', next: Set<string>) => {
      const prev = appliedFlags.current[key];
      prev.forEach(id => { if (!next.has(id)) m.setFeatureState({ source: REGIONS_SOURCE, id }, { [key]: false }); });
      next.forEach(id => { if (!prev.has(id)) m.setFeatureState({ source: REGIONS_SOURCE, id }, { [key]: true }); });
      appliedFlags.current[key] = next;
    };
    apply('selected', new Set(selectedRegionId ? [selectedRegionId] : []));
    apply('changed', new Set(changedRegionIds));
  }, [selectedRegionId, changedRegionIds, mapLoaded, regions]);

  // Все игровые объекты всех регионов (для маркеров)
  const allObjects = useMemo(() => {
    const result: (MapObject & { regionName: string })[] = [];
    regions.forEach(region => {
      region.objects?.forEach((obj: MapObject) => result.push({ ...obj, regionName: region.name }));
    });
    return result;
  }, [regions]);

  // Маркеры объектов: столицы — маленькая звезда, остальное — значок в круге
  useEffect(() => {
    const m = map.current;
    // Источники появляются в обработчике load: до него (в т.ч. при повторном
    // монтировании, когда mapLoaded ещё «старый») трогать карту нельзя
    if (!m || !mapLoaded || !m.getSource(REGIONS_SOURCE)) return;
    objectMarkers.current.forEach(marker => marker.remove());
    objectMarkers.current = [];

    allObjects.forEach(obj => {
      let lngLat: [number, number] | null = null;
      if (typeof obj.lng === 'number' && typeof obj.lat === 'number') {
        lngLat = [obj.lng, obj.lat];
      } else if (obj.x !== undefined && obj.y !== undefined) {
        // Легаси: SVG-координаты канвы 2000×1500
        lngLat = [(obj.x / 2000) * 360 - 180, 90 - (obj.y / 1500) * 180];
      }
      if (!lngLat) return;

      const icon = OBJECT_ICONS[obj.type] || OBJECT_ICONS.city;
      const el = document.createElement('div');
      el.className = 'openpax-map-object';
      if (obj.type === 'capital') {
        el.style.cssText = `
          font-size: 11px; line-height: 1; color: ${icon.color}; cursor: pointer;
          text-shadow: 0 0 2px #000, 0 0 3px #000;
        `;
      } else {
        el.style.cssText = `
          width: 20px; height: 20px; background: ${icon.color}; border: 2px solid #1a1a1a;
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
          font-size: 9px; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.5);
        `;
      }
      el.textContent = icon.label;
      const popup = new maplibregl.Popup({ offset: 12 });
      const box = document.createElement('div');
      box.style.cssText = 'color:#222;padding:2px 4px;';
      const title = document.createElement('b');
      title.textContent = obj.name || '';
      box.append(title, document.createElement('br'), document.createTextNode(obj.type === 'capital' ? 'Столица' : obj.type));
      popup.setDOMContent(box);

      objectMarkers.current.push(
        new maplibregl.Marker({ element: el }).setLngLat(clampLngLat(lngLat)).setPopup(popup).addTo(m),
      );
    });

    return () => {
      objectMarkers.current.forEach(marker => marker.remove());
      objectMarkers.current = [];
    };
  }, [allObjects, mapLoaded]);

  const buttonStyle: React.CSSProperties = {
    width: '32px', height: '32px', background: 'rgba(20, 20, 30, 0.9)', border: '1px solid #444',
    borderRadius: '4px', color: '#fff', fontSize: '18px', cursor: 'pointer',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: OCEAN_COLOR }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%', opacity: ready ? 1 : 0, transition: 'opacity 0.3s' }} />
      {!ready && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          color: '#667eea', fontSize: '1.2rem',
        }}>
          Загрузка карты…
        </div>
      )}

      {/* Тултип региона: «Регион · Контроль» */}
      {tooltipInfo && (
        <div
          style={{
            position: 'absolute', left: tooltipInfo.x + 12, top: tooltipInfo.y - 10,
            background: 'rgba(20, 20, 30, 0.95)', border: '1px solid #444', borderRadius: '6px',
            padding: '8px 12px', color: '#fff', fontSize: '12px', pointerEvents: 'none', zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)', minWidth: '120px',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#c9b8ff' }}>{tooltipInfo.name}</div>
          {tooltipInfo.owner && <div style={{ color: '#ccc', marginTop: '4px' }}>Контроль: {tooltipInfo.owner}</div>}
        </div>
      )}

      {/* Кнопки зума поверх карты */}
      <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 10 }}>
        <button onClick={zoomIn} style={buttonStyle} title="Приблизить (+)">+</button>
        <button onClick={zoomOut} style={buttonStyle} title="Отдалить (−)">−</button>
        <button onClick={resetView} style={{ ...buttonStyle, fontSize: '14px' }} title="Сбросить вид (0)">⌂</button>
      </div>
    </div>
  );
};
