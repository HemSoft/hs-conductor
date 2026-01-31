import { useEffect, useState, forwardRef, useImperativeHandle, useRef, useCallback, useLayoutEffect } from 'react';
import { Allotment } from 'allotment';
import YAML from 'yaml';
import { 
  Zap, ClipboardList, GitBranch, Package, FileText, 
  Play, Pause, ChevronDown, ChevronRight, Calendar, AlertTriangle, AlertCircle
} from 'lucide-react';
import { CronBuilder } from './CronBuilder';
import './Explorer.css';

// Smart positioning hook for context menus
function useContextMenuPosition(
  visible: boolean,
  initialX: number,
  initialY: number,
  menuRef: React.RefObject<HTMLDivElement | null>
): { x: number; y: number } {
  const [position, setPosition] = useState({ x: initialX, y: initialY });

  useLayoutEffect(() => {
    if (!visible || !menuRef.current) {
      setPosition({ x: initialX, y: initialY });
      return;
    }

    const menu = menuRef.current;
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8; // Keep some distance from edges

    let x = initialX;
    let y = initialY;

    // Flip horizontally if menu would overflow right edge
    if (x + menuRect.width > viewportWidth - padding) {
      x = Math.max(padding, x - menuRect.width);
    }

    // Flip vertically if menu would overflow bottom edge
    if (y + menuRect.height > viewportHeight - padding) {
      y = Math.max(padding, y - menuRect.height);
    }

    setPosition({ x, y });
  }, [visible, initialX, initialY, menuRef]);

  return position;
}

export interface Workload {
  id: string;
  name: string;
  type: string;
  description?: string;
  validationErrors?: string[];
  validationWarnings?: string[];
}

export interface Schedule {
  id: string;
  name: string;
  workloadId: string;
  cron?: string | null;
  interval?: string | null;
  enabled: boolean;
  params?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface InputDefinition {
  type: string;
  required?: boolean;
  description?: string;
  default?: string;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

interface NewScheduleForm {
  name: string;
  workloadId: string;
  cron: string;
  enabled: boolean;
}

interface ExplorerProps {
  onWorkloadSelect: (workload: Workload) => void;
  selectedWorkload: Workload | null;
  onScheduleSelect?: (schedule: Schedule) => void;
  selectedSchedule?: Schedule | null;
  onCreateWorkload?: () => void;
  onEditWorkload?: (workload: Workload) => void;
  onDuplicateWorkload?: (workload: Workload) => void;
  onDeleteWorkload?: (workload: Workload) => void;
  runningWorkloadIds?: Set<string>;
}

export interface ExplorerRef {
  refresh: () => void;
  refreshSchedules: () => void;
}

export const Explorer = forwardRef<ExplorerRef, ExplorerProps>(function Explorer(
  { onWorkloadSelect, selectedWorkload, onScheduleSelect, selectedSchedule, onCreateWorkload, onEditWorkload, onDuplicateWorkload, onDeleteWorkload, runningWorkloadIds },
  ref
) {
  const [workloads, setWorkloads] = useState<Workload[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(['ad-hoc', 'task', 'workflow']));
  const [schedulesExpanded, setSchedulesExpanded] = useState(true);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const scheduleContextMenuRef = useRef<HTMLDivElement>(null);
  
  // Add schedule modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [newSchedule, setNewSchedule] = useState<NewScheduleForm>({
    name: '',
    workloadId: '',
    cron: '0 * * * *',
    enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Schedule context menu state
  const [scheduleContextMenu, setScheduleContextMenu] = useState<ContextMenuState & { schedule?: Schedule }>({ visible: false, x: 0, y: 0 });
  
  // Workload context menu state
  const [workloadContextMenu, setWorkloadContextMenu] = useState<ContextMenuState & { workload?: Workload }>({ visible: false, x: 0, y: 0 });
  const workloadContextMenuRef = useRef<HTMLDivElement>(null);
  
  // Use smart positioning for context menus to avoid clipping
  const contextMenuPos = useContextMenuPosition(contextMenu.visible, contextMenu.x, contextMenu.y, contextMenuRef);
  const scheduleContextMenuPos = useContextMenuPosition(scheduleContextMenu.visible, scheduleContextMenu.x, scheduleContextMenu.y, scheduleContextMenuRef);
  const workloadContextMenuPos = useContextMenuPosition(workloadContextMenu.visible, workloadContextMenu.x, workloadContextMenu.y, workloadContextMenuRef);
  
  // Workload input parameters state
  const [workloadInputDefs, setWorkloadInputDefs] = useState<Record<string, InputDefinition>>({});
  const [scheduleParams, setScheduleParams] = useState<Record<string, string>>({});
  const [loadingInputs, setLoadingInputs] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Pane sizes (persisted to localStorage)
  const [explorerPaneSizes, setExplorerPaneSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem('conductor-explorer-pane-sizes');
    return saved ? JSON.parse(saved) : [400, 150];
  });
  const explorerPaneSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save explorer pane sizes when changed (debounced)
  const handleExplorerPaneChange = useCallback((sizes: number[]) => {
    setExplorerPaneSizes(sizes);
    // Debounce localStorage writes
    if (explorerPaneSaveTimeoutRef.current) {
      clearTimeout(explorerPaneSaveTimeoutRef.current);
    }
    explorerPaneSaveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem('conductor-explorer-pane-sizes', JSON.stringify(sizes));
    }, 300);
  }, []);

