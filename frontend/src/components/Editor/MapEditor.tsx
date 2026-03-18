/**
 * Open-Pax — Map Editor (Enhanced)
 * ================================
 * Редактор карт со свободным рисованием, зумом и объектами.
 */

import React, { useState, useRef, useCallback } from 'react';

export type EditorMode = 'draw' | 'select' | 'erase' | 'city';

// Types
export interface EditorRegion {
  id: string;
  name: string;
  color: string;
  points: { x: number; y: number }[];
  isComplete: boolean;
}

export interface EditorObject {
  id: string;
  type: string; // 'city' | 'port' | 'factory' | 'military' | 'capital'
  name: string;
  x: number;
  y: number;
  regionId?: string;
}

export interface MapEditorProps {
  onSave?: (regions: EditorRegion[], mapName: string, objects?: EditorObject[]) => void;
  onCancel?: () => void;
  initialRegions?: EditorRegion[];
  initialName?: string;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const pointsToPath = (points: { x: number; y: number }[]): string => {
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
};

const COLORS = [
  '#cc0000', '#cccc00', '#0000cc', '#cc00cc', '#00cccc',
  '#ff6666', '#ffff66', '#6666ff', '#ff66ff', '#66ffff',
  '#ffaa00', '#aa00ff', '#00ffaa', '#aaff00', '#ff00aa',
];

// Object type icons and colors
const OBJECT_TYPES = [
  { type: 'capital', label: 'Столица', color: '#ffd700', icon: '★' },
  { type: 'city', label: 'Город', color: '#ffffff', icon: '●' },
  { type: 'port', label: 'Порт', color: '#00ccff', icon: '⚓' },
  { type: 'factory', label: 'Завод', color: '#ff8800', icon: '⚙' },
  { type: 'military', label: 'Военная база', color: '#ff4444', icon: '⚔' },
];

const MAP_SIZES = [
  { label: 'Маленькая (800x600)', width: 800, height: 600 },
  { label: 'Средняя (1200x900)', width: 1200, height: 900 },
  { label: 'Большая (2000x1500)', width: 2000, height: 1500 },
  { label: 'Огромная (3000x2000)', width: 3000, height: 2000 },
];

export const MapEditor: React.FC<MapEditorProps> = ({
  onSave,
  onCancel,
  initialRegions = [],
  initialName = 'New World',
}) => {
  const [mapName, setMapName] = useState(initialName);
  const [regions, setRegions] = useState<EditorRegion[]>(initialRegions);
  const [objects, setObjects] = useState<EditorObject[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [mode, setMode] = useState<EditorMode>('draw');
  const [showGrid, setShowGrid] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mapSize, setMapSize] = useState(2); // Default to large
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [objectType, setObjectType] = useState('city');

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<EditorRegion[]>([]);

  const width = MAP_SIZES[mapSize].width;
  const height = MAP_SIZES[mapSize].height;

  // Get coordinates relative to SVG
  const getCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    // Account for zoom and pan
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = (e.clientX - rect.left) * scaleX / zoom + pan.x / zoom;
    const y = (e.clientY - rect.top) * scaleY / zoom + pan.y / zoom;
    return {
      x: Math.max(0, Math.min(width, x)),
      y: Math.max(0, Math.min(height, y)),
    };
  }, [width, height, zoom, pan]);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.2, Math.min(5, prev * delta)));
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && mode === 'select') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    } else if (mode === 'city') {
      // Place object
      const coords = getCoords(e);
      const newObject: EditorObject = {
        id: generateId(),
        type: objectType,
        name: `${OBJECT_TYPES.find(o => o.type === objectType)?.label || 'Object'} ${objects.length + 1}`,
        x: coords.x,
        y: coords.y,
        regionId: selectedRegionId || undefined,
      };
      setObjects(prev => [...prev, newObject]);
    } else if (mode === 'draw' || mode === 'erase') {
      handleDrawStart(e);
    }
  }, [mode, objectType, selectedRegionId, objects.length, getCoords, pan]);

  const handleDrawStart = useCallback((e: React.MouseEvent) => {
    const coords = getCoords(e);
    setIsDrawing(true);

    if (mode === 'erase') {
      // Delete nearest point
      const threshold = 20 / zoom;
      setRegions(prev => prev.map(r => ({
        ...r,
        points: r.points.filter(p =>
          Math.sqrt((p.x - coords.x) ** 2 + (p.y - coords.y) ** 2) > threshold
        ),
      })));
      return;
    }

    // Draw mode - add point
    setCurrentPoints(prev => [...prev, coords]);
  }, [mode, getCoords, zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && mode === 'select') {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    } else if (isDrawing && mode === 'draw') {
      const coords = getCoords(e);
      setCurrentPoints(prev => [...prev, coords]);
    }
  }, [isDragging, mode, dragStart, isDrawing, getCoords]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsDrawing(false);
  }, []);

  // Complete region
  const completeRegion = useCallback(() => {
    if (currentPoints.length < 3) return;

    const newRegion: EditorRegion = {
      id: generateId(),
      name: `Region ${regions.length + 1}`,
      color: COLORS[regions.length % COLORS.length],
      points: currentPoints,
      isComplete: true,
    };

    historyRef.current = [...regions];
    setRegions(prev => [...prev, newRegion]);
    setSelectedRegionId(newRegion.id);
    setCurrentPoints([]);
  }, [currentPoints, regions]);

  // Undo
  const undo = useCallback(() => {
    if (historyRef.current.length > 0) {
      setRegions(historyRef.current);
      historyRef.current = [];
    } else if (regions.length > 0) {
      const prev = regions.slice(0, -1);
      setRegions(prev);
    }
    setCurrentPoints([]);
  }, [regions]);

  // Delete selected region
  const deleteSelectedRegion = useCallback(() => {
    if (!selectedRegionId) return;
    setRegions(prev => prev.filter(r => r.id !== selectedRegionId));
    setSelectedRegionId(null);
  }, [selectedRegionId]);

  // Delete selected object
  const deleteSelectedObject = useCallback(() => {
    if (!selectedObjectId) return;
    setObjects(prev => prev.filter(o => o.id !== selectedObjectId));
    setSelectedObjectId(null);
  }, [selectedObjectId]);

  // Update region
  const updateRegion = useCallback((id: string, updates: Partial<EditorRegion>) => {
    setRegions(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  // Update object
  const updateObject = useCallback((id: string, updates: Partial<EditorObject>) => {
    setObjects(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    if (onSave) {
      onSave(regions, mapName, objects);
    }
  }, [regions, mapName, objects, onSave]);

  // Handle region click
  const handleRegionClick = useCallback((regionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (mode === 'select') {
      setSelectedRegionId(regionId);
      setSelectedObjectId(null);
    }
  }, [mode]);

  // Handle object click
  const handleObjectClick = useCallback((objectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (mode === 'select') {
      setSelectedObjectId(objectId);
      setSelectedRegionId(null);
    }
  }, [mode]);

  // Reset view
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Zoom buttons
  const zoomIn = () => setZoom(prev => Math.min(5, prev * 1.2));
  const zoomOut = () => setZoom(prev => Math.max(0.2, prev * 0.8));

  const selectedRegion = regions.find(r => r.id === selectedRegionId);
  const selectedObject = objects.find(o => o.id === selectedObjectId);

  return (
    <div className="map-editor">
      {/* Toolbar */}
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button
            className={mode === 'draw' ? 'active' : ''}
            onClick={() => setMode('draw')}
            title="Рисовать"
          >
            ✏️ Рисовать
          </button>
          <button
            className={mode === 'select' ? 'active' : ''}
            onClick={() => setMode('select')}
            title="Выбрать / Панорамировать"
          >
            👆 Выбрать
          </button>
          <button
            className={mode === 'erase' ? 'active' : ''}
            onClick={() => setMode('erase')}
            title="Ластик"
          >
            🧹 Ластик
          </button>
          <button
            className={mode === 'city' ? 'active' : ''}
            onClick={() => setMode('city')}
            title="Разместить объект"
          >
            🏙️ Объект
          </button>
        </div>

        {mode === 'city' && (
          <div className="toolbar-group">
            {OBJECT_TYPES.map(obj => (
              <button
                key={obj.type}
                className={objectType === obj.type ? 'active' : ''}
                onClick={() => setObjectType(obj.type)}
                title={obj.label}
              >
                {obj.icon} {obj.label}
              </button>
            ))}
          </div>
        )}

        <div className="toolbar-group">
          <button onClick={completeRegion} disabled={currentPoints.length < 3}>
            ✓ Завершить
          </button>
          <button onClick={undo} disabled={regions.length === 0 && currentPoints.length === 0}>
            ↩ Отменить
          </button>
        </div>

        <div className="toolbar-group">
          <label>
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />
            Сетка
          </label>
        </div>

        <div className="toolbar-group">
          <select
            value={mapSize}
            onChange={(e) => setMapSize(Number(e.target.value))}
            className="map-size-select"
          >
            {MAP_SIZES.map((size, i) => (
              <option key={i} value={i}>{size.label}</option>
            ))}
          </select>
        </div>

        <div className="toolbar-group toolbar-right">
          <input
            type="text"
            value={mapName}
            onChange={(e) => setMapName(e.target.value)}
            placeholder="Название карты"
            className="map-name-input"
          />
          <button onClick={handleSave} disabled={regions.length === 0}>
            💾 Сохранить
          </button>
          {onCancel && (
            <button onClick={onCancel} className="cancel-btn">
              ✕ Отмена
            </button>
          )}
        </div>
      </div>

      <div className="editor-content">
        {/* Canvas */}
        <div
          ref={containerRef}
          className="editor-canvas"
          style={{ cursor: mode === 'select' ? (isDragging ? 'grabbing' : 'grab') : 'crosshair' }}
        >
          {/* Zoom Controls */}
          <div className="zoom-controls">
            <button onClick={zoomIn} title="Увеличить">+</button>
            <button onClick={zoomOut} title="Уменьшить">−</button>
            <button onClick={resetView} title="Сбросить">⟲</button>
            <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="editor-svg"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transformOrigin: 'center center',
            }}
          >
            {/* Background */}
            <rect x="0" y="0" width={width} height={height} fill="#1a1a2e" />

            {/* Grid */}
            {showGrid && (
              <g className="grid">
                {Array.from({ length: Math.floor(width / 50) + 1 }, (_, i) => (
                  <line
                    key={`v${i}`}
                    x1={i * 50}
                    y1="0"
                    x2={i * 50}
                    y2={height}
                    stroke="#333"
                    strokeWidth="0.5"
                  />
                ))}
                {Array.from({ length: Math.floor(height / 50) + 1 }, (_, i) => (
                  <line
                    key={`h${i}`}
                    x1="0"
                    y1={i * 50}
                    x2={width}
                    y2={i * 50}
                    stroke="#333"
                    strokeWidth="0.5"
                  />
                ))}
              </g>
            )}

            {/* Completed regions */}
            {regions.map((region) => (
              <path
                key={region.id}
                d={pointsToPath(region.points)}
                fill={region.color}
                fillOpacity={selectedRegionId === region.id ? 0.8 : 0.6}
                stroke={selectedRegionId === region.id ? '#fff' : '#333'}
                strokeWidth={selectedRegionId === region.id ? 3 : 1}
                style={{ cursor: mode === 'select' ? 'pointer' : 'default' }}
                onClick={(e) => handleRegionClick(region.id, e)}
              />
            ))}

            {/* Current drawing */}
            {currentPoints.length > 0 && (
              <path
                d={pointsToPath(currentPoints)}
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeDasharray="5,5"
              />
            )}

            {/* Drawing points */}
            {currentPoints.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={4}
                fill={i === 0 ? '#0f0' : '#fff'}
              />
            ))}

            {/* Region points (when selected) */}
            {selectedRegion && selectedRegion.points.map((p, i) => (
              <circle
                key={`sel-${i}`}
                cx={p.x}
                cy={p.y}
                r={5}
                fill="transparent"
                stroke="#fff"
                strokeWidth={1}
              />
            ))}

            {/* Objects */}
            {objects.map((obj) => {
              const objType = OBJECT_TYPES.find(o => o.type === obj.type);
              const isSelected = selectedObjectId === obj.id;
              return (
                <g
                  key={obj.id}
                  transform={`translate(${obj.x}, ${obj.y})`}
                  style={{ cursor: mode === 'select' ? 'pointer' : 'default' }}
                  onClick={(e) => handleObjectClick(obj.id, e)}
                >
                  {/* Glow for selected */}
                  {isSelected && (
                    <circle r={18} fill={objType?.color || '#fff'} fillOpacity={0.3} />
                  )}
                  {/* Icon */}
                  <text
                    fontSize={16}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={objType?.color || '#fff'}
                    style={{ filter: 'drop-shadow(0 0 3px #000)' }}
                  >
                    {objType?.icon || '●'}
                  </text>
                  {/* Name */}
                  <text
                    y={20}
                    fill="#fff"
                    fontSize={10}
                    textAnchor="middle"
                    style={{ textShadow: '0 0 4px #000' }}
                  >
                    {obj.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Side Panel */}
        <div className="editor-panel">
          <h3>Свойства</h3>

          {selectedRegion ? (
            <div className="region-properties">
              <div className="property">
                <label>Название:</label>
                <input
                  type="text"
                  value={selectedRegion.name}
                  onChange={(e) => updateRegion(selectedRegion.id, { name: e.target.value })}
                />
              </div>

              <div className="property">
                <label>Цвет:</label>
                <div className="color-picker">
                  <input
                    type="color"
                    value={selectedRegion.color}
                    onChange={(e) => updateRegion(selectedRegion.id, { color: e.target.value })}
                  />
                  <div className="color-presets">
                    {COLORS.slice(0, 8).map(c => (
                      <button
                        key={c}
                        className="color-btn"
                        style={{ background: c }}
                        onClick={() => updateRegion(selectedRegion.id, { color: c })}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="property">
                <label>ID:</label>
                <span className="region-id">{selectedRegion.id}</span>
              </div>

              <div className="property">
                <label>Точек:</label>
                <span>{selectedRegion.points.length}</span>
              </div>

              <button onClick={deleteSelectedRegion} className="delete-btn">
                🗑️ Удалить регион
              </button>
            </div>
          ) : selectedObject ? (
            <div className="object-properties">
              <div className="property">
                <label>Тип:</label>
                <span>{OBJECT_TYPES.find(o => o.type === selectedObject.type)?.label}</span>
              </div>

              <div className="property">
                <label>Название:</label>
                <input
                  type="text"
                  value={selectedObject.name}
                  onChange={(e) => updateObject(selectedObject.id, { name: e.target.value })}
                />
              </div>

              <div className="property">
                <label>Позиция:</label>
                <span>X: {Math.round(selectedObject.x)}, Y: {Math.round(selectedObject.y)}</span>
              </div>

              <button onClick={deleteSelectedObject} className="delete-btn">
                🗑️ Удалить объект
              </button>
            </div>
          ) : (
            <p className="no-selection">Выберите регион или объект</p>
          )}

          <div className="regions-list">
            <h4>Регионы ({regions.length})</h4>
            {regions.map(r => (
              <div
                key={r.id}
                className={`region-item ${selectedRegionId === r.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedRegionId(r.id);
                  setSelectedObjectId(null);
                  setMode('select');
                }}
              >
                <span className="region-color" style={{ background: r.color }} />
                <span className="region-name">{r.name}</span>
              </div>
            ))}
          </div>

          <div className="objects-list">
            <h4>Объекты ({objects.length})</h4>
            {objects.map(o => (
              <div
                key={o.id}
                className={`object-item ${selectedObjectId === o.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedObjectId(o.id);
                  setSelectedRegionId(null);
                  setMode('select');
                }}
              >
                <span className="object-icon">
                  {OBJECT_TYPES.find(ot => ot.type === o.type)?.icon}
                </span>
                <span className="object-name">{o.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .map-editor {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1a1a2e;
          color: #fff;
        }

        .editor-toolbar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          background: #252540;
          border-bottom: 1px solid #333;
          flex-wrap: wrap;
        }

        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .toolbar-right {
          margin-left: auto;
        }

        .editor-toolbar button {
          padding: 6px 10px;
          border: 1px solid #444;
          border-radius: 4px;
          background: #333;
          color: #fff;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }

        .editor-toolbar button:hover:not(:disabled) {
          background: #444;
        }

        .editor-toolbar button.active {
          background: #0066cc;
          border-color: #0088ff;
        }

        .editor-toolbar button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .map-name-input {
          padding: 6px 10px;
          border: 1px solid #444;
          border-radius: 4px;
          background: #222;
          color: #fff;
          width: 140px;
          font-size: 13px;
        }

        .map-size-select {
          padding: 6px 10px;
          border: 1px solid #444;
          border-radius: 4px;
          background: #222;
          color: #fff;
          font-size: 13px;
        }

        .cancel-btn {
          background: #cc3333 !important;
        }

        .editor-content {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .editor-canvas {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: #111;
          position: relative;
          overflow: hidden;
        }

        .zoom-controls {
          position: absolute;
          bottom: 20px;
          right: 20px;
          z-index: 100;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .zoom-controls button {
          width: 32px;
          height: 32px;
          border: 1px solid #333;
          border-radius: 6px;
          background: #1a1a24;
          color: #fff;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .zoom-controls button:hover {
          background: #2a2a3a;
        }

        .zoom-level {
          text-align: center;
          font-size: 11px;
          color: #666;
        }

        .editor-svg {
          width: 100%;
          height: 100%;
          border: 2px solid #333;
          border-radius: 4px;
          transition: transform 0.1s ease-out;
        }

        .editor-panel {
          width: 260px;
          background: #252540;
          border-left: 1px solid #333;
          padding: 14px;
          overflow-y: auto;
        }

        .editor-panel h3 {
          margin: 0 0 14px 0;
          font-size: 16px;
        }

        .region-properties, .object-properties {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .property {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .property label {
          font-size: 11px;
          color: #888;
        }

        .property input[type="text"] {
          padding: 6px 8px;
          border: 1px solid #444;
          border-radius: 4px;
          background: #222;
          color: #fff;
          font-size: 13px;
        }

        .color-picker {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .color-picker input[type="color"] {
          width: 100%;
          height: 32px;
          border: none;
          cursor: pointer;
        }

        .color-presets {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .color-btn {
          width: 22px;
          height: 22px;
          border: 2px solid transparent;
          border-radius: 4px;
          cursor: pointer;
        }

        .color-btn:hover {
          border-color: #fff;
        }

        .region-id {
          font-family: monospace;
          font-size: 11px;
          color: #888;
        }

        .delete-btn {
          margin-top: 12px;
          padding: 8px;
          background: #cc3333 !important;
          border-color: #ff4444 !important;
        }

        .no-selection {
          color: #666;
          font-style: italic;
          font-size: 13px;
        }

        .regions-list, .objects-list {
          margin-top: 20px;
          border-top: 1px solid #333;
          padding-top: 14px;
        }

        .regions-list h4, .objects-list h4 {
          margin: 0 0 10px 0;
          font-size: 13px;
          color: #888;
        }

        .region-item, .object-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
          font-size: 13px;
        }

        .region-item:hover, .object-item:hover {
          background: #333;
        }

        .region-item.selected, .object-item.selected {
          background: #0066cc;
        }

        .region-color {
          width: 14px;
          height: 14px;
          border-radius: 3px;
        }

        .object-icon {
          font-size: 14px;
        }
      `}</style>
    </div>
  );
};

export default MapEditor;
