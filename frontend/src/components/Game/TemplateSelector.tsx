/**
 * Open-Pax — Template Selector Component
 * ======================================
 * Позволяет выбрать шаблон/сценарий мира перед началом игры.
 * Этап 5: пресеты как пакеты — бейджи источника, иконки возможностей,
 * экспорт в zip и импорт пресета из zip-архива.
 */

import React, { useState, useEffect, useRef } from 'react';
import { templatesApi } from '../../services/api';
import type { TemplateInfo } from '../../services/api';
import type { WorldTemplate } from '../../types';

interface TemplateSelectorProps {
  onSelect: (template: WorldTemplate) => void;
  onBack: () => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({ onSelect, onBack }) => {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await templatesApi.list();
      setTemplates(response.templates);
      setError(null);
    } catch (e) {
      console.error('[TemplateSelector] Failed to load templates:', e);
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (templateId: string) => {
    try {
      const template = await templatesApi.get(templateId);
      onSelect(template);
    } catch (e) {
      console.error('[TemplateSelector] Failed to load template:', e);
      setError('Failed to load template details');
    }
  };

  /** Экспорт пресета в zip — stopPropagation, чтобы клик не выбирал шаблон */
  const handleExport = async (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    try {
      await templatesApi.exportPreset(templateId);
    } catch (err) {
      console.error('[TemplateSelector] Ошибка экспорта пресета:', err);
      setImportError(`Ошибка экспорта: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /** Клик по «Импорт пресета» — открываем скрытый выбор файла */
  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  /** Файл выбран — отправляем на сервер; value сбрасываем, чтобы можно было выбрать тот же файл повторно */
  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await doImport(file, false);
  };

  /** Собственно импорт; при конфликте (EXISTS) — confirm и повтор с overwrite */
  const doImport = async (file: File, overwrite: boolean): Promise<void> => {
    setImporting(true);
    setImportError(null);
    try {
      const result = await templatesApi.importPreset(file, overwrite);
      await loadTemplates();
      // Импортированный пресет сразу выбираем — это то, ради чего его импортировали
      await handleSelect(result.template.id);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'EXISTS' && !overwrite) {
        // 409 — пресет уже есть: спрашиваем подтверждение перезаписи
        setImporting(false);
        if (window.confirm('Пресет уже существует. Перезаписать?')) {
          await doImport(file, true);
        }
        return;
      }
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="template-selector">
        <div className="loading">Loading templates...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="template-selector">
        <div className="error">{error}</div>
        <button onClick={loadTemplates}>Retry</button>
      </div>
    );
  }

  return (
    <div className="template-selector">
      <div className="selector-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h2>Выберите сценарий</h2>
        <div className="import-controls">
          <button
            className="btn-import"
            onClick={handleImportClick}
            disabled={importing}
          >
            {importing ? (
              <>
                <span className="import-spinner" />
                Импорт…
              </>
            ) : (
              '📦 Импорт пресета'
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={handleFileChosen}
          />
        </div>
      </div>

      {importError && (
        <div className="import-error">{importError}</div>
      )}

      <div className="template-grid">
        {templates.map(template => (
          <div
            key={template.id}
            className="template-card"
            onClick={() => handleSelect(template.id)}
          >
            <button
              className="template-export-btn"
              title="Экспорт zip"
              onClick={(e) => handleExport(e, template.id)}
            >
              ⬇
            </button>
            <div className="template-card-top">
              <div className="template-name">{template.name}</div>
              <span className={`template-badge ${template.source === 'preset' ? 'preset' : 'legacy'}`}>
                {template.source === 'preset' ? 'Пакет' : 'Базовый'}
              </span>
            </div>
            <div className="template-description">{template.description}</div>
            <div className="template-meta">
              <span>📅 {template.start_date}</span>
              <span>🌍 {template.country_count} стран</span>
              {template.has_rules && (
                <span title="Кастомные правила симуляции">⚙</span>
              )}
              {template.has_map && (
                <span title="Своя карта">🗺</span>
              )}
              {template.flags_count > 0 && (
                <span title={`Флагов: ${template.flags_count}`}>🚩×{template.flags_count}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TemplateSelector;
