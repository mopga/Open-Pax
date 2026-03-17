/**
 * Open-Pax — Main App
 * ==================
 */

import React, { useState, useEffect } from 'react';
import { MapView } from './components/Map/MapView';
import { MapEditor, type EditorRegion } from './components/Editor';
import { gameApi, worldApi, mapApi } from './services/api';
import type { Region, World, Game, CreateWorldRequest } from './types';

// Вспомогательная функция: точки в SVG path
const pointsToPath = (points: { x: number; y: number }[]): string => {
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
};

function App() {
  // Состояние
  const [currentView, setCurrentView] = useState<'menu' | 'create-world' | 'game' | 'editor'>('menu');
  const [worlds, setWorlds] = useState<World[]>([]);
  const [currentWorld, setCurrentWorld] = useState<World | null>(null);
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [actionText, setActionText] = useState('');
  const [turnResult, setTurnResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Загрузка списка миров при старте
  useEffect(() => {
    // В MVP просто используем дефолтный мир
    loadDefaultWorld();
  }, []);

  const loadDefaultWorld = async () => {
    try {
      // Пробуем загрузить дефолтный мир
      const response = await fetch('/maps/default.json');
      const worldData = await response.json();
      
      const regions: Region[] = worldData.regions.map((r: any) => ({
        id: r.id,
        name: r.name,
        svgPath: r.path,
        color: r.color,
        owner: 'neutral',
        population: 1000000,
        gdp: 100.0,
        militaryPower: 100,
        objects: [],
        borders: [],
        status: 'active' as any,
        metadata: {},
      }));
      
      setCurrentWorld({
        id: worldData.id,
        name: worldData.name,
        description: worldData.description,
        startDate: '1951-01-01',
        basePrompt: 'Альтернативная история XX века',
        historicalAccuracy: 0.8,
        regions: regions.reduce((acc: any, r: Region) => {
          acc[r.id] = r;
          return acc;
        }, {}),
        blocs: {},
      });
    } catch (e) {
      console.error('Failed to load world:', e);
    }
  };

  const handleStartGame = async (regionId: string) => {
    if (!currentWorld) return;
    
    setLoading(true);
    try {
      const response = await gameApi.create({
        world_id: currentWorld.id,
        player_name: 'Player',
        player_region_id: regionId,
      });
      
      const game = await gameApi.get(response.game_id);
      setCurrentGame(game);
      setSelectedRegion(regionId);
      setCurrentView('game');
    } catch (e) {
      console.error('Failed to start game:', e);
    }
    setLoading(false);
  };

  const handleSubmitAction = async () => {
    if (!currentGame || !actionText.trim()) return;
    
    setLoading(true);
    try {
      const result = await gameApi.submitAction({
        game_id: currentGame.id,
        player_id: currentGame.players[0].id,
        text: actionText,
      });
      
      setTurnResult(result.narration);
      setActionText('');
      
      // Обновить состояние игры
      const updatedGame = await gameApi.get(currentGame.id);
      setCurrentGame(updatedGame);
    } catch (e) {
      console.error('Failed to submit action:', e);
    }
    setLoading(false);
  };

  // Сохранить карту из редактора
  const handleSaveMap = async (regions: EditorRegion[], mapName: string) => {
    setLoading(true);
    try {
      // Конвертируем регионы в формат для API
      const mapRegions = regions.map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        path: pointsToPath(r.points),
      }));

      const result = await mapApi.create({
        name: mapName,
        width: 800,
        height: 600,
        regions: mapRegions,
      });

      console.log('Map saved:', result);
      alert(`Карта "${mapName}" сохранена!`);
      setCurrentView('menu');
    } catch (e) {
      console.error('Failed to save map:', e);
      // Для MVP - сохраняем в localStorage если API недоступен
      const localData = {
        name: mapName,
        regions: regions.map(r => ({
          id: r.id,
          name: r.name,
          color: r.color,
          path: pointsToPath(r.points),
        })),
      };
      localStorage.setItem(`map_${Date.now()}`, JSON.stringify(localData));
      alert('Сохранено локально (API недоступен)');
      setCurrentView('menu');
    }
    setLoading(false);
  };

  // Рендер
  return (
    <div className="app">
      <header className="app-header">
        <h1>🗺️ Open-Pax</h1>
        <p>Alternate History Simulator</p>
      </header>
      
      {currentView === 'menu' && currentWorld && (
        <div className="world-select">
          <h2>Выберите мир</h2>
          <div className="world-card">
            <h3>{currentWorld.name}</h3>
            <p>{currentWorld.description}</p>
            <button onClick={() => setCurrentView('create-world')}>
              Выбрать →
            </button>
          </div>
          <div className="editor-card">
            <h3>🗺️ Создать свою карту</h3>
            <p>Нарисуйте собственный мир для альтернативной истории</p>
            <button onClick={() => setCurrentView('editor')}>
              Создать карту →
            </button>
          </div>
        </div>
      )}
      
      {currentView === 'create-world' && currentWorld && (
        <div className="region-select">
          <h2>Выберите страну</h2>
          <MapView
            regions={Object.values(currentWorld.regions)}
            selectedRegionId={selectedRegion || undefined}
            onRegionClick={(id) => setSelectedRegion(id)}
          />
          {selectedRegion && (
            <div className="region-actions">
              <p>Вы выбрали: {currentWorld.regions[selectedRegion]?.name}</p>
              <button 
                onClick={() => handleStartGame(selectedRegion)}
                disabled={loading}
              >
                {loading ? 'Загрузка...' : 'Начать игру'}
              </button>
            </div>
          )}
        </div>
      )}
      
      {currentView === 'game' && currentGame && currentWorld && (
        <div className="game-view">
          <div className="game-map">
            <MapView
              regions={Object.values(currentWorld.regions)}
              selectedRegionId={currentGame.players[0].regionId}
            />
          </div>
          
          <div className="game-panel">
            <div className="turn-info">
              <h3>Ход {currentGame.currentTurn}</h3>
              <p>Вы управляете: {currentWorld.regions[currentGame.players[0].regionId]?.name}</p>
            </div>
            
            {turnResult && (
              <div className="turn-result">
                <h4>Результат хода:</h4>
                <p>{turnResult}</p>
              </div>
            )}
            
            <div className="action-input">
              <h4>Ваши действия:</h4>
              <textarea
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
                placeholder="Опишите, что хотите сделать..."
                rows={4}
              />
              <button 
                onClick={handleSubmitAction}
                disabled={loading || !actionText.trim()}
              >
                {loading ? 'Думаю...' : 'Завершить ход →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {currentView === 'editor' && (
        <MapEditor
          onSave={handleSaveMap}
          onCancel={() => setCurrentView('menu')}
        />
      )}
    </div>
  );
}

export default App;
