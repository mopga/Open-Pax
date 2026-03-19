/**
 * Open-Pax — Create World Screen
 * ==============================
 * UI для настройки параметров мира перед игрой.
 */

import React, { useState } from 'react';

interface RegionOwner {
  id: string;
  name: string;
  color: string;
  path: string;
  owner: string;
}

interface CreateWorldProps {
  mapId: string;
  mapName: string;
  regions: { id: string; name: string; color: string; path: string }[];
  onSave: (data: WorldConfig) => void;
  onCancel: () => void;
}

export interface WorldConfig {
  mapId: string;
  name: string;
  description: string;
  startDate: string;
  basePrompt: string;
  historicalAccuracy: number;
  regions: RegionOwner[];
}

export const CreateWorld: React.FC<CreateWorldProps> = ({
  mapId,
  mapName,
  regions: initialRegions,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(mapName + ' World');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('1951-01-01');
  const [basePrompt, setBasePrompt] = useState('');
  const [historicalAccuracy, setHistoricalAccuracy] = useState(80);
  const [regions, setRegions] = useState<RegionOwner[]>(
    initialRegions.map(r => ({
      ...r,
      owner: 'neutral',
    }))
  );
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  // Preset dates
  const datePresets = [
    { label: '1914', value: '1914-01-01', desc: 'WWI Era' },
    { label: '1939', value: '1939-01-01', desc: 'WWII Era' },
    { label: '1951', value: '1951-01-01', desc: 'Cold War' },
    { label: '1991', value: '1991-01-01', desc: 'Modern Era' },
    { label: '2000', value: '2000-01-01', desc: 'Millennium' },
  ];

  // Preset prompts
  const promptPresets = [
    { label: 'Cold War', prompt: 'Мир разделен на два лагеря: демократии Запада и коммунисты Востока. Гонка вооружений идет полным ходом.' },
    { label: 'Three Powers', prompt: 'Мир разделен на три силы: демократии, коммунисты и нейтральный блок. Холодная война ведется между всеми.' },
    { label: 'Custom', prompt: '' },
  ];

  const updateRegionOwner = (regionId: string, owner: string) => {
    setRegions(prev =>
      prev.map(r => (r.id === regionId ? { ...r, owner } : r))
    );
  };

  const handleSubmit = () => {
    onSave({
      mapId,
      name,
      description,
      startDate,
      basePrompt,
      historicalAccuracy,
      regions,
    });
  };

  const selectedRegion = regions.find(r => r.id === selectedRegionId);

  return (
    <div className="create-world">
      <div className="create-world-header">
        <h2>Создание мира</h2>
        <p>Настройте параметры альтернативной истории</p>
      </div>

      <div className="create-world-content">
        {/* Left Panel - Settings */}
        <div className="settings-panel">
          {/* World Name */}
          <div className="form-group">
            <label>Название мира</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Альтернативная история"
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label>Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Краткое описание вашего мира..."
              rows={2}
            />
          </div>

          {/* Start Date */}
          <div className="form-group">
            <label>Дата старта</label>
            <div className="date-presets">
              {datePresets.map(preset => (
                <button
                  key={preset.value}
                  className={startDate === preset.value ? 'active' : ''}
                  onClick={() => setStartDate(preset.value)}
                  title={preset.desc}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {/* Historical Accuracy */}
          <div className="form-group">
            <label>Историческая точность: {historicalAccuracy}%</label>
            <input
              type="range"
              min="0"
              max="100"
              value={historicalAccuracy}
              onChange={(e) => setHistoricalAccuracy(Number(e.target.value))}
            />
            <div className="accuracy-labels">
              <span>Фэнтези</span>
              <span>История</span>
            </div>
          </div>

          {/* Base Prompt */}
          <div className="form-group">
            <label>Описание альтернативной истории</label>
            <div className="prompt-presets">
              {promptPresets.map(preset => (
                <button
                  key={preset.label}
                  className={basePrompt === preset.prompt ? 'active' : ''}
                  onClick={() => setBasePrompt(preset.prompt)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <textarea
              value={basePrompt}
              onChange={(e) => setBasePrompt(e.target.value)}
              placeholder="Опишите ключевые отличия вашего мира от реальной истории..."
              rows={5}
              style={{ minHeight: '120px' }}
            />
            <div className="prompt-meta">
              <span className="char-count">{basePrompt.length} символов</span>
            </div>
            <p className="hint">
              Промпт определяет: историю до начала игры, поведение NPC стран, возможные события и реакции мира.
            </p>
            <details className="prompt-examples">
              <summary>Примеры описаний</summary>
              <div className="example-item" onClick={() => setBasePrompt('Мир разделен на два лагеря: демократии Запада и коммунисты Востока. Гонка вооружений идет полным ходом. США и СССР соперничают за влияние во всем мире.')}>
                <strong>Cold War:</strong> "Мир разделен на два лагеря..."
              </div>
              <div className="example-item" onClick={() => setBasePrompt('Мир разделен на три силы: демократии, коммунисты и нейтральный блок. Холодная война ведется между всеми тремя центрами силы.')}>
                <strong>Three Powers:</strong> "Мир разделен на три силы..."
              </div>
              <div className="example-item" onClick={() => setBasePrompt('В 1951 году Вторая мировая война не закончилась. Германия оккупировала всю Европу. Британия стала последним оплотом сопротивления.')}>
                <strong>WWII Alternate:</strong> "В 1951 году Вторая мировая..."
              </div>
              <div className="example-item" onClick={() => setBasePrompt('Технологии развились раньше — уже в 1951 году существует интернет, а искусственный интеллект становится реальностью.')}>
                <strong>Tech Revolution:</strong> "Технологии развились раньше..."
              </div>
            </details>
          </div>
        </div>

        {/* Right Panel - Map Preview */}
        <div className="map-preview-panel">
          <h3>Карта мира</h3>
          <p className="hint">Выберите регион для назначения владельца</p>

          <div className="map-preview-container">
            <svg viewBox="0 0 800 600" className="preview-svg">
              {/* Background */}
              <rect x="0" y="0" width="800" height="600" fill="#0d0d14" />

              {/* Grid */}
              <pattern id="grid2" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1a24" strokeWidth="0.5" />
              </pattern>
              <rect x="0" y="0" width="800" height="600" fill="url(#grid2)" />

              {/* Regions */}
              {regions.map(region => {
                const isSelected = region.id === selectedRegionId;
                return (
                  <g key={region.id}>
                    <path
                      d={region.path}
                      fill={region.color}
                      fillOpacity={isSelected ? 0.9 : 0.6}
                      stroke={isSelected ? '#ffffff' : '#444444'}
                      strokeWidth={isSelected ? 3 : 1}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedRegionId(region.id)}
                    />
                    {/* Region label */}
                    <text
                      x={getCentroid(region.path)?.x || 400}
                      y={getCentroid(region.path)?.y || 300}
                      fill="#ffffff"
                      fontSize="12"
                      textAnchor="middle"
                      pointerEvents="none"
                      style={{ textShadow: '0 0 4px #000' }}
                    >
                      {region.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Region Details */}
          <div className="region-details">
            {selectedRegion ? (
              <>
                <h4>{selectedRegion.name}</h4>
                <div className="owner-selector">
                  <label>Владелец:</label>
                  <select
                    value={selectedRegion.owner}
                    onChange={(e) => updateRegionOwner(selectedRegion.id, e.target.value)}
                  >
                    <option value="neutral">Нейтральный</option>
                    <option value="player">Игрок</option>
                    <option value="ai-1">AI - Агрессивный</option>
                    <option value="ai-2">AI - Дипломат</option>
                    <option value="ai-3">AI - Нейтральный</option>
                  </select>
                </div>
              </>
            ) : (
              <p className="no-selection">Выберите регион на карте</p>
            )}
          </div>

          {/* Region List */}
          <div className="regions-list">
            <h4>Регионы ({regions.length})</h4>
            <div className="region-items">
              {regions.map(r => (
                <div
                  key={r.id}
                  className={`region-item ${selectedRegionId === r.id ? 'selected' : ''}`}
                  onClick={() => setSelectedRegionId(r.id)}
                >
                  <span className="region-color" style={{ background: r.color }} />
                  <span className="region-name">{r.name}</span>
                  <span className={`region-owner ${r.owner}`}>
                    {r.owner === 'neutral' ? '⚪' : r.owner === 'player' ? '👤' : '🤖'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="create-world-footer">
        <button className="btn-secondary" onClick={onCancel}>
          Отмена
        </button>
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!name || !basePrompt}
        >
          Создать мир и начать игру
        </button>
      </div>

      <style>{`
        .create-world {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #0d0d14;
          color: #fff;
        }

        .create-world-header {
          padding: 24px 32px;
          border-bottom: 1px solid #252540;
        }

        .create-world-header h2 {
          margin: 0 0 8px 0;
          font-size: 28px;
        }

        .create-world-header p {
          margin: 0;
          color: #888;
        }

        .create-world-content {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .settings-panel {
          width: 400px;
          padding: 24px;
          border-right: 1px solid #252540;
          overflow-y: auto;
        }

        .map-preview-panel {
          flex: 1;
          padding: 24px;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          color: #aaa;
        }

        .form-group input[type="text"],
        .form-group input[type="date"],
        .form-group textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid #333;
          border-radius: 6px;
          background: #1a1a2e;
          color: #fff;
          font-size: 14px;
        }

        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #4a9eff;
        }

        .form-group textarea {
          resize: vertical;
          min-height: 80px;
        }

        .date-presets,
        .prompt-presets {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }

        .date-presets button,
        .prompt-presets button {
          padding: 6px 12px;
          border: 1px solid #333;
          border-radius: 4px;
          background: #1a1a2e;
          color: #aaa;
          cursor: pointer;
          font-size: 12px;
        }

        .date-presets button:hover,
        .prompt-presets button:hover {
          border-color: #4a9eff;
        }

        .date-presets button.active,
        .prompt-presets button.active {
          background: #4a9eff;
          border-color: #4a9eff;
          color: #fff;
        }

        .form-group input[type="range"] {
          width: 100%;
          margin: 8px 0;
        }

        .accuracy-labels {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #666;
        }

        .hint {
          font-size: 12px;
          color: #666;
          margin-top: 8px;
          font-style: italic;
        }

        .prompt-meta {
          display: flex;
          justify-content: flex-end;
          margin-top: 4px;
        }

        .char-count {
          font-size: 11px;
          color: #555;
        }

        .prompt-examples {
          margin-top: 12px;
          padding: 10px;
          background: #1a1a2e;
          border-radius: 6px;
          border: 1px solid #333;
        }

        .prompt-examples summary {
          cursor: pointer;
          font-size: 13px;
          color: #888;
          user-select: none;
        }

        .prompt-examples summary:hover {
          color: #aaa;
        }

        .example-item {
          margin-top: 10px;
          padding: 8px 10px;
          background: #252540;
          border-radius: 4px;
          font-size: 12px;
          color: #aaa;
          cursor: pointer;
          transition: background 0.2s;
        }

        .example-item:hover {
          background: #2a2a4a;
          color: #fff;
        }

        .example-item strong {
          color: #4a9eff;
        }

        .map-preview-container {
          flex: 1;
          min-height: 300px;
          max-height: 400px;
          border: 2px solid #252540;
          border-radius: 8px;
          overflow: hidden;
        }

        .preview-svg {
          width: 100%;
          height: 100%;
        }

        .region-details {
          padding: 16px;
          background: #1a1a2e;
          border-radius: 8px;
          margin-top: 16px;
        }

        .region-details h4 {
          margin: 0 0 12px 0;
        }

        .owner-selector {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .owner-selector select {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #333;
          border-radius: 4px;
          background: #252540;
          color: #fff;
        }

        .no-selection {
          color: #666;
          font-style: italic;
        }

        .regions-list {
          margin-top: 16px;
        }

        .regions-list h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: #888;
        }

        .region-items {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .region-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          background: #1a1a2e;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }

        .region-item:hover {
          background: #252540;
        }

        .region-item.selected {
          background: #4a9eff;
        }

        .region-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
        }

        .region-owner {
          font-size: 10px;
        }

        .create-world-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 20px 32px;
          border-top: 1px solid #252540;
        }

        .btn-primary,
        .btn-secondary {
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #4a9eff;
          border: none;
          color: #fff;
        }

        .btn-primary:hover:not(:disabled) {
          background: #3a8eef;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: transparent;
          border: 1px solid #444;
          color: #aaa;
        }

        .btn-secondary:hover {
          border-color: #666;
          color: #fff;
        }
      `}</style>
    </div>
  );
};

// Helper to get centroid of SVG path (simplified)
function getCentroid(path: string): { x: number; y: number } | null {
  // Extract numbers from path
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

export default CreateWorld;
