import { Activity, ArrowUpRight, Box, Database, Layers3 } from 'lucide-react';
import { useTrainer } from '@/hooks/useTrainer';

export default function StatOverview() {
  const { runs, datasets } = useTrainer();

  const stats = [
    {
      label: 'Training runs',
      value: String(runs.length).padStart(2, '0'),
      detail: `${runs.filter((run) => run.status === 'running').length} running now`,
      icon: Layers3,
    },
    {
      label: 'Training examples',
      value: datasets.reduce((sum, dataset) => sum + dataset.examples, 0).toLocaleString(),
      detail: `${datasets.length} datasets in library`,
      icon: Database,
    },
    {
      label: 'Ready configurations',
      value: String(runs.filter((run) => run.status === 'completed').length).padStart(2, '0'),
      detail: 'Local-agent export ready',
      icon: Box,
    },
    {
      label: 'Training efficiency',
      value: '4-bit',
      detail: 'QLoRA quantization',
      icon: Activity,
    },
  ];

  return (
    <section
      aria-label="Workspace statistics"
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
          <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            {index === 1 && <ArrowUpRight size={13} className="text-primary" />}
            {detail}
          </p>
        </div>
      ))}
    </section>
  );
}