  // Callback for CronBuilder
  const handleCronChange = useCallback((cron: string) => {
    setNewSchedule(s => ({ ...s, cron }));
  }, []);

  const fetchWorkloads = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('http://localhost:2900/workloads');
      if (!response.ok) throw new Error('Failed to fetch workloads');
      const data = await response.json();
      setWorkloads(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedules = async () => {
    try {
      const response = await fetch('http://localhost:2900/schedules');
      if (!response.ok) throw new Error('Failed to fetch schedules');
      const data = await response.json();
      setSchedules(data);
    } catch (err) {
      console.error('Failed to fetch schedules:', err);
    }
  };

  useEffect(() => {
    fetchWorkloads();
    fetchSchedules();
  }, []);

  useImperativeHandle(ref, () => ({
    refresh: fetchWorkloads,
    refreshSchedules: fetchSchedules,
  }));

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInsideContextMenu = contextMenuRef.current?.contains(target);
      const clickedInsideScheduleContextMenu = scheduleContextMenuRef.current?.contains(target);
      const clickedInsideWorkloadContextMenu = workloadContextMenuRef.current?.contains(target);
      
      if (!clickedInsideContextMenu && !clickedInsideScheduleContextMenu && !clickedInsideWorkloadContextMenu) {
        setContextMenu({ visible: false, x: 0, y: 0 });
        setScheduleContextMenu({ visible: false, x: 0, y: 0 });
        setWorkloadContextMenu({ visible: false, x: 0, y: 0 });
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch workload input definitions when workloadId changes
  useEffect(() => {
    if (!newSchedule.workloadId) {
      setWorkloadInputDefs({});
      // Only clear params when not editing
      if (!editingSchedule) {
        setScheduleParams({});
      }
      return;
    }

    const fetchWorkloadInputs = async () => {
      setLoadingInputs(true);
      try {
        const response = await fetch(`http://localhost:2900/workloads/${newSchedule.workloadId}`);
        if (!response.ok) throw new Error('Failed to fetch workload');
        const data = await response.json();
        
        // Parse YAML to get input definitions
        if (data.yaml) {
          const parsed = YAML.parse(data.yaml);
          const inputs: Record<string, InputDefinition> = parsed.input || {};
          setWorkloadInputDefs(inputs);
          
          // Only initialize params with defaults when creating (not editing)
          if (!editingSchedule) {
            const defaults: Record<string, string> = {};
            for (const [key, def] of Object.entries(inputs)) {
              if (def.default !== undefined) {
                defaults[key] = def.default;
              }
            }
            setScheduleParams(defaults);
          }
        } else {
          setWorkloadInputDefs({});
          if (!editingSchedule) {
            setScheduleParams({});
          }
        }
      } catch (err) {
        console.error('Failed to fetch workload inputs:', err);
        setWorkloadInputDefs({});
        if (!editingSchedule) {
          setScheduleParams({});
        }
      } finally {
        setLoadingInputs(false);
      }
    };

    fetchWorkloadInputs();
  }, [newSchedule.workloadId, editingSchedule]);

  const handleScheduleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleAddSchedule = () => {
    setContextMenu({ visible: false, x: 0, y: 0 });
    setEditingSchedule(null);
    setNewSchedule({
      name: '',
      workloadId: '',
      cron: '0 * * * *',
      enabled: true,
    });
    setWorkloadInputDefs({});
    setScheduleParams({});
    setFormError(null);
    setShowAddModal(true);
  };

  const handleEditSchedule = (schedule: Schedule) => {
    setContextMenu({ visible: false, x: 0, y: 0 });
    setScheduleContextMenu({ visible: false, x: 0, y: 0 });
    setEditingSchedule(schedule);
    setNewSchedule({
      name: schedule.name,
      workloadId: schedule.workloadId,
      cron: schedule.cron || '0 * * * *',
      enabled: schedule.enabled,
    });
    // Set params from schedule
    setScheduleParams((schedule.params || {}) as Record<string, string>);
    setFormError(null);
    setShowAddModal(true);
  };

  const handleDeleteSchedule = async (schedule: Schedule) => {
    setScheduleContextMenu({ visible: false, x: 0, y: 0 });
    
    if (!confirm(`Delete schedule "${schedule.name}"?`)) {
      return;
    }
    
    setDeleting(true);
    try {
      const response = await fetch(`http://localhost:2900/schedules/${schedule.id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete schedule');
      }
      
      fetchSchedules();
    } catch (err) {
      console.error('Failed to delete schedule:', err);
      alert('Failed to delete schedule');
    } finally {
      setDeleting(false);
    }
  };

  const handleScheduleItemContextMenu = (e: React.MouseEvent, schedule: Schedule) => {
    e.preventDefault();
    e.stopPropagation();
    setScheduleContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      schedule,
    });
  };

  const handleWorkloadItemContextMenu = (e: React.MouseEvent, workload: Workload) => {
    e.preventDefault();
    e.stopPropagation();
    setWorkloadContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      workload,
    });
  };

  const handleWorkloadEdit = () => {
    if (workloadContextMenu.workload && onEditWorkload) {
      onEditWorkload(workloadContextMenu.workload);
    }
    setWorkloadContextMenu({ visible: false, x: 0, y: 0 });
  };

  const handleWorkloadDuplicate = () => {
    if (workloadContextMenu.workload && onDuplicateWorkload) {
      onDuplicateWorkload(workloadContextMenu.workload);
    }
    setWorkloadContextMenu({ visible: false, x: 0, y: 0 });
  };

  const handleWorkloadDelete = () => {
    if (workloadContextMenu.workload && onDeleteWorkload) {
      onDeleteWorkload(workloadContextMenu.workload);
    }
    setWorkloadContextMenu({ visible: false, x: 0, y: 0 });
  };

  const handleWorkloadCreate = () => {
    if (onCreateWorkload) {
      onCreateWorkload();
    }
    setWorkloadContextMenu({ visible: false, x: 0, y: 0 });
  };

  const handleSaveSchedule = async () => {
    console.log('handleSaveSchedule called', { newSchedule, scheduleParams, workloadInputDefs, editingSchedule });
    setFormError(null);
    
    if (!newSchedule.name || !newSchedule.workloadId) {
      setFormError('Name and workload are required');
      return;
    }
    
    // Check required params
    const missingRequired = Object.entries(workloadInputDefs)
      .filter(([key, def]) => def.required && !scheduleParams[key])
      .map(([key]) => key);
    
    if (missingRequired.length > 0) {
      setFormError(`Missing required parameters: ${missingRequired.join(', ')}`);
      return;
    }
    
    setSaving(true);
    try {
      // Use existing ID when editing, generate new one when creating
      const id = editingSchedule?.id || newSchedule.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `schedule-${Date.now()}`;
      
      const scheduleData = {
        id,
        ...newSchedule,
        params: Object.keys(scheduleParams).length > 0 ? scheduleParams : undefined,
      };
      
      console.log('Posting schedule:', scheduleData);
      
      const response = await fetch('http://localhost:2900/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleData),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to save schedule');
      }
      
      setShowAddModal(false);
      setEditingSchedule(null);
      fetchSchedules();
    } catch (err) {
      console.error('Failed to save schedule:', err);
      setFormError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const groupedWorkloads = workloads.reduce((acc, workload) => {
    const type = workload.type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(workload);
    return acc;
  }, {} as Record<string, Workload[]>);

  const typeOrder = ['ad-hoc', 'task', 'workflow'];
  const sortedTypes = Object.keys(groupedWorkloads).sort((a, b) => {
    const aIndex = typeOrder.indexOf(a);
    const bIndex = typeOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  const handleRefresh = () => {
    fetchWorkloads();
    fetchSchedules();
  };

  return (
    <div className="explorer">
      <Allotment vertical onChange={handleExplorerPaneChange} defaultSizes={explorerPaneSizes}>
        <Allotment.Pane minSize={100}>
          <div className="explorer-section">
            <div className="explorer-header">
              <span>WORKLOADS</span>
              <div className="header-actions">
                <button 
                  className="add-btn" 
                  onClick={handleWorkloadCreate} 
                  title="New Workload"
                >
                  +
                </button>
                <button className="refresh-btn" onClick={handleRefresh} title="Refresh">
                  🔄
                </button>
              </div>
            </div>
            <div className="explorer-content">
              {loading && <div className="explorer-loading">Loading...</div>}
              {error && (
                <div className="explorer-error">
                  <span>⚠️ {error}</span>
                  <button onClick={handleRefresh}>Retry</button>
                </div>
              )}
              {!loading && !error && (
                <div className="tree">
                  {sortedTypes.map(type => (
                    <div key={type} className="tree-group">
                      <div 
                        className="tree-group-header"
                        onClick={() => toggleType(type)}
                      >
                        <span className="chevron">
                          {expandedTypes.has(type) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <span className="type-icon">
                          {type === 'ad-hoc' ? <Zap size={16} /> : type === 'task' ? <ClipboardList size={16} /> : type === 'workflow' ? <GitBranch size={16} /> : <Package size={16} />}
                        </span>
                        <span className="type-name">{type}</span>
                        <span className="type-count">{groupedWorkloads[type].length}</span>
                      </div>
                      {expandedTypes.has(type) && (
                        <div className="tree-group-items">
                          {groupedWorkloads[type].map(workload => {
                            const isRunning = runningWorkloadIds?.has(workload.id);
                            const hasErrors = workload.validationErrors && workload.validationErrors.length > 0;
                            const hasWarnings = workload.validationWarnings && workload.validationWarnings.length > 0;
                            const validationMessage = [
                              ...(workload.validationErrors || []),
                              ...(workload.validationWarnings || [])
                            ].join('\n');
                            
                            return (
                              <div
                                key={workload.id}
                                className={`tree-item ${selectedWorkload?.id === workload.id ? 'selected' : ''} ${isRunning ? 'running' : ''} ${hasErrors ? 'has-error' : ''} ${hasWarnings && !hasErrors ? 'has-warning' : ''}`}
                                onClick={() => onWorkloadSelect(workload)}
                                onContextMenu={(e) => handleWorkloadItemContextMenu(e, workload)}
                                title={validationMessage || workload.description}
                              >
                                <span className="item-icon">
                                  {isRunning ? <span className="spinner-circle" /> : <FileText size={14} />}
                                </span>
                                <span className="item-name">{workload.name}</span>
                                {hasErrors && (
                                  <span className="validation-indicator error" title={workload.validationErrors?.join('\n')}>
                                    <AlertCircle size={12} />
                                  </span>
                                )}
                                {hasWarnings && !hasErrors && (
                                  <span className="validation-indicator warning" title={workload.validationWarnings?.join('\n')}>
                                    <AlertTriangle size={12} />
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Allotment.Pane>
        
        <Allotment.Pane minSize={60}>
          <div 
            className="explorer-section schedules-section"
            onContextMenu={handleScheduleContextMenu}
          >
            <div className="explorer-header schedules-header">
              <span>SCHEDULES</span>
              <div className="header-actions">
                <button 
                  className="add-btn" 
                  onClick={handleAddSchedule} 
                  title="Add Schedule"
                >
                  +
                </button>
                <span className="schedule-count">{schedules.length}</span>
              </div>
            </div>
            <div className="explorer-content schedules-content">
              <div className="tree">
                <div className="tree-group">
                  <div 
                    className="tree-group-header"
                    onClick={() => setSchedulesExpanded(!schedulesExpanded)}
                  >
                    <span className="chevron">
                      {schedulesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <span className="type-icon"><Calendar size={16} /></span>
                    <span className="type-name">scheduled</span>
                    <span className="type-count">{schedules.length}</span>
                  </div>
                  {schedulesExpanded && (
                    <div className="tree-group-items">
                      {schedules.length === 0 ? (
                        <div className="empty-schedules">
                          <span className="empty-text">No schedules configured</span>
                          <button className="add-schedule-link" onClick={handleAddSchedule}>
                            + Add a schedule
                          </button>
                        </div>
                      ) : (
                        schedules.map(schedule => (
                          <div
                            key={schedule.id}
                            className={`tree-item schedule-item ${selectedSchedule?.id === schedule.id ? 'selected' : ''} ${!schedule.enabled ? 'disabled' : ''}`}
                            onClick={() => onScheduleSelect?.(schedule)}
                            onDoubleClick={() => handleEditSchedule(schedule)}
                            onContextMenu={(e) => handleScheduleItemContextMenu(e, schedule)}
                          >
                            <span className="item-icon">{schedule.enabled ? <Play size={14} /> : <Pause size={14} />}</span>
                            <span className="item-name">{schedule.name}</span>
                            <span className="schedule-timing">
                              {schedule.cron || schedule.interval || '—'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Allotment.Pane>
      </Allotment>
      
      {/* Context Menu */}
      {contextMenu.visible && (
        <div 
          ref={contextMenuRef}
          className="context-menu"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <button className="context-menu-item" onClick={handleAddSchedule}>
            <span className="context-icon">➕</span>
            Add Schedule
          </button>
          <button className="context-menu-item" onClick={() => { fetchSchedules(); setContextMenu({ visible: false, x: 0, y: 0 }); }}>
            <span className="context-icon">🔄</span>
            Refresh
          </button>
        </div>
      )}
      
      {/* Schedule Item Context Menu */}
      {scheduleContextMenu.visible && scheduleContextMenu.schedule && (
        <div 
          ref={scheduleContextMenuRef}
          className="context-menu"
          style={{ left: scheduleContextMenuPos.x, top: scheduleContextMenuPos.y }}
        >
          <button className="context-menu-item" onClick={() => handleEditSchedule(scheduleContextMenu.schedule!)}>
            <span className="context-icon">✏️</span>
            Edit Schedule
          </button>
          <button className="context-menu-item" onClick={() => handleDeleteSchedule(scheduleContextMenu.schedule!)}>
            <span className="context-icon">🗑️</span>
            Delete Schedule
          </button>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={handleAddSchedule}>
            <span className="context-icon">➕</span>
            Add Schedule
          </button>
        </div>
      )}
      
      {/* Workload Item Context Menu */}
      {workloadContextMenu.visible && workloadContextMenu.workload && (
        <div 
          ref={workloadContextMenuRef}
          className="context-menu"
          style={{ left: workloadContextMenuPos.x, top: workloadContextMenuPos.y }}
        >
          <button className="context-menu-item" onClick={handleWorkloadEdit}>
            <span className="context-icon">✏️</span>
            Edit Workload
          </button>
          <button className="context-menu-item" onClick={handleWorkloadDuplicate}>
            <span className="context-icon">📋</span>
            Duplicate
          </button>
          <button className="context-menu-item context-menu-item-danger" onClick={handleWorkloadDelete}>
            <span className="context-icon">🗑️</span>
            Delete Workload
          </button>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={handleWorkloadCreate}>
            <span className="context-icon">➕</span>
            New Workload
          </button>
        </div>
      )}
      
      {/* Add/Edit Schedule Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => { setShowAddModal(false); setEditingSchedule(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingSchedule ? 'Edit Schedule' : 'Add Schedule'}</h3>
              <button className="modal-close" onClick={() => { setShowAddModal(false); setEditingSchedule(null); }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-body-fixed">
                <div className="form-field">
                  <label>Schedule Name <span className="required-indicator">*</span></label>
                  <input
                    type="text"
                    value={newSchedule.name}
                    onChange={e => setNewSchedule(s => ({ ...s, name: e.target.value }))}
                    placeholder="e.g., Daily Weather Check"
                    autoFocus
                  />
                </div>
                <div className="form-field">
                  <label>Workload <span className="required-indicator">*</span></label>
                  <select
                    value={newSchedule.workloadId}
                    onChange={e => setNewSchedule(s => ({ ...s, workloadId: e.target.value }))}
                  >
                    <option value="">Select a workload...</option>
                    {workloads.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.type})</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="modal-body-scroll">
              {newSchedule.workloadId && Object.keys(workloadInputDefs).length > 0 && (
                <div className="params-section">
                  <div className="params-header">
                    <span className="params-icon">⚙️</span>
                    <span>Workload Parameters</span>
                  </div>
                  {loadingInputs ? (
                    <div className="params-loading">Loading parameters...</div>
                  ) : (
                    <div className="params-fields">
                      {Object.entries(workloadInputDefs).map(([key, def]) => (
                        <div key={key} className="form-field">
                          <label>
                            {key}
                            {def.required && <span className="required-indicator">*</span>}
                          </label>
                          <input
                            type="text"
                            value={scheduleParams[key] || ''}
                            onChange={e => setScheduleParams(p => ({ ...p, [key]: e.target.value }))}
                            placeholder={def.default || `Enter ${key}...`}
                          />
                          {def.description && (
                            <span className="form-hint">{def.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              <CronBuilder
                value={newSchedule.cron}
                onChange={handleCronChange}
              />
              <div className="form-field checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={newSchedule.enabled}
                    onChange={e => setNewSchedule(s => ({ ...s, enabled: e.target.checked }))}
                  />
                  Enabled
                </label>
              </div>
              </div>
            </div>
            {formError && (
              <div className="form-error">{formError}</div>
            )}
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => { setShowAddModal(false); setEditingSchedule(null); }}>
                Cancel
              </button>
              {editingSchedule && (
                <button 
                  className="btn-danger" 
                  onClick={() => { handleDeleteSchedule(editingSchedule); setShowAddModal(false); }}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              )}
              <button 
                className="btn-primary" 
                onClick={handleSaveSchedule}
                disabled={saving || !newSchedule.name || !newSchedule.workloadId}
              >
                {saving ? 'Saving...' : editingSchedule ? 'Save Changes' : 'Create Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
