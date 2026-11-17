import { useRef, useState } from 'react';
import { Check, FileText, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useTrainer } from '@/hooks/useTrainer';
import { parseDatasetFile } from '@/lib/datasetParser';

export default function FileImport() {
  const { addDataset } = useTrainer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [lastFile, setLastFile] = useState('');

  const handleImport = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseDatasetFile(file);
      addDataset({
        ...parsed,
        kind: 'Documents',
      });
      setLastFile(file.name);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not read the file. Check that JSON or JSONL is valid.';
      toast.error(message);
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  return (
    <section className="panel p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="rounded-lg bg-primary/10 p-2.5 text-primary">
          <FileText size={20} />
        </span>
        <div>
          <h2 className="section-title">Files &amp; documents</h2>
          <p className="mt-1 text-xs text-muted-foreground">Knowledge worth keeping</p>
        </div>
      </div>

      <label htmlFor="dataset-file" className="mb-2 block text-sm text-muted-foreground">
        Training file
      </label>
      <input
        id="dataset-file"
        ref={inputRef}
        type="file"
        accept=".txt,.md,.json,.jsonl"
        className="sr-only"
        onChange={(event) => void handleImport(event.target.files?.[0])}
        disabled={busy}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!busy) {
            void handleImport(event.dataTransfer.files[0]);
          }
        }}
        className="flex min-h-[180px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/[0.025] px-4 hover:bg-primary/5"
      >
        {busy ? (
          <Loader2 size={25} className="animate-spin text-primary" />
        ) : (
          <Upload size={25} className="text-primary" />
        )}
        <span className="text-sm font-medium">
          {busy ? 'Preparing dataset…' : 'Drop a file or click to browse'}
        </span>
        <span className="text-xs text-muted-foreground">TXT, MD, JSON, JSONL · Up to 500 KB</span>
      </button>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Text paragraphs become training examples. JSONL records are validated before import. PDF
        and DOCX are not supported yet.
      </p>

      {lastFile && (
        <p className="mt-3 flex items-center gap-2 text-sm text-primary">
          <Check size={16} />
          Imported {lastFile}
        </p>
      )}
    </section>
  );
}
