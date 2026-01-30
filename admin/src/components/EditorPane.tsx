import Editor, { OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import YAML, { YAMLParseError } from 'yaml';

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

// Validation error with line information
interface ValidationError {
  message: string;
  path: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

// Find line number for a YAML path like "input.topic.required"
function findLineForPath(yamlContent: string, fieldPath: string): { line: number; column: number; endColumn: number } | null {
  try {
    const doc = YAML.parseDocument(yamlContent);
    const pathParts = fieldPath.split('.');
    
    // Navigate the YAML AST to find the node
    let currentNode: YAML.ParsedNode | null = doc.contents as YAML.ParsedNode;
    
    for (const part of pathParts) {
      if (!currentNode || !('items' in currentNode)) break;
      
      const mapNode = currentNode as YAML.YAMLMap;
      const pair = mapNode.items.find(item => {
        const keyNode = item.key;
        if (YAML.isScalar(keyNode)) {
          return keyNode.value === part;
        }
        return false;
      });
      
      if (pair) {
        currentNode = pair.value as YAML.ParsedNode;
      } else {
        currentNode = null;
      }
    }
    
    if (currentNode && currentNode.range) {
      // Get line/column from the range
      const lines = yamlContent.substring(0, currentNode.range[0]).split('\n');
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;
      
      // Calculate end position
      const endLines = yamlContent.substring(0, currentNode.range[1]).split('\n');
      const endColumn = endLines[endLines.length - 1].length + 1;
      
      return { line, column, endColumn };
    }
  } catch {
    // Fall back to searching by text
  }
  
  // Fallback: search for the last part of the path in the YAML
  const lastPart = fieldPath.split('.').pop() || fieldPath;
  const lines = yamlContent.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const lineContent = lines[i];
    const match = lineContent.match(new RegExp(`^\\s*${lastPart}\\s*:`));
    if (match) {
      const colonIndex = lineContent.indexOf(':');
      const valueStart = colonIndex + 2;
      const valueEnd = lineContent.length;
      return { line: i + 1, column: valueStart, endColumn: valueEnd + 1 };
    }
  }
  
  return null;
}

// Parse validation response to extract structured errors
function parseValidationErrors(yamlContent: string, errorDetails: string): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Parse error lines like "  • input.topic.required: Expected boolean, received string"
  const errorRegex = /•\s*([^:]+):\s*(.+)/g;
  let match;
  
  while ((match = errorRegex.exec(errorDetails)) !== null) {
    const path = match[1].trim();
    const message = match[2].trim();
    
    const location = findLineForPath(yamlContent, path);
    
    errors.push({
      message: `${path}: ${message}`,
      path,
      line: location?.line || 1,
      column: location?.column || 1,
      endColumn: location?.endColumn,
    });
  }
  
  return errors;
}

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
  onCloseWorkload?: () => void;
  onEditWorkload?: (workload: Workload) => void;
  onWorkloadSaved?: () => void;
}

