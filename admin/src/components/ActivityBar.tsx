import { Files, Settings } from 'lucide-react';
import './ActivityBar.css';

interface ActivityBarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  const items = [
    { id: 'explorer', icon: Files, tooltip: 'Explorer' },
    { id: 'settings', icon: Settings, tooltip: 'Settings', disabled: true },
  ];

  return (
    <div className="activity-bar">
      {items.map((item) => {
        const IconComponent = item.icon;
        return (
          <button
            key={item.id}
            className={`activity-bar-item ${activeView === item.id ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
            onClick={() => !item.disabled && onViewChange(item.id)}
            disabled={item.disabled}
          >
            <IconComponent size={24} strokeWidth={1.5} />
            <span className="activity-bar-tooltip">{item.tooltip}</span>
          </button>
        );
      })}
    </div>
  );
}
