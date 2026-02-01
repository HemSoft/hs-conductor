import { useState, useEffect, useCallback } from 'react';
import './RightSidebar.css';

export interface RunInfo {
  instanceId: string;
  workloadId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'scheduled';
  createdAt: string;
  summary?: string | null;
  files?: { results: string[]; assets: string[]; all?: string[]; details?: FileDetail[] };
  // Manifest data
  duration?: number;
  outputCount?: number;
  // For scheduled runs
  scheduleName?: string;
  nextOccurrence?: string;
  previousOccurrence?: string;
}

interface FileDetail {
  name: string;
  size: number;
  type: string;
  isResult: boolean;
  isAsset: boolean;
  isManifest: boolean;
}

interface UpcomingSchedule {
  scheduleId: string;
  scheduleName: string;
  workloadId: string;
  cron: string;
  nextOccurrence: string;
  previousOccurrence?: string;
  enabled: boolean;
}

interface DateGroup {
  label: string;
  runs: RunInfo[];
  expanded: boolean;
}

interface RightSidebarProps {
  onRunSelect?: (run: RunInfo, content: string) => void;
  onRunDeleted?: (instanceId: string) => void;
  onRunningWorkloadsChange?: (workloadIds: Set<string>) => void;
}

// Date grouping utilities
function getDateGroup(date: Date, now: Date): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  
  // Calculate start of this week (Sunday)
  const dayOfWeek = now.getDay();
  const startOfThisWeek = new Date(startOfToday);
  startOfThisWeek.setDate(startOfThisWeek.getDate() - dayOfWeek);
  
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  
  // Start of this month
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  
  // Future dates (scheduled)
  if (date >= startOfToday && date > now) {
    return 'Scheduled';
  }
  
  // Today
  if (date >= startOfToday) {
    return 'Today';
  }
  
  // Yesterday
  if (date >= startOfYesterday && date < startOfToday) {
    return 'Yesterday';
  }
  
  // This week (but not today or yesterday)
  if (date >= startOfThisWeek && date < startOfYesterday) {
    return 'This Week';
  }
  
  // Last week
  if (date >= startOfLastWeek && date < startOfThisWeek) {
    return 'Last Week';
  }
  
  // This month (but not this/last week)
  if (date >= startOfThisMonth && date < startOfLastWeek) {
    return 'This Month';
  }
  
  // Last month
  if (date >= startOfLastMonth && date < startOfThisMonth) {
    return 'Last Month';
  }
  
  return 'Older';
}

function groupRunsByDate(runs: RunInfo[]): DateGroup[] {
  const now = new Date();
  const groups: Map<string, RunInfo[]> = new Map();
  
  // Define group order
  const groupOrder = ['Scheduled', 'Today', 'Yesterday', 'This Week', 'Last Week', 'This Month', 'Last Month', 'Older'];
  
  // Initialize all groups
  for (const label of groupOrder) {
    groups.set(label, []);
  }
  
  // Categorize each run
  for (const run of runs) {
    const date = new Date(run.status === 'scheduled' && run.nextOccurrence ? run.nextOccurrence : run.createdAt);
    const groupLabel = run.status === 'scheduled' ? 'Scheduled' : getDateGroup(date, now);
    const group = groups.get(groupLabel) || [];
    group.push(run);
    groups.set(groupLabel, group);
  }
  
  // Sort runs within each group
  for (const [label, groupRuns] of groups) {
    if (label === 'Scheduled') {
      // Scheduled runs: sort by next occurrence (soonest first)
      groupRuns.sort((a, b) => {
        const aTime = new Date(a.nextOccurrence || a.createdAt).getTime();
        const bTime = new Date(b.nextOccurrence || b.createdAt).getTime();
        return aTime - bTime;
      });
    } else {
      // Past runs: sort by createdAt (most recent first)
      groupRuns.sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime;
      });
    }
  }
  
  // Build result array (only include non-empty groups)
  const result: DateGroup[] = [];
  for (const label of groupOrder) {
    const groupRuns = groups.get(label) || [];
    if (groupRuns.length > 0) {
      result.push({
        label,
        runs: groupRuns,
        // Scheduled and Today are expanded by default
        expanded: label === 'Scheduled' || label === 'Today',
      });
    }
  }
  
  return result;
}

