import { useState, useRef, useEffect } from 'react';
import './TitleBar.css';

interface MenuItem {
  label?: string;
  accelerator?: string;
  action?: () => void;
  type?: 'separator';
  submenu?: MenuItem[];
  disabled?: boolean;
  checked?: boolean;
}

interface Menu {
  label: string;
  items: MenuItem[];
}

interface TitleBarProps {
  onReload: () => void;
  onFullScreen: () => void;
}

export function TitleBar({ onReload, onFullScreen }: TitleBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const menus: Menu[] = [
    {
      label: 'File',
      items: [
        { label: 'Reload Workloads', accelerator: 'Ctrl+Shift+R', action: onReload },
        { type: 'separator' },
        { label: 'Exit', accelerator: 'Alt+F4', action: () => window.close() }
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', accelerator: 'Ctrl+Z', action: () => document.execCommand('undo') },
        { label: 'Redo', accelerator: 'Ctrl+Y', action: () => document.execCommand('redo') },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'Ctrl+X', action: () => document.execCommand('cut') },
        { label: 'Copy', accelerator: 'Ctrl+C', action: () => document.execCommand('copy') },
        { label: 'Paste', accelerator: 'Ctrl+V', action: () => document.execCommand('paste') },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'Ctrl+A', action: () => document.execCommand('selectAll') }
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Full Screen', accelerator: 'F11', action: onFullScreen },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'Ctrl+Num+' },
        { label: 'Zoom Out', accelerator: 'Ctrl+Num-' },
        { label: 'Reset Zoom', accelerator: 'Ctrl+Num0' },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'Ctrl+R', action: () => window.location.reload() },
        { label: 'Toggle Developer Tools', accelerator: 'Ctrl+Shift+I' }
      ]
    },
    {
      label: 'Help',
      items: [
        { 
          label: 'About hs-cli-conductor', 
          action: () => {
            alert('hs-cli-conductor Admin\n\nEvent-Driven Multi-Agent Orchestration\nVersion 0.1.0');
          }
        }
      ]
    }
  ];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (label: string) => {
    setOpenMenu(openMenu === label ? null : label);
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.action && !item.disabled) {
      item.action();
    }
    setOpenMenu(null);
  };

  return (
    <div className="title-bar">
      <div className="title-bar-drag-region" />
      <div className="menu-bar" ref={menuBarRef}>
        {menus.map((menu) => (
          <div key={menu.label} className="menu-container">
            <button
              className={`menu-button ${openMenu === menu.label ? 'active' : ''}`}
              onClick={() => handleMenuClick(menu.label)}
              onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
            >
              {menu.label}
            </button>
            {openMenu === menu.label && (
              <div className="menu-dropdown">
                {menu.items.map((item, index) => (
                  item.type === 'separator' ? (
                    <div key={index} className="menu-separator" />
                  ) : (
                    <button
                      key={index}
                      className={`menu-item ${item.disabled ? 'disabled' : ''}`}
                      onClick={() => handleItemClick(item)}
                      disabled={item.disabled}
                    >
                      <span className="menu-item-label">{item.label}</span>
                      {item.accelerator && (
                        <span className="menu-item-accelerator">{item.accelerator}</span>
                      )}
                    </button>
                  )
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="title-bar-title">
        <span className="title-brand">HemSoft Developments</span>
        <span className="title-separator">—</span>
        <span className="title-product">Conductor</span>
        <span className="title-version">V1.0</span>
      </div>
    </div>
  );
}
