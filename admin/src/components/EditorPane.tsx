import Editor from '@monaco-editor/react';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import YAML from 'yaml';

// JavaScript to aggressively remove cookie consent banners
const cookieConsentRemoverJS = `
(function() {
  function removeCookieBanners() {
    // Text patterns that indicate cookie banners
    const cookieTexts = [
      'cookie', 'cookies', 'Cookie Policy', 'use cookies',
      'personalize content', 'tailor and measure ads',
      'gdpr', 'privacy', 'consent', 'Accept all', 'Accept cookies',
      'We use cookies', 'This site uses cookies'
    ];
    
    // Find and remove elements containing cookie-related text that look like banners
    document.querySelectorAll('div, section, aside, footer, [role="dialog"], [role="banner"]').forEach(el => {
      const text = el.innerText || '';
      const isSmall = el.offsetHeight < 400;
      const hasButton = el.querySelector('button');
      const isCookieBanner = cookieTexts.some(t => text.toLowerCase().includes(t.toLowerCase()));
      
      if (isCookieBanner && hasButton && isSmall) {
        // Check if this looks like a popup/overlay (fixed/sticky positioning, high z-index)
        const style = window.getComputedStyle(el);
        const isOverlay = style.position === 'fixed' || style.position === 'sticky' || 
                         parseInt(style.zIndex) > 100 ||
                         el.closest('[style*="position: fixed"]') ||
                         el.closest('[style*="position:fixed"]');
        if (isOverlay) {
          el.remove();
        }
      }
    });
    
    // Common selectors for cookie banners
    const selectors = [
      '#cookie-consent', '#cookie-banner', '#cookie-notice', '#cookieConsent',
      '.cookie-consent', '.cookie-banner', '.cookie-notice', '.cookie-popup',
      '.cc-banner', '.cc-window', '.cc-overlay',
      '#gdpr-consent', '#gdpr-banner', '.gdpr-consent', '.gdpr-banner',
      '#consent-banner', '.consent-banner',
      '#onetrust-consent-sdk', '.onetrust-pc-dark-filter',
      '#CybotCookiebotDialog', '.fc-consent-root', '#qc-cmp2-ui',
      '[data-testid="cookie-policy-manage-dialog"]',
      '[aria-label*="cookie" i]', '[aria-label*="consent" i]'
    ].join(',');
    
    document.querySelectorAll(selectors).forEach(el => el.remove());
    
    // Fix body scroll if locked
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.documentElement.style.overflow = '';
  }
  
  // Run immediately
  removeCookieBanners();
  
  // Run again after delays to catch dynamically loaded banners
  setTimeout(removeCookieBanners, 500);
  setTimeout(removeCookieBanners, 1500);
  setTimeout(removeCookieBanners, 3000);
  
  // Also run on any DOM changes
  const observer = new MutationObserver(() => {
    removeCookieBanners();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Stop observing after 10 seconds to save resources
  setTimeout(() => observer.disconnect(), 10000);
})();
`;
import MarkdownPreview from '@uiw/react-markdown-preview';
import type { Workload } from './Explorer';
import './EditorPane.css';

// Helper to format file sizes
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface InputDefinition {
  type: string;
  required?: boolean;
  description?: string;
  default?: string;
}

interface ParsedWorkload {
  input?: Record<string, InputDefinition>;
}

interface ResultView {
  type: 'result' | 'workload';
  title: string;
  content: string;
  language: string;
  instanceId?: string;
  availableFiles?: FileInfo[];
  currentFile?: string;
}

interface FileInfo {
  name: string;
  size: number;
  type: string;
  isResult: boolean;
  isAsset: boolean;
  isManifest: boolean;
}

export type { ResultView, FileInfo };

interface EditorPaneProps {
  workload: Workload | null;
  yamlContent: string | null;
  onRun: (params: Record<string, string>) => void;
  resultView?: ResultView | null;
  onBackToWorkload?: () => void;
  onYamlChange?: (yaml: string) => void;
  onFileSelect?: (instanceId: string, filename: string) => void;
}

