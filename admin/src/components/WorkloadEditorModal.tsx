import { useState, useEffect } from 'react';
import YAML from 'yaml';
import './WorkloadEditorModal.css';

// Type for window.ipcRenderer
declare global {
  interface Window {
    ipcRenderer: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
  }
}

// ============ TYPES ============

export type WorkloadType = 'ad-hoc' | 'task' | 'workflow';
export type OutputFormat = 'json' | 'markdown' | 'text';
export type WorkerType = 'fetch-worker' | 'file-worker' | 'ai-worker';
export type InputFieldType = 'string' | 'number' | 'boolean';

export interface InputField {
  type: InputFieldType;
  required?: boolean;
  description?: string;
  default?: string;
}

export interface StepConfig {
  prompt?: string;
  urls?: string[];
  format?: 'rss' | 'json';
  type?: string;
  filter?: string;
  [key: string]: unknown;
}

export interface WorkloadStep {
  id: string;
  name: string;
  worker: WorkerType;
  config: StepConfig;
  input?: string[];
  output: string;
  // Workflow-specific
  dependsOn?: string[];
  condition?: string;
  parallel?: boolean;
}

export interface WorkloadFormData {
  id: string;
  name: string;
  description: string;
  type: WorkloadType;
  version: string;
  tags: string[];
  // Ad-hoc specific
  prompt?: string;
  model?: string;
  outputFormat?: OutputFormat;
  input?: Record<string, InputField>;
  // Task/Workflow specific
  steps?: WorkloadStep[];
}

interface WorkloadEditorModalProps {
  mode: 'create' | 'edit' | 'duplicate';
  workload?: { id: string; name: string; type: string };
  yamlContent?: string;
  onSave: (yaml: string, isNew: boolean) => Promise<void>;
  onClose: () => void;
}

// ============ UTILITIES ============

function generateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'new-workload';
}

function parseYamlToForm(yaml: string): WorkloadFormData | null {
  try {
    const parsed = YAML.parse(yaml);
    return {
      id: parsed.id || '',
      name: parsed.name || '',
      description: parsed.description || '',
      type: parsed.type || 'ad-hoc',
      version: parsed.version || '1.0.0',
      tags: parsed.tags || [],
      prompt: parsed.prompt || '',
      model: parsed.model || '',
      outputFormat: parsed.output?.format || 'text',
      input: parsed.input || {},
      steps: parsed.steps || [],
    };
  } catch {
    return null;
  }
}

function formToYaml(form: WorkloadFormData): string {
  const doc: Record<string, unknown> = {
    id: form.id,
    name: form.name,
    description: form.description,
    type: form.type,
    version: form.version,
  };

  if (form.tags.length > 0) {
    doc.tags = form.tags;
  }

  if (form.type === 'ad-hoc') {
    doc.prompt = form.prompt || '';
    if (form.model) {
      doc.model = form.model;
    }
    if (form.input && Object.keys(form.input).length > 0) {
      doc.input = form.input;
    }
    doc.output = { format: form.outputFormat || 'text' };
  } else {
    // Task or Workflow
    doc.steps = (form.steps || []).map(step => {
      const stepDoc: Record<string, unknown> = {
        id: step.id,
        name: step.name,
        worker: step.worker,
        config: step.config,
      };
      if (step.input && step.input.length > 0) {
        stepDoc.input = step.input;
      }
      stepDoc.output = step.output;
      
      // Workflow-specific fields
      if (form.type === 'workflow') {
        if (step.dependsOn && step.dependsOn.length > 0) {
          stepDoc.dependsOn = step.dependsOn;
        }
        if (step.condition) {
          stepDoc.condition = step.condition;
        }
        if (step.parallel) {
          stepDoc.parallel = step.parallel;
        }
      }
      return stepDoc;
    });
  }

  return YAML.stringify(doc, { indent: 2, lineWidth: 120 });
}

