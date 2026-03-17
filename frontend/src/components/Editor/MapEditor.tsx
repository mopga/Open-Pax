/**
 * Open-Pax — Map Editor
 * ====================
 * Редактор карт со свободным рисованием.
 */

import React, { useState, useRef, useCallback } from 'react';

export type EditorMode = 'draw' | 'select' | 'erase';

export interface EditorRegion {
  id: string;
  name: string;
  color: string;
  points: { x: number; y: number }[];
  isComplete: boolean;
}

export interface MapEditorProps {
  onSave?: (regions: EditorRegion[], mapName: string) => void;
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

export const MapEditor: React.FC<MapEditorProps> = ({
  onSave,
  onCancel,
  initialRegions = [],
  initialName = 'New World',
}) => {
  const [mapName, setMapName] = useState(initialName);
  const [regions, setRegions] = useState<EditorRegion[]>(initialRegions);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [mode, setMode] = useState<EditorMode>('draw');
  const [showGrid, setShowGrid] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const historyRef = useRef<EditorRegion[]>([]);

  // Получить координаты относительно SVG
  const getCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 800 / rect.width;
    const scaleY = 600 / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  // Начало рисования
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode === 'select') return;

    const coords = getCoords(e);
    setIsDrawing(true);

    if (mode === 'erase') {
      // Удалить ближайшую точку
      const threshold = 15;
      setRegions(prev => prev.map(r => ({
        ...r,
        points: r.points.filter(p =>
          Math.sqrt((p.x - coords.x) ** 2 + (p.y - coords.y) ** 2) > threshold
        ),
      })));
      return;
    }

    // Режим draw - добавляем точку
    setCurrentPoints(prev => [...prev, coords]);
  }, [mode, getCoords]);

  // Рисование (drag)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing || mode !== 'draw') return;

    const coords = getCoords(e);
    setCurrentPoints(prev => [...prev, coords]);
  }, [isDrawing, mode, getCoords]);

  // Конец рисования
  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  // Завершить текущий регион
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

  // Отменить последний регион
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

  // Удалить выбранный регион
  const deleteSelectedRegion = useCallback(() => {
    if (!selectedRegionId) return;
    setRegions(prev => prev.filter(r => r.id !== selectedRegionId));
    setSelectedRegionId(null);
  }, [selectedRegionId]);

  // Обновить регион
  const updateRegion = useCallback((id: string, updates: Partial<EditorRegion>) => {
    setRegions(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  // Сохранить карту
  const handleSave = useCallback(() => {
    if (onSave) {
      onSave(regions, mapName);
    }
  }, [regions, mapName, onSave]);

  // Выбрать регион
  const handleRegionClick = useCallback((regionId: string) => {
    if (mode === 'select') {
      setSelectedRegionId(regionId);
    }
  }, [mode]);

  const selectedRegion = regions.find(r => r.id === selectedRegionId);

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
            title="Выбрать"
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
        </div>

        <div className="toolbar-group">
          <button onClick={completeRegion} disabled={currentPoints.length < 3}>
            ✓ Завершить регион
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
        <div className="editor-canvas">
          <svg
            ref={svgRef}
            viewBox="0 0 800 600"
            className="editor-svg"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Background */}
            <rect x="0" y="0" width="800" height="600" fill="#1a1a2e" />

            {/* Grid */}
            {showGrid && (
              <g className="grid">
                {Array.from({ length: 17 }, (_, i) => (
                  <line
                    key={`v${i}`}
                    x1={i * 50}
                    y1="0"
                    x2={i * 50}
                    y2="600"
                    stroke="#333"
                    strokeWidth="0.5"
                  />
                ))}
                {Array.from({ length: 13 }, (_, i) => (
                  <line
                    key={`h${i}`}
                    x1="0"
                    y1={i * 50}
                    x2="800"
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
                fillOpacity={0.7}
                stroke={selectedRegionId === region.id ? '#fff' : '#333'}
                strokeWidth={selectedRegionId === region.id ? 3 : 1}
                style={{ cursor: mode === 'select' ? 'pointer' : 'default' }}
                onClick={() => handleRegionClick(region.id)}
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

            {/* Points for current drawing */}
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
                style={{ cursor: 'pointer' }}
              />
            ))}
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

              <button
                onClick={deleteSelectedRegion}
                className="delete-btn"
              >
                🗑️ Удалить регион
              </button>
            </div>
          ) : (
            <p className="no-selection">Выберите регион на карте</p>
          )}

          <div className="regions-list">
            <h4>Регионы ({regions.length})</h4>
            {regions.map(r => (
              <div
                key={r.id}
                className={`region-item ${selectedRegionId === r.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedRegionId(r.id);
                  setMode('select');
                }}
              >
                <span
                  className="region-color"
                  style={{ background: r.color }}
                />
                <span className="region-name">{r.name}</span>
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
          gap: 16px;
          padding: 12px 16px;
          background: #252540;
          border-bottom: 1px solid #333;
          flex-wrap: wrap;
        }

        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .toolbar-right {
          margin-left: auto;
        }

        .editor-toolbar button {
          padding: 8px 12px;
          border: 1px solid #444;
          border-radius: 4px;
          background: #333;
          color: #fff;
          cursor: pointer;
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
          padding: 8px;
          border: 1px solid #444;
          border-radius: 4px;
          background: #222;
          color: #fff;
          width: 150px;
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
          padding: 20px;
          background: #111;
        }

        .editor-svg {
          width: 100%;
          max-width: 800px;
          height: auto;
          border: 2px solid #333;
          border-radius: 4px;
          cursor: crosshair;
        }

        .editor-panel {
          width: 280px;
          background: #252540;
          border-left: 1px solid #333;
          padding: 16px;
          overflow-y: auto;
        }

        .editor-panel h3 {
          margin: 0 0 16px 0;
          font-size: 18px;
        }

        .region-properties {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .property {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .property label {
          font-size: 12px;
          color: #888;
        }

        .property input[type="text"] {
          padding: 8px;
          border: 1px solid #444;
          border-radius: 4px;
          background: #222;
          color: #fff;
        }

        .color-picker {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .color-picker input[type="color"] {
          width: 100%;
          height: 40px;
          border: none;
          cursor: pointer;
        }

        .color-presets {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .color-btn {
          width: 24px;
          height: 24px;
          border: 2px solid transparent;
          border-radius: 4px;
          cursor: pointer;
        }

        .color-btn:hover {
          border-color: #fff;
        }

        .region-id {
          font-family: monospace;
          font-size: 12px;
          color: #888;
        }

        .delete-btn {
          margin-top: 16px;
          padding: 10px;
          background: #cc3333 !important;
          border-color: #ff4444 !important;
        }

        .no-selection {
          color: #666;
          font-style: italic;
        }

        .regions-list {
          margin-top: 24px;
          border-top: 1px solid #333;
          padding-top: 16px;
        }

        .regions-list h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: #888;
        }

        .region-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .region-item:hover {
          background: #333;
        }

        .region-item.selected {
          background: #0066cc;
        }

        .region-color {
          width: 16px;
          height: 16px;
          border-radius: 3px;
        }

        .region-name {
          font-size: 14px;
        }
      `}</style>
    </div>
  );
};

export default MapEditor;
