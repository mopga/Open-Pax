/**
 * Open-Pax — Main App (Redesign)
 * ==============================
 */

import React, { useEffect, useRef, useState } from 'react';
import { MapboxMapView } from './components/Map/MapboxMapView';
import { MapView } from './components/Map/MapView';
import { MapEditor, type EditorRegion, type EditorObject } from './components/Editor';
import { CreateWorld, type WorldConfig } from './components/WorldBuilder/CreateWorld';
import { TemplateSelector } from './components/Game/TemplateSelector';
import { CountrySelector } from './components/Game/CountrySelector';
import { DiplomacyPanel } from './components/Game/DiplomacyPanel';
import { gameApi, worldApi, mapApi, savesApi } from './services/api';
import type { Region, World, Game } from './types';
import { useGameStore, useUIStore, useActionsStore, type LocalMap } from './stores';
import { useSSE } from './services/sse';

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

function App() {
  // Stores
  const {
    currentGame, currentWorld, selectedRegion, history, pendingActions, changedRegions,
    generatedWorld, selectedCountry,
    setCurrentGame, setCurrentWorld, setSelectedRegion, setHistory, addHistory,
    setPendingActions, addPendingAction, removePendingAction, clearPendingActions,
    setChangedRegions, clearChangedRegions, setGeneratedWorld, setSelectedCountry,
    reset: resetGame
  } = useGameStore();

  const {
    currentView, loading, showJumpMenu, jumpDays, showSavesMenu,
    showPromptEditor, editingPrompt,
    showActions, actionsMaximized, actionsSize, isResizing,
    selectedMapForWorld, savedMaps, selectedTemplate,
    setCurrentView, setLoading, setShowJumpMenu, setJumpDays, setShowSavesMenu,
    setShowPromptEditor, setEditingPrompt,
    setShowActions, setActionsMaximized, setActionsSize, setIsResizing,
    setSelectedMapForWorld, setSavedMaps, addSavedMap, setSelectedTemplate,
    resetUI
  } = useUIStore();

  const {
    suggestions, newActionText,
    setSuggestions, setNewActionText, clearSuggestions,
    reset: resetActions
  } = useActionsStore();

  // Refs (not in store - DOM refs)
  const actionsRef = useRef<HTMLDivElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

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
  }, [isResizing, setActionsSize, setIsResizing]);

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
  }, [setSavedMaps]);

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
    addSavedMap(mapData);
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

    const localMap = handleSaveMapLocal(regions, mapName, objects);
    if (serverMapId) {
      const updatedMap = { ...localMap, id: `server_${serverMapId}` };
      localStorage.removeItem(localMap.id);
      localStorage.setItem(updatedMap.id, JSON.stringify(updatedMap));
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

    if (!selectedMapForWorld?.id.startsWith('server_')) {
      alert('Сначала сохраните карту на сервере (кнопка "Сохранить" в редакторе карт)!');
      setLoading(false);
      return;
    }

    const mapId = selectedMapForWorld.id.replace('server_', '');

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

      const world = await worldApi.get(result.world_id);
      const mapObjects = selectedMapForWorld?.objects || [];

      const regions: Region[] = Object.values(world.regions || {}).map((r: any) => {
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

      const playerRegionInWorld = regions.find(r => r.owner === 'player');
      const initialPlayerRegionId = playerRegionInWorld?.id || regions[0]?.id || null;

      if (result.world_id && initialPlayerRegionId) {
        try {
          const gameResponse = await gameApi.create({
            world_id: result.world_id,
            player_name: 'Player',
            player_region_id: initialPlayerRegionId,
          });
          const game = await gameApi.get(gameResponse.game_id);
          setCurrentGame(game);

          const playerRegionId = game.players[0]?.regionId || initialPlayerRegionId;
          setSelectedRegion(playerRegionId);
        } catch (e) {
          console.error('[DEBUG] Failed to create game via API:', e);
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

      const playerConfigRegion = config.regions.find(cr => cr.owner === 'player');
      const playerRegionId = playerConfigRegion?.id || regions[0]?.id || null;
      setSelectedRegion(playerRegionId);

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
      return;
    }

    setLoading(true);

    const turn = currentGame.currentTurn;
    const actionsText = actions.join(' | ');

    if (currentGame.id.startsWith('local_')) {
      addHistory({
        turn,
        action: actionsText,
        result: `Мир отреагировал на ${actions.length} действий за ${jumpDays} дней...`,
        date: `${jumpDays} дней`,
      });
      setCurrentGame({ ...currentGame, currentTurn: turn + 1 });
      setLoading(false);
      return;
    }

    try {
      const result = await gameApi.submitAction({
        game_id: currentGame.id,
        player_id: currentGame.players[0].id,
        text: actionsText,
        jump_days: jumpDays,
      } as any);

      addHistory({
        turn,
        action: actionsText,
        result: result.narration,
        events: result.events || [],
        date: `${jumpDays} дней`,
      });

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

      const changed: string[] = [];
      if (updatedGame.world && currentWorld) {
        const newRegions = { ...currentWorld.regions };
        const gameRegions = Array.isArray(updatedGame.world.regions)
          ? updatedGame.world.regions
          : Object.values(updatedGame.world.regions);
        gameRegions.forEach((r: any) => {
          if (newRegions[r.id]) {
            const oldRegion = newRegions[r.id];
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

        if (changed.length > 0) {
          setChangedRegions(changed);
          setTimeout(() => clearChangedRegions(), 3000);
        }
      }
    } catch (e) {
      console.error('Failed to submit action:', e);
      addHistory({
        turn,
        action: actionsText,
        result: 'Мир отреагировал на ваши действия...',
        date: `${jumpDays} дней`,
      });
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
        for (const action of result.actions || []) {
          if (action.result) {
            addHistory({
              turn: action.result.turn,
              action: action.text,
              result: action.result.narration,
              events: action.result.events,
              periodStart: action.result.periodStart,
              periodEnd: action.result.periodEnd,
            });
          }
        }

        const lastAction = result.actions?.[result.actions.length - 1];
        if (lastAction?.result) {
          setCurrentGame(prev => prev ? {
            ...prev,
            currentTurn: (lastAction.result as any).turn + 1,
            currentDate: (lastAction.result as any).periodEnd,
          } : prev);
        }
      } else if (result.type === 'date_advanced') {
        const startDate = currentGame.currentDate || '1951-01-01';
        addHistory({
          turn: currentGame.currentTurn,
          action: `⏭️ Time-skip`,
          result: `Продвинуто на ${days} дней`,
          periodStart: startDate,
          periodEnd: result.newDate,
        });

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

  // Выбрать тип действия и заполнить шаблон
  const handleActionTypeSelect = (type: string, template: string, targetRegionId?: string) => {
    setSelectedActionType(type);
    let text = template;
    if (targetRegionId && currentWorld) {
      const targetRegion = currentWorld.regions[targetRegionId];
      if (targetRegion) {
        text = template.replace('{target}', targetRegion.name);
      }
    }
    setNewActionText(text);
  };

  // Очистить выбор действия
  const clearActionType = () => {
    setSelectedActionType(null);
    setTargetRegionForAttack('');
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

  // Format date for display
  const formatDate = (dateStr: string): string => {
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    const date = new Date(dateStr);
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  // SSE real-time updates
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);
  const [turnProgress, setTurnProgress] = useState<string>('');

  // Action type selector
  const [selectedActionType, setSelectedActionType] = useState<string | null>(null);
  const [targetRegionForAttack, setTargetRegionForAttack] = useState<string>('');

  useSSE(currentGame?.id || null, {
    onTurnStart: (data) => {
      console.log('[SSE] Turn started:', data);
      setIsProcessingTurn(true);
      setTurnProgress('Обработка хода...');
    },
    onGeneratingNarration: () => {
      console.log('[SSE] Generating narration...');
      setTurnProgress('Генерация нарратива...');
    },
    onTurnComplete: (data) => {
      console.log('[SSE] Turn complete:', data);
      setIsProcessingTurn(false);
      setTurnProgress('');

      // Add to history
      if (data) {
        addHistory({
          turn: data.turn,
          action: data.action || 'Ход',
          result: data.narration,
          events: data.events,
          periodEnd: data.newDate,
        });

        // Update current game state
        if (data.newTurn && data.newDate) {
          setCurrentGame(prev => prev ? {
            ...prev,
            currentTurn: data.newTurn,
            currentDate: data.newDate,
          } : prev);
        }
      }
    },
    onConnected: () => {
      console.log('[SSE] Connected to game events');
    },
    onError: (error) => {
      console.error('[SSE] Error:', error);
      setIsProcessingTurn(false);
      setTurnProgress('');
    },
  });

  const renderGame = () => {
    if (!currentWorld) return null;

    const regions: Region[] = Object.values(currentWorld.regions);
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
            {import.meta.env.VITE_MAPBOX_TOKEN ? (
              <MapboxMapView
                regions={regions}
                selectedRegionId={selectedRegion || undefined}
                onRegionClick={handleCountryChange}
                changedRegionIds={changedRegions}
                showFlags={!!selectedCountry}
                playerCountryCode={selectedCountry || undefined}
              />
            ) : regions.some(r => r.svgPath || r.geojson) ? (
              <MapView
                regions={regions}
                selectedRegionId={selectedRegion || undefined}
                onRegionClick={handleCountryChange}
                changedRegionIds={changedRegions}
              />
            ) : (
              <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0a0a0f',
                color: '#667eea',
                padding: '40px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🗺️</div>
                <h3>Карта недоступна</h3>
                <p style={{ color: '#888', maxWidth: '300px' }}>
                  Для отображения карты нужен Mapbox token.
                  <br/><br/>
                  Создайте файл <code>frontend/.env</code> с:
                  <br/>
                  <code>VITE_MAPBOX_TOKEN=ваш_токен</code>
                </p>
                <p style={{ color: '#666', fontSize: '12px', marginTop: '16px' }}>
                  Получить токен: <a href="https://account.mapbox.com" target="_blank" style={{ color: '#667eea' }}>account.mapbox.com</a>
                </p>
              </div>
            )}
          </div>

          {/* Панель справа */}
          <div className="game-panel">
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

            {/* Diplomacy panel */}
            {currentGame && selectedRegion && (
              <DiplomacyPanel
                gameId={currentGame.id}
                selectedRegionId={selectedRegion}
                regions={regions}
              />
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
                    const save = data.saves[0];
                    if (save && confirm(`Загрузить "${save.name}" (Ход ${save.current_turn})?`)) {
                      await gameApi.loadSave(save.id);
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
                  if (suggestions.length === 0 && currentGame) {
                    (async () => {
                      try {
                        const data = await gameApi.getSuggestions(currentGame.id);
                        setSuggestions(data.suggestions || []);
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
                        setSuggestions(data.suggestions || []);
                      } catch (e) { console.error(e); }
                    }}
                  >
                    🔄 Сгенерировать действия
                  </button>

                  {/* Actions List */}
                  {suggestions.length > 0 && (
                    <div className="suggestions-list">
                      {suggestions.map((s, i) => (
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
                                try {
                                  await gameApi.queueAction(currentGame.id, text);
                                } catch (e) {
                                  console.error('Failed to queue suggestion:', e);
                                }
                                addPendingAction({
                                  id: `suggestion-${Date.now()}-${ai}`,
                                  text
                                });
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
                              onClick={() => removePendingAction(action.id)}
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
                    {/* Action Type Buttons */}
                    <div className="action-type-selector">
                      <button
                        className={`action-type-btn attack ${selectedActionType === 'attack' ? 'active' : ''}`}
                        onClick={() => {
                          if (selectedActionType === 'attack') {
                            clearActionType();
                          } else {
                            const enemyRegions = Object.values(currentWorld?.regions || {})
                              .filter(r => r.owner !== 'player' && r.owner !== 'neutral');
                            const firstEnemy = enemyRegions[0] as Region | undefined;
                            if (firstEnemy) {
                              setTargetRegionForAttack(firstEnemy.id);
                              handleActionTypeSelect('attack', 'атака на {target}', firstEnemy.id);
                            } else {
                              handleActionTypeSelect('attack', 'атака на {target}');
                            }
                          }
                        }}
                        title="Атаковать регион (💰20 ⚔️50)"
                      >
                        ⚔️ Attack
                        <span className="action-cost">💰20 ⚔️50</span>
                      </button>
                      <button
                        className={`action-type-btn develop ${selectedActionType === 'develop' ? 'active' : ''}`}
                        onClick={() => {
                          if (selectedActionType === 'develop') {
                            clearActionType();
                          } else {
                            handleActionTypeSelect('develop', 'развить регион');
                          }
                        }}
                        title="Развить регион (💰30)"
                      >
                        🏗️ Develop
                        <span className="action-cost">💰30</span>
                      </button>
                      <button
                        className={`action-type-btn trade ${selectedActionType === 'trade' ? 'active' : ''}`}
                        onClick={() => {
                          if (selectedActionType === 'trade') {
                            clearActionType();
                          } else {
                            handleActionTypeSelect('trade', 'торговля');
                          }
                        }}
                        title="Торговля (💰10)"
                      >
                        💰 Trade
                        <span className="action-cost">💰10</span>
                      </button>
                      <button
                        className={`action-type-btn build ${selectedActionType === 'build' ? 'active' : ''}`}
                        onClick={() => {
                          if (selectedActionType === 'build') {
                            clearActionType();
                          } else {
                            handleActionTypeSelect('build', 'строительство');
                          }
                        }}
                        title="Строительство (💰40)"
                      >
                        🏭 Build
                        <span className="action-cost">💰40</span>
                      </button>
                    </div>

                    {/* Target Region Selector (for attack) */}
                    {selectedActionType === 'attack' && (
                      <div className="target-region-selector">
                        <label>Цель:</label>
                        <select
                          value={targetRegionForAttack}
                          onChange={(e) => {
                            setTargetRegionForAttack(e.target.value);
                            const region = currentWorld?.regions[e.target.value];
                            if (region) {
                              setNewActionText(`атака на ${region.name}`);
                            }
                          }}
                        >
                          {(Object.values(currentWorld?.regions || {}) as Region[])
                            .filter(r => r.owner !== 'player' && r.owner !== 'neutral')
                            .map(r => (
                              <option key={r.id} value={r.id}>{r.name} ({r.owner})</option>
                            ))
                          }
                        </select>
                      </div>
                    )}

                    <textarea
                      value={newActionText}
                      onChange={(e) => setNewActionText(e.target.value)}
                      placeholder={selectedActionType ? 'Отредактируйте текст или добавьте...' : 'Опишите действие или выберите тип выше...'}
                      rows={2}
                    />
                    <button
                      className="btn-add-pending"
                      onClick={async () => {
                        if (newActionText.trim() && currentGame) {
                          const text = newActionText.trim();
                          try {
                            await gameApi.queueAction(currentGame.id, text);
                          } catch (e) {
                            console.error('Failed to queue action:', e);
                          }
                          addPendingAction({
                            id: `manual-${Date.now()}`,
                            text
                          });
                          setNewActionText('');
                          clearActionType();
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
                        const result = await gameApi.processAllActions(currentGame.id, 30);

                        for (const action of result.actions) {
                          if (action.result) {
                            addHistory({
                              turn: action.result.turn,
                              action: action.text,
                              result: action.result.narration,
                              events: action.result.events,
                              periodStart: action.result.periodStart,
                              periodEnd: action.result.periodEnd,
                            });
                          }
                        }

                        const lastAction = result.actions[result.actions.length - 1];
                        if (lastAction?.result) {
                          setCurrentGame(prev => prev ? {
                            ...prev,
                            currentTurn: (lastAction.result as any).turn + 1,
                            currentDate: (lastAction.result as any).periodEnd,
                          } : prev);
                        }

                        clearPendingActions();
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
              const worldData = await worldApi.generateFromTemplate(
                selectedTemplate.id,
                countryCode
              );
              setGeneratedWorld(worldData);

              // Use correct region ID (prefixed with worldId)
              const actualRegionId = worldData.regionIds?.[countryCode] || countryCode;

              const gameResponse = await gameApi.create({
                world_id: worldData.worldId,
                player_name: 'Player',
                player_region_id: actualRegionId,
              });

              const game = await gameApi.get(gameResponse.game_id);
              setCurrentGame(game);
              setCurrentWorld(game.world);
              setSelectedRegion(actualRegionId);
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
