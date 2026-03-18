/**
 * Open-Pax — Main App (Redesign)
 * ==============================
 */

import React, { useState, useEffect, useRef } from 'react';
import { MapView } from './components/Map/MapView';
import { MapEditor, type EditorRegion, type EditorObject } from './components/Editor';
import { CreateWorld, type WorldConfig } from './components/WorldBuilder/CreateWorld';
import { gameApi, worldApi, mapApi, savesApi } from './services/api';
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
  width?: number;
  height?: number;
  regions: { id: string; name: string; color: string; path: string }[];
  objects?: { id: string; type: string; name: string; x: number; y: number; regionId?: string }[];
}

function App() {
  // Состояние
  type ViewType = 'menu' | 'select-map' | 'create-world' | 'game' | 'editor';
  const [currentView, setCurrentView] = useState<ViewType>('menu');
  const [savedMaps, setSavedMaps] = useState<LocalMap[]>([]);
  const [selectedMapForWorld, setSelectedMapForWorld] = useState<LocalMap | null>(null);
  const [currentWorld, setCurrentWorld] = useState<World | null>(null);
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [changedRegions, setChangedRegions] = useState<string[]>([]);
  const [playerActions, setPlayerActions] = useState<string[]>(['']);
  const [jumpDays, setJumpDays] = useState<number>(30);
  const [showJumpMenu, setShowJumpMenu] = useState(false);
  const [history, setHistory] = useState<{ turn: number; action: string; result: string; events?: string[]; date?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdvisor, setShowAdvisor] = useState(false);
  const [advisorMode, setAdvisorMode] = useState<'advisor' | 'suggestions'>('advisor');
  const [advisorTips, setAdvisorTips] = useState<string>('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [savedGames, setSavedGames] = useState<any[]>([]);
  const [showSavesMenu, setShowSavesMenu] = useState(false);
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
  const handleSaveMapLocal = (regions: EditorRegion[], mapName: string, objects?: EditorObject[]): LocalMap => {
    const mapData: LocalMap = {
      id: `map_${Date.now()}`,
      name: mapName,
      regions: regions.map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        path: pointsToPath(r.points),
      })),
      objects: objects?.map(o => ({
        id: o.id,
        type: o.type,
        name: o.name,
        x: o.x,
        y: o.y,
        regionId: o.regionId,
      })),
    };
    localStorage.setItem(mapData.id, JSON.stringify(mapData));
    setSavedMaps(prev => [...prev, mapData]);
    return mapData;
  };

  // Сохранить карту на сервере
  const handleSaveMap = async (regions: EditorRegion[], mapName: string, objects?: EditorObject[]) => {
    setLoading(true);
    const mapRegions = regions.map(r => ({
      id: r.id,
      name: r.name,
      color: r.color,
      path: pointsToPath(r.points),
    }));

    // Пробуем сохранить на сервере
    let serverMapId = null;
    try {
      const mapData = {
        name: mapName,
        width: 2000,
        height: 1500,
        regions: mapRegions,
        objects: objects?.map(o => ({
          id: o.id,
          type: o.type,
          name: o.name,
          x: o.x,
          y: o.y,
          regionId: o.regionId,
        })) || [],
      };
      const result = await mapApi.create(mapData);
      serverMapId = result.id;
      alert(`Карта "${mapName}" сохранена на сервере!`);
    } catch (e) {
      console.warn('Failed to save map to server:', e);
    }

    // Сохраняем локально (с серверным ID если получилось)
    const localMap = handleSaveMapLocal(regions, mapName, objects);
    if (serverMapId) {
      // Обновляем localStorage с серверным ID
      const updatedMap = { ...localMap, id: `server_${serverMapId}` };
      localStorage.removeItem(localMap.id);
      localStorage.setItem(updatedMap.id, JSON.stringify(updatedMap));
      // Обновляем state
      setSavedMaps(prev => prev.filter(m => m.id !== localMap.id).concat(updatedMap));
    }

    setCurrentView('menu');
    setLoading(false);
  };

  // Выбрать карту для создания мира
  const handleSelectMap = (map: LocalMap) => {
    setSelectedMapForWorld(map);
    setCurrentView('create-world');
  };

  // Создать мир из конфигурации
  const handleCreateWorld = async (config: WorldConfig) => {
    setLoading(true);

    // Проверяем что карта сохранена на сервере
    if (!selectedMapForWorld?.id.startsWith('server_')) {
      alert('Сначала сохраните карту на сервере (кнопка "Сохранить" в редакторе карт)!');
      setLoading(false);
      return;
    }

    const mapId = selectedMapForWorld.id.replace('server_', '');
    console.log('[DEBUG] Creating world from map:', mapId);

    // Prepare initial owners
    const initialOwners = config.regions
      .filter(r => r.owner !== 'neutral')
      .map(r => ({ id: r.id, owner: r.owner }));

    try {
      const result = await worldApi.createFromMap({
        mapId,
        name: config.name,
        description: config.description,
        startDate: config.startDate,
        basePrompt: config.basePrompt,
        historicalAccuracy: config.historicalAccuracy / 100,
        initialOwners,
      });

      // Применяем начальное распределение владельцев
      const world = await worldApi.get(result.world_id);

      // Get objects from the selected map (localStorage)
      const mapObjects = selectedMapForWorld?.objects || [];

      const regions: Region[] = Object.values(world.regions || {}).map((r: any) => {
        // Find objects that belong to this region
        const regionObjects = mapObjects
          .filter((o: any) => o.regionId === r.id)
          .map((o: any) => ({
            id: o.id,
            type: o.type,
            name: o.name,
            x: o.x,
            y: o.y,
            level: 1,
            metadata: {},
          }));

        return {
          id: r.id,
          name: r.name,
          svgPath: r.svgPath,
          color: r.color,
          owner: r.owner || 'neutral',
          population: r.population || 1000000,
          gdp: r.gdp || 100,
          militaryPower: r.militaryPower || 100,
          objects: regionObjects,
          borders: r.borders || [],
          status: r.status || 'active',
          metadata: {},
        };
      });

      setCurrentWorld({
        ...world,
        regions: regions.reduce((acc: any, r) => { acc[r.id] = r; return acc; }, {}),
      } as World);

      // Find player region from WORLD (not config!) - regions have new IDs after world creation
      const playerRegionInWorld = regions.find(r => r.owner === 'player');
      const initialPlayerRegionId = playerRegionInWorld?.id || regions[0]?.id || null;
      console.log('[DEBUG] Player region ID from world:', initialPlayerRegionId, 'owner:', playerRegionInWorld?.owner);

      // Создаем игру - сервер сам определит правильный regionId на основе initialOwners
      if (result.world_id && initialPlayerRegionId) {
        try {
          console.log('[DEBUG] Creating game with:', { world_id: result.world_id, player_region_id: initialPlayerRegionId });
          const gameResponse = await gameApi.create({
            world_id: result.world_id,
            player_name: 'Player',
            player_region_id: initialPlayerRegionId,
          });
          console.log('[DEBUG] Game created, response:', gameResponse);
          const game = await gameApi.get(gameResponse.game_id);
          console.log('[DEBUG] Game fetched:', game);
          setCurrentGame(game);

          // Use player's actual regionId from game (may differ from initial)
          const playerRegionId = game.players[0]?.regionId || initialPlayerRegionId;
          setSelectedRegion(playerRegionId);
        } catch (e) {
          console.error('[DEBUG] Failed to create game via API:', e);
          // Fallback to local game
          setCurrentGame({
            id: 'local_' + Date.now(),
            world: { ...world, regions: regions.reduce((acc: any, r) => { acc[r.id] = r; return acc; }, {}) } as World,
            players: [{ id: 'player_1', name: 'Player', regionId: initialPlayerRegionId, color: '#ff0000' }],
            currentTurn: 1,
            maxTurns: 100,
            status: 'playing' as any,
          } as Game);
          setSelectedRegion(initialPlayerRegionId);
        }
      }

      setCurrentView('game');
    } catch (e) {
      console.error('[DEBUG] Failed to create world via API:', e);
      // Используем локальные данные (fallback для офлайн режима)
      const mapObjects = selectedMapForWorld?.objects || [];
      const regions: Region[] = selectedMapForWorld?.regions.map(r => {
        const regionObjects = mapObjects
          .filter((o: any) => o.regionId === r.id)
          .map((o: any) => ({
            id: o.id,
            type: o.type,
            name: o.name,
            x: o.x,
            y: o.y,
            level: 1,
            metadata: {},
          }));

        return {
          id: r.id,
          name: r.name,
          svgPath: r.path,
          color: r.color,
          owner: 'neutral',
          population: 1000000,
          gdp: 100,
          militaryPower: 100,
          objects: regionObjects,
          borders: [],
          status: 'active' as any,
          metadata: {},
        };
      }) || [];

      // Apply owner from config to regions
      const regionsWithOwner = regions.map(r => {
        const ownerConfig = config.regions.find(cr => cr.id === r.id);
        return {
          ...r,
          owner: ownerConfig?.owner || 'neutral',
        };
      });

      setCurrentWorld({
        id: selectedMapForWorld?.id || 'local',
        name: selectedMapForWorld?.name || 'Local World',
        description: 'Локальная карта',
        startDate: '1951-01-01',
        basePrompt: 'Альтернативная история',
        historicalAccuracy: 0.8,
        regions: regionsWithOwner.reduce((acc: any, r) => { acc[r.id] = r; return acc; }, {}),
        blocs: {},
      });

      // Find player region from config
      const playerConfigRegion = config.regions.find(cr => cr.owner === 'player');
      const playerRegionId = playerConfigRegion?.id || regions[0]?.id || null;
      setSelectedRegion(playerRegionId);

      // Создаем локальную игру
      if (playerRegionId) {
        setCurrentGame({
          id: 'local_' + Date.now(),
          world: { ...currentWorld, regions: regionsWithOwner.reduce((acc: any, r) => { acc[r.id] = r; return acc; }, {}) },
          players: [{ id: 'player_1', name: 'Player', regionId: playerRegionId, color: '#ff0000' }],
          currentTurn: 1,
          maxTurns: 100,
          status: 'playing' as any,
        } as Game);
      }

      setCurrentView('game');
    }
    setLoading(false);
  };

  // Отправить действия (несколько)
  const handleSubmitActions = async (actions: string[]) => {
    if (!currentGame || actions.length === 0 || !selectedRegion) {
      console.log('Debug: currentGame=', currentGame, 'actions=', actions, 'selectedRegion=', selectedRegion);
      return;
    }

    setLoading(true);

    const turn = currentGame.currentTurn;
    const actionsText = actions.join(' | ');

    console.log('[DEBUG] Submitting actions:', { gameId: currentGame.id, actions: actionsText, jumpDays, playerId: currentGame.players[0]?.id });

    // Для локальных игр (id начинается с local_) не делаем API вызов
    if (currentGame.id.startsWith('local_')) {
      setHistory(prev => [...prev, {
        turn,
        action: actionsText,
        result: `Мир отреагировал на ${actions.length} действий за ${jumpDays} дней...`,
        date: `${jumpDays} дней`,
      }]);
      setCurrentGame({ ...currentGame, currentTurn: turn + 1 });
      setPlayerActions(['']);
      setLoading(false);
      return;
    }

    try {
      console.log('[DEBUG] Making API call to submit action...');
      // Отправляем все действия и jumpDays на сервер
      const result = await gameApi.submitAction({
        game_id: currentGame.id,
        player_id: currentGame.players[0].id,
        text: actionsText,
        jump_days: jumpDays,
      } as any);

      setHistory(prev => [...prev, {
        turn,
        action: actionsText,
        result: result.narration,
        events: result.events || [],
        date: `${jumpDays} дней`,
      }]);

      // Update region objects if any were created
      if (result.objects && currentWorld && selectedRegion) {
        const updatedRegions = { ...currentWorld.regions };
        const region = updatedRegions[selectedRegion];
        if (region) {
          updatedRegions[selectedRegion] = {
            ...region,
            objects: result.objects,
          };
          setCurrentWorld({ ...currentWorld, regions: updatedRegions });
        }
      }

      const updatedGame = await gameApi.get(currentGame.id);
      setCurrentGame(updatedGame);

      // Also update currentWorld with new region data (for owner changes, colors, etc.)
      const changed: string[] = [];
      if (updatedGame.world && currentWorld) {
        const newRegions = { ...currentWorld.regions };
        // Handle both array (from API) and object (from local)
        const gameRegions = Array.isArray(updatedGame.world.regions)
          ? updatedGame.world.regions
          : Object.values(updatedGame.world.regions);
        gameRegions.forEach((r: any) => {
          if (newRegions[r.id]) {
            const oldRegion = newRegions[r.id];
            // Check if anything changed
            if (oldRegion.owner !== r.owner || oldRegion.color !== r.color) {
              changed.push(r.id);
            }
            newRegions[r.id] = {
              ...newRegions[r.id],
              owner: r.owner,
              color: r.color,
              population: r.population,
              militaryPower: r.militaryPower,
              gdp: r.gdp,
            };
          }
        });
        setCurrentWorld({ ...currentWorld, regions: newRegions });

        // Highlight changed regions briefly
        if (changed.length > 0) {
          setChangedRegions(changed);
          setTimeout(() => setChangedRegions([]), 3000);
        }
      }
    } catch (e) {
      console.error('Failed to submit action:', e);
      setHistory(prev => [...prev, {
        turn,
        action: actionsText,
        result: 'Мир отреагировал на ваши действия...',
        date: `${jumpDays} дней`,
      }]);
    }

    // Очистить список действий
    setPlayerActions(['']);
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
              <div key={map.id} className="map-card" onClick={() => handleSelectMap(map)}>
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
            changedRegionIds={changedRegions}
          />
        </div>

        {/* Панель справа */}
        <div className="game-panel">
          {/* Turn counter */}
          <div className="turn-header">
            <span className="turn-number">ХОД {currentGame?.currentTurn || 1}</span>
          </div>

          {/* Country selector - locked to player's region */}
          <div className="country-selector">
            <label>Ваша страна:</label>
            <div className="country-locked">
              {currentGame?.players[0] && (
                <span style={{ color: currentRegion?.color || '#fff' }}>
                  {currentRegion?.name || 'Неизвестно'}
                </span>
              )}
            </div>
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

          {/* Actions input */}
          <div className="action-section">
            <div className="actions-header">
              <span>Ваши действия:</span>
              <button
                className="btn-add-action"
                onClick={() => setPlayerActions([...playerActions, ''])}
              >
                + Добавить действие
              </button>
            </div>

            <div className="actions-list">
              {playerActions.map((action, index) => (
                <div key={index} className="action-item">
                  <div className="action-label">Действие {index + 1}</div>
                  <div className="action-input-row">
                    <textarea
                      value={action}
                      onChange={(e) => {
                        const newActions = [...playerActions];
                        newActions[index] = e.target.value;
                        setPlayerActions(newActions);
                      }}
                      placeholder="Опишите ваше действие..."
                      rows={2}
                    />
                    {playerActions.length > 1 && (
                      <button
                        className="btn-remove-action"
                        onClick={() => {
                          const newActions = playerActions.filter((_, i) => i !== index);
                          setPlayerActions(newActions);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Date jump selector */}
            <div className="jump-section">
              <button
                className="btn-jump-toggle"
                onClick={() => setShowJumpMenu(!showJumpMenu)}
              >
                Перемотать время: {jumpDays} дней ▼
              </button>
              {showJumpMenu && (
                <div className="jump-menu">
                  <button onClick={() => { setJumpDays(1); setShowJumpMenu(false); }}>1 день</button>
                  <button onClick={() => { setJumpDays(7); setShowJumpMenu(false); }}>1 неделя</button>
                  <button onClick={() => { setJumpDays(30); setShowJumpMenu(false); }}>1 месяц</button>
                  <button onClick={() => { setJumpDays(90); setShowJumpMenu(false); }}>3 месяца</button>
                  <button onClick={() => { setJumpDays(180); setShowJumpMenu(false); }}>6 месяцев</button>
                  <button onClick={() => { setJumpDays(365); setShowJumpMenu(false); }}>1 год</button>
                </div>
              )}
            </div>

            <button
              className="btn-turn"
              onClick={() => {
                const actions = playerActions.filter(a => a.trim());
                if (actions.length > 0) {
                  handleSubmitActions(actions);
                }
              }}
              disabled={loading || !playerActions.some(a => a.trim())}
            >
              {loading ? 'Думаю...' : `Ход (+${playerActions.filter(a => a.trim()).length}) →`}
            </button>

            {/* Save/Load buttons */}
            <div className="save-load-section">
              <button
                className="btn-save"
                onClick={async () => {
                  if (!currentGame) return;
                  try {
                    const name = prompt('Название сохранения:', `Игра ${new Date().toLocaleString()}`);
                    if (name) {
                      await gameApi.saveGame(currentGame.id, name);
                      alert('Игра сохранена!');
                    }
                  } catch (e) {
                    console.error(e);
                    alert('Ошибка сохранения');
                  }
                }}
              >
                💾 Сохранить
              </button>
              <button
                className="btn-load"
                onClick={async () => {
                  try {
                    const data = await savesApi.list();
                    if (data.saves.length === 0) {
                      alert('Нет сохранённых игр');
                      return;
                    }
                    const save = data.saves[0]; // Load most recent
                    if (save && confirm(`Загрузить "${save.name}" (Ход ${save.current_turn})?`)) {
                      await gameApi.loadSave(save.id);
                      // Reload game
                      const game = await gameApi.get(currentGame.id);
                      setCurrentGame(game);
                      setHistory([]);
                      alert('Игра загружена!');
                    }
                  } catch (e) {
                    console.error(e);
                    alert('Ошибка загрузки');
                  }
                }}
              >
                📂 Загрузить
              </button>
            </div>
          </div>

          {/* Events from last turn */}
          {history.length > 0 && history[history.length - 1].events && (
            <div className="events-section">
              <h4>📌 События</h4>
              <div className="events-list">
                {(history[history.length - 1].events || []).map((event, i) => (
                  <div key={i} className="event-item">{event}</div>
                ))}
              </div>
            </div>
          )}

          {/* Floating Advisor Button */}
          {!showAdvisor && (
            <button
              className="floating-advisor-btn"
              onClick={() => {
                setShowAdvisor(true);
                setAdvisorMode('advisor');
                // Auto-generate initial advice
                if (!advisorTips) {
                  (async () => {
                    try {
                      const tips = await gameApi.getAdvisor(currentGame.id, currentGame.players[0].id);
                      setAdvisorTips((tips.tips || []).join('\n'));
                    } catch (e) { console.error(e); }
                  })();
                }
              }}
              title="Советник"
            >
              💡
            </button>
          )}

          {/* Floating Advisor Panel */}
          {showAdvisor && (
            <div className="floating-advisor-panel">
              <div className="floating-advisor-header">
                <div className="advisor-tabs">
                  <button
                    className={`advisor-tab ${advisorMode === 'advisor' ? 'active' : ''}`}
                    onClick={() => setAdvisorMode('advisor')}
                  >
                    💡 Советник
                  </button>
                  <button
                    className={`advisor-tab ${advisorMode === 'suggestions' ? 'active' : ''}`}
                    onClick={async () => {
                      setAdvisorMode('suggestions');
                      if (suggestions.length === 0) {
                        try {
                          const data = await gameApi.getSuggestions(currentGame.id);
                          setSuggestions(data.suggestions || []);
                        } catch (e) { console.error(e); }
                      }
                    }}
                  >
                    📋 Подсказки
                  </button>
                </div>
                <button className="btn-close" onClick={() => setShowAdvisor(false)}>×</button>
              </div>

              {/* Advisor Tab */}
              {advisorMode === 'advisor' && (
                <>
                  <div className="floating-advisor-messages">
                    {advisorTips ? (
                      advisorTips.split('\n').map((line, i) => (
                        <div key={i} className="advisor-message">
                          {line || <br/>}
                        </div>
                      ))
                    ) : (
                      <div className="advisor-message loading">Загрузка совета...</div>
                    )}
                  </div>
                  <div className="floating-advisor-input">
                    <button
                      className="btn-refresh-advice"
                      onClick={async () => {
                        if (!currentGame) return;
                        setAdvisorTips('Загрузка...');
                        try {
                          const tips = await gameApi.getAdvisor(currentGame.id, currentGame.players[0].id);
                          setAdvisorTips((tips.tips || []).join('\n'));
                        } catch (e) {
                          console.error(e);
                          setAdvisorTips('Ошибка получения совета');
                        }
                      }}
                    >
                      🔄 Новый совет
                    </button>
                  </div>
                </>
              )}

              {/* Suggestions Tab */}
              {advisorMode === 'suggestions' && (
                <div className="floating-advisor-messages suggestions-list">
                  {suggestions.length > 0 ? (
                    suggestions.map((s, i) => (
                      <div key={i} className="suggestion-item">
                        <div className="suggestion-topic">📌 {s.topic}</div>
                        <div className="suggestion-description">{s.description}</div>
                        {s.actions?.map((a: any, ai: number) => (
                          <div
                            key={ai}
                            className="suggestion-action"
                            onClick={() => {
                              // Add action to player's actions
                              setPlayerActions(prev => [...prev, a.content]);
                            }}
                          >
                            → {a.title}: {a.content}
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    <div className="advisor-message loading">Загрузка подсказок...</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* History */}
          <div className="history-section">
            <h4>История</h4>
            <div className="history-list">
              {history.map((item, i) => (
                <div key={i} className="history-item">
                  <div className="history-header">
                    <span className="history-turn">Ход {item.turn}</span>
                    {item.date && <span className="history-date">📅 {item.date}</span>}
                  </div>
                  <div className="history-action">→ {item.action}</div>
                  <div className="history-result">{item.result}</div>
                  {item.events && item.events.length > 0 && (
                    <div className="history-events">
                      {item.events.map((event, ei) => (
                        <div key={ei} className="history-event">• {event}</div>
                      ))}
                    </div>
                  )}
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

  const renderCreateWorld = () => {
    if (!selectedMapForWorld) {
      return (
        <div className="error-container">
          <p>Карта не выбрана</p>
          <button onClick={() => setCurrentView('menu')}>Назад в меню</button>
        </div>
      );
    }

    return (
      <CreateWorld
        mapId={selectedMapForWorld.id.startsWith('server_')
          ? selectedMapForWorld.id.replace('server_', '')
          : selectedMapForWorld.id.replace('map_', '')}
        mapName={selectedMapForWorld.name}
        regions={selectedMapForWorld.regions}
        onSave={handleCreateWorld}
        onCancel={() => {
          setSelectedMapForWorld(null);
          setCurrentView('menu');
        }}
      />
    );
  };

  return (
    <div className="app">
      {currentView === 'menu' && renderMenu()}
      {currentView === 'game' && renderGame()}
      {currentView === 'editor' && renderEditor()}
      {currentView === 'create-world' && renderCreateWorld()}
    </div>
  );
}

export default App;
