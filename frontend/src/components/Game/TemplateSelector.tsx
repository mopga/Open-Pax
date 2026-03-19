/**
 * Open-Pax — Template Selector Component
 * ======================================
 * Allows user to select a world template/scenario before starting a game.
 */

import React, { useState, useEffect } from 'react';
import { templatesApi } from '../../services/api';
import type { WorldTemplate } from '../../types';

interface TemplateSelectorProps {
  onSelect: (template: WorldTemplate) => void;
  onBack: () => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({ onSelect, onBack }) => {
  const [templates, setTemplates] = useState<{
    id: string;
    name: string;
    description: string;
    start_date: string;
    country_count: number;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      </div>

      <div className="template-grid">
        {templates.map(template => (
          <div
            key={template.id}
            className="template-card"
            onClick={() => handleSelect(template.id)}
          >
            <div className="template-name">{template.name}</div>
            <div className="template-description">{template.description}</div>
            <div className="template-meta">
              <span>📅 {template.start_date}</span>
              <span>🌍 {template.country_count} стран</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TemplateSelector;
