/**
 * Open-Pax — окно «Модель ИИ»
 * ===========================
 * Свой ключ / подписка / локальная модель: выбор пресета провайдера,
 * ключ, основная и лёгкая модель, тип оплаты и цены для оценки расхода.
 *
 * Ключ сервер отдаёт только маской. Пустое поле ключа = оставить
 * сохранённый (сервер разрешает это, только если провайдер и адрес
 * не менялись).
 * Стили — конец frontend/src/index.css, секция «Настройки модели».
 */

import { useEffect, useMemo, useState } from 'react';
import {
  settingsApi,
  type BillingMode,
  type ConnectionTestResult,
  type LLMSettingsInput,
  type LLMSettingsView,
  type ModelPrice,
  type ProviderKind,
  type ProviderPreset,
  type RemoteModel,
} from '../../services/api';
import { formatTokens, formatUsd } from '../../utils/usageFormat';

export interface LLMSettingsModalProps {
  onClose: () => void;
  /** Вызывается после сохранения/сброса с новым состоянием настроек */
  onSaved?: (view: LLMSettingsView) => void;
  /** Показать пояснение «чтобы играть, подключите модель» */
  onboarding?: boolean;
}

interface FormState {
  presetId: string;
  provider: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  lightModel: string;
  billing: BillingMode;
  priceIn: string;
  priceOut: string;
  lightPriceIn: string;
  lightPriceOut: string;
  contextLength: string;
  budget: string;
}

const BILLING_LABELS: Record<BillingMode, string> = {
  payg: 'Оплата за токены (API)',
  subscription: 'Подписка / token plan',
  local: 'Локальная модель (бесплатно)',
};

function numStr(n: number | undefined): string {
  return n === undefined || n === null ? '' : String(n);
}

function formFromPreset(preset: ProviderPreset): FormState {
  return {
    presetId: preset.id,
    provider: preset.provider,
    baseUrl: preset.baseUrl,
    apiKey: '',
    model: preset.model ?? '',
    lightModel: preset.lightModel ?? '',
    billing: preset.billing,
    priceIn: '', priceOut: '', lightPriceIn: '', lightPriceOut: '',
    contextLength: numStr(preset.contextLength),
    budget: '',
  };
}

function formFromView(view: LLMSettingsView): FormState {
  const s = view.settings;
  if (!s) return formFromPreset(view.presets[0]);
  return {
    presetId: s.presetId,
    provider: s.provider,
    baseUrl: s.baseUrl,
    apiKey: '',
    model: s.model,
    lightModel: s.lightModel ?? '',
    billing: s.billing,
    priceIn: numStr(s.pricing?.inputPerM),
    priceOut: numStr(s.pricing?.outputPerM),
    lightPriceIn: numStr(s.lightPricing?.inputPerM),
    lightPriceOut: numStr(s.lightPricing?.outputPerM),
    contextLength: numStr(s.contextLength),
    budget: numStr(s.budgetPerGameUsd),
  };
}

function priceFrom(inp: string, out: string): ModelPrice | undefined {
  if (inp.trim() === '' && out.trim() === '') return undefined;
  return { inputPerM: Number(inp || 0), outputPerM: Number(out || 0) };
}

function toInput(f: FormState): LLMSettingsInput {
  return {
    presetId: f.presetId,
    provider: f.provider,
    baseUrl: f.baseUrl.trim(),
    ...(f.apiKey.trim() ? { apiKey: f.apiKey.trim() } : {}),
    model: f.model.trim(),
    ...(f.lightModel.trim() ? { lightModel: f.lightModel.trim() } : {}),
    billing: f.billing,
    ...(f.billing === 'payg' && priceFrom(f.priceIn, f.priceOut) ? { pricing: priceFrom(f.priceIn, f.priceOut) } : {}),
    ...(f.billing === 'payg' && f.lightModel.trim() && priceFrom(f.lightPriceIn, f.lightPriceOut)
      ? { lightPricing: priceFrom(f.lightPriceIn, f.lightPriceOut) } : {}),
    ...(f.contextLength.trim() ? { contextLength: Number(f.contextLength) } : {}),
    ...(f.budget.trim() ? { budgetPerGameUsd: Number(f.budget) } : {}),
  };
}

