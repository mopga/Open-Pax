/**
 * Open-Pax — Map View Component
 * ============================
 * Интерактивная карта с SVG регионами.
 */

import React, { useState, useRef, useEffect } from 'react';
import type { Region } from '../../types';

interface MapViewProps {
  regions: Region[];
  selectedRegionId?: string;
  onRegionClick?: (regionId: string) => void;
  width?: number;
  height?: number;
}

export const MapView: React.FC<MapViewProps> = ({
  regions,
  selectedRegionId,
  onRegionClick,
  width = 800,
  height = 600,
}) => {
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Обработчик клика по региону
  const handleRegionClick = (regionId: string) => {
    if (onRegionClick) {
      onRegionClick(regionId);
    }
  };
  
  // Обработчик mouse enter
  const handleMouseEnter = (regionId: string) => {
    setHoveredRegion(regionId);
  };
  
  // Обработчик mouse leave
  const handleMouseLeave = () => {
    setHoveredRegion(null);
  };
  
  return (
    <div className="map-container" style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          height: 'auto',
          maxWidth: '100%',
        }}
      >
        {/* Фон карты */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="#1a1a2e"
        />
        
        {/* Регионы */}
        {regions.map((region) => {
          const isSelected = region.id === selectedRegionId;
          const isHovered = region.id === hoveredRegion;
          
          return (
            <g key={region.id}>
              <path
                d={region.svgPath}
                fill={region.color}
                stroke={isSelected ? '#ffffff' : isHovered ? '#cccccc' : '#333333'}
                strokeWidth={isSelected ? 3 : isHovered ? 2 : 1}
                style={{
                  cursor: onRegionClick ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                  opacity: isSelected || isHovered ? 1 : 0.85,
                  filter: isSelected 
                    ? 'drop-shadow(0 0 10px rgba(255,255,255,0.5))' 
                    : isHovered 
                      ? 'drop-shadow(0 0 5px rgba(255,255,255,0.3))'
                      : 'none',
                }}
                onClick={() => handleRegionClick(region.id)}
                onMouseEnter={() => handleMouseEnter(region.id)}
                onMouseLeave={handleMouseLeave}
              />
              
              {/* Объекты на карте (армии, города и т.д.) */}
              {region.objects?.map((obj) => (
                <g key={obj.id} transform={`translate(${obj.x}, ${obj.y})`}>
                  {obj.type === 'army' && (
                    <circle
                      r={8}
                      fill="#ff4444"
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  )}
                  {obj.type === 'factory' && (
                    <rect
                      x={-6}
                      y={-6}
                      width={12}
                      height={12}
                      fill="#ffaa00"
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  )}
                  {obj.type === 'university' && (
                    <circle
                      r={6}
                      fill="#44ff44"
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  )}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      
      {/* Tooltip при наведении */}
      {hoveredRegion && (
        <div
          className="map-tooltip"
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(0,0,0,0.8)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '14px',
            pointerEvents: 'none',
          }}
        >
          {regions.find(r => r.id === hoveredRegion)?.name}
        </div>
      )}
    </div>
  );
};

export default MapView;
