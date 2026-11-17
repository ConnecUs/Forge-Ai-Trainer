import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Info, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { BASE_MODELS } from '@/constants/trainer';
import { useTrainer } from '@/hooks/useTrainer';
import { trainingSchema, type TrainingValues } from '@/lib/validations';
import type { HubModel } from '@/types/trainer';

const HYPERPARAM_FIELDS = [
  { key: 'epochs', label: 'Epochs', type: 'number' },
  { key: 'rank', label: 'LoRA rank', type: 'number' },
  { key: 'learningRate', label: 'Learning rate', type: 'text' },
] as const;

interface NewRunDialogProps {
  preselectedModel?: HubModel;
  triggerLabel?: string;
}

function formatModelOptionLabel(model: HubModel): string {
  const parts = model.path.split(/[\\/]/).filter(Boolean);
  const hfRepo = parts.find((p) => p.startsWith('models--'));
  const repoLabel = hfRepo
    ? hfRepo.replace(/^models--/, '').replace(/--/g, '/')
    : parts[parts.length - 2] || '';
  const prefix = repoLabel && !model.name.includes(repoLabel) ? `${repoLabel} / ` : '';
  return `${prefix}${model.name} (${model.format} · ${model.size_formatted})`;
}

export default function NewRunDialog({
  preselectedModel,
  triggerLabel = 'New training run',
}: NewRunDialogProps) {
  const [open, setOpen] = useState(false);
  const [modelFilter, setModelFilter] = useState('');
  const [trainableOnly, setTrainableOnly] = useState(!preselectedModel);
  const { datasets, hubModels, startRun } = useTrainer();
  const navigate = useNavigate();

  const readyDatasets = useMemo(
    () => datasets.filter((d) => Boolean(d.filePath || d.content)),
    [datasets]
  );

  const modelOptions = useMemo(() => {
    const query = modelFilter.trim().toLowerCase();
    if (hubModels.length > 0) {
      const base = trainableOnly
        ? hubModels.filter((m) => Boolean(m.trainable))
        : hubModels;
      const filtered = query
        ? base.filter(
            (m) =>
              m.name.toLowerCase().includes(query) ||
              (m.architecture || '').toLowerCase().includes(query) ||
              m.format.toLowerCase().includes(query) ||
              m.path.toLowerCase().includes(query)
          )
        : base;
      return filtered.slice(0, 80);
    }
    return [];
  }, [hubModels, modelFilter, trainableOnly]);

  const defaultModel = preselectedModel || modelOptions[0] || hubModels[0];
  const defaultModelName = defaultModel?.name || BASE_MODELS[0].name;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<TrainingValues>({
    resolver: zodResolver(trainingSchema),
    defaultValues: {
      name: 'Personal assistant v3',
      model: defaultModelName,
      modelId: defaultModel?.id,
      modelPath: defaultModel?.path,
      method: 'QLoRA',
      dataset: readyDatasets[0]?.name || datasets[0]?.name || '',
      epochs: 3,
      rank: 16,
      learningRate: '0.0002',
      autoBalance: true,
    },
  });

  const selectedModelName = watch('model');
  const selectedDatasetName = watch('dataset');

  useEffect(() => {
    if (preselectedModel) {
      setValue('model', preselectedModel.name);
      setValue('modelId', preselectedModel.id);
      setValue('modelPath', preselectedModel.path);
      return;
    }
    if (modelOptions.length > 0 && !modelOptions.some((m) => m.name === selectedModelName)) {
      const first = modelOptions[0];
      setValue('model', first.name);
      setValue('modelId', first.id);
      setValue('modelPath', first.path);
    }
  }, [preselectedModel, modelOptions, selectedModelName, setValue]);

  useEffect(() => {
    if (
      readyDatasets.length > 0 &&
      !readyDatasets.some((d) => d.name === selectedDatasetName)
    ) {
      setValue('dataset', readyDatasets[0].name);
    }
  }, [readyDatasets, selectedDatasetName, setValue]);

  const selectedHubModel = hubModels.find((m) => m.name === selectedModelName);

  const onSubmit = async (values: TrainingValues) => {
    const matched = hubModels.find((m) => m.name === values.model);
    await startRun({
      ...values,
      modelId: matched?.id ?? values.modelId,
      modelPath: matched?.path ?? values.modelPath,
    });
    setOpen(false);
    reset();
    navigate('/training');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11 gap-2 px-5 font-semibold transition-transform hover:-translate-y-0.5">
          <Plus size={17} /> {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <p className="eyebrow mb-2">Model Hub (:8899) · Local Training</p>
          <DialogTitle className="text-2xl">Configure a training run</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-3 space-y-4">
          <div>
            <label htmlFor="run-name" className="mb-2 block text-sm">
              Run name
            </label>
            <input id="run-name" className="field" {...register('name')} />
            {errors.name && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                ! {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="base-model" className="text-sm">
                Base model {modelOptions.length > 0 ? `(${modelOptions.length} shown)` : ''}
              </label>
              {hubModels.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTrainableOnly((prev) => !prev)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                      trainableOnly
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {trainableOnly ? 'Verified trainable' : 'All formats'}
                  </button>
                  <input
                    type="text"
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    placeholder="Filter models…"
                    className="h-8 w-40 rounded-md border border-border bg-background px-2.5 text-xs"
                  />
                </div>
              )}
            </div>
            <select
              id="base-model"
              className="field"
              {...register('model', {
                onChange: (event) => {
                  const chosen = hubModels.find((m) => m.name === event.target.value);
                  setValue('modelId', chosen?.id);
                  setValue('modelPath', chosen?.path);
                },
              })}
            >
              {modelOptions.length > 0
                ? modelOptions.map((model) => (
                    <option key={model.id} value={model.name}>
                      {formatModelOptionLabel(model)}
                    </option>
                  ))
                : BASE_MODELS.map((model) => (
                    <option key={model.id} value={model.name}>
                      {model.name}
                    </option>
                  ))}
            </select>
            {selectedHubModel && (
              <p className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground">
                {selectedHubModel.path}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="method" className="mb-2 block text-sm">
                Training method
              </label>
              <select id="method" className="field" {...register('method')}>
                <option value="QLoRA">QLoRA</option>
                <option value="LoRA">LoRA</option>
                <option value="Full fine-tune">Full fine-tune</option>
              </select>
            </div>

            <div>
              <label htmlFor="dataset" className="mb-2 block text-sm">
                Training dataset
              </label>
              <select id="dataset" className="field" {...register('dataset')}>
                <option value="">Select a dataset</option>
                {datasets.map((dataset) => {
                  const hasFile = Boolean(dataset.filePath || dataset.content);
                  return (
                    <option key={dataset.id} value={dataset.name} disabled={!hasFile}>
                      {dataset.name} · {dataset.examples} examples
                      {hasFile ? '' : ' (sample only — no file)'}
                    </option>
                  );
                })}
              </select>
              {errors.dataset && (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  ! {errors.dataset.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {HYPERPARAM_FIELDS.map((field) => (
              <div key={field.key}>
                <label htmlFor={field.key} className="mb-2 block text-sm">
                  {field.label}
                </label>
                <input
                  id={field.key}
                  type={field.type}
                  className="field"
                  {...register(field.key)}
                />
                {errors[field.key] && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    ! {errors[field.key]?.message}
                  </p>
                )}
              </div>
            ))}
          </div>

          <label
            htmlFor="auto-balance"
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-xs leading-5"
          >
            <input
              id="auto-balance"
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
              {...register('autoBalance')}
            />
            <span>
              <span className="font-medium text-foreground">
                Balance CUDA memory (recommended)
              </span>
              <span className="mt-0.5 block text-muted-foreground">
                Caps GPU VRAM around ~85% for Windows responsiveness, uses paged 8-bit AdamW, and
                switches oversized Full fine-tune / LoRA runs to 4-bit QLoRA instead of CPU/pagefile
                lockups.
              </span>
            </span>
          </label>

          <p className="flex gap-2 rounded-lg bg-secondary p-3 text-xs leading-5 text-muted-foreground">
            <Info size={17} className="shrink-0" />
            Dispatches a local Python LoRA/QLoRA worker to your GPU. Select a SafeTensors /
            HuggingFace model and an imported dataset on disk.
          </p>

          <Button type="submit" disabled={!datasets.length} className="h-11 w-full gap-2">
            Start local training <ArrowRight size={16} />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