export function LLMSettingsModal({ onClose, onSaved, onboarding }: LLMSettingsModalProps) {
  const [view, setView] = useState<LLMSettingsView | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'test' | 'save' | 'models' | 'reset'>('');
  const [testResults, setTestResults] = useState<ConnectionTestResult[] | null>(null);
  const [models, setModels] = useState<RemoteModel[]>([]);
  const [modelsError, setModelsError] = useState('');

  useEffect(() => {
    settingsApi.getLLM()
      .then(v => {
        setView(v);
        setForm(formFromView(v));
      })
      .catch(e => setLoadError(e?.message || 'Не удалось загрузить настройки'));
  }, []);

  // Esc закрывает окно
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const preset = useMemo(
    () => view?.presets.find(p => p.id === form?.presetId) ?? null,
    [view, form?.presetId],
  );

  const saved = view?.settings ?? null;
  /** Сохранённый ключ подойдёт, если провайдер и адрес не менялись */
  const savedKeyUsable = !!saved?.hasApiKey && !!form
    && saved.provider === form.provider
    && saved.baseUrl.replace(/\/+$/, '') === form.baseUrl.trim().replace(/\/+$/, '');

  const update = (patch: Partial<FormState>) => {
    setForm(f => (f ? { ...f, ...patch } : f));
    setTestResults(null);
    setError('');
  };

  const selectPreset = (p: ProviderPreset) => {
    setModels([]);
    setModelsError('');
    setTestResults(null);
    setError('');
    // Вернулись к сохранённому пресету — восстанавливаем его значения
    setForm(saved && saved.presetId === p.id && view ? formFromView(view) : formFromPreset(p));
  };

  /** Выбор модели из списка: подтягиваем цену, если провайдер её знает (OpenRouter) */
  const applyModelPrice = (field: 'model' | 'lightModel', id: string) => {
    const found = models.find(m => m.id === id);
    if (!found?.pricing) return;
    if (field === 'model') {
      update({ model: id, priceIn: String(found.pricing.inputPerM), priceOut: String(found.pricing.outputPerM) });
    } else {
      update({ lightModel: id, lightPriceIn: String(found.pricing.inputPerM), lightPriceOut: String(found.pricing.outputPerM) });
    }
  };

  const loadModels = async () => {
    if (!form) return;
    setBusy('models');
    setModelsError('');
    try {
      const { models: list } = await settingsApi.listModels(toInput(form));
      setModels(list);
      if (list.length === 0) setModelsError('Провайдер вернул пустой список — введите имя модели вручную.');
      // Локальный сервер с одной моделью — сразу её и подставим
      if (list.length === 1 && !form.model) update({ model: list[0].id });
    } catch (e: any) {
      setModelsError(e?.message || 'Не удалось получить список моделей');
    } finally {
      setBusy('');
    }
  };

  const runTest = async () => {
    if (!form) return;
    setBusy('test');
    setError('');
    setTestResults(null);
    try {
      const res = await settingsApi.testLLM(toInput(form));
      setTestResults(res.results);
    } catch (e: any) {
      setError(e?.message || 'Проверка не удалась');
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (!form) return;
    setBusy('save');
    setError('');
    try {
      const v = await settingsApi.saveLLM(toInput(form));
      onSaved?.(v);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить');
      setBusy('');
    }
  };

  const reset = async () => {
    if (!window.confirm('Удалить сохранённые настройки модели (вместе с ключом) и вернуться к llm.config.json / .env?')) return;
    setBusy('reset');
    try {
      const v = await settingsApi.resetLLM();
      setView(v);
      setForm(formFromView(v));
      onSaved?.(v);
    } catch (e: any) {
      setError(e?.message || 'Не удалось сбросить');
    } finally {
      setBusy('');
    }
  };

  const keyPlaceholder = savedKeyUsable
    ? `Сохранён: ${saved!.apiKeyMasked} — оставьте пустым`
    : preset?.keyRequired ? 'Вставьте API-ключ' : 'Не требуется';

  return (
    <div className="llm-modal-overlay" onClick={onClose}>
      <div
        className="llm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="llm-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="llm-modal-header">
          <h2 id="llm-modal-title">Модель ИИ</h2>
          <button type="button" className="llm-modal-close" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>

        {onboarding && (
          <p className="llm-onboarding">
            Чтобы играть, подключите модель: свой API-ключ, подписку или локальный сервер.
            Токены списываются с вашего аккаунта у провайдера, расход виден в игре.
          </p>
        )}

        {loadError && <div className="llm-error">{loadError}</div>}
        {!form || !view ? (
          !loadError && <div className="llm-loading">Загрузка…</div>
        ) : (
          <div className="llm-modal-body">
            <div className="llm-field">
              <span className="llm-label">Провайдер</span>
              <div className="llm-presets">
                {view.presets.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`llm-preset${p.id === form.presetId ? ' active' : ''}${p.billing === 'local' ? ' local' : ''}`}
                    onClick={() => selectPreset(p)}
                    aria-pressed={p.id === form.presetId}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {preset?.hint && <div className="llm-hint">{preset.hint}</div>}
            </div>

            <label className="llm-field">
              <span className="llm-label">
                API-ключ
                {preset?.keyUrl && (
                  <a href={preset.keyUrl} target="_blank" rel="noreferrer noopener" className="llm-link">где взять?</a>
                )}
              </span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={form.apiKey}
                placeholder={keyPlaceholder}
                disabled={!preset?.keyRequired && form.billing === 'local'}
                onChange={e => update({ apiKey: e.target.value })}
              />
              <span className="llm-hint">Ключ хранится только локально, в базе Open-Pax на этом компьютере.</span>
            </label>

            <label className="llm-field">
              <span className="llm-label">Адрес API</span>
              <input
                type="url"
                spellCheck={false}
                value={form.baseUrl}
                placeholder="https://…/v1"
                onChange={e => update({ baseUrl: e.target.value })}
              />
            </label>

            <div className="llm-row">
              <label className="llm-field">
                <span className="llm-label">Основная модель <small>симуляция мира</small></span>
                <input
                  list="llm-models"
                  spellCheck={false}
                  value={form.model}
                  placeholder="например deepseek-v4-pro"
                  onChange={e => { update({ model: e.target.value }); applyModelPrice('model', e.target.value); }}
                />
              </label>
              <label className="llm-field">
                <span className="llm-label">Лёгкая модель <small>подсказки, советник</small></span>
                <input
                  list="llm-models"
                  spellCheck={false}
                  value={form.lightModel}
                  placeholder="та же, что основная"
                  onChange={e => { update({ lightModel: e.target.value }); applyModelPrice('lightModel', e.target.value); }}
                />
              </label>
            </div>
            <datalist id="llm-models">
              {models.map(m => <option key={m.id} value={m.id} />)}
            </datalist>
            <div className="llm-inline">
              <button type="button" className="llm-btn-ghost" onClick={loadModels} disabled={!!busy}>
                {busy === 'models' ? 'Загружаю…' : `Загрузить список моделей${models.length ? ` (${models.length})` : ''}`}
              </button>
              {modelsError && <span className="llm-error-inline">{modelsError}</span>}
            </div>

            <div className="llm-row">
              <label className="llm-field">
                <span className="llm-label">Оплата</span>
                <select value={form.billing} onChange={e => update({ billing: e.target.value as BillingMode })}>
                  {(Object.keys(BILLING_LABELS) as BillingMode[]).map(b => (
                    <option key={b} value={b}>{BILLING_LABELS[b]}</option>
                  ))}
                </select>
              </label>
              {form.provider === 'ollama' ? (
                <label className="llm-field">
                  <span className="llm-label">Контекст, токенов</span>
                  <input
                    type="number"
                    min={2048}
                    step={1024}
                    value={form.contextLength}
                    onChange={e => update({ contextLength: e.target.value })}
                  />
                </label>
              ) : (
                <label className="llm-field">
                  <span className="llm-label">Бюджет на игру, $ <small>предупреждение</small></span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.budget}
                    placeholder="без лимита"
                    onChange={e => update({ budget: e.target.value })}
                  />
                </label>
              )}
            </div>

            {form.billing === 'payg' && (
              <div className="llm-field">
                <span className="llm-label">Цена, $ за 1M токенов (вход / выход)</span>
                <div className="llm-price-grid">
                  <span>Основная</span>
                  <input type="number" min={0} step="any" value={form.priceIn} placeholder="авто" aria-label="Цена входа основной модели"
                    onChange={e => update({ priceIn: e.target.value })} />
                  <input type="number" min={0} step="any" value={form.priceOut} placeholder="авто" aria-label="Цена выхода основной модели"
                    onChange={e => update({ priceOut: e.target.value })} />
                  {form.lightModel.trim() && (
                    <>
                      <span>Лёгкая</span>
                      <input type="number" min={0} step="any" value={form.lightPriceIn} placeholder="авто" aria-label="Цена входа лёгкой модели"
                        onChange={e => update({ lightPriceIn: e.target.value })} />
                      <input type="number" min={0} step="any" value={form.lightPriceOut} placeholder="авто" aria-label="Цена выхода лёгкой модели"
                        onChange={e => update({ lightPriceOut: e.target.value })} />
                    </>
                  )}
                </div>
                <span className="llm-hint">
                  «Авто» — встроенная оценка для известных моделей (DeepSeek, Claude); для остальных будут видны только токены.
                </span>
              </div>
            )}

            {testResults && (
              <div className="llm-test-results">
                {testResults.map(r => (
                  <div key={r.model} className={`llm-test-row ${r.ok ? 'ok' : 'fail'}`}>
                    <span className="llm-test-icon">{r.ok ? '✓' : '✗'}</span>
                    <span className="llm-test-model">{r.model}</span>
                    <span className="llm-test-detail">
                      {r.ok
                        ? `ответ «${r.reply}» за ${(r.latencyMs / 1000).toFixed(1)} с`
                        : r.error}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {error && <div className="llm-error">{error}</div>}

            <div className="llm-usage">
              Израсходовано сегодня: {formatTokens(view.usage.today.inputTokens + view.usage.today.outputTokens)} ток.
              {view.usage.today.costUsd > 0 && ` · ${formatUsd(view.usage.today.costUsd)}`}
              {' · '}всего: {formatTokens(view.usage.allTime.inputTokens + view.usage.allTime.outputTokens)} ток.
              {view.usage.allTime.costUsd > 0 && ` · ${formatUsd(view.usage.allTime.costUsd)}`}
            </div>

            <div className="llm-actions">
              {view.source === 'settings' && (
                <button type="button" className="llm-btn-ghost danger" onClick={reset} disabled={!!busy}>
                  Сбросить
                </button>
              )}
              <div className="llm-actions-right">
                <button type="button" className="llm-btn-secondary" onClick={runTest} disabled={!!busy || !form.model.trim()}>
                  {busy === 'test' ? 'Проверяю…' : 'Проверить'}
                </button>
                <button type="button" className="llm-btn-primary" onClick={save} disabled={!!busy || !form.model.trim()}>
                  {busy === 'save' ? 'Сохраняю…' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LLMSettingsModal;
