import { AlertCircle, ArrowUpRight, CircleCheck, Layers3, Pause, Play, Sparkles, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTrainer } from '@/hooks/useTrainer';
import LossChart from '@/components/features/LossChart';

export default function ActiveRun() {
  const { runs, toggleRun, repairEnvironment } = useTrainer();
  const run = runs[0];

  if (!run) {
    return (
      <div className="panel p-8">
        <Layers3 className="text-primary" />
        <h2 className="section-title mt-4">Your first model starts here</h2>
        <p className="mt-2 text-muted-foreground">
          Select a local model from your Model Hub (:8899) and start a training run.
        </p>
      </div>
    );
  }

  const lossDisplay =
    typeof run.currentLoss === 'number' ? run.currentLoss.toFixed(3) : '—';
  const currentEpoch = Math.ceil((run.progress / 100) * run.epochs);
  const statusLabel =
    run.status === 'running'
      ? 'Training'
      : run.status === 'paused'
        ? 'Paused'
        : run.status === 'failed'
          ? 'Failed'
          : 'Completed';

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-5">
        <h2 className="section-title">Training monitor</h2>
        <Link
          to="/training"
          className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          View runs <ArrowUpRight size={14} />
        </Link>
      </div>

      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Layers3 size={19} />
            </span>
            <div>
              <h3 className="font-semibold">{run.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {run.model} <span className="mx-1.5">/</span> {run.method}
                {run.method === 'Full fine-tune' ? ' recipe' : ' adapter'}
              </p>
            </div>
          </div>

          <span
            className={`badge ${
              run.status === 'failed' ? 'border-destructive/40 text-destructive' : 'text-primary'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                run.status === 'failed' ? 'bg-destructive' : 'bg-primary'
              }`}
            />
            {statusLabel}
          </span>
        </div>

        {run.error && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs leading-5 text-destructive">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{run.error}</span>
            </div>
            {/(CUDA|Python|Missing Python|Triton|CUBLAS|cuDNN)/i.test(run.error) && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-destructive/40 bg-background text-xs text-foreground hover:bg-secondary"
                onClick={() => void repairEnvironment()}
              >
                <Wrench size={13} />
                Auto-fix CUDA
              </Button>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-between text-xs">
          <span className="text-muted-foreground">
            Training progress{' '}
            <span className="ml-2 font-mono text-foreground">
              {currentEpoch} / {run.epochs} epochs
            </span>
          </span>
          <span className="font-mono text-primary">{run.progress}%</span>
        </div>

        <div className="mt-2 h-1.5 rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all ${
              run.status === 'failed' ? 'bg-destructive' : 'bg-primary'
            }`}
            style={{ width: `${run.progress}%` }}
          />
        </div>

        <div className="mt-6 flex items-end justify-between">
          <div>
            <p className="eyebrow text-[10px]">Training loss</p>
            <p className="mt-2 font-mono text-2xl">{lossDisplay}</p>
          </div>
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Live worker telemetry
          </span>
        </div>

        <LossChart lossHistory={run.lossHistory} />

        {run.logs && run.logs.length > 0 && (
          <div className="mt-4 max-h-28 overflow-y-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-5 text-muted-foreground">
            {run.logs.slice(-6).map((line, idx) => (
              <div key={idx} className="truncate">
                {line}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Rank {run.rank} <span className="mx-2">·</span> LR {run.learningRate}{' '}
            <span className="mx-2">·</span>{' '}
            {run.method === 'QLoRA' ? '4-bit quantization' : run.method}
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            {run.status === 'completed' && (
              <Button asChild className="h-10 gap-2">
                <Link to={`/trained/${run.id}`}>
                  <Sparkles size={14} />
                  Model dashboard
                </Link>
              </Button>
            )}

            <Button
              variant="outline"
              className="h-10 gap-2"
              disabled={run.status === 'completed'}
              onClick={() => void toggleRun(run.id)}
            >
              {run.status === 'running' ? (
                <Pause size={14} />
              ) : run.status === 'completed' ? (
                <CircleCheck size={14} />
              ) : (
                <Play size={14} />
              )}
              {run.status === 'running'
                ? 'Pause run'
                : run.status === 'completed'
                  ? 'Finished'
                  : run.status === 'failed'
                    ? 'Retry run'
                    : 'Resume run'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
