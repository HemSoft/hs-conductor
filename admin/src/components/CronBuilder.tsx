import { useState, useEffect, useMemo } from 'react';
import './CronBuilder.css';

type Frequency = 'minute' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

interface CronBuilderProps {
  value: string;
  onChange: (cron: string) => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun', short: 'S' },
  { value: 1, label: 'Mon', short: 'M' },
  { value: 2, label: 'Tue', short: 'T' },
  { value: 3, label: 'Wed', short: 'W' },
  { value: 4, label: 'Thu', short: 'T' },
  { value: 5, label: 'Fri', short: 'F' },
  { value: 6, label: 'Sat', short: 'S' },
];

export function CronBuilder({ value, onChange }: CronBuilderProps) {
  const [frequency, setFrequency] = useState<Frequency>('hourly');
  const [minute, setMinute] = useState(0);
  const [hour, setHour] = useState(9);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [selectedDays, setSelectedDays] = useState<number[]>([1]); // Monday by default
  const [customCron, setCustomCron] = useState(value);

  // Parse incoming cron value to set initial state
  useEffect(() => {
    const parts = value.split(' ');
    if (parts.length !== 5) {
      setFrequency('custom');
      setCustomCron(value);
      return;
    }

    const [min, hr, dom, , dow] = parts;

    // Detect frequency from cron pattern
    if (value === '* * * * *') {
      setFrequency('minute');
    } else if (min !== '*' && hr === '*' && dom === '*' && dow === '*') {
      setFrequency('hourly');
      setMinute(parseInt(min) || 0);
    } else if (min !== '*' && hr !== '*' && dom === '*' && dow === '*') {
      setFrequency('daily');
      setMinute(parseInt(min) || 0);
      setHour(parseInt(hr) || 9);
    } else if (min !== '*' && hr !== '*' && dom === '*' && dow !== '*') {
      setFrequency('weekly');
      setMinute(parseInt(min) || 0);
      setHour(parseInt(hr) || 9);
      const days = dow.split(',').map(d => parseInt(d)).filter(d => !isNaN(d));
      setSelectedDays(days.length > 0 ? days : [1]);
    } else if (min !== '*' && hr !== '*' && dom !== '*' && dow === '*') {
      setFrequency('monthly');
      setMinute(parseInt(min) || 0);
      setHour(parseInt(hr) || 9);
      setDayOfMonth(parseInt(dom) || 1);
    } else {
      setFrequency('custom');
      setCustomCron(value);
    }
  }, []);

  // Generate cron expression when settings change
  const cronExpression = useMemo(() => {
    switch (frequency) {
      case 'minute':
        return '* * * * *';
      case 'hourly':
        return `${minute} * * * *`;
      case 'daily':
        return `${minute} ${hour} * * *`;
      case 'weekly':
        return `${minute} ${hour} * * ${selectedDays.sort().join(',')}`;
      case 'monthly':
        return `${minute} ${hour} ${dayOfMonth} * *`;
      case 'custom':
        return customCron;
      default:
        return '0 * * * *';
    }
  }, [frequency, minute, hour, dayOfMonth, selectedDays, customCron]);

  // Update parent when cron changes
  useEffect(() => {
    onChange(cronExpression);
  }, [cronExpression, onChange]);

  // Human-readable description
  const description = useMemo(() => {
    const formatTime = (h: number, m: number) => {
      const period = h >= 12 ? 'PM' : 'AM';
      const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
    };

    switch (frequency) {
      case 'minute':
        return 'Runs every minute';
      case 'hourly':
        return `Runs every hour at minute ${minute}`;
      case 'daily':
        return `Runs daily at ${formatTime(hour, minute)}`;
      case 'weekly': {
        const dayNames = selectedDays
          .sort()
          .map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label)
          .filter(Boolean);
        return `Runs every ${dayNames.join(', ')} at ${formatTime(hour, minute)}`;
      }
      case 'monthly':
        return `Runs on day ${dayOfMonth} of every month at ${formatTime(hour, minute)}`;
      case 'custom':
        return 'Custom cron expression';
      default:
        return '';
    }
  }, [frequency, minute, hour, dayOfMonth, selectedDays]);

  const toggleDay = (day: number) => {
    setSelectedDays(prev => {
      if (prev.includes(day)) {
        // Don't allow deselecting all days
        if (prev.length === 1) return prev;
        return prev.filter(d => d !== day);
      }
      return [...prev, day];
    });
  };

  return (
    <div className="cron-builder">
      <div className="cron-frequency">
        <label>Run Frequency</label>
        <div className="frequency-buttons">
          <button
            type="button"
            className={`freq-btn ${frequency === 'minute' ? 'active' : ''}`}
            onClick={() => setFrequency('minute')}
          >
            Every Minute
          </button>
          <button
            type="button"
            className={`freq-btn ${frequency === 'hourly' ? 'active' : ''}`}
            onClick={() => setFrequency('hourly')}
          >
            Hourly
          </button>
          <button
            type="button"
            className={`freq-btn ${frequency === 'daily' ? 'active' : ''}`}
            onClick={() => setFrequency('daily')}
          >
            Daily
          </button>
          <button
            type="button"
            className={`freq-btn ${frequency === 'weekly' ? 'active' : ''}`}
            onClick={() => setFrequency('weekly')}
          >
            Weekly
          </button>
          <button
            type="button"
            className={`freq-btn ${frequency === 'monthly' ? 'active' : ''}`}
            onClick={() => setFrequency('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`freq-btn ${frequency === 'custom' ? 'active' : ''}`}
            onClick={() => setFrequency('custom')}
          >
            Custom
          </button>
        </div>
      </div>

      <div className="cron-options">
        {/* Hourly: minute selector */}
        {frequency === 'hourly' && (
          <div className="cron-option">
            <span className="option-label">At minute</span>
            <select value={minute} onChange={e => setMinute(parseInt(e.target.value))}>
              {Array.from({ length: 60 }, (_, i) => (
                <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
              ))}
            </select>
            <span className="option-suffix">of every hour</span>
          </div>
        )}

        {/* Daily: time picker */}
        {frequency === 'daily' && (
          <div className="cron-option">
            <span className="option-label">At</span>
            <select value={hour} onChange={e => setHour(parseInt(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                </option>
              ))}
            </select>
            <span className="option-separator">:</span>
            <select value={minute} onChange={e => setMinute(parseInt(e.target.value))}>
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
              ))}
            </select>
          </div>
        )}

        {/* Weekly: day selector + time picker */}
        {frequency === 'weekly' && (
          <>
            <div className="cron-option">
              <span className="option-label">On</span>
              <div className="day-selector">
                {DAYS_OF_WEEK.map(day => (
                  <button
                    key={day.value}
                    type="button"
                    className={`day-btn ${selectedDays.includes(day.value) ? 'active' : ''}`}
                    onClick={() => toggleDay(day.value)}
                    title={day.label}
                  >
                    {day.short}
                  </button>
                ))}
              </div>
            </div>
            <div className="cron-option">
              <span className="option-label">At</span>
              <select value={hour} onChange={e => setHour(parseInt(e.target.value))}>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                  </option>
                ))}
              </select>
              <span className="option-separator">:</span>
              <select value={minute} onChange={e => setMinute(parseInt(e.target.value))}>
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                  <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Monthly: day of month + time picker */}
        {frequency === 'monthly' && (
          <>
            <div className="cron-option">
              <span className="option-label">On day</span>
              <select value={dayOfMonth} onChange={e => setDayOfMonth(parseInt(e.target.value))}>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
              <span className="option-suffix">of every month</span>
            </div>
            <div className="cron-option">
              <span className="option-label">At</span>
              <select value={hour} onChange={e => setHour(parseInt(e.target.value))}>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                  </option>
                ))}
              </select>
              <span className="option-separator">:</span>
              <select value={minute} onChange={e => setMinute(parseInt(e.target.value))}>
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                  <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Custom: raw cron input */}
        {frequency === 'custom' && (
          <div className="cron-option custom">
            <input
              type="text"
              value={customCron}
              onChange={e => setCustomCron(e.target.value)}
              placeholder="* * * * *"
              className="custom-cron-input"
            />
            <div className="cron-format-hint">
              <span className="cron-part">minute</span>
              <span className="cron-part">hour</span>
              <span className="cron-part">day</span>
              <span className="cron-part">month</span>
              <span className="cron-part">weekday</span>
            </div>
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="cron-preview">
        <div className="preview-expression">
          <span className="preview-label">Cron:</span>
          <code className="preview-cron">{cronExpression}</code>
        </div>
        <div className="preview-description">
          <span className="preview-icon">📅</span>
          {description}
        </div>
      </div>
    </div>
  );
}
