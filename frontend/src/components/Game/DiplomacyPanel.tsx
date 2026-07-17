/**
 * Open-Pax — Diplomacy Panel Component
 * =====================================
 * Shows diplomatic relationships (allies/hostile/neutral) for the selected country.
 */

import React, { useEffect, useState } from 'react';
// ОТКЛЮЧЕНО: переговоры (временно) — chatsApi/useChatStore/useUIStore нужны были только для открытия чата
import { gameApi } from '../../services/api';
// import { chatsApi } from '../../services/api';
// import { useChatStore, useUIStore } from '../../stores';
import type { Region } from '../../types';

interface DiplomacyPanelProps {
  gameId: string;
  selectedRegionId: string;
  regions: Region[];
  /** Меняется после каждого хода (currentTurn) — триггерит перезагрузку матрицы */
  refreshKey?: number | string;
}

interface RelationshipData {
  // Ключи — polityId (коды стран для шаблонов, 'player'/'ai-N' для кастомных карт)
  [polityId: string]: { [polityId: string]: string };
}

interface RelationshipEntry {
  id: string;
  name: string;
  relationship: string;
}

const REL_COLOR: Record<string, string> = {
  ally: '#22c55e',
  hostile: '#ef4444',
  neutral: '#6b7280',
};

const FLAG_EMOJI: Record<string, string> = {
  USA: '🇺🇸', RUS: '🇷🇺', CHN: '🇨🇳', GBR: '🇬🇧', FRA: '🇫🇷',
  DEU: '🇩🇪', JPN: '🇯🇵', IND: '🇮🇳', BRA: '🇧🇷', CAN: '🇨🇦',
  ITA: '🇮🇹', ESP: '🇪🇸', MEX: '🇲🇽', AUS: '🇦🇺', KOR: '🇰🇷',
  SAU: '🇸🇦', TUR: '🇹🇷', POL: '🇵🇱', NLD: '🇳🇱', BEL: '🇧🇪',
  SWE: '🇸🇪', NOR: '🇳🇴', DNK: '🇩🇰', FIN: '🇫🇮', AUT: '🇦🇹',
  CHE: '🇨🇭', PRT: '🇵🇹', GRC: '🇬🇷', CZE: '🇨🇿', HUN: '🇭🇺',
  ROU: '🇷🇴', BGR: '🇧🇬', UKR: '🇺🇦', KAZ: '🇰🇿', ARG: '🇦🇷',
  CHL: '🇨🇱', COL: '🇨🇴', PER: '🇵🇪', VEN: '🇻🇪', ECU: '🇪🇨',
  BOL: '🇧🇴', PRY: '🇵🇾', URY: '🇺🇾', GTM: '🇬🇹', CUB: '🇨🇺',
  HTI: '🇭🇹', DOM: '🇩🇴', HND: '🇭🇳', NIC: '🇳🇮', CRI: '🇨🇷',
  PAN: '🇵🇦', SLV: '🇸🇻', JAM: '🇯🇲', TTO: '🇹🇹', PRK: '🇰🇵',
  VNM: '🇻🇳', THA: '🇹🇭', IDN: '🇮🇩', MYS: '🇲🇾', PHL: '🇵🇭',
  PAK: '🇵🇰', BGD: '🇧🇩', IRN: '🇮🇷', IRQ: '🇮🇶', SYR: '🇸🇾',
  ISR: '🇮🇱', EGY: '🇪🇬', LBY: '🇱🇾', DZA: '🇩🇿', MAR: '🇲🇦',
  TUN: '🇹🇳', NGA: '🇳🇬', ZAF: '🇿🇦', ETH: '🇪🇹', KEN: '🇰🇪',
  GHA: '🇬🇭', AGO: '🇦🇴', MOZ: '🇲🇿', TZA: '🇹🇿', CMR: '🇨🇲',
  COD: '🇨🇩', SDN: '🇸🇩', SOM: '🇸🇴', YEM: '🇾🇪', AFG: '🇦🇫',
  MMR: '🇲🇲', KHM: '🇰🇭', LAO: '🇱🇦', MNG: '🇲🇳', NPL: '🇳🇵',
  LKA: '🇱🇰', AZE: '🇦🇿', GEO: '🇬🇪', ARM: '🇦🇲', BLR: '🇧🇾',
  MDA: '🇲🇩', LTU: '🇱🇹', LVA: '🇱🇻', EST: '🇪🇪', SRB: '🇷🇸',
  HRV: '🇭🇷', BIH: '🇧🇦', SVN: '🇸🇮', SVK: '🇸🇰', MKD: '🇲🇰',
  MNE: '🇲🇪', ALB: '🇦🇱', RWA: '🇷🇼', UZB: '🇺🇿', TKM: '🇹🇲',
  KGZ: '🇰🇬', TJK: '🇹🇯',
};

