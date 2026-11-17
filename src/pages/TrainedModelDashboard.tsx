import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  Check,
  Copy,
  Cpu,
  Download,
  FileCode2,
  FolderOpen,
  HardDrive,
  Layers3,
  Link2,
  Plus,
  Radio,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import TrainedTelemetryCharts from '@/components/features/TrainedTelemetryCharts';
import {
  addModelAssignment,
  deleteModelAssignment,
  fetchTrainedModel,
  pingModelTelemetry,
  updateModelAssignment,
  updateTrainedModel,
} from '@/lib/api';
import { downloadFile } from '@/lib/download';
import type {
  AssignmentStatus,
  AssignmentTargetType,
  DiscoveredApp,
  ModelAvailability,
} from '@/types/trainer';

const STATUS_STYLES: Record<AssignmentStatus, string> = {
  assigned: 'border-primary/40 bg-primary/15 text-primary',
  available: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  disabled: 'border-border bg-secondary text-muted-foreground',
};

export default function TrainedModelDashboard() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ['trained-model', id],
    queryFn: () => fetchTrainedModel(id),
    enabled: Boolean(id),
    refetchInterval: 8_000,
  });

  const model = detailQuery.data?.model;
  const discoveredApps = detailQuery.data?.discoveredApps ?? [];
  const gpu = detailQuery.data?.gpu ?? null;

  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [probing, setProbing] = useState(false);

  const [appName, setAppName] = useState('');
  const [processName, setProcessName] = useState('');
  const [targetType, setTargetType] = useState<AssignmentTargetType>('app');
  const [assignStatus, setAssignStatus] = useState<AssignmentStatus>('assigned');
  const [portInput, setPortInput] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [addingAssignment, setAddingAssignment] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const modelId = model?.id;
  const modelDisplayName = model?.displayName;
  const modelNotes = model?.notes;

  useEffect(() => {
    if (modelId) {
      setDisplayNameDraft(modelDisplayName ?? '');
      setNotesDraft(modelNotes ?? '');
    }
  }, [modelId, modelDisplayName, modelNotes]);

  const syncModelCache = () => {
    void queryClient.invalidateQueries({ queryKey: ['trained-model', id] });
    void queryClient.invalidateQueries({ queryKey: ['trained-models'] });
  };

  const handleAvailabilityChange = async (availability: ModelAvailability) => {
    if (!model) return;
    try {
      await updateTrainedModel(model.id, { availability });
      syncModelCache();
      toast.success(`Model marked as ${availability}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update availability');
    }
  };

  const handleSaveMeta = async () => {
    if (!model) return;
    setSavingMeta(true);
    try {
      await updateTrainedModel(model.id, {
        displayName: displayNameDraft.trim() || model.displayName,
        notes: notesDraft,
      });
      syncModelCache();
      toast.success('Model profile saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save model profile');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSelectDiscoveredApp = (app: DiscoveredApp) => {
    setAppName(app.name);
    setTargetType(app.targetType);
    setProcessName(app.processName || '');
    setPortInput(app.port ? String(app.port) : '');
    setPathInput(app.pathOrCommand);
  };

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model || !appName.trim()) return;
    setAddingAssignment(true);
    try {
      await addModelAssignment(model.id, {
        appName: appName.trim(),
        processName: processName.trim() || undefined,
        targetType,
        status: assignStatus,
        port: portInput.trim() ? Number(portInput.trim()) : undefined,
        pathOrCommand: pathInput.trim() || undefined,
        notes: assignNotes.trim() || undefined,
      });
      setAppName('');
      setProcessName('');
      setPortInput('');
      setPathInput('');
      setAssignNotes('');
      syncModelCache();
      toast.success('Target added to model routing');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add target');
    } finally {
      setAddingAssignment(false);
    }
  };

  const handleToggleAssignmentStatus = async (
    assignmentId: string,
    nextStatus: AssignmentStatus
  ) => {
    if (!model) return;
    try {
      await updateModelAssignment(model.id, assignmentId, { status: nextStatus });
      syncModelCache();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update target');
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (!model) return;
    try {
      await deleteModelAssignment(model.id, assignmentId);
      syncModelCache();
      toast.success('Target removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove target');
    }
  };

  const handleProbeTelemetry = async () => {
    if (!model) return;
    setProbing(true);
    try {
      await pingModelTelemetry(model.id);
      syncModelCache();
      toast.success('Live telemetry probe recorded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Telemetry probe failed');
    } finally {
      setProbing(false);
    }
  };

  const copyText = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 1500);
  };

  if (detailQuery.isLoading) {
    return <div className="panel p-8 text-muted-foreground">Generating model dashboard…</div>;
  }

  if (detailQuery.isError || !model) {
    return (
      <div className="panel p-8">
        <h1 className="text-xl font-semibold">Trained model not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The requested adapter may have been deleted or has not completed training yet.
        </p>
        <Button asChild variant="outline" className="mt-5 h-10 gap-2">
          <Link to="/trained">
            <ArrowLeft size={15} /> Back to trained models
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <Link
            to="/trained"
            className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} />
            Back to trained models
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
              <Sparkles size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-[10px]">
                Procedural Dashboard · {model.dashboardSpec.archetype}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight lg:text-3xl">
                {model.displayName}
              </h1>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                Base: {model.baseModel} · Adapter: {model.outputDir}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {model.dashboardSpec.capabilities.map((cap) => (
              <span key={cap} className="badge text-[11px] text-primary">
                {cap}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex rounded-lg border border-border bg-card p-1">
            {(['available', 'assigned', 'archived'] as const).map((state) => (
              <button
                key={state}
                type="button"
                onClick={() => void handleAvailabilityChange(state)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  model.availability === state
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {state}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            className="h-10 gap-2"
            disabled={probing}
            onClick={() => void handleProbeTelemetry()}
          >
            <Radio size={15} className="text-primary" />
            {probing ? 'Probing…' : 'Probe telemetry'}
          </Button>

          <Button
            variant="outline"
            className="h-10 gap-2"
            onClick={() => {
              downloadFile(
                `${model.displayName.replace(/\s+/g, '-').toLowerCase()}-dashboard.json`,
                model.dashboardSpec.jsonDescriptor
              );
              toast.success('Model descriptor downloaded');
            }}
          >
            <Download size={15} />
            Export descriptor
          </Button>
        </div>
      </div>

      {/* Procedurally generated KPI strip */}
      <section
        aria-label="Model telemetry KPIs"
        className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-5"
      >
        {model.dashboardSpec.kpis.map((kpi, idx) => (
          <div
            key={kpi.id}
            className={`p-5 ${idx ? 'border-l border-border' : ''} ${
              idx > 1 ? 'border-t lg:border-t-0' : ''
            }`}
          >
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="mt-3 font-mono text-2xl font-semibold tracking-tight">{kpi.value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{kpi.detail}</p>
          </div>
        ))}
      </section>

      {/* App & Process Routing + Live Hardware Telemetry */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="panel min-w-0 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title flex items-center gap-2">
                <Link2 size={18} className="text-primary" />
                App &amp; process assignments
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Track and configure which local apps, services, or processes can use this adapter.
              </p>
            </div>
            <span className="badge font-mono text-xs">{model.assignments.length} targets</span>
          </div>

          {/* Quick-pick discovered apps */}
          {discoveredApps.length > 0 && (
            <div className="mt-5">
              <p className="eyebrow mb-2 text-[10px]">Quick-pick workspace apps &amp; services</p>
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-background p-2.5">
                {discoveredApps.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => handleSelectDiscoveredApp(app)}
                    className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {app.name}
                    {app.port ? ` :${app.port}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add assignment form */}
          <form
            onSubmit={(e) => void handleAddAssignment(e)}
            className="mt-4 grid gap-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-6"
          >
            <div className="sm:col-span-2">
              <label htmlFor="assign-app-name" className="mb-1 block text-xs text-muted-foreground">
                App or service name
              </label>
              <input
                id="assign-app-name"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="e.g. Kush Engine"
                className="field min-h-10 text-sm"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="assign-process" className="mb-1 block text-xs text-muted-foreground">
                Process match
              </label>
              <input
                id="assign-process"
                value={processName}
                onChange={(e) => setProcessName(e.target.value)}
                placeholder="e.g. python, node"
                className="field min-h-10 text-sm"
              />
            </div>

            <div>
              <label htmlFor="assign-port" className="mb-1 block text-xs text-muted-foreground">
                Port
              </label>
              <input
                id="assign-port"
                type="number"
                value={portInput}
                onChange={(e) => setPortInput(e.target.value)}
                placeholder="8899"
                className="field min-h-10 text-sm"
              />
            </div>

            <div>
              <label htmlFor="assign-status" className="mb-1 block text-xs text-muted-foreground">
                Role
              </label>
              <select
                id="assign-status"
                value={assignStatus}
                onChange={(e) => setAssignStatus(e.target.value as AssignmentStatus)}
                className="field min-h-10 text-sm"
              >
                <option value="assigned">Assigned</option>
                <option value="available">Available</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="assign-path" className="mb-1 block text-xs text-muted-foreground">
                Workspace path / command hint
              </label>
              <input
                id="assign-path"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="C:\25th_Dynasty_Workspace\Projects\..."
                className="field min-h-10 font-mono text-xs"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="assign-type" className="mb-1 block text-xs text-muted-foreground">
                Target type
              </label>
              <select
                id="assign-type"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as AssignmentTargetType)}
                className="field min-h-10 text-sm"
              >
                <option value="app">App</option>
                <option value="process">Process</option>
                <option value="service">Service</option>
              </select>
            </div>

            <div className="flex items-end">
              <Button
                type="submit"
                disabled={addingAssignment || !appName.trim()}
                className="h-10 w-full gap-1.5"
              >
                <Plus size={15} />
                Add
              </Button>
            </div>
          </form>

          {/* Configured targets list */}
          <div className="mt-5 space-y-3">
            {model.assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-background p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        assignment.liveStatus === 'online'
                          ? 'bg-emerald-400'
                          : 'bg-muted-foreground/40'
                      }`}
                    />
                    <span className="font-medium">{assignment.appName}</span>
                    <span className="badge text-[10px] capitalize text-muted-foreground">
                      {assignment.targetType}
                    </span>
                    <span className={`badge text-[10px] capitalize ${STATUS_STYLES[assignment.status]}`}>
                      {assignment.status}
                    </span>
                    <span className="badge font-mono text-[10px]">
                      {assignment.liveStatus === 'online'
                        ? `ONLINE${assignment.matchedPid ? ` · PID ${assignment.matchedPid}` : ''}${
                            assignment.memoryMb ? ` · ${assignment.memoryMb} MB` : ''
                          }`
                        : 'OFFLINE'}
                    </span>
                  </div>

                  <p className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground">
                    {assignment.port ? `:${assignment.port} · ` : ''}
                    {assignment.matchedProcess ? `${assignment.matchedProcess} · ` : ''}
                    {assignment.pathOrCommand || assignment.processName || 'No path/command filter'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  {(['assigned', 'available', 'disabled'] as const).map((nextState) => (
                    <button
                      key={nextState}
                      type="button"
                      onClick={() => void handleToggleAssignmentStatus(assignment.id, nextState)}
                      className={`rounded-md border px-2.5 py-1 text-[11px] capitalize transition-colors ${
                        assignment.status === nextState
                          ? 'border-primary/40 bg-primary/15 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {nextState}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label={`Remove ${assignment.appName}`}
                    onClick={() => void handleRemoveAssignment(assignment.id)}
                    className="icon-button h-8 w-8 hover:text-destructive"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}

            {!model.assignments.length && (
              <p className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                No apps or processes linked yet. Pick a workspace app above or enter a custom target
                to track its live online/offline status.
              </p>
            )}
          </div>
        </section>

        {/* Live Telemetry & Event Feed */}
        <div className="min-w-0 space-y-6">
          <section className="panel p-6">
            <div className="flex items-center justify-between">
              <h2 className="section-title flex items-center gap-2">
                <Activity size={18} className="text-primary" />
                Live system telemetry
              </h2>
              <Cpu size={17} className="text-muted-foreground" />
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-background p-4">
              <Cpu size={24} className={gpu ? 'text-primary' : 'text-muted-foreground'} />
              <div>
                <p className="text-sm font-medium">{gpu ? gpu.name : 'GPU telemetry unavailable'}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {gpu
                    ? `Util ${gpu.utilizationPct}% · ${gpu.temperatureC}°C · ${(gpu.freeMb / 1024).toFixed(1)}/${(gpu.totalMb / 1024).toFixed(1)} GB free`
                    : 'Waiting for nvidia-smi'}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-background p-3.5">
                <p className="eyebrow text-[10px]">OS Processes scanned</p>
                <p className="mt-2 font-mono text-lg font-semibold">
                  {detailQuery.data?.liveProcessCount ?? 0}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3.5">
                <p className="eyebrow text-[10px]">Listening ports</p>
                <p className="mt-2 font-mono text-lg font-semibold">
                  {detailQuery.data?.listeningPortCount ?? 0}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <p className="eyebrow mb-2 text-[10px]">Telemetry event log</p>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border bg-background p-3">
                {[...model.telemetryLog].reverse().map((entry) => (
                  <div key={entry.id} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="font-mono uppercase text-primary">{entry.event}</span>
                      <span className="font-mono">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs">{entry.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel p-6">
            <h2 className="section-title">Model profile &amp; notes</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="model-display-name" className="mb-1 block text-xs text-muted-foreground">
                  Display name
                </label>
                <input
                  id="model-display-name"
                  value={displayNameDraft}
                  onChange={(e) => setDisplayNameDraft(e.target.value)}
                  className="field min-h-10 text-sm"
                />
              </div>
              <div>
                <label htmlFor="model-notes" className="mb-1 block text-xs text-muted-foreground">
                  Deployment / prompt notes
                </label>
                <textarea
                  id="model-notes"
                  rows={3}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Record system prompt conventions, target app notes, or evaluation observations…"
                  className="field text-sm"
                />
              </div>
              <Button
                variant="outline"
                className="h-10 w-full gap-2"
                disabled={savingMeta}
                onClick={() => void handleSaveMeta()}
              >
                <Save size={15} />
                {savingMeta ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </section>
        </div>
      </div>

      {/* Procedurally generated telemetry charts */}
      <section className="space-y-4">
        <div>
          <h2 className="section-title">Training &amp; convergence telemetry</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Generated automatically from recorded trainer metrics ({model.telemetrySeries.length}{' '}
            steps).
          </p>
        </div>
        <TrainedTelemetryCharts
          widgets={model.dashboardSpec.metricsWidgets}
          series={model.telemetrySeries}
        />
      </section>

      {/* Architecture, Artifacts & Integration */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel min-w-0 p-6">
          <h2 className="section-title flex items-center gap-2">
            <Layers3 size={18} className="text-primary" />
            Architecture &amp; adapter spec
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-muted-foreground">Architecture</p>
              <p className="mt-1 font-mono">{model.architecture.architectureName}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-muted-foreground">LoRA rank / alpha</p>
              <p className="mt-1 font-mono">
                r={model.rank} · α={model.loraAlpha}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-muted-foreground">Hidden / Layers</p>
              <p className="mt-1 font-mono">
                {model.architecture.hiddenSize ?? '—'} · {model.architecture.numLayers ?? '—'} layers
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-muted-foreground">Vocab / Context</p>
              <p className="mt-1 font-mono">
                {model.architecture.vocabSize?.toLocaleString() ?? '—'} ·{' '}
                {model.architecture.maxPositionEmbeddings?.toLocaleString() ?? '—'}
              </p>
            </div>
          </div>

          {model.targetModules.length > 0 && (
            <div className="mt-4">
              <p className="eyebrow mb-2 text-[10px]">Target LoRA modules</p>
              <div className="flex flex-wrap gap-1.5">
                {model.targetModules.map((mod) => (
                  <span key={mod} className="badge font-mono text-[11px]">
                    {mod}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <p className="eyebrow mb-2 flex items-center gap-1.5 text-[10px]">
              <FolderOpen size={12} /> Saved checkpoints ({model.checkpoints.length})
            </p>
            <div className="space-y-2">
              {model.checkpoints.map((cp) => (
                <div
                  key={cp.name}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs"
                >
                  <span className="font-mono font-medium">{cp.name}</span>
                  <span className="text-muted-foreground">
                    {cp.epoch !== undefined ? `Epoch ${cp.epoch} · ` : ''}
                    {cp.sizeFormatted}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <p className="eyebrow mb-2 flex items-center gap-1.5 text-[10px]">
              <HardDrive size={12} /> Output artifacts ({model.files.length})
            </p>
            <div className="max-h-44 space-y-1.5 overflow-y-auto">
              {model.files.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                >
                  <span className="truncate font-mono">{file.name}</span>
                  <span className="font-mono text-muted-foreground">{file.sizeFormatted}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel min-w-0 p-6">
          <div className="flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2">
              <FileCode2 size={18} className="text-primary" />
              Procedural integration snippet
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void copyText('python', model.dashboardSpec.pythonSnippet)}
            >
              {copiedKey === 'python' ? <Check size={13} /> : <Copy size={13} />}
              Copy Python
            </Button>
          </div>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-background p-4 font-mono text-xs leading-6 text-foreground">
            {model.dashboardSpec.pythonSnippet}
          </pre>

          <div className="mt-5 flex items-center justify-between">
            <p className="eyebrow text-[10px]">Runtime descriptor JSON</p>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void copyText('json', model.dashboardSpec.jsonDescriptor)}
            >
              {copiedKey === 'json' ? <Check size={13} /> : <Copy size={13} />}
              Copy JSON
            </Button>
          </div>
          <pre className="mt-2 max-h-60 overflow-auto rounded-lg border border-border bg-background p-4 font-mono text-xs leading-5 text-muted-foreground">
            {model.dashboardSpec.jsonDescriptor}
          </pre>
        </section>
      </div>
    </div>
  );
}
