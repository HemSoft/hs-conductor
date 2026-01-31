import { Files, Play, Settings } from 'lucide-react';
import './ActivityBar.css';

interface ActivityBarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  const items = [
    { id: 'explorer', icon: Files, tooltip: 'Explorer', implemented: true },
    { id: 'runs', icon: Play, tooltip: 'Run History - To be implemented', implemented: false },
    { id: 'settings', icon: Settings, tooltip: 'Settings - To be implemented', implemented: false },
  ];

  return (
    <div className="activity-bar">
      {items.map((item) => {
        const IconComponent = item.icon;
        return (
          <button
            key={item.id}
            className={`activity-bar-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onViewChange(item.id)}
            title={item.tooltip}
          >
            <IconComponent size={24} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}
