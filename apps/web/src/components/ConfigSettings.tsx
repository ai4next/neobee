import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../styles/ConfigSettings.css';

interface StageProvider {
  stage: string;
  provider: string;
  apiKey: string;
  model: string;
  temperature?: number;
  baseURL?: string;
}

interface Config {
  providers: StageProvider[];
}

const STAGES = [
  { id: 'default', name: 'Default' },
  { id: 'deep_research', name: 'Deep Research' },
  { id: 'expert_creation', name: 'Expert Synthesis' },
  { id: 'insight_refinement', name: 'Insight Refinement' },
  { id: 'cross_review', name: 'Cross Review' },
  { id: 'idea_synthesis', name: 'Idea Synthesis' }
];

const PROVIDER_OPTIONS = [
  { id: 'anthropic', name: 'Anthropic Claude' },
  { id: 'openai', name: 'OpenAI GPT' },
  { id: 'openrouter', name: 'OpenRouter' }
];

interface ConfigSettingsProps {
  onClose?: () => void;
}

export function ConfigSettings({ onClose }: ConfigSettingsProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<Config>({ providers: [] });
  const [searchProvider, setSearchProvider] = useState('duckduckgo');
  const [searchApiKey, setSearchApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        if (data.providers && data.providers.length > 0) {
          setConfig(data);
        } else {
          setConfig({ providers: [{ stage: 'default', provider: 'anthropic', apiKey: '', model: 'claude-sonnet-4-7', temperature: 0.7, baseURL: '' }] });
        }
        setSearchProvider(data.searchProvider || 'duckduckgo');
        setSearchApiKey(data.searchApiKey || '');
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, searchProvider, searchApiKey })
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Config saved successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save config' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save config' });
    } finally {
      setSaving(false);
    }
  }

  function updateProvider(index: number, field: keyof StageProvider, value: string) {
    setConfig((prev) => {
      const newProviders = [...prev.providers];
      newProviders[index] = { ...newProviders[index], [field]: value };
      return { ...prev, providers: newProviders };
    });
  }

  function addProvider() {
    const usedStages = config.providers.map((p) => p.stage);
    const availableStages = STAGES.filter((s) => !usedStages.includes(s.id));
    if (availableStages.length === 0) return;

    const firstAvailable = availableStages[0].id;
    setConfig((prev) => ({
      ...prev,
      providers: [...prev.providers, { stage: firstAvailable, provider: 'anthropic', apiKey: '', model: 'claude-sonnet-4-7', temperature: 0.7, baseURL: '' }]
    }));
  }

  function removeProvider(index: number) {
    setConfig((prev) => ({
      ...prev,
      providers: prev.providers.filter((_, i) => i !== index)
    }));
  }

  function getAvailableStages(currentIndex: number) {
    const usedStages = config.providers
      .map((p, i) => (i === currentIndex ? null : p.stage))
      .filter(Boolean) as string[];
    return STAGES.filter((s) => !usedStages.includes(s.id));
  }

  return (
    <div className="nb-system-config">
      <div className="nb-config-header">
        <div className="nb-config-actions">
          <button className="nb-config-btn secondary" onClick={loadConfig} disabled={loading}>
            {loading ? t('loading') || 'Loading...' : t('load') || 'Load'}
          </button>
          <button className="nb-config-btn primary" onClick={saveConfig} disabled={saving}>
            {saving ? t('saving') || 'Saving...' : t('save') || 'Save'}
          </button>
        </div>
        {onClose && (
          <button className="nb-config-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {message && (
        <div className={`nb-config-message ${message.type}`}>{message.text}</div>
      )}

      <div className="nb-config-providers">
        {config.providers.map((provider, index) => {
          const availableStages = getAvailableStages(index);
          return (
            <div key={index} className="nb-config-provider">
              <h4>{t('modelConfig') || 'Model Configuration'}</h4>
              <div className="nb-provider-header">
                <select
                  value={provider.stage}
                  onChange={(e) => updateProvider(index, 'stage', e.target.value)}
                  className="nb-provider-select"
                >
                  {availableStages.map((s) => (
                    <option key={s.id} value={s.id}>{s.id === 'default' ? t('default') || 'Default' : t(s.id)}</option>
                  ))}
                </select>
                <select
                  value={provider.provider}
                  onChange={(e) => updateProvider(index, 'provider', e.target.value)}
                  className="nb-provider-select"
                >
                  {PROVIDER_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button className="nb-config-btn danger small" onClick={() => removeProvider(index)}>
                  {t('remove') || 'Remove'}
                </button>
              </div>

              <div className="nb-provider-fields">
                <label className="nb-field">
                  <span>Base URL</span>
                  <input
                    type="text"
                    value={provider.baseURL || ''}
                    onChange={(e) => updateProvider(index, 'baseURL', e.target.value)}
                    placeholder="https://api.anthropic.com"
                  />
                </label>
                <label className="nb-field">
                  <span>API Key</span>
                  <input
                    type="password"
                    value={provider.apiKey}
                    onChange={(e) => updateProvider(index, 'apiKey', e.target.value)}
                    placeholder="sk-..."
                  />
                </label>
                <label className="nb-field">
                  <span>{t('model')}</span>
                  <input
                    type="text"
                    value={provider.model}
                    onChange={(e) => updateProvider(index, 'model', e.target.value)}
                    placeholder="e.g. claude-sonnet-4-7"
                  />
                </label>
                <label className="nb-field">
                  <span>Temperature</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={provider.temperature ?? 0.7}
                    onChange={(e) => updateProvider(index, 'temperature', e.target.value)}
                    placeholder="0.7"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {config.providers.length < STAGES.length && (
        <button className="nb-config-btn add" onClick={addProvider}>
          + {t('addProvider') || 'Add Stage Config'}
        </button>
      )}

      {/* Search Engine Configuration */}
      <div className="nb-search-section">
        <h4>{t('searchEngine') || 'Search Engine'}</h4>

        <div className="nb-search-controls">
          <select
            value={searchProvider}
            onChange={(e) => setSearchProvider(e.target.value)}
            className="nb-provider-select"
          >
            <option value="duckduckgo">{t('duckduckgo') || 'DuckDuckGo'}</option>
            <option value="tavily">{t('tavily') || 'Tavily'}</option>
            <option value="llm">{t('llm') || 'LLM (LLM-based)'}</option>
          </select>
        </div>

        {searchProvider === 'tavily' && (
          <div className="nb-search-apikey">
            <label className="nb-field">
              <span>{t('apiKey') || 'API Key'}</span>
              <input
                type="password"
                value={searchApiKey}
                onChange={(e) => setSearchApiKey(e.target.value)}
                placeholder={t('tavilyApiKeyPlaceholder') || 'Enter your Tavily API key'}
              />
            </label>
          </div>
        )}

        {searchProvider === 'tavily' && (
          <p className="nb-search-hint">
            {t('tavilyHint') || 'The API key will be saved to config and used for search requests'}
          </p>
        )}
      </div>
    </div>
  );
}
