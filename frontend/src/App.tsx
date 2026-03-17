/**
 * Open-Pax — Main App (Redesign)
 * ==============================
 */

import React, { useState, useEffect, useRef } from 'react';
import { MapView } from './components/Map/MapView';
import { MapEditor, type EditorRegion } from './components/Editor';
import { gameApi, worldApi, mapApi } from './services/api';
import type { Region, World, Game } from './types';

// Вспомогательная функция: точки в SVG path
const pointsToPath = (points: { x: number; y: number }[]): string => {
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
};

// Интерфейс для карты из localStorage
interface LocalMap {
  id: string;
  name: string;
  regions: { id: string; name: string; color: string; path: string }[];
}

function App() {
  // Состояние
  type ViewType = 'menu' | 'select-map' | 'create-world' | 'game' | 'editor';
  const [currentView, setCurrentView] = useState<ViewType>('menu');
  const [savedMaps, setSavedMaps] = useState<LocalMap[]>([]);
  const [currentWorld, setCurrentWorld] = useState<World | null>(null);
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [actionText, setActionText] = useState('');
  const [history, setHistory] = useState<{ turn: number; action: string; result: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const historyEndRef = useRef<HTMLDivElement>(null);

  // Прокрутка истории вниз
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Загрузка сохраненных карт
  useEffect(() => {
    const loadMaps = async () => {
      const maps: LocalMap[] = [];

      try {
        const serverMaps = await mapApi.list();
        for (const m of serverMaps) {
          try {
            const fullMap = await mapApi.get(m.id);
            maps.push({
              id: `server_${m.id}`,
              name: fullMap.name,
              regions: fullMap.regions.map(r => ({
                id: r.id,
                name: r.name,
                color: r.color,
                path: r.path,
              })),
            });
          } catch (e) { /* skip */ }
        }
      } catch (e) { /* skip */ }

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('map_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (!maps.find(m => m.name === data.name)) {
              maps.push({ id: key, ...data });
            }
          } catch (e) { /* skip */ }
        }
      }

      setSavedMaps(maps);
    };

    loadMaps();
  }, []);

  // Сохранить карту локально
  const handleSaveMapLocal = (regions: EditorRegion[], mapName: string): LocalMap => {
    const mapData: LocalMap = {
      id: `map_${Date.now()}`,
      name: mapName,
      regions: regions.map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        path: pointsToPath(r.points),
      })),
    };
    localStorage.setItem(mapData.id, JSON.stringify(mapData));
    setSavedMaps(prev => [...prev, mapData]);
    return mapData;
  };

  // Сохранить карту на сервере
  const handleSaveMap = async (regions: EditorRegion[], mapName: string) => {
    setLoading(true);
    try {
      const mapRegions = regions.map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        path: pointsToPath(r.points),
      }));

      await mapApi.create({
        name: mapName,
        width: 800,
        height: 600,
        regions: mapRegions,
      });

      handleSaveMapLocal(regions, mapName);
      alert(`Карта "${mapName}" сохранена!`);
      setCurrentView('menu');
    } catch (e) {
      handleSaveMapLocal(regions, mapName);
      alert('Сохранено локально!');
      setCurrentView('menu');
    }
    setLoading(false);
  };

  // Загрузить карту и создать мир
  const handleLoadMap = async (map: LocalMap) => {
    setLoading(true);
    try {
      const mapId = map.id.startsWith('server_')
        ? map.id.replace('server_', '')
        : map.id.replace('map_', '');

      const result = await worldApi.createFromMap({ mapId, name: map.name });
      const world = await worldApi.get(result.world_id);

      const regions: Region[] = Object.values(world.regions || {}).map((r: any) => ({
        id: r.id,
        name: r.name,
        svgPath: r.svgPath,
        color: r.color,
        owner: r.owner || 'neutral',
        population: r.population || 1000000,
        gdp: r.gdp || 100,
        militaryPower: r.militaryPower || 100,
        objects: [],
        borders: r.borders || [],
        status: r.status || 'active',
        metadata: {},
      }));

      setCurrentWorld({
        ...world,
        regions: regions.reduce((acc: any, r) => { acc[r.id] = r; return acc; }, {}),
      } as World);

      const firstRegionId = regions[0]?.id || null;
      setSelectedRegion(firstRegionId);

      // Создаем игру
      if (result.world_id && firstRegionId) {
        try {
          const gameResponse = await gameApi.create({
            world_id: result.world_id,
            player_name: 'Player',
            player_region_id: firstRegionId,
          });
          const game = await gameApi.get(gameResponse.game_id);
          setCurrentGame(game);
        } catch (e) {
          // Fallback to local game
          setCurrentGame({
            id: 'local_' + Date.now(),
            world: { ...world, regions: regions.reduce((acc: any, r) => { acc[r.id] = r; return acc; }, {}) } as World,
            players: [{ id: 'player_1', name: 'Player', regionId: firstRegionId, color: '#ff0000' }],
            currentTurn: 1,
            maxTurns: 100,
            status: 'playing' as any,
          } as Game);
        }
      }

      setCurrentView('game');
    } catch (e) {
      // Используем локальные данные
      const regions: Region[] = map.regions.map(r => ({
        id: r.id,
        name: r.name,
        svgPath: r.path,
        color: r.color,
        owner: 'neutral',
        population: 1000000,
        gdp: 100,
        militaryPower: 100,
        objects: [],
        borders: [],
        status: 'active' as any,
        metadata: {},
      }));

      setCurrentWorld({
        id: map.id,
        name: map.name,
        description: 'Локальная карта',
        startDate: '1951-01-01',
        basePrompt: 'Альтернативная история',
        historicalAccuracy: 0.8,
        regions: regions.reduce((acc: any, r) => { acc[r.id] = r; return acc; }, {}),
        blocs: {},
      });

      const firstRegionId = regions[0]?.id || null;
      setSelectedRegion(firstRegionId);

      // Создаем локальную игру
      if (firstRegionId) {
        setCurrentGame({
          id: 'local_' + Date.now(),
          world: currentWorld!,
          players: [{ id: 'player_1', name: 'Player', regionId: firstRegionId, color: '#ff0000' }],
          currentTurn: 1,
          maxTurns: 100,
          status: 'playing' as any,
        } as Game);
      }

      setCurrentView('game');
    }
    setLoading(false);
  };

  // Отправить действие
  const handleSubmitAction = async () => {
    if (!currentGame || !actionText.trim() || !selectedRegion) {
      console.log('Debug: currentGame=', currentGame, 'actionText=', actionText, 'selectedRegion=', selectedRegion);
      return;
    }

    setLoading(true);

    const turn = currentGame.currentTurn;

    // Для локальных игр (id начинается с local_) не делаем API вызов
    if (currentGame.id.startsWith('local_')) {
      setHistory(prev => [...prev, {
        turn,
        action: actionText,
        result: 'Мир отреагировал на ваши действия...',
      }]);
      setCurrentGame({ ...currentGame, currentTurn: turn + 1 });
      setActionText('');
      setLoading(false);
      return;
    }

    try {
      const result = await gameApi.submitAction({
        game_id: currentGame.id,
        player_id: currentGame.players[0].id,
        text: actionText,
      });

      setHistory(prev => [...prev, {
        turn,
        action: actionText,
        result: result.narration,
      }]);

      const updatedGame = await gameApi.get(currentGame.id);
      setCurrentGame(updatedGame);
    } catch (e) {
      console.error('Failed to submit action:', e);
      setHistory(prev => [...prev, {
        turn,
        action: actionText,
        result: 'Мир отреагировал на ваши действия...',
      }]);
    }

    setActionText('');
    setLoading(false);
  };

  // Выбрать страну
  const handleCountryChange = (regionId: string) => {
    setSelectedRegion(regionId);
  };

  // Рендер главного меню
  const renderMenu = () => (
    <div className="menu-container">
      <div className="menu-header">
        <h1>🗺️ Open-Pax</h1>
        <p>Alternate History Simulator</p>
      </div>

      {savedMaps.length > 0 && (
        <div className="saved-maps-section">
          <h3>Сохраненные миры</h3>
          <div className="maps-grid">
            {savedMaps.map(map => (
              <div key={map.id} className="map-card" onClick={() => handleLoadMap(map)}>
                <div className="map-preview">
                  <svg viewBox="0 0 800 600">
                    {map.regions.map(r => (
                      <path key={r.id} d={r.path} fill={r.color} opacity={0.7} />
                    ))}
                  </svg>
                </div>
                <div className="map-info">
                  <h4>{map.name}</h4>
                  <span>{map.regions.length} регионов</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="menu-actions">
        <button className="btn-primary" onClick={() => setCurrentView('editor')}>
          ➕ Создать новую карту
        </button>
      </div>
    </div>
  );

  // Рендер игры
  const renderGame = () => {
    if (!currentWorld) return null;

    const regions = Object.values(currentWorld.regions);
    const currentRegion = regions.find(r => r.id === selectedRegion);

    return (
      <div className="game-container">
        {/* Карта слева */}
        <div className="game-map">
          <MapView
            regions={regions}
            selectedRegionId={selectedRegion || undefined}
            onRegionClick={handleCountryChange}
          />
        </div>

        {/* Панель справа */}
        <div className="game-panel">
          {/* Turn counter */}
          <div className="turn-header">
            <span className="turn-number">ХОД {currentGame?.currentTurn || 1}</span>
          </div>

          {/* Country selector */}
          <div className="country-selector">
            <label>Выберите страну:</label>
            <select
              value={selectedRegion || ''}
              onChange={(e) => handleCountryChange(e.target.value)}
            >
              {regions.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Current country info */}
          {currentRegion && (
            <div className="country-info">
              <div className="country-name" style={{ color: currentRegion.color }}>
                {currentRegion.name}
              </div>
              <div className="country-stats">
                <span>👥 {currentRegion.population?.toLocaleString() || '1,000,000'}</span>
                <span>💰 {currentRegion.gdp || 100}</span>
                <span>⚔️ {currentRegion.militaryPower || 100}</span>
              </div>
            </div>
          )}

          {/* Action input */}
          <div className="action-section">
            <textarea
              value={actionText}
              onChange={(e) => setActionText(e.target.value)}
              placeholder="Опишите ваши действия..."
              rows={4}
            />
            <button
              className="btn-turn"
              onClick={handleSubmitAction}
              disabled={loading || !actionText.trim()}
            >
              {loading ? 'Думаю...' : 'Turn →'}
            </button>
          </div>

          {/* History */}
          <div className="history-section">
            <h4>История</h4>
            <div className="history-list">
              {history.map((item, i) => (
                <div key={i} className="history-item">
                  <div className="history-turn">Ход {item.turn}</div>
                  <div className="history-action">→ {item.action}</div>
                  <div className="history-result">{item.result}</div>
                </div>
              ))}
              <div ref={historyEndRef} />
            </div>
          </div>

          {/* Back button */}
          <button className="btn-back" onClick={() => {
            setCurrentView('menu');
            setCurrentWorld(null);
            setCurrentGame(null);
            setHistory([]);
          }}>
            ← В меню
          </button>
        </div>
      </div>
    );
  };

  // Рендер редактора
  const renderEditor = () => (
    <MapEditor
      onSave={handleSaveMap}
      onCancel={() => setCurrentView('menu')}
    />
  );

  return (
    <div className="app">
      {currentView === 'menu' && renderMenu()}
      {currentView === 'game' && renderGame()}
      {currentView === 'editor' && renderEditor()}
    </div>
  );
}

export default App;
