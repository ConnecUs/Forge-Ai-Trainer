import { Download, Layers3, Pause, Play, Sparkles, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useTrainer } from '@/hooks/useTrainer';
import { downloadFile } from '@/lib/download';

export default function RunHistory() {
  const { runs, toggleRun, removeRun } = useTrainer();

  return (
    <section className="panel p-6">
      <h2 className="section-title mb-5">
        Run history <span className="ml-2 text-sm text-muted-foreground">{runs.length}</span>
      </h2>

      <div className="space-y-3">
        {runs.map((run) => (
          <div
            key={run.id}
            className="flex flex-wrap items-center justify-between gap-5 rounded-lg border border-border p-4"
          >
            <div className="flex items-center gap-3">
              <Layers3 className="text-primary" size={20} />
              <div>
                <h3 className="text-sm font-medium">{run.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {run.model} · {run.method} · {run.created}
                </p>
                {run.error && <p className="mt-1 text-xs text-destructive">{run.error}</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <span
                className={`badge ${
                  run.status === 'failed' ? 'border-destructive/40 text-destructive' : 'text-primary'
                }`}
              >
                {run.status}
              </span>
              <span className="font-mono text-xs">{run.progress}%</span>
              {run.status === 'completed' && (
                <Button asChild variant="outline" className="h-11 gap-2 border-primary/30 text-primary">
                  <Link to={`/trained/${run.id}`}>
                    <Sparkles size={14} />
                    Dashboard
                  </Link>
                </Button>
              )}
              <Button
                variant="outline"
                className="h-11 gap-2"
                disabled={run.status === 'completed'}
                onClick={() => void toggleRun(run.id)}
              >
                {run.status === 'running' ? <Pause size={14} /> : <Play size={14} />}
                {run.status === 'running'
                  ? 'Pause'
                  : run.status === 'failed'
                    ? 'Retry'
                    : 'Resume'}
              </Button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Export logs for ${run.name}`}
                onClick={() => {
                  downloadFile(
                    `${run.name}-run-log.json`,
                    JSON.stringify(run, null, 2)
                  );
                  toast.success('Run log downloaded');
                }}
              >
                <Download size={17} />
              </button>
              <button
                type="button"
                className="icon-button hover:text-destructive"
                aria-label={`Delete ${run.name}`}
                onClick={() => void removeRun(run.id)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>
        ))}

        {!runs.length && (
          <p className="py-8 text-muted-foreground">
            No runs yet. Create your first training configuration.
          </p>
        )}
      </div>
    </section>
  );
}
