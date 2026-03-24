/**
 * Open-Pax — Main App (Redesign)
 * ==============================
 */

import React, { useState, useEffect, useRef } from 'react';
import { MapboxMapView } from './components/Map/MapboxMapView';
import { MapEditor, type EditorRegion, type EditorObject } from './components/Editor';
import { CreateWorld, type WorldConfig } from './components/WorldBuilder/CreateWorld';
import { TemplateSelector } from './components/Game/TemplateSelector';
import { CountrySelector } from './components/Game/CountrySelector';
import { gameApi, worldApi, mapApi, savesApi } from './services/api';
import type { Region, World, Game, WorldTemplate, GameStatus } from './types';

// Вспомогательная функция: точки в SVG path
const pointsToPath = (points: { x: number; y: number }[]): string => {
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
};

// Вспомогательная функция: форматирование диапазона дат
const formatDateRange = (start: string, end: string): string => {
  try {
    const startDate = new Date(start);
    const endDate = new Date(end);

    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

    const startStr = `${startDate.getDate()} ${months[startDate.getMonth()]} ${startDate.getFullYear()}`;
    const endStr = `${endDate.getDate()} ${months[endDate.getMonth()]} ${endDate.getFullYear()}`;

    return `${startStr} — ${endStr}`;
  } catch {
    return `${start} — ${end}`;
  }
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
  type ViewType = 'menu' | 'select-template' | 'select-country' | 'select-map' | 'create-world' | 'game' | 'editor';
  const [currentView, setCurrentView] = useState<ViewType>('menu');
  const [savedMaps, setSavedMaps] = useState<LocalMap[]>([]);
  const [selectedMapForWorld, setSelectedMapForWorld] = useState<LocalMap | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WorldTemplate | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [generatedWorld, setGeneratedWorld] = useState<{
    date: string;
    countries: Record<string, any>;
    regions: Record<string, Region>;
    playerCountryCode: string;
  } | null>(null);
  const [currentWorld, setCurrentWorld] = useState<World | null>(null);
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [changedRegions, setChangedRegions] = useState<string[]>([]);
  const [pendingActions, setPendingActions] = useState<{ id: string; text: string }[]>([]);
  const [jumpDays, setJumpDays] = useState<number>(30);
  const [showJumpMenu, setShowJumpMenu] = useState(false);
  const [history, setHistory] = useState<{
    turn: number;
    action: string;
    result: string;
    events?: string[];
    periodStart?: string;
    periodEnd?: string;
    date?: string; // Legacy fallback
  }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [actions, setActions] = useState<any[]>([]);
  const [newActionText, setNewActionText] = useState('');
  const [savedGames, setSavedGames] = useState<any[]>([]);
  const [showSavesMenu, setShowSavesMenu] = useState(false);
  const [actionsMaximized, setActionsMaximized] = useState(false);
  const [actionsSize, setActionsSize] = useState({ width: 400, height: 500 });
  const actionsRef = useRef<HTMLDivElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState('');

  // Прокрутка истории вниз
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Resize handler for actions panel
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !actionsRef.current) return;
      const rect = actionsRef.current.getBoundingClientRect();
      const newWidth = Math.max(300, Math.min(800, e.clientX - rect.left));
      const newHeight = Math.max(300, Math.min(700, window.innerHeight - rect.top - 20));
      setActionsSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

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

    setLoading(false);
  };

  // Time-skip handler (Phase 4)
  const handleTimeSkip = async (days: number) => {
    if (!currentGame) return;

    setShowJumpMenu(false);
    setLoading(true);

    try {
      const result = await gameApi.timeSkip(currentGame.id, days);

      if (result.type === 'actions_processed') {
        // Add each processed action to history
        for (const action of result.actions || []) {
          if (action.result) {
            setHistory(prev => [...prev, {
              turn: action.result.turn,
              action: action.text,
              result: action.result.narration,
              events: action.result.events,
              periodStart: action.result.periodStart,
              periodEnd: action.result.periodEnd,
            }]);
          }
        }

        // Update game state from last action
        const lastAction = result.actions?.[result.actions.length - 1];
        if (lastAction?.result) {
          setCurrentGame(prev => prev ? {
            ...prev,
            currentTurn: (lastAction.result as any).turn + 1,
            currentDate: (lastAction.result as any).periodEnd,
          } : prev);
        }
      } else if (result.type === 'date_advanced') {
        // Just update date - add a time-skip entry to history
        const startDate = currentGame.currentDate || '1951-01-01';
        setHistory(prev => [...prev, {
          turn: currentGame.currentTurn,
          action: `⏭️ Time-skip`,
          result: `Продвинуто на ${days} дней`,
          periodStart: startDate,
          periodEnd: result.newDate,
        }]);

        setCurrentGame(prev => prev ? {
          ...prev,
          currentTurn: result.newTurn!,
          currentDate: result.newDate,
        } : prev);
      }
    } catch (e) {
      console.error('Time-skip failed:', e);
    }

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
        <button className="btn-primary" onClick={() => setCurrentView('select-template')}>
          🌍 Новая игра (шаблон)
        </button>
        <button className="btn-secondary" onClick={() => setCurrentView('editor')}>
          ➕ Создать новую карту
        </button>
      </div>
    </div>
  );

  // Рендер игры
  // Format date for display
  const formatDate = (dateStr: string): string => {
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    const date = new Date(dateStr);
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const renderGame = () => {
    if (!currentWorld) return null;

    const regions = Object.values(currentWorld.regions);
    const currentRegion = regions.find(r => r.id === selectedRegion);

    return (
      <div className="game-wrapper">
        {/* Timeline Bar */}
        <div className="timeline-bar">
          <div className="timeline-left">
            <button className="btn-back-menu" onClick={() => setCurrentView('menu')}>
              ← Меню
            </button>
          </div>
          <div className="timeline-center">
            <span className="turn-badge">ХОД {currentGame?.currentTurn || 1}</span>
          </div>
          <div className="timeline-right">
            <div className="timeline-date">
              <span className="date-display">📅 {formatDate(currentGame?.currentDate || '1951-01-01')}</span>
              <button
                className="btn-time-skip"
                onClick={() => setShowJumpMenu(!showJumpMenu)}
                title="Тайм-скип"
              >
                →
              </button>
              {showJumpMenu && (
                <div className="time-skip-dropdown">
                  <div className="dropdown-header">Тайм-скип</div>
                  <button onClick={() => handleTimeSkip(7)}>1 неделя</button>
                  <button onClick={() => handleTimeSkip(30)}>1 месяц</button>
                  <button onClick={() => handleTimeSkip(90)}>3 месяца</button>
                  <button onClick={() => handleTimeSkip(180)}>6 месяцев</button>
                  <button onClick={() => handleTimeSkip(365)}>1 год</button>
                  <div className="dropdown-divider"></div>
                  <div className="custom-jump">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={jumpDays > 365 ? jumpDays : ''}
                      placeholder="?"
                      onChange={(e) => setJumpDays(parseInt(e.target.value) || 30)}
                    />
                    <span>дней</span>
                    <button
                      className="btn-confirm-jump"
                      onClick={() => handleTimeSkip(jumpDays)}
                    >
                      ✓
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="game-container">
          {/* Карта слева */}
          <div className="game-map">
            <MapboxMapView
              regions={regions}
              selectedRegionId={selectedRegion || undefined}
              onRegionClick={handleCountryChange}
              changedRegionIds={changedRegions}
            />
          </div>

          {/* Панель справа */}
          <div className="game-panel">
            {/* Turn counter - moved to timeline bar */}
            <div className="turn-header" style={{ display: 'none' }}>
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
                      if (currentGame) {
                        const game = await gameApi.get(currentGame.id);
                        setCurrentGame(game);
                        setHistory([]);
                        alert('Игра загружена!');
                      }
                    }
                  } catch (e) {
                    console.error(e);
                    alert('Ошибка загрузки');
                  }
                }}
              >
                📂 Загрузить
              </button>
              <button
                className="btn-edit-prompt"
                onClick={() => {
                  setEditingPrompt(currentWorld?.basePrompt || '');
                  setShowPromptEditor(true);
                }}
                title="Редактировать промпт мира"
              >
                📝 Промпт
              </button>
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

          {/* Floating Actions Button */}
          {!showActions && (
            <button
              className="floating-advisor-btn"
              onClick={() => {
                setShowActions(true);
                // Load actions if not loaded
                if (actions.length === 0 && currentGame) {
                  (async () => {
                    try {
                      const data = await gameApi.getSuggestions(currentGame.id);
                      setActions(data.suggestions || []);
                    } catch (e) { console.error(e); }
                  })();
                }
              }}
              title="Действия"
            >
              ⚡
            </button>
          )}

          {/* Floating Actions Panel */}
          {showActions && (
            <div
              ref={actionsRef}
              className={`floating-advisor-panel ${actionsMaximized ? 'maximized' : ''}`}
              style={{
                width: actionsMaximized ? '90%' : `${actionsSize.width}px`,
                height: actionsMaximized ? '80vh' : `${actionsSize.height}px`,
                left: actionsMaximized ? '5%' : '20px',
                bottom: actionsMaximized ? '10vh' : '80px',
              }}
            >
              {/* Resize handle */}
              {!actionsMaximized && (
                <div
                  className="resize-handle"
                  onMouseDown={() => setIsResizing(true)}
                />
              )}

              <div className="floating-advisor-header">
                <div className="panel-title">⚡ Действия</div>
                <div className="header-buttons">
                  <button
                    className="btn-maximize"
                    onClick={() => setActionsMaximized(!actionsMaximized)}
                    title={actionsMaximized ? 'Свернуть' : 'Развернуть'}
                  >
                    {actionsMaximized ? '−' : '□'}
                  </button>
                  <button className="btn-close" onClick={() => setShowActions(false)}>×</button>
                </div>
              </div>

              {/* Actions Content */}
              <div className="suggestions-content">
                {/* Generate Button */}
                <button
                  className="btn-generate-suggestions"
                  onClick={async () => {
                    if (!currentGame) return;
                    try {
                      const data = await gameApi.getSuggestions(currentGame.id);
                      setActions(data.suggestions || []);
                    } catch (e) { console.error(e); }
                  }}
                >
                  🔄 Сгенерировать действия
                </button>

                {/* Actions List */}
                {actions.length > 0 && (
                  <div className="suggestions-list">
                    {actions.map((s, i) => (
                      <div key={i} className="suggestion-item">
                        <div className="suggestion-topic">📌 {s.topic}</div>
                        <div className="suggestion-description">{s.description}</div>
                        {s.actions?.map((a: any, ai: number) => (
                          <div
                            key={ai}
                            className="suggestion-action"
                            onClick={async () => {
                              if (!currentGame) return;
                              const text = a.content;
                              // Add to backend queue
                              try {
                                await gameApi.queueAction(currentGame.id, text);
                              } catch (e) {
                                console.error('Failed to queue suggestion:', e);
                              }
                              // Add to local pending actions
                              setPendingActions(prev => [...prev, {
                                id: `suggestion-${Date.now()}-${ai}`,
                                text
                              }]);
                            }}
                          >
                            + {a.title}: {a.content}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending Actions Section */}
                <div className="pending-actions-section">
                  <div className="pending-header">Ожидают обработки:</div>
                  {pendingActions.length === 0 ? (
                    <div className="pending-empty">Нет действий</div>
                  ) : (
                    <div className="pending-list">
                      {pendingActions.map((action, index) => (
                        <div key={action.id} className="pending-item">
                          <span className="pending-number">{index + 1}.</span>
                          <span className="pending-text">{action.text}</span>
                          <button
                            className="btn-remove-pending"
                            onClick={() => {
                              setPendingActions(prev => prev.filter(a => a.id !== action.id));
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Manual Action Input */}
                <div className="manual-action-input">
                  <textarea
                    value={newActionText}
                    onChange={(e) => setNewActionText(e.target.value)}
                    placeholder="Опишите действие вручную..."
                    rows={2}
                  />
                  <button
                    className="btn-add-pending"
                    onClick={async () => {
                      if (newActionText.trim() && currentGame) {
                        const text = newActionText.trim();
                        // Add to backend queue
                        try {
                          await gameApi.queueAction(currentGame.id, text);
                        } catch (e) {
                          console.error('Failed to queue action:', e);
                        }
                        // Add to local state
                        setPendingActions(prev => [...prev, {
                          id: `manual-${Date.now()}`,
                          text
                        }]);
                        setNewActionText('');
                      }
                    }}
                    disabled={!newActionText.trim()}
                  >
                    + Добавить
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="suggestions-footer">
                <button
                  className="btn-submit-actions"
                  disabled={pendingActions.length === 0 || loading}
                  onClick={async () => {
                    if (!currentGame || pendingActions.length === 0) return;
                    setLoading(true);
                    try {
                      // Process all queued actions sequentially
                      const result = await gameApi.processAllActions(currentGame.id, 30);

                      // Add each processed action result to history with date range
                      for (const action of result.actions) {
                        if (action.result) {
                          setHistory(prev => [...prev, {
                            turn: action.result.turn,
                            action: action.text,
                            result: action.result.narration,
                            events: action.result.events,
                            periodStart: action.result.periodStart,
                            periodEnd: action.result.periodEnd,
                          }]);
                        }
                      }

                      // Update game turn/date from last action
                      const lastAction = result.actions[result.actions.length - 1];
                      if (lastAction?.result) {
                        setCurrentGame(prev => prev ? {
                          ...prev,
                          currentTurn: (lastAction.result as any).turn + 1,
                          currentDate: (lastAction.result as any).periodEnd,
                        } : prev);
                      }

                      setPendingActions([]);
                    } catch (e) {
                      console.error('Failed to process actions:', e);
                    }
                    setLoading(false);
                  }}
                >
                  {loading ? 'Думаю...' : `Отправить ${pendingActions.length} действие(й) →`}
                </button>
              </div>
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
                    {item.periodStart && item.periodEnd ? (
                      <span className="history-date">
                        📅 {formatDateRange(item.periodStart, item.periodEnd)}
                      </span>
                    ) : item.date && (
                      <span className="history-date">📅 {item.date}</span>
                    )}
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

          {/* Prompt Editor Modal */}
          {showPromptEditor && (
            <div className="prompt-editor-modal">
              <div className="prompt-editor-overlay" onClick={() => setShowPromptEditor(false)} />
              <div className="prompt-editor-content">
                <div className="prompt-editor-header">
                  <h3>📝 Редактирование промпта мира</h3>
                  <button className="btn-close-prompt" onClick={() => setShowPromptEditor(false)}>×</button>
                </div>
                <p className="prompt-editor-desc">
                  Этот промпт определяет историю вашего мира, поведение NPC стран и возможные события.
                  Изменения вступят в силу для будущих ходов.
                </p>
                <textarea
                  className="prompt-editor-textarea"
                  value={editingPrompt}
                  onChange={(e) => setEditingPrompt(e.target.value)}
                  placeholder="Опишите ключевые особенности вашего мира..."
                  rows={10}
                />
                <div className="prompt-editor-footer">
                  <span className="char-count">{editingPrompt.length} символов</span>
                  <div className="prompt-editor-actions">
                    <button className="btn-cancel-prompt" onClick={() => setShowPromptEditor(false)}>
                      Отмена
                    </button>
                    <button
                      className="btn-save-prompt"
                      onClick={async () => {
                        if (!currentWorld) return;
                        try {
                          await worldApi.updatePrompt(currentWorld.id, editingPrompt);
                          setCurrentWorld({ ...currentWorld, basePrompt: editingPrompt });
                          setShowPromptEditor(false);
                          alert('Промпт мира обновлён!');
                        } catch (e) {
                          console.error(e);
                          alert('Ошибка сохранения промпта');
                        }
                      }}
                    >
                      💾 Сохранить
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
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
      {currentView === 'select-template' && (
        <TemplateSelector
          onSelect={(template) => {
            setSelectedTemplate(template);
            setCurrentView('select-country');
          }}
          onBack={() => setCurrentView('menu')}
        />
      )}
      {currentView === 'select-country' && selectedTemplate && (
        <CountrySelector
          template={selectedTemplate}
          onSelect={async (countryCode) => {
            setSelectedCountry(countryCode);
            setLoading(true);
            try {
              // Generate world state from template using Balance Agent (also saves to DB)
              const worldData = await worldApi.generateFromTemplate(
                selectedTemplate.id,
                countryCode
              );
              setGeneratedWorld(worldData);

              // Create real game session via API
              const gameResponse = await gameApi.create({
                world_id: worldData.worldId,
                player_name: 'Player',
                player_region_id: countryCode,
              });

              // Load the created game to get full state
              const game = await gameApi.get(gameResponse.game_id);
              setCurrentGame(game);
              setCurrentWorld(game.world);
              setSelectedRegion(countryCode);

              console.log('[DEBUG] Generated world:', worldData, 'Game:', game);

              // Show game view
              setCurrentView('game');
            } catch (e) {
              console.error('[Game] Failed to generate world:', e);
              alert('Failed to generate world. Please try again.');
              setCurrentView('menu');
            } finally {
              setLoading(false);
            }
          }}
          onBack={() => setCurrentView('select-template')}
        />
      )}
      {currentView === 'game' && renderGame()}
      {currentView === 'editor' && renderEditor()}
      {currentView === 'create-world' && renderCreateWorld()}
    </div>
  );
}

export default App;