export function EditorPane({ workload, yamlContent, onRun, resultView, onBackToWorkload, onYamlChange, onFileSelect }: EditorPaneProps) {
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [editedYaml, setEditedYaml] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('preview'); // Default to preview for markdown
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [webViewHistory, setWebViewHistory] = useState<string[]>([]);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);

  // Track if content has been modified
  const hasChanges = editedYaml !== null && editedYaml !== yamlContent;

  // Reset edited content when workload changes
  useEffect(() => {
    setEditedYaml(null);
    setSaveMessage(null);
  }, [workload?.id]);

  // Reset web view when result changes
  useEffect(() => {
    setWebViewUrl(null);
    setWebViewHistory([]);
  }, [resultView?.instanceId, resultView?.currentFile]);

  // Inject JavaScript into webview to remove cookie banners
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !webViewUrl) return;

    const handleDomReady = () => {
      // Execute JavaScript to remove cookie banners
      webview.executeJavaScript(cookieConsentRemoverJS).catch(() => {
        // Ignore errors
      });
    };

    webview.addEventListener('dom-ready', handleDomReady);
    return () => {
      webview.removeEventListener('dom-ready', handleDomReady);
    };
  }, [webViewUrl]);

  const handleWebViewBack = useCallback(() => {
    if (webViewHistory.length > 0) {
      const prevUrl = webViewHistory[webViewHistory.length - 1];
      setWebViewHistory(prev => prev.slice(0, -1));
      setWebViewUrl(prevUrl);
    } else {
      setWebViewUrl(null);
    }
  }, [webViewHistory]);

  const handleWebViewClose = useCallback(() => {
    setWebViewUrl(null);
    setWebViewHistory([]);
  }, []);

  // Close web view on Escape key
  useEffect(() => {
    if (!webViewUrl) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleWebViewClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [webViewUrl, handleWebViewClose]);

  // Custom link handler for markdown preview
  const handleLinkClick = useCallback((url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      setWebViewHistory(prev => webViewUrl ? [...prev, webViewUrl] : prev);
      setWebViewUrl(url);
    }
  }, [webViewUrl]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setEditedYaml(value);
      setSaveMessage(null);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!workload || !editedYaml) return;
    
    setIsSaving(true);
    setSaveMessage(null);
    
    try {
      const response = await fetch(`http://localhost:2900/workloads/${workload.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: editedYaml }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to save');
      }
      
      setSaveMessage({ type: 'success', text: 'Saved!' });
      onYamlChange?.(editedYaml);
      setEditedYaml(null); // Reset to match server state
      
      // Clear success message after 2s
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (error) {
      setSaveMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Save failed' 
      });
    } finally {
      setIsSaving(false);
    }
  }, [workload, editedYaml, onYamlChange]);

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && !isSaving) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasChanges, isSaving, handleSave]);

  // Parse YAML to extract input definitions
  const inputDefs = useMemo(() => {
    if (!yamlContent) return {};
    try {
      const parsed = YAML.parse(yamlContent) as ParsedWorkload;
      return parsed.input || {};
    } catch {
      return {};
    }
  }, [yamlContent]);

  // Reset param values when workload changes
  useEffect(() => {
    const defaults: Record<string, string> = {};
    Object.entries(inputDefs).forEach(([key, def]) => {
      defaults[key] = def.default || '';
    });
    setParamValues(defaults);
  }, [inputDefs]);

  const handleParamChange = (key: string, value: string) => {
    setParamValues(prev => ({ ...prev, [key]: value }));
  };

  const handleRun = () => {
    // Only send non-empty values
    const filteredParams: Record<string, string> = {};
    Object.entries(paramValues).forEach(([key, value]) => {
      if (value.trim()) {
        filteredParams[key] = value.trim();
      }
    });
    onRun(filteredParams);
  };

  const hasInputs = Object.keys(inputDefs).length > 0;
  const hasRequiredEmpty = Object.entries(inputDefs).some(
    ([key, def]) => def.required && !paramValues[key]?.trim()
  );

  // Check if current file is markdown
  const isMarkdown = resultView?.language === 'markdown' || resultView?.currentFile?.endsWith('.md');

  // Show result view if active
  if (resultView) {
    const hasMultipleFiles = resultView.availableFiles && resultView.availableFiles.length > 1;
    const viewableFiles = resultView.availableFiles?.filter(f => !f.isManifest) || [];
    
    return (
      <div className="editor-pane">
        <div className="editor-tabs">
          <div className="tab active result-tab">
            <span className="tab-icon">📋</span>
            <span className="tab-name">{resultView.title}</span>
            <button className="tab-close" onClick={onBackToWorkload} title="Close result">
              ✕
            </button>
          </div>
        </div>
        <div className="editor-toolbar result-toolbar">
          <div className="toolbar-left">
            <span className="result-badge">{webViewUrl ? 'WEB' : 'RESULT'}</span>
            <span className="result-title">
              {webViewUrl ? new URL(webViewUrl).hostname : (resultView.currentFile || resultView.title)}
            </span>
          </div>
          <div className="toolbar-right">
            {webViewUrl ? (
              <>
                <button 
                  className="web-nav-btn" 
                  onClick={handleWebViewBack}
                  title={webViewHistory.length > 0 ? 'Go back' : 'Close web view'}
                >
                  ← {webViewHistory.length > 0 ? 'Back' : 'Close'}
                </button>
                <button 
                  className="web-nav-btn web-nav-external" 
                  onClick={() => window.open(webViewUrl, '_blank')}
                  title="Open in external browser"
                >
                  🔗 Open External
                </button>
              </>
            ) : (
              <>
                {isMarkdown && (
                  <div className="view-toggle">
                    <button
                      className={`toggle-btn ${viewMode === 'code' ? 'active' : ''}`}
                      onClick={() => setViewMode('code')}
                      title="View source code"
                    >
                      📝 Code
                    </button>
                    <button
                      className={`toggle-btn ${viewMode === 'preview' ? 'active' : ''}`}
                      onClick={() => setViewMode('preview')}
                      title="Preview rendered markdown"
                    >
                      👁️ Preview
                    </button>
                  </div>
                )}
                <button className="back-btn" onClick={onBackToWorkload}>
                  ← Back to Workload
                </button>
              </>
            )}
          </div>
        </div>
        {!webViewUrl && hasMultipleFiles && (
          <div className="file-tabs">
            {viewableFiles.map(file => (
              <button
                key={file.name}
                className={`file-tab ${resultView.currentFile === file.name ? 'active' : ''}`}
                onClick={() => resultView.instanceId && onFileSelect?.(resultView.instanceId, file.name)}
                title={`${file.name} (${formatFileSize(file.size)})`}
              >
                <span className="file-tab-icon">{file.isResult ? '📄' : '📊'}</span>
                <span className="file-tab-name">{file.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="editor-content">
          {webViewUrl ? (
            <div className="web-view-container">
              <webview
                ref={webviewRef as React.RefObject<Electron.WebviewTag>}
                src={webViewUrl}
                className="web-view-iframe"
              />
            </div>
          ) : isMarkdown && viewMode === 'preview' ? (
            <div className="markdown-preview-container" data-color-mode="dark">
              <MarkdownPreview
                source={resultView.content}
                style={{ padding: 24, background: 'transparent' }}
                components={{
                  a: ({ href, children, ...props }) => (
                    <a
                      {...props}
                      href={href}
                      onClick={(e) => {
                        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                          e.preventDefault();
                          handleLinkClick(href);
                        }
                      }}
                    >
                      {children}
                    </a>
                  ),
                }}
              />
            </div>
          ) : (
            <Editor
              height="100%"
              language={resultView.language}
              theme="vs-dark"
              value={resultView.content}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
              }}
            />
          )}
        </div>
      </div>
    );
  }

  if (!workload) {
    return (
      <div className="editor-pane empty">
        <div className="empty-message">
          <span className="empty-icon">📄</span>
          <h3>No workload selected</h3>
          <p>Select a workload from the Explorer to view its configuration</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-pane">
      <div className="editor-tabs">
        <div className={`tab active ${hasChanges ? 'modified' : ''}`}>
          <span className="tab-icon">📄</span>
          <span className="tab-name">{hasChanges ? '● ' : ''}{workload.name}.yaml</span>
        </div>
      </div>
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <span className="workload-type">{workload.type}</span>
          <span className="workload-name">{workload.name}</span>
          {hasChanges && <span className="modified-indicator">● Modified</span>}
          {saveMessage && (
            <span className={`save-message ${saveMessage.type}`}>
              {saveMessage.text}
            </span>
          )}
        </div>
        <div className="toolbar-right">
          <button 
            className="save-btn" 
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            title={hasChanges ? 'Save changes (Ctrl+S)' : 'No changes to save'}
          >
            {isSaving ? '⏳' : '💾'} Save
          </button>
          <button 
            className="run-btn" 
            onClick={handleRun}
            disabled={hasRequiredEmpty}
            title={hasRequiredEmpty ? 'Fill in required parameters' : 'Run workload'}
          >
            ▶ Run
          </button>
        </div>
      </div>
      {hasInputs && (
        <div className="params-panel">
          <div className="params-header">
            <span className="params-icon">⚙️</span>
            <span>Parameters</span>
          </div>
          <div className="params-form">
            {Object.entries(inputDefs).map(([key, def]) => (
              <div key={key} className="param-field">
                <label className="param-label">
                  {key}
                  {def.required && <span className="required-mark">*</span>}
                </label>
                <input
                  type="text"
                  className="param-input"
                  placeholder={def.description || `Enter ${key}`}
                  value={paramValues[key] || ''}
                  onChange={(e) => handleParamChange(key, e.target.value)}
                />
                {def.description && (
                  <span className="param-hint">{def.description}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="editor-content">
        <Editor
          height="100%"
          defaultLanguage="yaml"
          theme="vs-dark"
          value={editedYaml ?? yamlContent ?? '# Loading...'}
          onChange={handleEditorChange}
          options={{
            readOnly: false,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
}
