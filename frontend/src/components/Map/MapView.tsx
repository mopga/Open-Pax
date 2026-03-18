/**
 * Open-Pax — Map View Component
 * ============================
 * Интерактивная карта с SVG регионами, зумом и панорамированием.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Region, MapObject } from '../../types';

interface MapViewProps {
  regions: Region[];
  selectedRegionId?: string;
  onRegionClick?: (regionId: string) => void;
  width?: number;
  height?: number;
}

// Типы объектов на карте
const OBJECT_ICONS: Record<string, { color: string; shape: 'circle' | 'rect' | 'triangle'; size: number }> = {
  army: { color: '#ff4444', shape: 'circle', size: 10 },
  fleet: { color: '#4488ff', shape: 'circle', size: 12 },
  missile: { color: '#ff8800', shape: 'triangle', size: 10 },
  radar: { color: '#44ffaa', shape: 'circle', size: 8 },
  port: { color: '#00ccff', shape: 'rect', size: 12 },
  exchange: { color: '#ffaa00', shape: 'rect', size: 14 },
  clearing: { color: '#aa44ff', shape: 'rect', size: 12 },
  grouping: { color: '#ff44aa', shape: 'circle', size: 14 },
  factory: { color: '#ffaa00', shape: 'rect', size: 12 },
  university: { color: '#44ff44', shape: 'circle', size: 10 },
};

export const MapView: React.FC<MapViewProps> = ({
  regions,
  selectedRegionId,
  onRegionClick,
  width = 2000,
  height = 1500,
}) => {
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Обработчик зума колесом мыши
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.2, Math.min(5, prev * delta)));
  }, []);

  // Обработчик начала перетаскивания
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  // Обработчик перетаскивания
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  // Обработчик окончания перетаскивания
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Обработчик клика по региону
  const handleRegionClick = (regionId: string) => {
    if (onRegionClick && !isDragging) {
      onRegionClick(regionId);
    }
  };

  // Сброс зума
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Увеличить/уменьшить
  const zoomIn = () => setZoom(prev => Math.min(5, prev * 1.2));
  const zoomOut = () => setZoom(prev => Math.max(0.2, prev * 0.8));

  // Рендер объекта
  const renderObject = (obj: MapObject) => {
    const icon = OBJECT_ICONS[obj.type] || { color: '#ffffff', shape: 'circle' as const, size: 8 };

    return (
      <g key={obj.id} transform={`translate(${obj.x}, ${obj.y})`}>
        {/* Glow effect */}
        <circle r={icon.size + 4} fill={icon.color} fillOpacity={0.3} />

        {icon.shape === 'circle' && (
          <circle r={icon.size} fill={icon.color} stroke="#ffffff" strokeWidth={2} />
        )}
        {icon.shape === 'rect' && (
          <rect x={-icon.size/2} y={-icon.size/2} width={icon.size} height={icon.size}
            fill={icon.color} stroke="#ffffff" strokeWidth={2} rx={2} />
        )}
        {icon.shape === 'triangle' && (
          <polygon points={`0,-${icon.size} ${icon.size},${icon.size} -${icon.size},${icon.size}`}
            fill={icon.color} stroke="#ffffff" strokeWidth={2} />
        )}

        {/* Label */}
        {obj.name && (
          <text y={icon.size + 14} fill="#ffffff" fontSize={10}
            textAnchor="middle" style={{ textShadow: '0 0 4px #000' }}>
            {obj.name}
          </text>
        )}
      </g>
    );
  };

  return (
    <div
      ref={containerRef}
      className="map-view-container"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
        background: '#0a0a12',
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Zoom Controls */}
      <div className="zoom-controls" style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <button onClick={zoomIn} style={zoomButtonStyle}>+</button>
        <button onClick={zoomOut} style={zoomButtonStyle}>−</button>
        <button onClick={resetView} style={zoomButtonStyle}>⟲</button>
        <div style={{...zoomButtonStyle, width: 40, fontSize: 12, cursor: 'default'}}>
          {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* Mini-map indicator */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        color: '#666',
        fontSize: 11,
      }}>
        🖱️ Drag to pan • Scroll to zoom
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          height: '100%',
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out',
        }}
      >
        {/* Background */}
        <rect x={0} y={0} width={width} height={height} fill="#0d0d14" />

        {/* Grid pattern - larger for zoomed view */}
        <pattern id="grid" width={100} height={100} patternUnits="userSpaceOnUse">
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#1a1a28" strokeWidth={1}/>
        </pattern>
        <rect x={0} y={0} width={width} height={height} fill="url(#grid)" />

        {/* Regions */}
        {regions.map((region) => {
          const isSelected = region.id === selectedRegionId;
          const isHovered = region.id === hoveredRegion;

          return (
            <g key={region.id}>
              {/* Glow for selected */}
              {isSelected && (
                <path
                  d={region.svgPath}
                  fill={region.color}
                  fillOpacity={0.4}
                  style={{ filter: 'blur(15px)' }}
                />
              )}
              <path
                d={region.svgPath}
                fill={region.color}
                fillOpacity={isSelected ? 0.9 : isHovered ? 0.75 : 0.5}
                stroke={isSelected ? '#ffffff' : isHovered ? '#aaaaaa' : '#333333'}
                strokeWidth={isSelected ? 3 : isHovered ? 2 : 1}
                style={{
                  cursor: onRegionClick ? 'pointer' : 'default',
                  transition: 'all 0.15s ease',
                  filter: isSelected
                    ? 'drop-shadow(0 0 15px rgba(255,255,255,0.6))'
                    : isHovered
                      ? `drop-shadow(0 0 12px ${region.color})`
                      : 'none',
                }}
                onClick={() => handleRegionClick(region.id)}
                onMouseEnter={() => setHoveredRegion(region.id)}
                onMouseLeave={() => setHoveredRegion(null)}
              />

              {/* Region label */}
              <text
                x={getCentroid(region.svgPath)?.x || width/2}
                y={getCentroid(region.svgPath)?.y || height/2}
                fill={isSelected || isHovered ? '#ffffff' : '#cccccc'}
                fontSize={14}
                fontWeight={isSelected ? 700 : 500}
                textAnchor="middle"
                pointerEvents="none"
                style={{
                  textShadow: '0 0 8px #000, 0 0 4px #000',
                  opacity: isHovered || isSelected ? 1 : 0.7,
                }}
              >
                {region.name}
              </text>

              {/* Objects on map */}
              {region.objects?.map(renderObject)}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredRegion && (
        <div className="map-tooltip" style={tooltipStyle}>
          <strong>{regions.find(r => r.id === hoveredRegion)?.name}</strong>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
            {regions.find(r => r.id === hoveredRegion)?.owner !== 'neutral' && (
              <>Owner: {regions.find(r => r.id === hoveredRegion)?.owner}</>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper to get centroid of SVG path
function getCentroid(path: string): { x: number; y: number } | null {
  const nums = path.match(/-?\d+\.?\d*/g);
  if (!nums || nums.length < 2) return null;

  const points: number[] = nums.map(Number);
  let sumX = 0, sumY = 0, count = 0;

  for (let i = 0; i < points.length; i += 2) {
    sumX += points[i];
    sumY += points[i + 1] || 0;
    count++;
  }

  return count > 0 ? { x: sumX / count, y: sumY / count } : null;
}

const zoomButtonStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  border: '1px solid #333',
  borderRadius: 8,
  background: '#1a1a24',
  color: '#fff',
  fontSize: 20,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const tooltipStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
  background: 'rgba(0,0,0,0.85)',
  color: '#fff',
  padding: '10px 14px',
  borderRadius: 8,
  fontSize: 14,
  pointerEvents: 'none',
  border: '1px solid #333',
  zIndex: 50,
};

export default MapView;