export function RightSidebar({ onRunSelect, onRunDeleted, onRunningWorkloadsChange }: RightSidebarProps) {
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [scheduledRuns, setScheduledRuns] = useState<RunInfo[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Scheduled', 'Today']));

  const fetchRuns = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:2900/runs');
      if (!response.ok) throw new Error('Failed to fetch runs');
      const data = await response.json();
      setRuns(data);
    } catch (err) {
      console.error('Failed to fetch runs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUpcoming = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:2900/schedules/upcoming');
      if (!response.ok) throw new Error('Failed to fetch upcoming');
      const data: UpcomingSchedule[] = await response.json();
      
      // Convert upcoming schedules to RunInfo format
      const scheduled: RunInfo[] = data.map(s => ({
        instanceId: `scheduled-${s.scheduleId}`,
        workloadId: s.workloadId,
        status: 'scheduled' as const,
        createdAt: new Date().toISOString(),
        scheduleName: s.scheduleName,
        nextOccurrence: s.nextOccurrence,
        previousOccurrence: s.previousOccurrence,
        summary: `Next run: ${formatRelativeTime(new Date(s.nextOccurrence))}`,
      }));
      
      setScheduledRuns(scheduled);
    } catch (err) {
      console.error('Failed to fetch upcoming schedules:', err);
    }
  }, []);

  const deleteRun = async (instanceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Don't allow deleting scheduled runs
    if (instanceId.startsWith('scheduled-')) return;
    
    try {
      const response = await fetch(`http://localhost:2900/runs/${instanceId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setRuns(prev => prev.filter(r => r.instanceId !== instanceId));
        if (selectedRunId === instanceId) {
          setSelectedRunId(null);
        }
        onRunDeleted?.(instanceId);
      }
    } catch (err) {
      console.error('Failed to delete run:', err);
    }
  };

  const clearFailedRuns = async () => {
    const failedIds = runs.filter(r => r.status === 'failed').map(r => r.instanceId);
    
    try {
      const response = await fetch('http://localhost:2900/runs', {
        method: 'DELETE',
      });
      if (response.ok) {
        failedIds.forEach(id => onRunDeleted?.(id));
        fetchRuns();
      }
    } catch (err) {
      console.error('Failed to clear failed runs:', err);
    }
  };

  const hasFailedRuns = runs.some(r => r.status === 'failed');

  // Initial fetch and polling
  useEffect(() => {
    fetchRuns();
    fetchUpcoming();
    
    // Poll every 2 seconds for status updates
    const interval = setInterval(() => {
      fetchRuns();
      fetchUpcoming();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchRuns, fetchUpcoming]);

  // Notify parent about running workloads
  useEffect(() => {
    const runningIds = new Set(runs.filter(r => r.status === 'running').map(r => r.workloadId));
    onRunningWorkloadsChange?.(runningIds);
  }, [runs, onRunningWorkloadsChange]);

  const handleRunClick = async (run: RunInfo) => {
    // Don't select scheduled runs (they haven't run yet)
    if (run.status === 'scheduled') return;
    
    setSelectedRunId(run.instanceId);
    
    try {
      const response = await fetch(`http://localhost:2900/runs/${run.instanceId}`);
      if (!response.ok) throw new Error('Failed to fetch run details');
      const details = await response.json();
      
      const resultFile = details.files?.results?.[0];
      if (resultFile && onRunSelect) {
        const fileResponse = await fetch(
          `http://localhost:2900/runs/${run.instanceId}/file/${resultFile}`
        );
        if (fileResponse.ok) {
          const fileData = await fileResponse.json();
          onRunSelect(run, fileData.raw || JSON.stringify(fileData.content, null, 2));
        }
      }
    } catch (err) {
      console.error('Failed to load run result:', err);
    }
  };

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'running': return <span className="spinner-circle" />;
      case 'scheduled': return '📅';
      default: return '⏳';
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'completed': return 'status-completed';
      case 'failed': return 'status-failed';
      case 'running': return 'status-running';
      case 'scheduled': return 'status-scheduled';
      default: return 'status-pending';
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatWorkloadName = (workloadId: string) => {
    return workloadId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Combine runs and scheduled, then group
  const allRuns = [...scheduledRuns, ...runs];
  const dateGroups = groupRunsByDate(allRuns);
  
  // Update expanded state for groups
  const groupsWithExpanded = dateGroups.map(g => ({
    ...g,
    expanded: expandedGroups.has(g.label),
  }));

  return (
    <div className="right-sidebar">
      <div className="sidebar-header">
        <span>RUN HISTORY</span>
        <div className="header-actions">
          {hasFailedRuns && (
            <button className="clear-failed-btn" onClick={clearFailedRuns} title="Clear failed runs">
              🗑️
            </button>
          )}
          <button className="refresh-btn" onClick={() => { fetchRuns(); fetchUpcoming(); }} title="Refresh">
            🔄
          </button>
        </div>
      </div>
      <div className="sidebar-content">
        {loading ? (
          <div className="empty-state">
            <span className="spinner">⏳</span>
            <p>Loading runs...</p>
          </div>
        ) : allRuns.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📋</span>
            <p>No runs yet</p>
            <p className="hint">Run a workload to see output here</p>
          </div>
        ) : (
          <div className="run-list">
            {groupsWithExpanded.map((group) => (
              <div key={group.label} className="date-group">
                <div 
                  className="date-group-header"
                  onClick={() => toggleGroup(group.label)}
                >
                  <span className="chevron">{group.expanded ? '▼' : '▶'}</span>
                  <span className="date-label">{group.label}</span>
                  <span className="date-count">{group.runs.length}</span>
                </div>
                {group.expanded && (
                  <div className="date-group-items">
                    {group.runs.map((run) => (
                      <div
                        key={run.instanceId}
                        className={`run-item ${selectedRunId === run.instanceId ? 'selected' : ''} ${getStatusClass(run.status)}`}
                        onClick={() => handleRunClick(run)}
                      >
                        <div className="run-header">
                          <span className="status-icon">
                            {getStatusIcon(run.status)}
                          </span>
                          <span className="workload-name">
                            {run.scheduleName || formatWorkloadName(run.workloadId)}
                          </span>
                          {run.status !== 'scheduled' && (
                            <button
                              className="delete-run-btn"
                              onClick={(e) => deleteRun(run.instanceId, e)}
                              title="Delete run"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        {run.summary && (
                          <div className="run-summary" title={run.summary}>
                            {run.summary}
                          </div>
                        )}
                        <div className="run-details">
                          <span className={`status-badge ${run.status}`}>
                            {run.status === 'scheduled' ? 'SCHEDULED' : run.status}
                          </span>
                          {run.duration !== undefined && run.status === 'completed' && (
                            <span className="run-duration" title="Duration">
                              ⏱️ {formatDuration(run.duration)}
                            </span>
                          )}
                          {run.outputCount !== undefined && run.outputCount > 1 && (
                            <span className="run-files" title={`${run.outputCount} output files`}>
                              📄 {run.outputCount}
                            </span>
                          )}
                          <span className="run-time">
                            {run.status === 'scheduled' && run.nextOccurrence
                              ? formatTime(run.nextOccurrence)
                              : formatTime(run.createdAt)}
                          </span>
                        </div>
                        {run.status === 'scheduled' && run.nextOccurrence && (
                          <ScheduleProgressBar
                            nextOccurrence={run.nextOccurrence}
                            previousOccurrence={run.previousOccurrence}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper to format relative time for scheduled runs
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);
  
  if (diffMins < 1) return 'in less than a minute';
  if (diffMins < 60) return `in ${diffMins} minute${diffMins === 1 ? '' : 's'}`;
  if (diffHours < 24) return `in ${diffHours} hour${diffHours === 1 ? '' : 's'}`;
  return `in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
}

// Calculate progress color based on percentage (red -> orange -> yellow -> green)
function getProgressColor(progress: number): string {
  // Clamp progress to 0-100
  const p = Math.max(0, Math.min(100, progress));
  
  // Color stops: red(0%) -> orange(33%) -> yellow(66%) -> green(100%)
  if (p <= 33) {
    // Red to Orange
    const t = p / 33;
    const r = 220;
    const g = Math.round(60 + t * 100); // 60 -> 160
    const b = Math.round(60 - t * 20);  // 60 -> 40
    return `rgb(${r}, ${g}, ${b})`;
  } else if (p <= 66) {
    // Orange to Yellow
    const t = (p - 33) / 33;
    const r = Math.round(220 + t * 20); // 220 -> 240
    const g = Math.round(160 + t * 60); // 160 -> 220
    const b = 40;
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Yellow to Green
    const t = (p - 66) / 34;
    const r = Math.round(240 - t * 140); // 240 -> 100
    const g = Math.round(220 - t * 20);  // 220 -> 200
    const b = Math.round(40 + t * 60);   // 40 -> 100
    return `rgb(${r}, ${g}, ${b})`;
  }
}

// Schedule progress bar component
interface ScheduleProgressBarProps {
  nextOccurrence: string;
  previousOccurrence?: string;
}

function ScheduleProgressBar({ nextOccurrence, previousOccurrence }: ScheduleProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState('');
  
  useEffect(() => {
    const updateProgress = () => {
      const now = new Date().getTime();
      const next = new Date(nextOccurrence).getTime();
      
      // Use previousOccurrence if available, otherwise estimate based on interval to next
      let prev: number;
      if (previousOccurrence) {
        prev = new Date(previousOccurrence).getTime();
      } else {
        // Fallback: estimate interval as time from now to next, doubled
        // This gives a reasonable progress when we don't know the previous run
        const timeToNext = next - now;
        prev = now - timeToNext;
      }
      
      const totalInterval = next - prev;
      const elapsed = now - prev;
      
      // Calculate progress percentage (0-100)
      const progressPercent = totalInterval > 0 
        ? Math.min(100, Math.max(0, (elapsed / totalInterval) * 100))
        : 0;
      
      setProgress(progressPercent);
      
      // Calculate time remaining
      const remaining = next - now;
      if (remaining <= 0) {
        setTimeRemaining('now');
      } else if (remaining < 60000) {
        setTimeRemaining('<1m');
      } else if (remaining < 3600000) {
        const mins = Math.ceil(remaining / 60000);
        setTimeRemaining(`${mins}m`);
      } else if (remaining < 86400000) {
        const hours = Math.floor(remaining / 3600000);
        const mins = Math.ceil((remaining % 3600000) / 60000);
        setTimeRemaining(`${hours}h ${mins}m`);
      } else {
        const days = Math.floor(remaining / 86400000);
        const hours = Math.floor((remaining % 86400000) / 3600000);
        setTimeRemaining(`${days}d ${hours}h`);
      }
    };
    
    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    return () => clearInterval(interval);
  }, [nextOccurrence, previousOccurrence]);
  
  const progressColor = getProgressColor(progress);
  
  return (
    <div className="schedule-progress-container">
      <div className="schedule-progress-bar">
        <div
          className="schedule-progress-fill"
          style={{
            width: `${progress}%`,
            backgroundColor: progressColor,
          }}
        />
      </div>
      <div className="schedule-progress-label">
        <span className="progress-text" style={{ color: progressColor }}>
          {Math.round(progress)}%
        </span>
        <span className="time-remaining">{timeRemaining}</span>
      </div>
    </div>
  );
}

// Helper to format duration in milliseconds
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