const emptyForm: WorkloadFormData = {
  id: '',
  name: '',
  description: '',
  type: 'ad-hoc',
  version: '1.0.0',
  tags: [],
  prompt: '',
  model: '',
  outputFormat: 'text',
  input: {},
  steps: [],
};

// ============ COMPONENT ============

export function WorkloadEditorModal({ mode, workload: _workload, yamlContent, onSave, onClose }: WorkloadEditorModalProps) {
  const [viewMode, setViewMode] = useState<'form' | 'yaml'>('form');
  const [form, setForm] = useState<WorkloadFormData>(emptyForm);
  const [yamlText, setYamlText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [availableModels, setAvailableModels] = useState<Array<{ value: string; label: string; cost: string }>>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  // Fetch available models on mount
  useEffect(() => {
    async function fetchModels() {
      try {
        const result = await window.ipcRenderer.invoke('get-available-models') as {
          success: boolean;
          models?: Array<{ value: string; label: string; cost: string }>;
          error?: string;
        };
        
        if (result.success && result.models) {
          setAvailableModels(result.models);
        } else {
          console.error('Failed to fetch models:', result.error);
          // Use fallback models
          setAvailableModels([
            { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', cost: '1x' },
            { value: 'claude-opus-4.5', label: 'Claude Opus 4.5', cost: '3x' },
            { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', cost: '0.33x' },
            { value: 'gpt-5.2', label: 'GPT 5.2', cost: '1x' },
            { value: 'gpt-5', label: 'GPT 5', cost: '1x' },
          ]);
        }
      } catch (err) {
        console.error('Error fetching models:', err);
        // Use fallback
        setAvailableModels([
          { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', cost: '1x' },
          { value: 'gpt-5', label: 'GPT 5', cost: '1x' },
        ]);
      } finally {
        setModelsLoading(false);
      }
    }
    
    fetchModels();
  }, []);

  // Parse initial content
  useEffect(() => {
    if (yamlContent && (mode === 'edit' || mode === 'duplicate')) {
      const parsed = parseYamlToForm(yamlContent);
      if (parsed) {
        if (mode === 'duplicate') {
          parsed.id = parsed.id + '-copy';
          parsed.name = parsed.name + ' (Copy)';
        }
        setForm(parsed);
        setYamlText(formToYaml(parsed));
      } else {
        setYamlText(yamlContent);
        setViewMode('yaml');
        setError('Failed to parse YAML - editing in YAML mode only');
      }
    }
  }, [yamlContent, mode]);

  // Sync form changes to YAML
  useEffect(() => {
    if (viewMode === 'form') {
      setYamlText(formToYaml(form));
    }
  }, [form, viewMode]);

  const handleViewModeChange = (newMode: 'form' | 'yaml') => {
    if (newMode === 'form' && viewMode === 'yaml') {
      // Parse YAML to form when switching from YAML to form
      const parsed = parseYamlToForm(yamlText);
      if (parsed) {
        setForm(parsed);
        setError(null);
      } else {
        setError('Invalid YAML syntax - cannot switch to form view');
        return;
      }
    }
    setViewMode(newMode);
  };

  const handleNameChange = (name: string) => {
    setForm(f => ({
      ...f,
      name,
      id: mode === 'create' ? generateId(name) : f.id,
    }));
  };

  const handleTypeChange = (type: WorkloadType) => {
    setForm(f => ({
      ...f,
      type,
      // Reset type-specific fields
      steps: type !== 'ad-hoc' ? (f.steps?.length ? f.steps : []) : [],
    }));
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !form.tags.includes(tagInput.trim())) {
      setForm(f => ({ ...f, tags: [...f.tags, tagInput.trim()] }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));
  };

  const handleInputFieldChange = (key: string, field: InputField | null) => {
    setForm(f => {
      const newInput = { ...f.input };
      if (field === null) {
        delete newInput[key];
      } else {
        newInput[key] = field;
      }
      return { ...f, input: newInput };
    });
  };

  const handleAddInputField = () => {
    const newKey = `param${Object.keys(form.input || {}).length + 1}`;
    handleInputFieldChange(newKey, { type: 'string', required: false });
  };

  const handleAddStep = () => {
    const newStep: WorkloadStep = {
      id: `step-${(form.steps?.length || 0) + 1}`,
      name: `Step ${(form.steps?.length || 0) + 1}`,
      worker: 'ai-worker',
      config: {},
      output: `output-${(form.steps?.length || 0) + 1}.json`,
    };
    setForm(f => ({ ...f, steps: [...(f.steps || []), newStep] }));
  };

  const handleStepChange = (index: number, step: WorkloadStep) => {
    setForm(f => {
      const steps = [...(f.steps || [])];
      steps[index] = step;
      return { ...f, steps };
    });
  };

  const handleRemoveStep = (index: number) => {
    setForm(f => ({
      ...f,
      steps: (f.steps || []).filter((_, i) => i !== index),
    }));
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= (form.steps?.length || 0)) return;
    
    setForm(f => {
      const steps = [...(f.steps || [])];
      [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
      return { ...f, steps };
    });
  };

  const handleSave = async () => {
    setError(null);
    
    // Validation
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!form.id.trim()) {
      setError('ID is required');
      return;
    }
    if (form.type === 'ad-hoc' && !form.prompt?.trim()) {
      setError('Prompt is required for ad-hoc workloads');
      return;
    }
    if ((form.type === 'task' || form.type === 'workflow') && (!form.steps || form.steps.length === 0)) {
      setError('At least one step is required for task/workflow');
      return;
    }

    setSaving(true);
    try {
      const yaml = viewMode === 'yaml' ? yamlText : formToYaml(form);
      await onSave(yaml, mode === 'create' || mode === 'duplicate');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'create' ? 'Create Workload' : mode === 'duplicate' ? 'Duplicate Workload' : 'Edit Workload';
  const typeIcon = form.type === 'ad-hoc' ? '⚡' : form.type === 'task' ? '📋' : '🔄';

  return (
    <div className="workload-editor-overlay" onClick={onClose}>
      <div className="workload-editor-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="workload-editor-header">
          <div className="header-title">
            <span className="header-icon">{typeIcon}</span>
            <h2>{title}</h2>
          </div>
          <div className="header-actions">
            <div className="view-toggle">
              <button
                className={`toggle-btn ${viewMode === 'form' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('form')}
              >
                Form
              </button>
              <button
                className={`toggle-btn ${viewMode === 'yaml' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('yaml')}
              >
                YAML
              </button>
            </div>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="workload-editor-body">
          {viewMode === 'form' ? (
            <div className="form-view">
              {/* Type Selector - only for create mode */}
              {mode === 'create' && (
                <div className="type-selector">
                  <label>Workload Type</label>
                  <div className="type-options">
                    <button
                      className={`type-option ${form.type === 'ad-hoc' ? 'selected' : ''}`}
                      onClick={() => handleTypeChange('ad-hoc')}
                    >
                      <span className="type-option-icon">⚡</span>
                      <span className="type-option-label">Ad-hoc</span>
                      <span className="type-option-desc">Single AI execution</span>
                    </button>
                    <button
                      className={`type-option ${form.type === 'task' ? 'selected' : ''}`}
                      onClick={() => handleTypeChange('task')}
                    >
                      <span className="type-option-icon">📋</span>
                      <span className="type-option-label">Task</span>
                      <span className="type-option-desc">Sequential steps</span>
                    </button>
                    <button
                      className={`type-option ${form.type === 'workflow' ? 'selected' : ''}`}
                      onClick={() => handleTypeChange('workflow')}
                    >
                      <span className="type-option-icon">🔄</span>
                      <span className="type-option-label">Workflow</span>
                      <span className="type-option-desc">Complex with dependencies</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Basic Info */}
              <div className="form-section">
                <h3>Basic Information</h3>
                <div className="form-row">
                  <div className="form-field">
                    <label>Name <span className="required">*</span></label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => handleNameChange(e.target.value)}
                      placeholder="e.g., Weather Report"
                    />
                  </div>
                  <div className="form-field">
                    <label>ID <span className="required">*</span></label>
                    <input
                      type="text"
                      value={form.id}
                      onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                      placeholder="e.g., weather-report"
                      disabled={mode === 'edit'}
                    />
                    <span className="field-hint">Unique identifier (auto-generated from name)</span>
                  </div>
                </div>
                <div className="form-field">
                  <label>Description <span className="required">*</span></label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="What does this workload do?"
                    rows={2}
                  />
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label>Version</label>
                    <input
                      type="text"
                      value={form.version}
                      onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                      placeholder="1.0.0"
                    />
                  </div>
                  <div className="form-field tags-field">
                    <label>Tags</label>
                    <div className="tags-input">
                      <div className="tags-list">
                        {form.tags.map(tag => (
                          <span key={tag} className="tag">
                            {tag}
                            <button onClick={() => handleRemoveTag(tag)}>×</button>
                          </span>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                        placeholder="Add tag..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Ad-hoc specific fields */}
              {form.type === 'ad-hoc' && (
                <>
                  <div className="form-section">
                    <h3>AI Configuration</h3>
                    <div className="form-field">
                      <label>Prompt <span className="required">*</span></label>
                      <textarea
                        value={form.prompt}
                        onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                        placeholder="Enter your AI prompt here. Use {{variable}} for dynamic inputs."
                        rows={6}
                        className="code-textarea"
                      />
                      <span className="field-hint">
                        Use <code>{'{{variable}}'}</code> syntax for dynamic inputs
                      </span>
                    </div>
                    <div className="form-row">
                      <div className="form-field">
                        <label>Model (optional)</label>
                        <select
                          value={form.model || ''}
                          onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                          disabled={modelsLoading}
                        >
                          <option value="">Default (claude-sonnet-4.5)</option>
                          {modelsLoading ? (
                            <option disabled>Loading models...</option>
                          ) : (
                            availableModels.map(model => (
                              <option key={model.value} value={model.value}>
                                {model.label}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                      <div className="form-field">
                        <label>Output Format</label>
                        <select
                          value={form.outputFormat}
                          onChange={e => setForm(f => ({ ...f, outputFormat: e.target.value as OutputFormat }))}
                        >
                          <option value="text">Text</option>
                          <option value="markdown">Markdown</option>
                          <option value="json">JSON</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="form-section">
                    <div className="section-header">
                      <h3>Input Parameters</h3>
                      <button className="add-btn" onClick={handleAddInputField}>+ Add Field</button>
                    </div>
                    {Object.keys(form.input || {}).length === 0 ? (
                      <div className="empty-state">
                        <p>No input parameters defined</p>
                        <p className="hint">Add parameters to make this workload configurable</p>
                      </div>
                    ) : (
                      <div className="input-fields">
                        {Object.entries(form.input || {}).map(([key, field]) => (
                          <InputFieldEditor
                            key={key}
                            fieldKey={key}
                            field={field}
                            onChange={(newKey, newField) => {
                              if (newKey !== key) {
                                // Key changed - remove old, add new
                                handleInputFieldChange(key, null);
                                if (newField) handleInputFieldChange(newKey, newField);
                              } else {
                                handleInputFieldChange(key, newField);
                              }
                            }}
                            onRemove={() => handleInputFieldChange(key, null)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Task/Workflow specific fields */}
              {(form.type === 'task' || form.type === 'workflow') && (
                <div className="form-section">
                  <div className="section-header">
                    <h3>Steps</h3>
                    <button className="add-btn" onClick={handleAddStep}>+ Add Step</button>
                  </div>
                  {(!form.steps || form.steps.length === 0) ? (
                    <div className="empty-state">
                      <p>No steps defined</p>
                      <p className="hint">Add steps to define the execution flow</p>
                    </div>
                  ) : (
                    <div className="steps-list">
                      {form.steps.map((step, index) => (
                        <StepEditor
                          key={step.id}
                          step={step}
                          index={index}
                          isWorkflow={form.type === 'workflow'}
                          availableInputs={form.steps?.slice(0, index).map(s => s.output) || []}
                          availableStepIds={form.steps?.filter((_, i) => i !== index).map(s => s.id) || []}
                          onChange={s => handleStepChange(index, s)}
                          onRemove={() => handleRemoveStep(index)}
                          onMoveUp={() => handleMoveStep(index, 'up')}
                          onMoveDown={() => handleMoveStep(index, 'down')}
                          canMoveUp={index > 0}
                          canMoveDown={index < (form.steps?.length || 0) - 1}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="yaml-view">
              <textarea
                className="yaml-editor"
                value={yamlText}
                onChange={e => setYamlText(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        {error && (
          <div className="workload-editor-error">{error}</div>
        )}
        <div className="workload-editor-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Create Workload'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ SUB-COMPONENTS ============

interface InputFieldEditorProps {
  fieldKey: string;
  field: InputField;
  onChange: (key: string, field: InputField | null) => void;
  onRemove: () => void;
}

function InputFieldEditor({ fieldKey, field, onChange, onRemove }: InputFieldEditorProps) {
  const [localKey, setLocalKey] = useState(fieldKey);

  const handleKeyBlur = () => {
    if (localKey !== fieldKey && localKey.trim()) {
      onChange(localKey.trim(), field);
    }
  };

  return (
    <div className="input-field-editor">
      <div className="input-field-header">
        <input
          type="text"
          className="field-key-input"
          value={localKey}
          onChange={e => setLocalKey(e.target.value)}
          onBlur={handleKeyBlur}
          placeholder="field_name"
        />
        <button className="remove-btn" onClick={onRemove} title="Remove field">🗑️</button>
      </div>
      <div className="input-field-config">
        <select
          value={field.type}
          onChange={e => onChange(fieldKey, { ...field, type: e.target.value as InputFieldType })}
        >
          <option value="string">String</option>
          <option value="number">Number</option>
          <option value="boolean">Boolean</option>
        </select>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={field.required || false}
            onChange={e => onChange(fieldKey, { ...field, required: e.target.checked })}
          />
          Required
        </label>
      </div>
      <input
        type="text"
        placeholder="Description (optional)"
        value={field.description || ''}
        onChange={e => onChange(fieldKey, { ...field, description: e.target.value })}
      />
      <input
        type="text"
        placeholder="Default value (optional)"
        value={field.default || ''}
        onChange={e => onChange(fieldKey, { ...field, default: e.target.value })}
      />
    </div>
  );
}

interface StepEditorProps {
  step: WorkloadStep;
  index: number;
  isWorkflow: boolean;
  availableInputs: string[];
  availableStepIds: string[];
  onChange: (step: WorkloadStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

function StepEditor({
  step,
  index,
  isWorkflow,
  availableInputs,
  availableStepIds,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: StepEditorProps) {
  const [expanded, setExpanded] = useState(true);

  const workerIcon = step.worker === 'ai-worker' ? '🤖' : step.worker === 'fetch-worker' ? '🌐' : '📁';

  return (
    <div className="step-editor">
      <div className="step-header" onClick={() => setExpanded(!expanded)}>
        <span className="step-chevron">{expanded ? '▼' : '▶'}</span>
        <span className="step-icon">{workerIcon}</span>
        <span className="step-number">#{index + 1}</span>
        <span className="step-name">{step.name || 'Unnamed Step'}</span>
        <span className="step-worker">{step.worker}</span>
        <div className="step-actions" onClick={e => e.stopPropagation()}>
          <button className="move-btn" onClick={onMoveUp} disabled={!canMoveUp} title="Move up">↑</button>
          <button className="move-btn" onClick={onMoveDown} disabled={!canMoveDown} title="Move down">↓</button>
          <button className="remove-btn" onClick={onRemove} title="Remove step">🗑️</button>
        </div>
      </div>
      {expanded && (
        <div className="step-body">
          <div className="form-row">
            <div className="form-field">
              <label>Step ID</label>
              <input
                type="text"
                value={step.id}
                onChange={e => onChange({ ...step, id: e.target.value })}
                placeholder="step-id"
              />
            </div>
            <div className="form-field">
              <label>Name</label>
              <input
                type="text"
                value={step.name}
                onChange={e => onChange({ ...step, name: e.target.value })}
                placeholder="Step Name"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Worker</label>
              <select
                value={step.worker}
                onChange={e => onChange({ ...step, worker: e.target.value as WorkerType, config: {} })}
              >
                <option value="ai-worker">🤖 AI Worker</option>
                <option value="fetch-worker">🌐 Fetch Worker</option>
                <option value="file-worker">📁 File Worker</option>
              </select>
            </div>
            <div className="form-field">
              <label>Output File</label>
              <input
                type="text"
                value={step.output}
                onChange={e => onChange({ ...step, output: e.target.value })}
                placeholder="output.json"
              />
            </div>
          </div>

          {/* Worker-specific config */}
          {step.worker === 'ai-worker' && (
            <div className="form-field">
              <label>Prompt</label>
              <textarea
                value={step.config.prompt || ''}
                onChange={e => onChange({ ...step, config: { ...step.config, prompt: e.target.value } })}
                placeholder="AI prompt for this step"
                rows={3}
              />
            </div>
          )}

          {step.worker === 'fetch-worker' && (
            <>
              <div className="form-field">
                <label>URLs (one per line)</label>
                <textarea
                  value={(step.config.urls || []).join('\n')}
                  onChange={e => onChange({
                    ...step,
                    config: { ...step.config, urls: e.target.value.split('\n').filter(u => u.trim()) }
                  })}
                  placeholder="https://example.com/feed.rss"
                  rows={3}
                />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Format</label>
                  <select
                    value={step.config.format || 'json'}
                    onChange={e => onChange({ ...step, config: { ...step.config, format: e.target.value as 'rss' | 'json' } })}
                  >
                    <option value="json">JSON</option>
                    <option value="rss">RSS</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Filter (optional)</label>
                  <input
                    type="text"
                    value={step.config.filter || ''}
                    onChange={e => onChange({ ...step, config: { ...step.config, filter: e.target.value } })}
                    placeholder="Filter expression"
                  />
                </div>
              </div>
            </>
          )}

          {/* Input files from previous steps */}
          {availableInputs.length > 0 && (
            <div className="form-field">
              <label>Input Files</label>
              <div className="input-files-selector">
                {availableInputs.map(input => (
                  <label key={input} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={(step.input || []).includes(input)}
                      onChange={e => {
                        const newInputs = e.target.checked
                          ? [...(step.input || []), input]
                          : (step.input || []).filter(i => i !== input);
                        onChange({ ...step, input: newInputs });
                      }}
                    />
                    {input}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Workflow-specific fields */}
          {isWorkflow && (
            <>
              <div className="form-field">
                <label>Depends On</label>
                <div className="input-files-selector">
                  {availableStepIds.map(id => (
                    <label key={id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={(step.dependsOn || []).includes(id)}
                        onChange={e => {
                          const newDeps = e.target.checked
                            ? [...(step.dependsOn || []), id]
                            : (step.dependsOn || []).filter(d => d !== id);
                          onChange({ ...step, dependsOn: newDeps });
                        }}
                      />
                      {id}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Condition (optional)</label>
                  <input
                    type="text"
                    value={step.condition || ''}
                    onChange={e => onChange({ ...step, condition: e.target.value })}
                    placeholder="steps.fetch.status == 'success'"
                  />
                </div>
                <div className="form-field checkbox-field">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={step.parallel || false}
                      onChange={e => onChange({ ...step, parallel: e.target.checked })}
                    />
                    Can run in parallel
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
