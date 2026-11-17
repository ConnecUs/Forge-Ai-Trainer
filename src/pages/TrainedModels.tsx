import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  Cpu,
  HardDrive,
  Layers3,
  Link2,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeading from '@/components/layout/PageHeading';
import { useTrainer } from '@/hooks/useTrainer';
import type { ModelAvailability } from '@/types/trainer';

const AVAILABILITY_FILTERS = ['all', 'assigned', 'available', 'archived'] as const;

const AVAILABILITY_BADGE: Record<ModelAvailability, string> = {
  assigned: 'border-primary/40 bg-primary/10 text-primary',
  available: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  archived: 'border-border bg-secondary text-muted-foreground',
};

export default function TrainedModels() {
  const { trainedModels, discoveredApps, refreshTrainedModels } = useTrainer();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof AVAILABILITY_FILTERS)[number]>('all');

  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trainedModels.filter((model) => {
      if (filter !== 'all' && model.availability !== filter) return false;
      if (!q) return true;
      return (
        model.displayName.toLowerCase().includes(q) ||
        model.baseModel.toLowerCase().includes(q) ||
        model.dashboardSpec.archetype.toLowerCase().includes(q) ||
        model.assignments.some((a) => a.appName.toLowerCase().includes(q))
      );
    });
  }, [trainedModels, search, filter]);

  const stats = useMemo(() => {
    const totalAssignments = trainedModels.reduce(
      (sum, m) => sum + m.assignments.filter((a) => a.status === 'assigned').length,
      0
    );
    const liveOnline = trainedModels.reduce(
      (sum, m) =>
        sum + m.assignments.filter((a) => a.status !== 'disabled' && a.liveStatus === 'online').length,
      0
    );
    const totalBytes = trainedModels.reduce((sum, m) => sum + m.adapterBytes, 0);
    const formatSize = (bytes: number) => {
      if (bytes <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      let val = bytes;
      let idx = 0;
      while (val >= 1024 && idx < units.length - 1) {
        val /= 1024;
        idx += 1;
      }
      return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
    };

    return [
      {
        label: 'Trained adapters',
        value: String(trainedModels.length).padStart(2, '0'),
        detail: `${trainedModels.filter((m) => m.adapterReady).length} verified on disk`,
        icon: Layers3,
      },
      {
        label: 'Active assignments',
        value: String(totalAssignments).padStart(2, '0'),
        detail: `${liveOnline} target processes online`,
        icon: Link2,
      },
      {
        label: 'Workspace apps detected',
        value: String(discoveredApps.length).padStart(2, '0'),
        detail: 'Available for assignment',
        icon: Cpu,
      },
      {
        label: 'Adapter footprint',
        value: formatSize(totalBytes),
        detail: 'SafeTensors LoRA weights',
        icon: HardDrive,
      },
    ];
  }, [trainedModels, discoveredApps.length]);

  return (
    <>
      <PageHeading
        eyebrow="Registry · Assignments · Telemetry"
        title="Trained models"
        description="Manage your fine-tuned adapters, track app & process assignments, and open each model's procedurally generated telemetry dashboard."
        action={
          <Button variant="outline" className="h-11 gap-2" onClick={refreshTrainedModels}>
            <RefreshCw size={16} />
            Refresh telemetry
          </Button>
        }
      />

      <section
        aria-label="Trained model summary"
        className="mb-7 grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card xl:grid-cols-4"
      >
        {stats.map(({ label, value, detail, icon: Icon }, index) => (
          <div
            key={label}
            className={`p-5 lg:p-6 ${index ? 'border-l border-border' : ''} ${
              index > 1 ? 'border-t xl:border-t-0' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{label}</span>
              <Icon size={16} />
            </div>
            <div className="mt-4 text-[32px] font-semibold leading-none tracking-tight">{value}</div>
            <p className="mt-3 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </section>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
          {AVAILABILITY_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filter === item
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter trained models or apps…"
            className="h-10 w-64 rounded-lg border border-border bg-card pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      {filteredModels.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {filteredModels.map((model) => {
            const assignedTargets = model.assignments.filter((a) => a.status === 'assigned');
            const availableTargets = model.assignments.filter((a) => a.status === 'available');
            const onlineTargets = model.assignments.filter(
              (a) => a.status !== 'disabled' && a.liveStatus === 'online'
            );

            return (
              <article key={model.id} className="panel flex flex-col justify-between p-6">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                        <Sparkles size={20} />
                      </span>
                      <div>
                        <h2 className="text-lg font-semibold tracking-tight">
                          {model.displayName}
                        </h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {model.baseModel} · {model.dashboardSpec.archetype}
                        </p>
                      </div>
                    </div>

                    <span className={`badge capitalize ${AVAILABILITY_BADGE[model.availability]}`}>
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          model.availability === 'assigned'
                            ? 'bg-primary'
                            : model.availability === 'available'
                              ? 'bg-emerald-400'
                              : 'bg-muted-foreground'
                        }`}
                      />
                      {model.availability}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {model.dashboardSpec.capabilities.map((cap) => (
                      <span key={cap} className="badge text-[10px] text-muted-foreground">
                        {cap}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 grid grid-cols-4 gap-3 border-y border-border py-4">
                    <div>
                      <p className="eyebrow text-[10px]">Final loss</p>
                      <p className="mt-1.5 font-mono text-sm">
                        {typeof model.telemetrySummary.finalLoss === 'number'
                          ? model.telemetrySummary.finalLoss.toFixed(3)
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="eyebrow text-[10px]">Accuracy</p>
                      <p className="mt-1.5 font-mono text-sm">
                        {typeof model.telemetrySummary.finalAccuracy === 'number'
                          ? `${model.telemetrySummary.finalAccuracy.toFixed(1)}%`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="eyebrow text-[10px]">Adapter</p>
                      <p className="mt-1.5 font-mono text-sm">{model.adapterSizeFormatted}</p>
                    </div>
                    <div>
                      <p className="eyebrow text-[10px]">Live targets</p>
                      <p className="mt-1.5 font-mono text-sm">
                        {onlineTargets.length} / {model.assignments.length}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>App &amp; process routing</span>
                      <span>
                        {assignedTargets.length} assigned · {availableTargets.length} available
                      </span>
                    </div>

                    {model.assignments.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {model.assignments.map((assignment) => (
                          <span
                            key={assignment.id}
                            className={`badge text-[11px] ${
                              assignment.status === 'assigned'
                                ? 'border-primary/30 bg-primary/10 text-foreground'
                                : 'text-muted-foreground'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                assignment.liveStatus === 'online'
                                  ? 'bg-emerald-400'
                                  : 'bg-muted-foreground/50'
                              }`}
                            />
                            {assignment.appName}
                            {assignment.port ? `:${assignment.port}` : ''}
                            <span className="text-[10px] opacity-70">({assignment.status})</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No apps or processes assigned yet. Open the model dashboard to route it.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <span className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                    <Activity size={13} className="text-primary" />
                    {model.telemetrySummary.totalSteps} steps · rank {model.rank}
                  </span>

                  <Button asChild className="h-10 gap-2">
                    <Link to={`/trained/${model.id}`}>
                      Open procedural dashboard
                      <ArrowUpRight size={15} />
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel p-8 text-center">
          <Sparkles className="mx-auto text-primary" size={26} />
          <h2 className="mt-4 text-lg font-semibold">No trained models found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {trainedModels.length
              ? 'No trained models match your current filter.'
              : 'Complete a training run to unlock its procedurally generated dashboard and app assignment controls.'}
          </p>
          <Button asChild variant="outline" className="mt-5 h-10">
            <Link to="/training">Go to training runs</Link>
          </Button>
        </div>
      )}
    </>
  );
}
