import { useState, useEffect, useCallback, useRef } from 'react';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { TitleBar } from './components/TitleBar';
import { ActivityBar } from './components/ActivityBar';
import { Explorer, Workload, ExplorerRef } from './components/Explorer';
import { EditorPane, ResultView } from './components/EditorPane';
import type { FileInfo } from './components/EditorPane';
import { RightSidebar, RunInfo } from './components/RightSidebar';
import { WorkloadEditorModal } from './components/WorkloadEditorModal';
import { DeleteWorkloadModal } from './components/DeleteWorkloadModal';
import { StatusBar } from './components/StatusBar';
import './App.css';

interface WorkloadStats {
  total: number;
  byType: Record<string, number>;
}

interface EditorModalState {
  mode: 'create' | 'edit' | 'duplicate';
  workload?: Workload;
  yamlContent?: string;
}

function App() {
  const [activeView, setActiveView] = useState('explorer');
  const [selectedWorkload, setSelectedWorkload] = useState<Workload | null>(null);
  const [yamlContent, setYamlContent] = useState<string | null>(null);
  const [resultView, setResultView] = useState<ResultView | null>(null);
  const explorerRef = useRef<ExplorerRef>(null);
  
  // Workload editor modal state
  const [editorModal, setEditorModal] = useState<EditorModalState | null>(null);
  const [deleteModal, setDeleteModal] = useState<Workload | null>(null);
  const [runningWorkloadIds, setRunningWorkloadIds] = useState<Set<string>>(new Set());
  
  // Status bar stats
  const [workloadStats, setWorkloadStats] = useState<WorkloadStats>({ total: 0, byType: {} });
  const [scheduleCount, setScheduleCount] = useState(0);

  // Pane sizes (persisted to localStorage)
  const [paneSizes, setPaneSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem('conductor-pane-sizes');
    return saved ? JSON.parse(saved) : [250, -1, 280]; // -1 means flex
  });
  const paneSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save pane sizes when changed (debounced)
  const handlePaneChange = useCallback((sizes: number[]) => {
    setPaneSizes(sizes);
    // Debounce localStorage writes
    if (paneSaveTimeoutRef.current) {
      clearTimeout(paneSaveTimeoutRef.current);
    }
    paneSaveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem('conductor-pane-sizes', JSON.stringify(sizes));
    }, 300);
  }, []);

  // Fetch stats for status bar
  const fetchStats = useCallback(async () => {
    try {
      const [workloadsRes, schedulesRes] = await Promise.all([
        fetch('http://localhost:2900/workloads'),
        fetch('http://localhost:2900/schedules'),
      ]);
      
      if (workloadsRes.ok) {
        const workloads = await workloadsRes.json();
        const byType: Record<string, number> = {};
        workloads.forEach((w: Workload) => {
          byType[w.type] = (byType[w.type] || 0) + 1;
        });
        setWorkloadStats({ total: workloads.length, byType });
      }
      
      if (schedulesRes.ok) {
        const schedules = await schedulesRes.json();
        setScheduleCount(schedules.length);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleReload = useCallback(() => {
    explorerRef.current?.refresh();
    fetchStats();
  }, [fetchStats]);

  const handleFullScreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  // Keyboard shortcuts handled by Electron main process
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        handleFullScreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFullScreen]);

  useEffect(() => {
    if (selectedWorkload) {
      fetchYamlContent(selectedWorkload);
    }
  }, [selectedWorkload]);

  const fetchYamlContent = async (workload: Workload) => {
    try {
      const response = await fetch(`http://localhost:2900/workloads/${workload.id}`);
      if (!response.ok) throw new Error('Failed to fetch workload details');
      const data = await response.json();
      setYamlContent(data.yaml || '# No YAML content available');
      return data.yaml;
    } catch (err) {
      setYamlContent(`# Error loading workload\n# ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    }
  };

  const handleRun = async (params: Record<string, string>) => {
    if (!selectedWorkload) return;

    try {
      const response = await fetch(`http://localhost:2900/run/${selectedWorkload.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      
      if (!response.ok) throw new Error('Failed to run workload');
      
      // Run started - RightSidebar will pick it up via polling
      console.log('Run started:', await response.json());
    } catch (err) {
      console.error('Run failed:', err);
    }
  };

  const handleRunSelect = async (run: RunInfo, content: string) => {
    // Fetch full run details including file list
    let fileDetails: FileInfo[] = [];
    let currentFile = '';
    
    try {
      const response = await fetch(`http://localhost:2900/runs/${run.instanceId}`);
      if (response.ok) {
        const details = await response.json();
        fileDetails = details.files?.details || [];
        // Find the first result file as current
        const resultFiles = details.files?.results || [];
        currentFile = resultFiles[0] || '';
      }
    } catch (err) {
      console.error('Failed to fetch run details:', err);
    }
    
    const isJson = content.trim().startsWith('{') || content.trim().startsWith('[');
    setResultView({
      type: 'result',
      title: `${run.workloadId} - ${new Date(run.createdAt).toLocaleTimeString()}`,
      content,
      language: isJson ? 'json' : 'markdown',
      instanceId: run.instanceId,
      availableFiles: fileDetails,
      currentFile,
    });
  };

  const handleFileSelect = async (instanceId: string, filename: string) => {
    try {
      const response = await fetch(`http://localhost:2900/runs/${instanceId}/file/${filename}`);
      if (!response.ok) throw new Error('Failed to fetch file');
      
      const data = await response.json();
      const content = data.raw || JSON.stringify(data.content, null, 2);
      const isJson = content.trim().startsWith('{') || content.trim().startsWith('[');
      
      setResultView(prev => prev ? {
        ...prev,
        content,
        language: isJson ? 'json' : 'markdown',
        currentFile: filename,
      } : null);
    } catch (err) {
      console.error('Failed to load file:', err);
    }
  };

  const handleRunDeleted = (instanceId: string) => {
    // Clear result view if the deleted run was being displayed
    if (resultView?.instanceId === instanceId) {
      setResultView(null);
    }
  };

  const handleBackToWorkload = () => {
    setResultView(null);
  };

  const handleCloseWorkload = () => {
    setSelectedWorkload(null);
    setYamlContent(null);
    setResultView(null);
  };

  // Workload CRUD handlers
  const handleCreateWorkload = () => {
    setEditorModal({ mode: 'create' });
  };

  const handleEditWorkload = async (workload: Workload) => {
    const yaml = await fetchYamlContentForEdit(workload);
    setEditorModal({ mode: 'edit', workload, yamlContent: yaml || '' });
  };

  const handleDuplicateWorkload = async (workload: Workload) => {
    const yaml = await fetchYamlContentForEdit(workload);
    setEditorModal({ mode: 'duplicate', workload, yamlContent: yaml || '' });
  };

  const handleDeleteWorkload = (workload: Workload) => {
    setDeleteModal(workload);
  };

  const fetchYamlContentForEdit = async (workload: Workload): Promise<string | null> => {
    try {
      const response = await fetch(`http://localhost:2900/workloads/${workload.id}`);
      if (!response.ok) throw new Error('Failed to fetch workload details');
      const data = await response.json();
      return data.yaml || null;
    } catch (err) {
      console.error('Failed to fetch workload YAML:', err);
      return null;
    }
  };

  const handleSaveWorkload = async (yaml: string, isNew: boolean) => {
    const url = isNew
      ? 'http://localhost:2900/workloads'
      : `http://localhost:2900/workloads/${editorModal?.workload?.id}`;
    
    const method = isNew ? 'POST' : 'PUT';
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      // Include details if available (for validation errors)
      const errorMessage = errorData.details 
        ? `${errorData.error}\n\n${errorData.details}`
        : errorData.error || 'Failed to save workload';
      throw new Error(errorMessage);
    }
    
    // Update EditorPane if the edited workload is currently selected
    if (!isNew && selectedWorkload?.id === editorModal?.workload?.id) {
      setYamlContent(yaml);
    }
    
    // Refresh the explorer and stats
    explorerRef.current?.refresh();
    fetchStats();
    setEditorModal(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal) return;
    
    const response = await fetch(`http://localhost:2900/workloads/${deleteModal.id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete workload');
    }
    
    // Clear selection if deleted workload was selected
    if (selectedWorkload?.id === deleteModal.id) {
      setSelectedWorkload(null);
      setYamlContent(null);
    }
    
    // Refresh the explorer and stats
    explorerRef.current?.refresh();
    fetchStats();
    setDeleteModal(null);
  };

  // Refresh stats when explorer refreshes
  const handleExplorerWorkloadSelect = (w: Workload) => {
    setSelectedWorkload(w);
    setResultView(null);
  };

  return (
    <div className="app">
      <TitleBar
        onReload={handleReload}
        onFullScreen={handleFullScreen}
      />
      <div className="app-content">
        <ActivityBar activeView={activeView} onViewChange={setActiveView} />
        <Allotment onChange={handlePaneChange}>
          <Allotment.Pane minSize={150} preferredSize={paneSizes[0]} maxSize={400}>
            <Explorer
              ref={explorerRef}
              onWorkloadSelect={handleExplorerWorkloadSelect}
              selectedWorkload={selectedWorkload}
              onCreateWorkload={handleCreateWorkload}
              onEditWorkload={handleEditWorkload}
              onDuplicateWorkload={handleDuplicateWorkload}
              onDeleteWorkload={handleDeleteWorkload}
              runningWorkloadIds={runningWorkloadIds}
            />
          </Allotment.Pane>
          <Allotment.Pane minSize={300}>
            <EditorPane
              workload={selectedWorkload}
              yamlContent={yamlContent}
              onRun={handleRun}
              resultView={resultView}
              onBackToWorkload={handleBackToWorkload}
              onYamlChange={setYamlContent}
              onFileSelect={handleFileSelect}
              onCloseWorkload={handleCloseWorkload}
              onEditWorkload={handleEditWorkload}
              onWorkloadSaved={handleReload}
            />
          </Allotment.Pane>
          <Allotment.Pane minSize={200} preferredSize={paneSizes[2]} maxSize={400}>
            <RightSidebar
              onRunSelect={handleRunSelect}
              onRunDeleted={handleRunDeleted}
              onRunningWorkloadsChange={setRunningWorkloadIds}
            />
          </Allotment.Pane>
        </Allotment>
      </div>
      
      <StatusBar
        workloadStats={workloadStats}
        scheduleCount={scheduleCount}
        runningCount={runningWorkloadIds.size}
      />
      
      {/* Workload Editor Modal */}
      {editorModal && (
        <WorkloadEditorModal
          mode={editorModal.mode}
          workload={editorModal.workload}
          yamlContent={editorModal.yamlContent}
          onSave={handleSaveWorkload}
          onClose={() => setEditorModal(null)}
        />
      )}
      
      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <DeleteWorkloadModal
          workload={deleteModal}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
}

export default App;