export const DiplomacyPanel: React.FC<DiplomacyPanelProps> = ({
  gameId,
  selectedRegionId,
  regions,
  refreshKey,
}) => {
  const [relationships, setRelationships] = useState<RelationshipData | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const fetchRelationships = React.useCallback(async () => {
    try {
      const data = await gameApi.getRelationships(gameId);
      setRelationships(data);
    } catch (e) {
      console.error('[DiplomacyPanel] Failed to load relationships:', e);
    }
  }, [gameId]);

  // Перезагрузка при смене игры и после каждого хода (refreshKey = currentTurn).
  // Bug fix: раньше панель слушала window-событие 'turn_complete', которое
  // никто никогда не диспатчил, поэтому матрица не обновлялась после ходов.
  useEffect(() => {
    fetchRelationships();
  }, [fetchRelationships, refreshKey]);

  // ОТКЛЮЧЕНО: переговоры (временно) — открытие дипломатического чата с политией
  // // Этап 3: открыть переговоры с политией — создать чат и переключить панель на вкладку «Дипломатия»
  // const handleOpenChat = async (polityName: string) => {
  //   try {
  //     const { chat } = await chatsApi.create(gameId, polityName);
  //     const chatStore = useChatStore.getState();
  //     chatStore.upsertChat(chat);
  //     chatStore.setActiveChat(chat.id);
  //     chatStore.setPanelTab('chats');
  //     useUIStore.getState().setShowActions(true);
  //     // Загружаем сообщения (бэкенд помечает чат прочитанным)
  //     const data = await chatsApi.messages(gameId, chat.id);
  //     chatStore.setMessages(chat.id, data.messages || []);
  //     chatStore.markRead(chat.id);
  //   } catch (e) {
  //     console.error('[DiplomacyPanel] Не удалось открыть переговоры:', e);
  //   }
  // };

  // regionOwner — это polityId владельца выбранного региона
  const regionOwner = regions.find(r => r.id === selectedRegionId)?.owner;
  if (!regionOwner || regionOwner === 'neutral') {
    return null;
  }

  if (!relationships) {
    return (
      <div className="diplomacy-panel" style={{ opacity: 0.6 }}>
        <div style={{ padding: 8, fontSize: 12, color: '#888' }}>Загрузка дипломатии...</div>
      </div>
    );
  }

  const relMap = relationships[regionOwner] || {};
  const entries: RelationshipEntry[] = Object.entries(relMap)
    .filter(([id, rel]) => rel !== 'neutral')
    .map(([id, rel]) => {
      // id — polityId; имя берём из региона этой политии (owner = polityId)
      const region = regions.find(r => r.owner === id);
      return {
        id,
        name: region?.name || id,
        relationship: rel,
      };
    })
    .sort((a, b) => {
      const order = { ally: 0, hostile: 1 };
      return (order[a.relationship as keyof typeof order] ?? 2) - (order[b.relationship as keyof typeof order] ?? 2);
    });

  const allies = entries.filter(e => e.relationship === 'ally');
  const hostiles = entries.filter(e => e.relationship === 'hostile');

  if (entries.length === 0) {
    return (
      <div className="diplomacy-panel">
        <div className="diplomacy-header">
          <span>🤝 Дипломатия</span>
        </div>
        <div style={{ padding: 8, fontSize: 12, color: '#888' }}>Нет союзников или врагов</div>
      </div>
    );
  }

  return (
    <div className="diplomacy-panel">
      <div className="diplomacy-header" onClick={() => setCollapsed(c => !c)} style={{ cursor: 'pointer' }}>
        <span>🤝 Дипломатия</span>
        <span style={{ fontSize: 11, color: '#888' }}>{collapsed ? '▶' : '▼'}</span>
      </div>

      {!collapsed && (
        <div className="diplomacy-content">
          {allies.length > 0 && (
            <div className="diplomacy-section">
              <div className="diplomacy-section-title" style={{ color: REL_COLOR.ally }}>
                Союзники ({allies.length})
              </div>
              {allies.map(e => (
                <div key={e.id} className="diplomacy-entry">
                  <span style={{ color: REL_COLOR.ally }}>●</span>
                  <span>{FLAG_EMOJI[e.id] || '🏳️'}</span>
                  <span>{e.name}</span>
                  {/* ОТКЛЮЧЕНО: переговоры (временно)
                  <button
                    className="btn-negotiate"
                    onClick={() => handleOpenChat(e.name)}
                    title={`Переговоры с ${e.name}`}
                  >
                    💬 Переговоры
                  </button>
                  */}
                </div>
              ))}
            </div>
          )}

          {hostiles.length > 0 && (
            <div className="diplomacy-section">
              <div className="diplomacy-section-title" style={{ color: REL_COLOR.hostile }}>
                Враги ({hostiles.length})
              </div>
              {hostiles.map(e => (
                <div key={e.id} className="diplomacy-entry">
                  <span style={{ color: REL_COLOR.hostile }}>●</span>
                  <span>{FLAG_EMOJI[e.id] || '🏳️'}</span>
                  <span>{e.name}</span>
                  {/* ОТКЛЮЧЕНО: переговоры (временно)
                  <button
                    className="btn-negotiate"
                    onClick={() => handleOpenChat(e.name)}
                    title={`Переговоры с ${e.name}`}
                  >
                    💬 Переговоры
                  </button>
                  */}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DiplomacyPanel;
