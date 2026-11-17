import { useLocation } from 'react-router-dom';
import { BookOpen, ChevronRight, Cpu, HelpCircle, WifiOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { LexiconGuideDialog } from '@/components/ui/lexicon-tip';
import { useTrainer } from '@/hooks/useTrainer';

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Overview',
  '/training': 'Training runs',
  '/trained': 'Trained models',
  '/skills': 'Skill & knowledge studio',
  '/datasets': 'Datasets',
  '/capture': 'Capture studio',
  '/models': 'Model library',
};

export default function Header() {
  const { pathname } = useLocation();
  const { environment } = useTrainer();
  const hubConnected = Boolean(environment?.hub?.connected);
  const agentConnected = Boolean(environment?.agentConnected);
  const pageTitle =
    ROUTE_TITLES[pathname] ||
    (pathname.startsWith('/trained/') ? 'Model dashboard' : 'Page not found');

  return (
    <header className="flex h-[72px] items-center justify-between gap-4 border-b border-border px-5 lg:px-9">
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden text-muted-foreground sm:inline">Workspace</span>
        <ChevronRight size={14} className="hidden text-muted-foreground sm:block" />
        <span>{pageTitle}</span>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`badge ${
            hubConnected ? 'border-primary/30 text-primary' : 'text-muted-foreground'
          }`}
        >
          {hubConnected ? <Cpu size={13} /> : <WifiOff size={13} />}
          {hubConnected
            ? `Hub :8899 · ${environment?.hub.modelCount ?? 0} models`
            : agentConnected
              ? 'Hub :8899 offline'
              : 'Agent offline'}
        </span>

        <LexiconGuideDialog
          trigger={
            <button
              type="button"
              className="badge cursor-pointer border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <HelpCircle size={13} className="text-primary" />
              Lexicon &amp; guide
            </button>
          }
        />

        <Dialog>
          <DialogTrigger className="icon-button" aria-label="Open workspace guide">
            <BookOpen size={18} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Welcome to Froge Trainer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm leading-6 text-muted-foreground">
              <p>
                1. Import text or JSONL files, save conversations, or capture a screen in Capture
                studio. Datasets are saved to disk under <code className="text-foreground">data/datasets/</code>.
              </p>
              <p>
                2. Pick a local model from your Model Hub (<code className="text-foreground">localhost:8899</code>)
                and configure a LoRA, QLoRA, or full fine-tuning run.
              </p>
              <p>
                3. Follow live GPU training metrics and export adapter checkpoints from{' '}
                <code className="text-foreground">data/runs/</code>.
              </p>
              <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-foreground">
                LoRA/QLoRA training requires a SafeTensors/HuggingFace model directory and CUDA-enabled
                PyTorch (<code className="text-primary">server/requirements.txt</code>).
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
