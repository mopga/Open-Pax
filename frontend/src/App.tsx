/**
 * Open-Pax — Main App (Redesign)
 * ==============================
 */

import React, { useEffect, useRef, useState } from 'react';
import { MapboxMapView } from './components/Map/MapboxMapView';
import { TemplateSelector } from './components/Game/TemplateSelector';
import { CountrySelector } from './components/Game/CountrySelector';
import { AdvisorChat } from './components/Game/AdvisorChat';
import { Landing } from './components/Game/Landing';
import { SaveGameModal } from './components/Game/SaveGameModal';
import { HudBar } from './components/Game/HudBar';
import { GameLoader } from './components/Game/GameLoader';
import { Fab } from './components/Game/Fab';
import { gameApi, worldApi, savesApi, settingsApi, usageApi, type GameUsage, type LLMSettingsView } from './services/api';
import { LLMSettingsModal } from './components/Settings/LLMSettingsModal';
import type { Region, Polity } from './types';
import { useGameStore, useUIStore, useActionsStore, useChatStore } from './stores';
import { useSSE } from './services/sse';
import { renderMarkdown } from './utils/inlineMarkdown';

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
    selectedCountry,
    setCurrentGame, setCurrentWorld, setSelectedRegion, setHistory, addHistory,
    addPendingAction, removePendingAction, clearPendingActions,
    setChangedRegions, clearChangedRegions, setSelectedCountry,
  } = useGameStore();

  const {
    currentView, loading, showJumpMenu,
    showPromptEditor, editingPrompt,
    showActions, actionsMaximized, actionsSize, isResizing,
    selectedTemplate,
    setCurrentView, setLoading, setShowJumpMenu,
    setShowPromptEditor, setEditingPrompt,
    setShowActions, setActionsMaximized, setActionsSize, setIsResizing,
    setSelectedTemplate,
  } = useUIStore();

  const {
    suggestions, newActionText,
    setSuggestions, setNewActionText,
  } = useActionsStore();

  // Этап 3: живой Советник (вкладки плавающей панели)
  const panelTab = useChatStore(s => s.panelTab);
  const setPanelTab = useChatStore(s => s.setPanelTab);

  // Привязка chatStore к текущей игре (при смене игры лента советника сбрасывается)
  const currentGameId = currentGame?.id || null;
  useEffect(() => {
    const chatStore = useChatStore.getState();
    chatStore.setGameId(currentGameId);
  }, [currentGameId]);

  // Модель ИИ: свой ключ / подписка / локальная модель + расход токенов
  const [llmView, setLlmView] = useState<LLMSettingsView | null>(null);
  const [settingsModal, setSettingsModal] = useState<null | { onboarding: boolean; then?: () => void }>(null);
  const [gameUsage, setGameUsage] = useState<GameUsage | null>(null);

  useEffect(() => {
    settingsApi.getLLM().then(setLlmView).catch(e => console.warn('[LLM] настройки недоступны:', e));
  }, []);

  /** Новая игра без подключённой модели — сначала окно настроек */
  const requireModel = (next: () => void) => {
    if (llmView && !llmView.configured) {
      setSettingsModal({ onboarding: true, then: next });
    } else {
      next();
    }
  };

  // Расход по игре: при смене игры/хода и периодически (подсказки и советник тоже тратят токены)
  const refreshUsage = () => {
    if (!currentGameId) return;
    usageApi.game(currentGameId).then(setGameUsage).catch(() => { /* индикатор не критичен */ });
  };
  useEffect(() => {
    setGameUsage(null);
    if (!currentGameId || currentView !== 'game') return;
    refreshUsage();
    const timer = window.setInterval(refreshUsage, 10_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGameId, currentView, currentGame?.currentTurn]);

  /**
   * Накладывает изменения регионов на карту и подсвечивает изменившиеся.
   * Читает мир из стора напрямую: вызывается из SSE-колбэков, где
   * замыкание на currentWorld было бы устаревшим.
   */
  const applyRegionChanges = (changes: (Partial<Region> & { id: string })[], highlight = true) => {
    const world = useGameStore.getState().currentWorld;
    if (!world || changes.length === 0) return;
    const regions = { ...world.regions };
    const changed: string[] = [];
    // Объекты (батальоны, столицы) обновляют карту, но регион не подсвечивают
    let objectsChanged = false;
    const objectIds = (r?: Partial<Region>) => (r?.objects || []).map(o => o.id).join(',');
    for (const c of changes) {
      const old = regions[c.id];
      if (!old || old.owner !== c.owner || old.color !== c.color || old.name !== c.name) changed.push(c.id);
      else if (c.objects && objectIds(old) !== objectIds(c)) objectsChanged = true;
      regions[c.id] = { ...old, ...c } as Region;
    }
    if (changed.length === 0 && !objectsChanged) return;
    setCurrentWorld({ ...world, regions });
    if (highlight) {
      setChangedRegions(changed);
      setTimeout(() => clearChangedRegions(), 3000);
    }
  };

  /** Обновить реестр государств (переименования, новые государства) */
  const applyPolityChanges = (changes: Polity[], replace = false) => {
    const world = useGameStore.getState().currentWorld;
    if (!world || (changes.length === 0 && !replace)) return;
    const polities = replace ? {} as Record<string, Polity> : { ...(world.polities || {}) };
    for (const p of changes) polities[p.id] = p;
    setCurrentWorld({ ...world, polities });
  };

  /** Полная сверка игры и карты с сервером — после хода и отката */
  const syncGameFromServer = async (gameId: string, highlight = true) => {
    const updatedGame = await gameApi.get(gameId);
    setCurrentGame(prev => (prev ? {
      ...prev,
      currentTurn: updatedGame.currentTurn,
      currentDate: updatedGame.currentDate,
      players: updatedGame.players,
    } : updatedGame));
    applyRegionChanges(Object.values(updatedGame.world?.regions || {}), highlight);
    applyPolityChanges(Object.values(updatedGame.world?.polities || {}), true);
  };

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

  // Time-skip handler (Phase 4)
  const handleTimeSkip = async (days: number) => {
    if (!currentGame) return;

    setLoading(true);

    try {
      const draftActions = pendingActions.map(action => action.text);
      const result = await gameApi.timeSkip(currentGame.id, days, draftActions);

      if (result.type === 'actions_processed') {
        const turnActions = result.actions || [];
        const turnResult = turnActions.find(action => action.result)?.result;
        if (turnResult) {
          addHistory({
            turn: turnResult.turn,
            action: turnActions.map(action => action.text).join('\n'),
            result: turnResult.narration,
            events: turnResult.events,
            timelineEvents: turnResult.timelineEvents,
            periodStart: turnResult.periodStart,
            periodEnd: turnResult.periodEnd,
          });
        }

        const lastAction = result.actions?.[result.actions.length - 1];
        if (lastAction?.result) {
          setCurrentGame(prev => prev ? {
            ...prev,
            currentTurn: (lastAction.result as any).turn + 1,
            currentDate: (lastAction.result as any).periodEnd,
          } : prev);
        }
      } else if (result.type === 'world_simulated' && result.result) {
        const turnResult = result.result;
        addHistory({
          turn: turnResult.turn,
          action: '⏭️ Автономный ход мира',
          result: turnResult.narration,
          events: turnResult.events,
          timelineEvents: turnResult.timelineEvents,
          periodStart: turnResult.periodStart,
          periodEnd: turnResult.periodEnd,
        });

        setCurrentGame(prev => prev ? {
          ...prev,
          currentTurn: turnResult.turn + 1,
          currentDate: turnResult.periodEnd,
        } : prev);
      }
      clearPendingActions();
      setLiveTimelineEvents([]);
      // Итоговая сверка карты: события уже перекрасили регионы по SSE,
      // здесь доезжают worldChanges конца хода и всё, что SSE мог пропустить
      await syncGameFromServer(currentGame.id);
    } catch (e) {
      console.error('Time-skip failed:', e);
      setLiveTimelineEvents([]);
    }

    setLoading(false);
  };

  // Этап 2: Rewind — откат на ход назад
  const handleRewind = async () => {
    if (!currentGame || loading) return;
    if (!window.confirm('Откатить последний ход? Мир вернётся к предыдущему состоянию.')) return;

    setLoading(true);
    try {
      await gameApi.rewind(currentGame.id);
      await syncGameFromServer(currentGame.id, false);
      const updatedGame = useGameStore.getState().currentGame!;

      addHistory({
        turn: updatedGame.currentTurn,
        action: '⏪ Откат',
        result: 'Последний ход отменён, мир возвращён к предыдущему состоянию',
      });
    } catch (e) {
      console.error('Rewind failed:', e);
      alert('Не удалось откатить ход — снапшот появляется после первого сыгранного хода.');
    }

    setLoading(false);
  };

  // Этап 2: Intervene — прервать применение оставшихся событий пачки
  const handleIntervene = async () => {
    if (!currentGame) return;
    try {
      await gameApi.intervene(currentGame.id);
      setTurnProgress('⏸ Intervene: останавливаем после текущего события…');
    } catch (e) {
      console.error('Intervene failed:', e);
    }
  };

  // Выбрать страну
  const handleCountryChange = (regionId: string) => {
    setSelectedRegion(regionId);
  };

  // Этап 6: открытие панели управления (FAB)
  const openActionsPanel = () => {
    setShowActions(true);
    if (suggestions.length === 0 && currentGame) {
      (async () => {
        try {
          const data = await gameApi.getSuggestions(currentGame.id);
          setSuggestions(data.suggestions || []);
        } catch (e) { console.error(e); }
      })();
    }
  };

  // Этап 6: возобновление сохранённой игры с лендинга
  const handleResumeSave = async (save: any) => {
    if (!save?.id || !save?.game_id) return;
    setLoading(true);
    try {
      await gameApi.loadSave(save.id);
      const game = await gameApi.get(save.game_id);
      setCurrentGame(game);
      setCurrentWorld(game.world);
      const regionId = game.players?.[0]?.regionId;
      if (regionId) {
        setSelectedRegion(regionId);
        // Государство игрока: polityId; у старых игр — код из id региона `${worldId}_${code}`
        const code = game.players?.[0]?.polityId || game.world.regions[regionId]?.owner || String(regionId).split('_').pop();
        if (code) setSelectedCountry(code);
      }
      setHistory(game.history ?? []);
      setCurrentView('game');
    } catch (e) {
      console.error('[Save] Failed to resume save:', e);
      alert('Ошибка загрузки сохранения');
    } finally {
      setLoading(false);
    }
  };

  // Рендер главного меню — Этап 6: лендинг в духе pax_home
  const renderMenu = () => (
    <Landing
      onNewGame={() => requireModel(() => setCurrentView('select-template'))}
      llmView={llmView}
      onOpenSettings={() => setSettingsModal({ onboarding: false })}
      onResumeSave={handleResumeSave}
    />
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
  const [liveTimelineEvents, setLiveTimelineEvents] = useState<Array<{
    headline: string;
    description?: string;
    date?: string;
    kind?: 'reaction' | 'independent' | 'world';
  }>>([]);
  // Этап 2: сложность новой игры
  const [difficulty, setDifficulty] = useState<string>('normal');

  // Этап 6: модалка сохранения (замена prompt())
  const [showSaveModal, setShowSaveModal] = useState(false);

  useSSE(currentGame?.id || null, {
    onTurnStart: (data) => {
      console.log('[SSE] Turn started:', data);
      setIsProcessingTurn(true);
      setTurnProgress('Обработка хода...');
      setLiveTimelineEvents([]);
    },
    onLLMProgress: (data) => {
      setTurnProgress(`Модель генерирует… ${data.chars} зн.`);
    },
    onJumpEvent: (data) => {
      setTurnProgress(`Событие ${data.index + 1}/${data.total}: ${data.event?.headline || ''}`);
      // Карта меняется прямо по ходу событий, а не только после хода
      if (data.changedRegions?.length) {
        applyRegionChanges(data.changedRegions as (Partial<Region> & { id: string })[]);
      }
      if (data.changedPolities?.length) applyPolityChanges(data.changedPolities as Polity[]);
      if (data.event?.headline) {
        setLiveTimelineEvents(events => [...events, data.event]);
      }
    },
    onActionVoided: (data) => {
      setTurnProgress(`⊘ Действие отклонено: ${data.reason || data.action}`);
      setLiveTimelineEvents(events => [...events, {
        headline: `⊘ Отклонено: ${data.action}`,
        description: data.reason,
        kind: 'reaction',
      }]);
    },
    // Этап 3: проактивный комментарий советника после хода — в ленту с пометкой
    onAdvisorProactive: (data) => {
      if (data?.content) {
        useChatStore.getState().addAdvisorMessage({
          role: 'assistant',
          content: data.content,
          proactive: true,
        });
      }
    },
    onTurnComplete: (data) => {
      console.log('[SSE] Turn complete:', data);
      setIsProcessingTurn(false);
      setTurnProgress('');

      // HTTP-ответ хода содержит полный список приказов, интервал и карточки
      // событий; историю добавляет только он. SSE отвечает за live-прогресс
      // и синхронизацию состояния, иначе один ход появлялся дважды.
      if (data) {
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

    // Полития игрока (owner = polityId; из players.polityId, либо выводим из домашнего региона)
    const playerPolityId = currentGame?.players?.[0]?.polityId
      ?? regions.find(r => r.id === currentGame?.players?.[0]?.regionId)?.owner
      ?? 'player';

    return (
      <div className="game-wrapper">
        {/* Этап 6: HUD-бар в духе оригинала (дата, rewind, панель «Таймлайн») */}
        <HudBar
          worldName={currentWorld?.name || ''}
          turn={currentGame?.currentTurn || 1}
          dateISO={currentGame?.currentDate || '1951-01-01'}
          loading={loading}
          onBack={() => {
            setCurrentView('menu');
            setCurrentWorld(null);
            setCurrentGame(null);
            setHistory([]);
          }}
          onRewind={handleRewind}
          onTimeSkip={handleTimeSkip}
          timelineOpen={showJumpMenu}
          onTimelineOpenChange={setShowJumpMenu}
          usage={gameUsage}
          onOpenSettings={() => setSettingsModal({ onboarding: false })}
        />

        <div className="game-container">
          {/* Этап 2: баннер прогресса хода + Intervene */}
          {isProcessingTurn && (
            <div className="turn-progress-banner">
              <span className="turn-progress-text">{turnProgress || 'Обработка хода...'}</span>
              <button
                className="btn-intervene"
                onClick={handleIntervene}
                title="Прервать симуляцию после текущего события (остальные события пачки будут отменены)"
              >
                ⏸ Intervene
              </button>
            </div>
          )}
          {liveTimelineEvents.length > 0 && (
            <div className="live-event-sequence" aria-live="polite">
              {liveTimelineEvents.map((event, index) => (
                <div key={`${event.date || 'live'}-${index}`} className={`history-event-card ${event.kind || 'world'}`}>
                  <div className="history-event-card-meta">
                    <span>{event.kind === 'reaction' ? 'Реакция' : event.kind === 'independent' ? 'Событие мира' : 'Событие'}</span>
                    {event.date && <time>{event.date}</time>}
                  </div>
                  <div className="history-event-card-title">{event.headline}</div>
                  {event.description && <div className="history-event-card-description">{renderMarkdown(event.description)}</div>}
                </div>
              ))}
            </div>
          )}
          {/* Карта слева */}
          <div className="game-map">
            <MapboxMapView
              regions={regions}
              selectedRegionId={selectedRegion || undefined}
              onRegionClick={handleCountryChange}
              changedRegionIds={changedRegions}
              playerCountryCode={selectedCountry || undefined}
              polities={currentWorld?.polities}
            />
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
                  <span style={{ color: currentWorld?.polities?.[playerPolityId]?.color || '#fff' }}>
                    {currentWorld?.polities?.[playerPolityId]?.name
                      || regions.find(r => r.id === currentGame.players[0].regionId)?.name
                      || 'Неизвестно'}
                  </span>
                )}
              </div>
            </div>

            {/* Выбранный регион и его владелец */}
            {currentRegion && (
              <div className="country-info">
                <div className="country-name" style={{ color: currentRegion.color }}>
                  {currentRegion.name}
                </div>
                {currentRegion.owner && currentRegion.owner !== 'neutral'
                  && currentWorld?.polities?.[currentRegion.owner]
                  && currentWorld.polities[currentRegion.owner].name !== currentRegion.name && (
                  <div className="country-owner">{currentWorld.polities[currentRegion.owner].name}</div>
                )}
              </div>
            )}

            {/* Save/Load buttons */}
            <div className="save-load-section">
              <button
                className="btn-save"
                onClick={() => setShowSaveModal(true)}
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

            {/* Этап 6: FAB-группа (действия) */}
            {!showActions && (
              <Fab items={[
                { icon: '⚡', title: 'Действия', onClick: openActionsPanel },
              ]} />
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
                  <div className="panel-title">⚡ Панель управления</div>
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

                {/* Этап 3: вкладки панели — Предложения | Советник */}
                <div className="advisor-tabs-row">
                  <button
                    className={`advisor-tab ${panelTab === 'suggestions' ? 'active' : ''}`}
                    onClick={() => setPanelTab('suggestions')}
                  >
                    Предложения
                  </button>
                  <button
                    className={`advisor-tab ${panelTab === 'advisor' ? 'active' : ''}`}
                    onClick={() => setPanelTab('advisor')}
                  >
                    Советник
                  </button>
                </div>

                {/* Actions Content */}
                {panelTab === 'suggestions' && (
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
                              onClick={() => {
                                const text = a.content;
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
                    <textarea
                      value={newActionText}
                      onChange={(e) => setNewActionText(e.target.value)}
                      placeholder="Опишите действие своими словами…"
                      rows={2}
                    />
                    <button
                      className="btn-add-pending"
                       onClick={() => {
                         if (newActionText.trim() && currentGame) {
                           const text = newActionText.trim();
                           addPendingAction({
                            id: `manual-${Date.now()}`,
                            text
                          });
                          setNewActionText('');
                        }
                      }}
                      disabled={!newActionText.trim()}
                    >
                      + Добавить
                    </button>
                  </div>
                </div>
                )}

                {/* Этап 3: вкладка живого Советника (стриминг + проактивные сводки) */}
                {panelTab === 'advisor' && currentGame && (
                  <AdvisorChat gameId={currentGame.id} />
                )}

                {/* Submit Button */}
                {panelTab === 'suggestions' && (
                <div className="suggestions-footer">
                  <button
                    className="btn-submit-actions"
                    disabled={pendingActions.length === 0 || loading}
                    onClick={() => {
                      if (pendingActions.length === 0) return;
                      setShowActions(false);
                      setShowJumpMenu(true);
                    }}
                  >
                    Выбрать период · приказов: {pendingActions.length} →
                  </button>
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
                      {item.periodStart && item.periodEnd ? (
                        <span className="history-date">
                          📅 {formatDateRange(item.periodStart, item.periodEnd)}
                        </span>
                      ) : item.date && (
                        <span className="history-date">📅 {item.date}</span>
                      )}
                    </div>
                    <div className="history-action">→ {item.action}</div>
                    <div className="history-result">{renderMarkdown(item.result)}</div>
                    {item.timelineEvents && item.timelineEvents.length > 0 ? (
                      <div className="history-timeline-events">
                        {item.timelineEvents.map((event, ei) => (
                          <div key={`${event.date}-${ei}`} className={`history-event-card ${event.kind || 'world'}`}>
                            <div className="history-event-card-meta">
                              <span>{event.kind === 'reaction' ? 'Реакция' : event.kind === 'independent' ? 'Событие мира' : 'Событие'}</span>
                              {event.date && <time>{event.date}</time>}
                            </div>
                            <div className="history-event-card-title">{event.headline}</div>
                            {event.description && <div className="history-event-card-description">{renderMarkdown(event.description)}</div>}
                          </div>
                        ))}
                      </div>
                    ) : item.events && item.events.length > 0 && (
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

            {/* Этап 6: модалка сохранения игры (вместо prompt()) */}
            <SaveGameModal
              open={showSaveModal}
              defaultName={`Игра ${new Date().toLocaleString('ru-RU')}`}
              onClose={() => setShowSaveModal(false)}
              onSave={async (name) => {
                if (!currentGame) return;
                try {
                  await gameApi.saveGame(currentGame.id, name);
                  setShowSaveModal(false);
                } catch (e) {
                  console.error(e);
                  alert('Ошибка сохранения');
                }
              }}
            />

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

  return (
    <div className="app">
      {/* Этап 6: полноэкранный лоадер генерации мира с этапами */}
      {loading && currentView === 'select-country' && (
        <GameLoader title="Создание мира…" phase="Раскладываем государства по карте…" />
      )}
      {/* Этап 6: лоадер при возобновлении сохранённой игры */}
      {loading && currentView === 'menu' && (
        <GameLoader title="Загрузка игровых данных…" />
      )}
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
        <div>
          <div className="difficulty-selector">
            <label htmlFor="difficulty-select">Сложность:</label>
            <select
              id="difficulty-select"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="story">История (очень легко)</option>
              <option value="easy">Легко</option>
              <option value="normal">Обычная</option>
              <option value="hard">Сложно</option>
              <option value="very_hard">Очень сложно</option>
            </select>
          </div>
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

              // Use correct region ID (prefixed with worldId)
              const actualRegionId = worldData.regionIds?.[countryCode] || countryCode;

              const gameResponse = await gameApi.create({
                world_id: worldData.worldId,
                player_name: 'Player',
                player_region_id: actualRegionId,
                difficulty,
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
        </div>
      )}
      {currentView === 'game' && renderGame()}
      {settingsModal && (
        <LLMSettingsModal
          onboarding={settingsModal.onboarding}
          onClose={() => setSettingsModal(null)}
          onSaved={view => {
            setLlmView(view);
            refreshUsage();
            if (view.configured) settingsModal.then?.();
          }}
        />
      )}
    </div>
  );
}

export default App;
