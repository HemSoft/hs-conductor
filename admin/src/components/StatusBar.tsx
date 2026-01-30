import { useState, useEffect } from 'react';
import { Zap, ClipboardList, GitBranch, Package, FileText, Calendar, Loader2, Clock } from 'lucide-react';
import './StatusBar.css';

interface WorkloadStats {
  total: number;
  byType: Record<string, number>;
}

interface StatusBarProps {
  workloadStats?: WorkloadStats;
  scheduleCount?: number;
  runningCount?: number;
}

export function StatusBar({ workloadStats, scheduleCount = 0, runningCount = 0 }: StatusBarProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Default stats if none provided
  const stats = workloadStats || { total: 0, byType: {} };
  
  const typeIcons: Record<string, React.ReactNode> = {
    'ad-hoc': <Zap size={12} />,
    'task': <ClipboardList size={12} />,
    'workflow': <GitBranch size={12} />,
  };

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {/* Workload Distribution */}
        <div className="status-item" data-tooltip="Total Workloads">
          <span className="status-icon"><Package size={12} /></span>
          <span className="status-text">{stats.total} workloads</span>
        </div>
        
        {/* Type breakdown */}
        {Object.entries(stats.byType).map(([type, count]) => (
          <div key={type} className="status-item status-item-secondary" data-tooltip={`${type} workloads`}>
            <span className="status-icon">{typeIcons[type] || <FileText size={12} />}</span>
            <span className="status-text">{count}</span>
          </div>
        ))}
        
        <div className="status-divider" />
        
        {/* Schedules */}
        <div className="status-item" data-tooltip="Active Schedules">
          <span className="status-icon"><Calendar size={12} /></span>
          <span className="status-text">{scheduleCount} schedules</span>
        </div>
        
        {/* Running workloads */}
        {runningCount > 0 && (
          <>
            <div className="status-divider" />
            <div className="status-item status-item-active" data-tooltip="Running Workloads">
              <span className="status-icon spinning"><Loader2 size={12} /></span>
              <span className="status-text">{runningCount} running</span>
            </div>
          </>
        )}
      </div>
      
      <div className="status-bar-center">
        {/* Optional center area for notifications or status messages */}
      </div>
      
      <div className="status-bar-right">
        {/* Date and Time */}
        <div className="status-item" data-tooltip="Current Date">
          <span className="status-icon"><Calendar size={12} /></span>
          <span className="status-text">{formatDate(currentTime)}</span>
        </div>
        <div className="status-divider" />
        <div className="status-item status-item-time" data-tooltip="Current Time">
          <span className="status-icon"><Clock size={12} /></span>
          <span className="status-text">{formatTime(currentTime)}</span>
        </div>
      </div>
    </div>
  );
}
