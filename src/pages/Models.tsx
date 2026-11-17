import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Box, Download, Layers3, RefreshCw, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import PageHeading from '@/components/layout/PageHeading';
import NewRunDialog from '@/components/features/NewRunDialog';
import { useTrainer } from '@/hooks/useTrainer';
import { downloadFile } from '@/lib/download';

const FORMAT_FILTERS = ['Trainable', 'All', 'SafeTensors', 'GGUF', 'ONNX'] as const;

export default function Models() {
  const { runs, trainedModels, hubModels, hubStatus, refreshHub } = useTrainer();
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<(typeof FORMAT_FILTERS)[number]>('Trainable');

  const filteredModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return hubModels.filter((model) => {
      if (formatFilter === 'Trainable') {
        if (!model.trainable) return false;
      } else if (
        formatFilter !== 'All' &&
        model.format.toLowerCase() !== formatFilter.toLowerCase()
      ) {
        return false;
      }
      if (!query) return true;
      return (
        model.name.toLowerCase().includes(query) ||
        (model.architecture || '').toLowerCase().includes(query) ||
        model.path.toLowerCase().includes(query)
      );
    });
  }, [hubModels, search, formatFilter]);

  return (
    <>
      <PageHeading
        eyebrow="Connected to Model Hub (:8899)"
        title="Model library"
        description="Browse your local model repository and launch fine-tuning recipes."
        action={
          <Button variant="outline" className="h-11 gap-2" onClick={refreshHub}>
            <RefreshCw size={16} />
            Refresh Hub
          </Button>
        }
      />

      <div className="mb-7 rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-primary">
          <span>
            {hubStatus?.connected
              ? `Connected to Model Hub · ${hubStatus.totalCount} models (${hubStatus.totalSizeFormatted})`
              : 'Model Hub on port 8899 is offline'}
          </span>
          {hubStatus?.lastScanned && (
            <span className="text-xs font-normal text-muted-foreground">
              Last scanned: {hubStatus.lastScanned}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {hubStatus?.connected
            ? 'SafeTensors / HuggingFace directories can be fine-tuned directly with LoRA/QLoRA. GGUF and ONNX artifacts are shown as local inference references.'
            : hubStatus?.error || 'Start your Model Hub on port 8899 to browse local models.'}
        </p>
      </div>

      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="section-title">Training recipes &amp; adapters</h2>
            <span className="badge text-muted-foreground">{runs.length}</span>
          </div>
          {trainedModels.length > 0 && (
            <Link
              to="/trained"
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80"
            >
              <Sparkles size={14} />
              Manage trained models ({trainedModels.length})
              <ArrowUpRight size={14} />
            </Link>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {runs.map((run) => {
            const trained = trainedModels.find((m) => m.id === run.id);
            const assignedCount =
              trained?.assignments.filter((a) => a.status === 'assigned').length ?? 0;

            return (
              <article key={run.id} className="panel p-6">
                <div className="flex items-center justify-between">
                  <span className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-primary">
                    <Layers3 size={22} />
                  </span>
                  <div className="flex items-center gap-2">
                    {trained && (
                      <span className="badge border-primary/30 bg-primary/10 text-primary capitalize">
                        {trained.availability}
                        {assignedCount > 0 ? ` · ${assignedCount} apps` : ''}
                      </span>
                    )}
                    <span className="badge">{run.method}</span>
                  </div>
                </div>

                <h3 className="mt-5 text-lg font-semibold">{trained?.displayName || run.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {run.model} · {run.dataset}
                </p>

                <div className="mt-5 grid grid-cols-3 gap-3 border-y border-border py-4">
                  <div>
                    <p className="eyebrow text-[10px]">Rank</p>
                    <p className="mt-2 font-mono text-sm">{run.rank}</p>
                  </div>
                  <div>
                    <p className="eyebrow text-[10px]">Epochs</p>
                    <p className="mt-2 font-mono text-sm">{run.epochs}</p>
                  </div>
                  <div>
                    <p className="eyebrow text-[10px]">Run status</p>
                    <p className="mt-2 text-sm capitalize">{run.status}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {trained && (
                    <Button asChild className="h-11 flex-1 gap-2">
                      <Link to={`/trained/${trained.id}`}>
                        <Sparkles size={15} />
                        Open dashboard
                      </Link>
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    className={`h-11 gap-2 ${trained ? 'flex-1' : 'w-full'}`}
                    onClick={() => {
                      downloadFile(
                        `${run.name.replace(/\s+/g, '-').toLowerCase()}-config.json`,
                        JSON.stringify(
                          {
                            name: run.name,
                            base_model: run.model,
                            model_path: run.modelPath,
                            method: run.method,
                            dataset: run.dataset,
                            num_train_epochs: run.epochs,
                            lora_r: run.rank,
                            learning_rate: Number(run.learningRate),
                            load_in_4bit: run.method === 'QLoRA',
                            output_dir: run.outputDir,
                          },
                          null,
                          2
                        )
                      );
                      toast.success('Training configuration downloaded');
                    }}
                  >
                    <Download size={16} />
                    Export configuration
                  </Button>
                </div>
              </article>
            );
          })}
        </div>

        {!runs.length && (
          <div className="panel p-8 text-muted-foreground">
            Start a training run to create your first recipe.
          </div>
        )}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <h2 className="section-title">
              Local model repository{' '}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {filteredModels.length} shown
              </span>
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, arch, path…"
                className="h-10 w-56 rounded-lg border border-border bg-background pl-9 pr-3 text-sm"
              />
            </div>

            <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
              {FORMAT_FILTERS.map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormatFilter(fmt)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    formatFilter === fmt
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="divide-y divide-border border-t border-border">
          {filteredModels.slice(0, 60).map((model) => (
            <div
              key={model.id}
              className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 hover:bg-secondary/30"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Box size={19} className="shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-medium">{model.name}</h3>
                    <span className="badge text-[10px]">{model.format}</span>
                    {model.trainable ? (
                      <span className="badge border-primary/30 bg-primary/10 text-[10px] text-primary">
                        Verified trainable
                      </span>
                    ) : (
                      model.trainableReason && (
                        <span className="badge text-[10px] text-muted-foreground">
                          {model.trainableReason}
                        </span>
                      )
                    )}
                    {model.quantization && model.quantization !== 'Unknown' && (
                      <span className="badge text-[10px] text-muted-foreground">
                        {model.quantization}
                      </span>
                    )}
                    {model.architecture && model.architecture !== 'Unknown' && (
                      <span className="badge text-[10px] text-muted-foreground">
                        {model.architecture}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                    {model.path} · {model.size_formatted}
                  </p>
                </div>
              </div>

              <NewRunDialog preselectedModel={model} triggerLabel="Train" />
            </div>
          ))}

          {!filteredModels.length && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {hubStatus?.connected
                ? 'No models match your current filter.'
                : 'Model Hub on port 8899 is not reachable.'}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
