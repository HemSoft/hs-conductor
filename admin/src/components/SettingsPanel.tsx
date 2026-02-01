import { useState, useEffect, useCallback } from 'react';
import './SettingsPanel.css';

interface Config {
  env: string;
  server: {
    port: number;
    corsOrigin: string;
  };
  inngest: {
    baseUrl: string;
    eventKey?: string;
    signingKey?: string;
  };
  ai: {
    defaultModel: string;
    useMock: boolean;
    concurrency: number;
    retries: number;
  };
  paths: {
    data: string;
    workloads: string;
    skills?: string | string[];
    allowedWritePath?: string;
  };
  logging: {
    level: string;
    timestamps: boolean;
    colors: boolean;
  };
  workers: {
    exec: {
      timeout: number;
      shell: string;
    };
    fetch: {
      timeout: number;
      userAgent: string;
    };
  };
}

interface SettingsSectionProps {
  title: string;
  icon: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function SettingsSection({ title, icon, children, defaultOpen = true }: SettingsSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="settings-section">
      <button
        className={`settings-section-header ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="settings-section-icon">{icon}</span>
        <span className="settings-section-title">{title}</span>
        <span className="settings-section-chevron">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && <div className="settings-section-content">{children}</div>}
    </div>
  );
}

interface SettingItemProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingItem({ label, description, children }: SettingItemProps) {
  return (
    <div className="setting-item">
      <div className="setting-item-label">
        <span className="setting-label-text">{label}</span>
        {description && <span className="setting-description">{description}</span>}
      </div>
      <div className="setting-item-control">{children}</div>
    </div>
  );
}

export function SettingsPanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:2900/config');
      if (!response.ok) throw new Error('Failed to fetch configuration');
      const data = await response.json();
      setConfig(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  if (loading) {
    return (
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
        </div>
        <div className="settings-loading">Loading configuration...</div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
        </div>
        <div className="settings-error">
          <span className="error-icon">⚠️</span>
          <span>{error || 'Configuration not available'}</span>
          <button onClick={fetchConfig} className="retry-button">Retry</button>
        </div>
      </div>
    );
  }

  const formatSkillFolders = (skills: string | string[] | undefined): string => {
    if (!skills) return '~/.claude/skills (default)';
    if (Array.isArray(skills)) return skills.join(', ');
    return skills;
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>Settings</h2>
        <span className="env-badge">{config.env}</span>
      </div>
      
      <div className="settings-content">
        <SettingsSection title="Server" icon="🌐">
          <SettingItem label="Port" description="HTTP server port">
            <span className="setting-value">{config.server.port}</span>
          </SettingItem>
          <SettingItem label="CORS Origin" description="Allowed origins for cross-origin requests">
            <span className="setting-value">{config.server.corsOrigin}</span>
          </SettingItem>
        </SettingsSection>

        <SettingsSection title="Inngest" icon="⚡">
          <SettingItem label="Base URL" description="Inngest dashboard/API URL">
            <span className="setting-value">{config.inngest.baseUrl}</span>
          </SettingItem>
          <SettingItem label="Event Key" description="Authentication key">
            <span className="setting-value setting-secret">
              {config.inngest.eventKey ? '••••••••' : 'Not set'}
            </span>
          </SettingItem>
        </SettingsSection>

        <SettingsSection title="AI / LLM" icon="🤖">
          <SettingItem label="Default Model" description="Model used for AI workers">
            <span className="setting-value">{config.ai.defaultModel}</span>
          </SettingItem>
          <SettingItem label="Mock Mode" description="Use mock AI responses">
            <span className={`setting-value ${config.ai.useMock ? 'setting-enabled' : 'setting-disabled'}`}>
              {config.ai.useMock ? 'Enabled' : 'Disabled'}
            </span>
          </SettingItem>
          <SettingItem label="Concurrency" description="Max parallel AI requests">
            <span className="setting-value">{config.ai.concurrency}</span>
          </SettingItem>
          <SettingItem label="Retries" description="Failed request retry count">
            <span className="setting-value">{config.ai.retries}</span>
          </SettingItem>
        </SettingsSection>

        <SettingsSection title="Paths" icon="📁">
          <SettingItem label="Data Directory" description="Storage for runs, alerts, schedules">
            <span className="setting-value setting-path">{config.paths.data}</span>
          </SettingItem>
          <SettingItem label="Workloads Directory" description="Workload YAML files location">
            <span className="setting-value setting-path">{config.paths.workloads}</span>
          </SettingItem>
          <SettingItem label="Skill Folders" description="Claude skill locations">
            <span className="setting-value setting-path">{formatSkillFolders(config.paths.skills)}</span>
          </SettingItem>
          <SettingItem label="Allowed Write Path" description="AI tool write sandbox">
            <span className="setting-value setting-path">
              {config.paths.allowedWritePath || './data (default)'}
            </span>
          </SettingItem>
        </SettingsSection>

        <SettingsSection title="Logging" icon="📝" defaultOpen={false}>
          <SettingItem label="Log Level" description="Verbosity level">
            <span className={`setting-value setting-level-${config.logging.level}`}>
              {config.logging.level}
            </span>
          </SettingItem>
          <SettingItem label="Timestamps" description="Include timestamps in logs">
            <span className={`setting-value ${config.logging.timestamps ? 'setting-enabled' : 'setting-disabled'}`}>
              {config.logging.timestamps ? 'Enabled' : 'Disabled'}
            </span>
          </SettingItem>
          <SettingItem label="Colors" description="Colorized console output">
            <span className={`setting-value ${config.logging.colors ? 'setting-enabled' : 'setting-disabled'}`}>
              {config.logging.colors ? 'Enabled' : 'Disabled'}
            </span>
          </SettingItem>
        </SettingsSection>

        <SettingsSection title="Workers" icon="⚙️" defaultOpen={false}>
          <div className="settings-subsection">
            <h4>Exec Worker</h4>
            <SettingItem label="Timeout" description="Command timeout (ms)">
              <span className="setting-value">{config.workers.exec.timeout.toLocaleString()}ms</span>
            </SettingItem>
            <SettingItem label="Shell" description="Default shell for commands">
              <span className="setting-value">{config.workers.exec.shell}</span>
            </SettingItem>
          </div>
          <div className="settings-subsection">
            <h4>Fetch Worker</h4>
            <SettingItem label="Timeout" description="HTTP request timeout (ms)">
              <span className="setting-value">{config.workers.fetch.timeout.toLocaleString()}ms</span>
            </SettingItem>
            <SettingItem label="User Agent" description="HTTP User-Agent header">
              <span className="setting-value">{config.workers.fetch.userAgent}</span>
            </SettingItem>
          </div>
        </SettingsSection>

        <div className="settings-footer">
          <p className="settings-info">
            Configuration is loaded from <code>config.yaml</code> and can be overridden with environment variables.
          </p>
          <p className="settings-info">
            See <code>src/lib/config.ts</code> for all available options and environment variable mappings.
          </p>
        </div>
      </div>
    </div>
  );
}