export function EditorPane({ workload, yamlContent, onRun, resultView, onBackToWorkload, onYamlChange, onFileSelect, onCloseWorkload, onEditWorkload, onWorkloadSaved }: EditorPaneProps) {
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [editedYaml, setEditedYaml] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('preview'); // Default to preview for markdown
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [webViewHistory, setWebViewHistory] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const monacoRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoInstanceRef = useRef<typeof Monaco | null>(null);

  // Track if content has been modified
  const hasChanges = editedYaml !== null && editedYaml !== yamlContent;

  // Reset edited content when workload changes
  useEffect(() => {
    setEditedYaml(null);
    setSaveMessage(null);
    setValidationErrors([]);
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
      onWorkloadSaved?.(); // Refresh explorer to update validation indicators
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
  }, [workload, editedYaml, onYamlChange, onWorkloadSaved]);

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

  // Monaco editor mount handler
  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    monacoRef.current = editor;
    monacoInstanceRef.current = monaco;
  }, []);

  // Validate YAML content and set markers
  const validateContent = useCallback(async (content: string) => {
    if (!workload || !monacoRef.current || !monacoInstanceRef.current) return;
    
    const monaco = monacoInstanceRef.current;
    const model = monacoRef.current.getModel();
    if (!model) return;
    
    const errors: ValidationError[] = [];
    
    // First, check YAML syntax
    try {
      YAML.parse(content);
    } catch (e) {
      if (e instanceof YAMLParseError) {
        const pos = e.linePos?.[0] || { line: 1, col: 1 };
        errors.push({
          message: e.message.split('\n')[0], // First line of error message
          path: 'syntax',
          line: pos.line,
          column: pos.col,
          endColumn: pos.col + 10,
        });
      }
    }
    
    // If no syntax errors, validate schema via backend
    if (errors.length === 0) {
      try {
        const response = await fetch(`http://localhost:2900/workloads/${workload.id}/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ yaml: content }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          if (errorData.details) {
            const schemaErrors = parseValidationErrors(content, errorData.details);
            errors.push(...schemaErrors);
          }
        }
      } catch {
        // Network error - skip validation
      }
    }
    
    // Set Monaco markers
    const markers: Monaco.editor.IMarkerData[] = errors.map(err => ({
      severity: monaco.MarkerSeverity.Error,
      message: err.message,
      startLineNumber: err.line,
      startColumn: err.column,
      endLineNumber: err.endLine || err.line,
      endColumn: err.endColumn || err.column + 20,
    }));
    
    monaco.editor.setModelMarkers(model, 'workload-validation', markers);
    setValidationErrors(errors);
  }, [workload]);

  // Debounced validation on content change
  useEffect(() => {
    const content = editedYaml ?? yamlContent;
    // Skip validation if:
    // - No content or workload
    // - Content is still loading
    // - Result view is active
    if (!content || !workload || content === '# Loading...' || resultView) {
      setValidationErrors([]);
      return;
    }
    
    const timeoutId = setTimeout(() => {
      validateContent(content);
    }, 500); // Debounce 500ms
    
    return () => clearTimeout(timeoutId);
  }, [editedYaml, yamlContent, workload, validateContent, resultView]);

  // Clear markers when workload changes
  useEffect(() => {
    if (monacoRef.current && monacoInstanceRef.current) {
      const model = monacoRef.current.getModel();
      if (model) {
        monacoInstanceRef.current.editor.setModelMarkers(model, 'workload-validation', []);
      }
    }
    setValidationErrors([]);
  }, [workload?.id]);

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
          <button className="tab-close" onClick={onCloseWorkload} title="Close workload">
            ✕
          </button>
        </div>
      </div>
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <span className="workload-type">{workload.type}</span>
          <span className="workload-name">{workload.name}</span>
          {hasChanges && <span className="modified-indicator">● Modified</span>}
          {validationErrors.length > 0 && (
            <span className="validation-error-badge" title={validationErrors.map(e => e.message).join('\n')}>
              ⚠️ {validationErrors.length} {validationErrors.length === 1 ? 'error' : 'errors'}
            </span>
          )}
          {saveMessage && (
            <span className={`save-message ${saveMessage.type}`}>
              {saveMessage.text}
            </span>
          )}
        </div>
        <div className="toolbar-right">
          <button 
            className="edit-btn" 
            onClick={() => workload && onEditWorkload?.(workload)}
            title="Edit workload properties"
          >
            ✏️ Edit
          </button>
          <button 
            className="save-btn" 
            onClick={handleSave}
            disabled={!hasChanges || isSaving || validationErrors.length > 0}
            title={validationErrors.length > 0 ? `Fix ${validationErrors.length} validation error(s) first` : hasChanges ? 'Save changes (Ctrl+S)' : 'No changes to save'}
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
          key={workload.id}
          height="100%"
          defaultLanguage="yaml"
          theme="vs-dark"
          value={editedYaml ?? yamlContent ?? '# Loading...'}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
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
      {validationErrors.length > 0 && (
        <div className="validation-panel">
          <div className="validation-header">
            <span className="validation-icon">⚠️</span>
            <span>Problems ({validationErrors.length})</span>
          </div>
          <div className="validation-list">
            {validationErrors.map((err, i) => (
              <div 
                key={i} 
                className="validation-item"
                onClick={() => {
                  // Jump to error line in editor
                  if (monacoRef.current) {
                    monacoRef.current.setPosition({ lineNumber: err.line, column: err.column });
                    monacoRef.current.focus();
                    monacoRef.current.revealLineInCenter(err.line);
                  }
                }}
                title="Click to go to error"
              >
                <span className="error-icon">❌</span>
                <span className="error-message">{err.message}</span>
                <span className="error-location">Ln {err.line}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
