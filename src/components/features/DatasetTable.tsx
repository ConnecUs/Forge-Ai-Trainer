import { useState } from 'react';
import {
  ArrowUpRight,
  Download,
  Eye,
  FileText,
  MessageSquare,
  ScanLine,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LexiconTip } from '@/components/ui/lexicon-tip';
import { useTrainer } from '@/hooks/useTrainer';
import { fetchDatasetPreview } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import type { DatasetKind, DatasetPreviewResponse } from '@/types/trainer';

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
  const [preview, setPreview] = useState<DatasetPreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const handleInspect = async (id: string) => {
    setLoadingPreview(true);
    try {
      const data = await fetchDatasetPreview(id);
      setPreview(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to preview dataset');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownload = async (id: string, name: string, kind: DatasetKind, content?: string) => {
    const ext = kind === 'Screen' ? 'json' : 'jsonl';
    if (content) {
      downloadFile(`${name}.${ext}`, content);
      toast.success('Dataset downloaded');
      return;
    }
    try {
      const response = await fetch(`/api/datasets/${encodeURIComponent(id)}/download`);
      if (!response.ok) {
        toast.info('Sample dataset metadata only. Build or import data to export content.');
        return;
      }
      const text = await response.text();
      downloadFile(`${name}.${ext}`, text);
      toast.success('Dataset downloaded');
    } catch {
      toast.error('Failed to download dataset');
    }
  };

  return (
    <>
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
                const isLocalReady = Boolean(dataset.filePath || dataset.content);
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
                            {isLocalReady ? 'Ready on local disk' : 'Sample metadata only'} ·{' '}
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
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isLocalReady ? 'bg-primary' : 'bg-muted-foreground'
                            }`}
                          />
                          {isLocalReady ? 'Ready' : 'Sample'}
                        </span>
                      ) : (
                        <span className="flex justify-end">
                          <LexiconTip termKey="trainingDataset">
                            <button
                              type="button"
                              aria-label={`Inspect ${dataset.name}`}
                              className="icon-button"
                              disabled={loadingPreview}
                              onClick={() => void handleInspect(dataset.id)}
                            >
                              <Eye size={16} />
                            </button>
                          </LexiconTip>
                          <button
                            type="button"
                            aria-label={`Download ${dataset.name}`}
                            className="icon-button"
                            onClick={() =>
                              void handleDownload(
                                dataset.id,
                                dataset.name,
                                dataset.kind,
                                dataset.content
                              )
                            }
                          >
                            <Download size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${dataset.name}`}
                            className="icon-button hover:text-destructive"
                            onClick={() => void removeDataset(dataset.id)}
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
              No datasets yet. Build one in Skill studio or import a file in Capture studio.
            </div>
          )}
        </div>
      </section>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[760px]">
          <DialogHeader>
            <p className="eyebrow text-[10px] text-primary">Dataset Inspector</p>
            <DialogTitle className="text-xl">{preview?.dataset.name}</DialogTitle>
          </DialogHeader>

          {preview && (
            <div className="space-y-4 overflow-hidden">
              <div className="flex flex-wrap gap-2">
                <span className="badge font-mono text-xs">Schema: {preview.format}</span>
                <span className="badge font-mono text-xs">
                  {preview.totalLines.toLocaleString()} records
                </span>
                <span className="badge font-mono text-xs">~{preview.avgChars} chars/record</span>
              </div>

              <div className="max-h-[55vh] space-y-2.5 overflow-y-auto pr-1">
                {preview.sampleRows.map((row, idx) => (
                  <pre
                    key={idx}
                    className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-5 text-foreground"
                  >
                    {JSON.stringify(row, null, 2)}
                  </pre>
                ))}
                {!preview.sampleRows.length && (
                  <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    Sample dataset has no JSONL file on disk. Use Skill &amp; Knowledge Studio or
                    Capture Studio to create a trainable dataset.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
