import { ArrowUpRight, Download, FileText, MessageSquare, ScanLine, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTrainer } from '@/hooks/useTrainer';
import { downloadFile } from '@/lib/download';
import type { DatasetKind } from '@/types/trainer';

interface DatasetTableProps {
  compact?: boolean;
}

const KIND_ICONS: Record<DatasetKind, typeof FileText> = {
  Documents: FileText,
  Conversations: MessageSquare,
  Screen: ScanLine,
};

export default function DatasetTable({ compact = false }: DatasetTableProps) {
  const { datasets, removeDataset } = useTrainer();
  const visibleDatasets = compact ? datasets.slice(0, 3) : datasets;

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="section-title">{compact ? 'Your datasets' : 'Dataset library'}</h2>
          <span className="badge text-muted-foreground">{datasets.length}</span>
        </div>

        {compact && (
          <Link
            to="/datasets"
            className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            View all <ArrowUpRight size={14} />
          </Link>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-y border-border bg-background/50 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-6 py-3 font-medium">Dataset name</th>
              <th className="px-4 py-3 font-medium">Examples</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Size</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-6 py-3 text-right font-medium">
                {compact ? 'Status' : 'Actions'}
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleDatasets.map((dataset) => {
              const Icon = KIND_ICONS[dataset.kind];
              return (
                <tr
                  key={dataset.id}
                  className="border-b border-border last:border-b-0 hover:bg-secondary/40"
                >
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-3 whitespace-nowrap">
                      <span className="rounded-lg border border-border bg-secondary p-2 text-muted-foreground">
                        <Icon size={16} />
                      </span>
                      <span className="font-medium">
                        {dataset.name}
                        <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                          {dataset.content ? 'Locally captured' : 'Sample dataset'} ·{' '}
                          {dataset.created}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs">
                    {dataset.examples.toLocaleString()}
                  </td>
                  <td className="hidden px-4 py-4 text-xs text-muted-foreground sm:table-cell">
                    {dataset.size}
                  </td>
                  <td className="px-4 py-4">
                    <span className="badge text-[10px] text-muted-foreground">{dataset.kind}</span>
                  </td>
                  <td className="px-6 py-4">
                    {compact ? (
                      <span className="flex items-center justify-end gap-1.5 text-xs text-primary">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        Ready
                      </span>
                    ) : (
                      <span className="flex justify-end">
                        <button
                          type="button"
                          aria-label={`Download ${dataset.name}`}
                          className="icon-button"
                          onClick={() => {
                            if (!dataset.content) {
                              toast.info(
                                'Sample dataset metadata only. Import your own data to export content.'
                              );
                              return;
                            }
                            const ext = dataset.kind === 'Screen' ? 'json' : 'jsonl';
                            downloadFile(`${dataset.name}.${ext}`, dataset.content);
                            toast.success('Dataset downloaded');
                          }}
                        >
                          <Download size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${dataset.name}`}
                          className="icon-button hover:text-destructive"
                          onClick={() => removeDataset(dataset.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!visibleDatasets.length && (
          <div className="p-10 text-center text-muted-foreground">
            No datasets yet. Import your first file in Capture studio.
          </div>
        )}
      </div>
    </section>
  );
}
