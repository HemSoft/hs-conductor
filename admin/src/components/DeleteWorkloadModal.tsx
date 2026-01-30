import { useState } from 'react';
import './DeleteWorkloadModal.css';

interface DeleteWorkloadModalProps {
  workload: { id: string; name: string; type: string };
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function DeleteWorkloadModal({ workload, onConfirm, onClose }: DeleteWorkloadModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmed = confirmText === workload.name;
  const typeIcon = workload.type === 'ad-hoc' ? '⚡' : workload.type === 'task' ? '📋' : '🔄';

  const handleDelete = async () => {
    if (!isConfirmed) return;
    
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workload');
      setDeleting(false);
    }
  };

  return (
    <div className="delete-modal-overlay" onClick={onClose}>
      <div className="delete-modal" onClick={e => e.stopPropagation()}>
        <div className="delete-modal-header">
          <span className="delete-icon">⚠️</span>
          <h3>Delete Workload</h3>
        </div>
        
        <div className="delete-modal-body">
          <div className="workload-preview">
            <span className="preview-icon">{typeIcon}</span>
            <div className="preview-info">
              <span className="preview-name">{workload.name}</span>
              <span className="preview-id">{workload.id}</span>
            </div>
          </div>
          
          <p className="warning-text">
            This action cannot be undone. This will permanently delete the workload
            <strong> {workload.name}</strong> and all associated configurations.
          </p>
          
          <div className="confirm-field">
            <label>
              Type <strong>{workload.name}</strong> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={workload.name}
              autoFocus
            />
          </div>
          
          {error && <div className="delete-error">{error}</div>}
        </div>
        
        <div className="delete-modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button
            className="btn-danger"
            onClick={handleDelete}
            disabled={!isConfirmed || deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Workload'}
          </button>
        </div>
      </div>
    </div>
  );
}
