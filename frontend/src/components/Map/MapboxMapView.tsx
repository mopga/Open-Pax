/**
 * Open-Pax — игровая карта на MapLibre GL
 * =======================================
 * Компонент сохранил историческое имя MapboxMapView (используется в App.tsx),
 * но внутри работает на MapLibre GL — без токена и без внешних тайлов.
 * Базовый стиль — офлайн (inline StyleSpecification): тёмный фон + координатная
 * сетка из собственного geojson. Регионы, границы, лейблы и объекты рисуются
 * только из данных игры (region.geojson).
 *
 * Поддерживает: заливки регионов, границы, подписи имён, выбор, hover,
 * тултип со статами, подсветку изменённых регионов, маркеры объектов,
 * клавиатурную навигацию (+/-/0/стрелки).
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Region } from '../../types';
import type { MapObject } from '../../types';

// Соответствие ISO 3166-1 alpha-3 → alpha-2 для flagcdn.com
const ISO3_TO_ISO2: Record<string, string> = {
  USA: 'us', RUS: 'ru', CHN: 'cn', GBR: 'gb', FRA: 'fr',
  DEU: 'de', JPN: 'jp', IND: 'in', BRA: 'br', CAN: 'ca',
  ITA: 'it', ESP: 'es', MEX: 'mx', AUS: 'au', KOR: 'kr',
  SAU: 'sa', TUR: 'tr', POL: 'pl', NLD: 'nl', BEL: 'be',
  SWE: 'se', NOR: 'no', DNK: 'dk', FIN: 'fi', AUT: 'at',
  CHE: 'ch', PRT: 'pt', GRC: 'gr', CZE: 'cz', HUN: 'hu',
  ROU: 'ro', BGR: 'bg', UKR: 'ua', KAZ: 'kz', ARG: 'ar',
  CHL: 'cl', COL: 'co', PER: 'pe', VEN: 've', ECU: 'ec',
  BOL: 'bo', PRY: 'py', URY: 'uy', GTM: 'gt', CUB: 'cu',
  HTI: 'ht', DOM: 'do', HND: 'hn', NIC: 'ni', CRI: 'cr',
  PAN: 'pa', SLV: 'sv', JAM: 'jm', TTO: 'tt', PRK: 'kp',
  VNM: 'vn', THA: 'th', IDN: 'id', MYS: 'my', PHL: 'ph',
  PAK: 'pk', BGD: 'bd', IRN: 'ir', IRQ: 'iq', SYR: 'sy',
  ISR: 'il', EGY: 'eg', LBY: 'ly', DZA: 'dz', MAR: 'ma',
  TUN: 'tn', NGA: 'ng', ZAF: 'za', ETH: 'et', KEN: 'ke',
  GHA: 'gh', AGO: 'ao', MOZ: 'mz', TZA: 'tz', CMR: 'cm',
  COD: 'cd', SDN: 'sd', SOM: 'so', YEM: 'ye', AFG: 'af',
  MMR: 'mm', KHM: 'kh', LAO: 'la', MNG: 'mn', NPL: 'np',
  LKA: 'lk', AZE: 'az', GEO: 'ge', ARM: 'am', BLR: 'by',
  MDA: 'md', LTU: 'lt', LVA: 'lv', EST: 'ee', SRB: 'rs',
  HRV: 'hr', BIH: 'ba', SVN: 'si', SVK: 'sk', MKD: 'mk',
  MNE: 'me', ALB: 'al', RWA: 'rw', UZB: 'uz', TKM: 'tm',
  KGZ: 'kg', TJK: 'tj',
};

// Конвертация ISO 3166-1 alpha-3 в флаг-эмодзи
const codeToEmoji = (code: string): string => {
  if (!code || code.length !== 3) return '';
  const toAlpha2 = ISO3_TO_ISO2[code];
  if (!toAlpha2) return code;
  return toAlpha2.toUpperCase().split('').map(c =>
    String.fromCodePoint(127397 + c.charCodeAt(0))
  ).join('');
};

// URL PNG-флага на flagcdn.com по 3-буквенному коду страны
const getFlagUrl = (code3: string, size: number = 40): string | null => {
  const code2 = ISO3_TO_ISO2[code3];
  if (!code2) return null;
  return `https://flagcdn.com/w${size}/${code2}.png`;
};

interface MapboxMapViewProps {
  regions: Region[];
  selectedRegionId?: string;
  onRegionClick?: (regionId: string) => void;
  onRegionHover?: (regionId: string | null) => void;
  changedRegionIds?: string[];
  showFlags?: boolean;
  playerCountryCode?: string;
  showMinimap?: boolean;
}

// Иконки игровых объектов на карте
const OBJECT_ICONS: Record<string, { color: string; label: string }> = {
  city: { color: '#ffffff', label: '●' },
  // Столица: золотая звезда — визуально отличается от обычного города
  capital: { color: '#ffd700', label: '★' },
  army: { color: '#ff4444', label: '▲' },
  // Батальон: красный треугольник (как армия — оба типа рендерятся)
  battalion: { color: '#ff4444', label: '▲' },
  fleet: { color: '#4488ff', label: '◆' },
  missile: { color: '#ff8800', label: '✈' },
  radar: { color: '#44ff44', label: '◎' },
  port: { color: '#4488ff', label: '⚓' },
  factory: { color: '#ffaa00', label: '⚙' },
  university: { color: '#aa44ff', label: '★' },
};

// Офлайн-стиль: без внешних тайлов, источников и глифов.
// Фон океана — тёмный; суша рисуется только из geojson регионов игры.
const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  name: 'open-pax-offline',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#0d1117' },
    },
  ],
};

const REGIONS_SOURCE_ID = 'regions';
const FILL_LAYER_ID = 'regions-fill';
const LINE_LAYER_ID = 'regions-line';
const GRATICULE_SOURCE_ID = 'graticule';
const GRATICULE_LAYER_ID = 'graticule-line';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// Координатная сетка (градусная) как собственный geojson — без внешних источников
const buildGraticule = (): GeoJSON.FeatureCollection => {
  const features: GeoJSON.Feature[] = [];
  const STEP = 30;
  for (let lng = -180; lng <= 180; lng += STEP) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[lng, -85], [lng, 85]] },
    });
  }
  for (let lat = -60; lat <= 60; lat += STEP) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[-180, lat], [180, lat]] },
    });
  }
  return { type: 'FeatureCollection', features };
};

// Рекурсивный обход всех координат геометрии (Polygon и MultiPolygon)
const eachPosition = (geometry: GeoJSON.Geometry, cb: (pos: GeoJSON.Position) => void): void => {
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      cb(coords as GeoJSON.Position);
      return;
    }
    coords.forEach(walk);
  };
  walk('coordinates' in geometry ? geometry.coordinates : undefined);
};

// Внешние кольца полигонов (для подписи берём самое большое)
const getOuterRings = (geometry: GeoJSON.Geometry): GeoJSON.Position[][] => {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates[0] ? [geometry.coordinates[0]] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map(poly => poly[0]).filter(Boolean);
  }
  return [];
};

// Площадь кольца по формуле шнурка (для выбора главного полигона)
const ringArea = (ring: GeoJSON.Position[]): number => {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
};

// Центроид кольца (взвешенный; при вырождении — среднее вершин)
const ringCentroid = (ring: GeoJSON.Position[]): [number, number] => {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    twiceArea += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    const sum = ring.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return [sum[0] / ring.length, sum[1] / ring.length];
  }
  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
};

// Точка подписи региона: центроид наибольшего внешнего кольца
const getLabelPoint = (geometry: GeoJSON.Geometry): [number, number] | null => {
  const rings = getOuterRings(geometry);
  if (rings.length === 0) return null;
  const mainRing = rings.reduce((best, ring) => (ringArea(ring) > ringArea(best) ? ring : best));
  return ringCentroid(mainRing);
};

// Предел Web Mercator по широте (за ±85° проекция не определена)
const MAX_MERCATOR_LAT = 85;

// Кламп координат в допустимый диапазон карты.
// Без этого fitBounds/setLngLat бросают «Invalid LngLat latitude value»,
// если геометрия касается полюсов (Антарктида −90°) + padding уводит за предел.
const clampLngLat = (p: [number, number]): [number, number] => {
  let [lng, lat] = p;
  if (!isFinite(lng)) lng = 0;
  if (!isFinite(lat)) lat = 0;
  lng = Math.max(-180, Math.min(180, lng));
  lat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  return [lng, lat];
};

export const MapboxMapView: React.FC<MapboxMapViewProps> = ({
  regions,
  selectedRegionId,
  onRegionClick,
  onRegionHover,
  changedRegionIds = [],
  showFlags = false,
  playerCountryCode,
  // Пропс сохранён для совместимости API; миникарта в офлайн-режиме не используется
  showMinimap = true,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const objectMarkers = useRef<maplibregl.Marker[]>([]);
  const labelMarkers = useRef<maplibregl.Marker[]>([]);
  const fittedRegionIds = useRef<string>('');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [tooltipInfo, setTooltipInfo] = useState<{ x: number; y: number; name: string; owner: string | null; population: number; gdp: number; militaryPower: number } | null>(null);

  // Актуальные значения для обработчиков карты (регистрируются один раз)
  const regionsRef = useRef(regions);
  regionsRef.current = regions;
  const onRegionClickRef = useRef(onRegionClick);
  onRegionClickRef.current = onRegionClick;
  const onRegionHoverRef = useRef(onRegionHover);
  onRegionHoverRef.current = onRegionHover;

  // Границы карты по регионам (обход всех координат, включая MultiPolygon)
  const getBounds = useCallback((): [[number, number], [number, number]] => {
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    regionsRef.current.forEach(region => {
      if (!region.geojson) return;
      try {
        const geojson = JSON.parse(region.geojson);
        if (!geojson.geometry) return;
        eachPosition(geojson.geometry, (pos) => {
          minLng = Math.min(minLng, pos[0]);
          maxLng = Math.max(maxLng, pos[0]);
          minLat = Math.min(minLat, pos[1]);
          maxLat = Math.max(maxLat, pos[1]);
        });
      } catch (e) { /* пропускаем битый geojson */ }
    });

    if (!isFinite(minLng)) {
      return [[-180, -85], [180, 85]];
    }

    // Отступ от краёв
    const padding = 0.1;
    const lngPad = (maxLng - minLng) * padding;
    const latPad = (maxLat - minLat) * padding;

    // Кламп: padding не должен уводить границы за пределы проекции (Антарктида −90°)
    return [
      clampLngLat([minLng - lngPad, minLat - latPad]),
      clampLngLat([maxLng + lngPad, maxLat + latPad])
    ];
  }, []);

  // Функции зума для клавиатуры и кнопок
  const zoomIn = useCallback(() => {
    map.current?.zoomIn({ duration: 300 });
  }, []);

  const zoomOut = useCallback(() => {
    map.current?.zoomOut({ duration: 300 });
  }, []);

  const resetView = useCallback(() => {
    map.current?.fitBounds(getBounds(), { padding: 50, duration: 500 });
  }, [getBounds]);

  // Клавиатурная навигация: + / - / 0 / стрелки
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!map.current) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case '0':
          e.preventDefault();
          resetView();
          break;
        case 'ArrowUp':
          e.preventDefault();
          map.current.panBy([0, -100], { duration: 200 });
          break;
        case 'ArrowDown':
          e.preventDefault();
          map.current.panBy([0, 100], { duration: 200 });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          map.current.panBy([-100, 0], { duration: 200 });
          break;
        case 'ArrowRight':
          e.preventDefault();
          map.current.panBy([100, 0], { duration: 200 });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, resetView]);

  // Инициализация карты (один раз)
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: OFFLINE_STYLE,
      center: [0, 20],
      zoom: 1,
      attributionControl: false,
    });

    // Кнопки зума/компаса MapLibre
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      if (!map.current) return;
      const m = map.current;

      // Координатная сетка под регионами
      m.addSource(GRATICULE_SOURCE_ID, { type: 'geojson', data: buildGraticule() });
      m.addLayer({
        id: GRATICULE_LAYER_ID,
        type: 'line',
        source: GRATICULE_SOURCE_ID,
        paint: {
          'line-color': '#1c2333',
          'line-width': 1,
        },
      });

      // Источник и слои регионов (данные придут позже через setData)
      m.addSource(REGIONS_SOURCE_ID, { type: 'geojson', data: EMPTY_FC });

      // Заливка регионов
      m.addLayer({
        id: FILL_LAYER_ID,
        type: 'fill',
        source: REGIONS_SOURCE_ID,
        paint: {
          'fill-color': [
            'case',
            ['get', 'isSelected'], '#ffffff',
            // Полития игрока: owner = polityId (код страны из playerCountryCode;
            // для кастомных карт — 'player')
            ['get', 'isPlayer'], '#00ff88',
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

      // Границы регионов
      m.addLayer({
        id: LINE_LAYER_ID,
        type: 'line',
        source: REGIONS_SOURCE_ID,
        paint: {
          'line-color': [
            'case',
            ['get', 'isSelected'], '#ffffff',
            // Подсветка изменённых за ход регионов
            ['get', 'isChanged'], '#ffd700',
            ['get', 'isHovered'], '#666666',
            '#1a1a1a'
          ],
          'line-width': [
            'case',
            ['get', 'isSelected'], 3,
            ['get', 'isChanged'], 3,
            2
          ],
        },
      });

      // Клик по региону
      m.on('click', FILL_LAYER_ID, (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id && onRegionClickRef.current) {
          onRegionClickRef.current(id);
        }
      });

      // Hover: курсор + локальное состояние + тултип
      m.on('mouseenter', FILL_LAYER_ID, () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = 'pointer';
        }
      });

      m.on('mouseleave', FILL_LAYER_ID, () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = '';
        }
        setHoveredRegionId(null);
        setTooltipInfo(null);
      });

      m.on('mousemove', FILL_LAYER_ID, (e) => {
        const props = e.features?.[0]?.properties;
        const id = props?.id || null;
        setHoveredRegionId(prev => (prev === id ? prev : id));
        if (onRegionHoverRef.current) {
          onRegionHoverRef.current(id);
        }
        // Обновление тултипа
        if (id) {
          const region = regionsRef.current.find(r => r.id === id);
          if (region) {
            // Строка «Контроль: X» — только если регионом владеет другая полития
            // (как в оригинале: тултип «West Germany / Northern Bavaria»).
            // Имя политии берём из её «домашнего» региона (id вида `${worldId}_${polityId}`).
            let ownerName: string | null = null;
            const owner = region.owner;
            if (owner && owner !== 'neutral' && owner !== region.name) {
              const homeRegion = regionsRef.current.find(
                r => r.owner === owner && r.id.endsWith(`_${owner}`)
              );
              const resolved = homeRegion?.name || owner;
              if (resolved !== region.name) {
                ownerName = resolved;
              }
            }
            setTooltipInfo({
              x: e.point.x,
              y: e.point.y,
              name: region.name,
              owner: ownerName,
              population: region.population,
              gdp: region.gdp,
              militaryPower: region.militaryPower,
            });
          }
        }
      });

      setMapLoaded(true);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Данные регионов: пересборка FeatureCollection и setData в источник.
  // Подсветка (выбор/hover/изменённые) живёт в properties фич, слои не пересоздаются.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;

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
          flag: region.flag || null,
          flag_emoji: region.flag ? codeToEmoji(region.flag) : '',
          owner: region.owner || null,
          isSelected: region.id === selectedRegionId,
          isHovered: hoveredRegionId === region.id,
          isChanged: changedRegionIds.includes(region.id),
          isPlayer: !!region.owner && region.owner === (playerCountryCode || 'player'),
        };
        geojsonFeatures.push(parsed);
      } catch (e) { /* пропускаем битый geojson */ }
    });

    const source = m.getSource(REGIONS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: geojsonFeatures });

    // При смене набора регионов подгоняем видимую область
    const idsKey = regions.map(r => r.id).sort().join('|');
    if (idsKey && idsKey !== fittedRegionIds.current) {
      fittedRegionIds.current = idsKey;
      m.fitBounds(getBounds(), { padding: 50, duration: 500 });
    }
  }, [regions, mapLoaded, selectedRegionId, hoveredRegionId, changedRegionIds, playerCountryCode, getBounds]);

  // Подписи регионов — HTML-маркерами: офлайн-стиль без glyphs не поддерживает
  // symbol-слой с text-field, поэтому лейблы рисуем DOM-элементами
  // (pointer-events: none — не мешают клику и hover по регионам).
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;

    // Удаляем старые подписи
    labelMarkers.current.forEach(marker => marker.remove());
    labelMarkers.current = [];

    regions.forEach(region => {
      if (!region.geojson) return;
      try {
        const geojson = JSON.parse(region.geojson);
        if (!geojson.geometry) return;
        const point = getLabelPoint(geojson.geometry);
        if (!point) return;

        const flagEmoji = region.flag ? codeToEmoji(region.flag) : '';
        const el = document.createElement('div');
        el.className = 'openpax-map-label';
        el.style.cssText = `
          pointer-events: none;
          color: #ffffff;
          font-size: 13px;
          font-weight: 700;
          font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
          text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 6px rgba(0,0,0,0.8);
          white-space: nowrap;
          user-select: none;
        `;
        el.textContent = showFlags && flagEmoji ? `${flagEmoji} ${region.name}` : region.name;

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(clampLngLat(point))
          .addTo(m);
        labelMarkers.current.push(marker);
      } catch (e) { /* пропускаем битый geojson */ }
    });

    return () => {
      labelMarkers.current.forEach(marker => marker.remove());
      labelMarkers.current = [];
    };
  }, [regions, mapLoaded, showFlags]);

  // Все игровые объекты всех регионов (для маркеров)
  const allObjects = useMemo(() => {
    const result: (MapObject & { regionName: string; regionColor: string })[] = [];
    regions.forEach(region => {
      if (region.objects) {
        region.objects.forEach((obj: MapObject) => {
          result.push({
            ...obj,
            regionName: region.name,
            regionColor: region.color,
          });
        });
      }
    });
    return result;
  }, [regions]);

  // Маркеры объектов
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;

    // Удаляем старые маркеры
    objectMarkers.current.forEach(marker => marker.remove());
    objectMarkers.current = [];

    allObjects.forEach(obj => {
      if (obj.x === undefined || obj.y === undefined) return;

      // Конвертация SVG-координат в lng/lat:
      // канва 2000x1500 → -180..180 lng, 90..-90 lat
      const lng = (obj.x / 2000) * 360 - 180;
      const lat = 90 - (obj.y / 1500) * 180;

      const icon = OBJECT_ICONS[obj.type] || OBJECT_ICONS.city;

      // Кастомный DOM-элемент маркера
      const el = document.createElement('div');
      el.className = 'openpax-map-object';
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

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(clampLngLat([lng, lat]))
        .setPopup(
          new maplibregl.Popup({ offset: 15 })
            .setHTML(`<div style="color:#333;padding:4px;"><b>${obj.name}</b><br/>${obj.type}</div>`)
        )
        .addTo(m);
      objectMarkers.current.push(marker);
    });

    return () => {
      objectMarkers.current.forEach(marker => marker.remove());
      objectMarkers.current = [];
    };
  }, [allObjects, mapLoaded]);

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
          Загрузка карты…
        </div>
      )}

      {/* Тултип региона */}
      {tooltipInfo && (
        <div
          style={{
            position: 'absolute',
            left: tooltipInfo.x + 10,
            top: tooltipInfo.y - 10,
            background: 'rgba(20, 20, 30, 0.95)',
            border: '1px solid #444',
            borderRadius: '6px',
            padding: '10px 14px',
            color: '#fff',
            fontSize: '12px',
            pointerEvents: 'none',
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            minWidth: '140px',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '6px', color: '#667eea' }}>
            {tooltipInfo.name}
          </div>
          {tooltipInfo.owner && (
            <div style={{ color: '#ccc', marginBottom: '6px' }}>Контроль: {tooltipInfo.owner}</div>
          )}
          <div style={{ color: '#aaa' }}>👥 {tooltipInfo.population?.toLocaleString()}</div>
          <div style={{ color: '#aaa' }}>💰 {tooltipInfo.gdp}</div>
          <div style={{ color: '#aaa' }}>⚔️ {tooltipInfo.militaryPower}</div>
        </div>
      )}

      {/* Кнопки зума поверх карты */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        zIndex: 10,
      }}>
        <button
          onClick={zoomIn}
          style={{
            width: '32px',
            height: '32px',
            background: 'rgba(20, 20, 30, 0.9)',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '18px',
            cursor: 'pointer',
          }}
          title="Приблизить (+)"
        >
          +
        </button>
        <button
          onClick={zoomOut}
          style={{
            width: '32px',
            height: '32px',
            background: 'rgba(20, 20, 30, 0.9)',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '18px',
            cursor: 'pointer',
          }}
          title="Отдалить (−)"
        >
          −
        </button>
        <button
          onClick={resetView}
          style={{
            width: '32px',
            height: '32px',
            background: 'rgba(20, 20, 30, 0.9)',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '14px',
            cursor: 'pointer',
          }}
          title="Сбросить вид (0)"
        >
          ⌂
        </button>
      </div>
    </div>
  );
};
