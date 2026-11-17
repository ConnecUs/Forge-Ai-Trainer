import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, HelpCircle, Search, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LEXICON, type LexiconCategory, type LexiconEntry } from '@/constants/lexicon';

const CATEGORY_COLORS: Record<LexiconCategory, string> = {
  Training: 'border-primary/40 bg-primary/10 text-primary',
  Hyperparameter: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  'CUDA & Compute': 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  'Dataset & Skill': 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  Telemetry: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
  Architecture: 'border-border bg-secondary text-foreground',
};

function LexiconCardBody({ entry }: { entry: LexiconEntry }) {
  return (
    <div className="w-[310px] space-y-2 p-1 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{entry.term}</span>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[entry.category]}`}
        >
          {entry.category}
        </span>
      </div>
      <p className="text-xs font-medium leading-4 text-foreground/90">{entry.short}</p>
      <p className="text-[11px] leading-4 text-muted-foreground">{entry.explanation}</p>
      <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] leading-4 text-primary">
        <span className="font-semibold">Tip: </span>
        {entry.ruleOfThumb}
      </div>
    </div>
  );
}

interface LexiconTipProps {
  termKey: keyof typeof LEXICON;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

export function LexiconTip({
  termKey,
  children,
  side = 'top',
  align = 'center',
}: LexiconTipProps) {
  const entry = LEXICON[termKey];
  if (!entry) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} className="max-w-[340px]">
        <LexiconCardBody entry={entry} />
      </TooltipContent>
    </Tooltip>
  );
}

interface LexiconTermProps {
  termKey: keyof typeof LEXICON;
  label?: string;
  className?: string;
}

export function LexiconTerm({ termKey, label, className = '' }: LexiconTermProps) {
  const entry = LEXICON[termKey];
  if (!entry) return <span>{label || termKey}</span>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={`inline-flex cursor-help items-center gap-1 border-b border-dotted border-primary/60 text-foreground transition-colors hover:border-primary hover:text-primary ${className}`}
        >
          {label || entry.term}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[340px]">
        <LexiconCardBody entry={entry} />
      </TooltipContent>
    </Tooltip>
  );
}

interface SettingLabelProps {
  htmlFor?: string;
  label: string;
  termKey: keyof typeof LEXICON;
  className?: string;
  rightSlot?: ReactNode;
}

export function SettingLabel({
  htmlFor,
  label,
  termKey,
  className = 'mb-2 flex items-center justify-between gap-2 text-sm',
  rightSlot,
}: SettingLabelProps) {
  const entry = LEXICON[termKey];

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="cursor-pointer">
          {label}
        </label>
        {entry && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Explain ${entry.term}`}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary"
              >
                <HelpCircle size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="max-w-[340px]">
              <LexiconCardBody entry={entry} />
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {rightSlot}
    </div>
  );
}

const CATEGORIES: Array<'All' | LexiconCategory> = [
  'All',
  'Dataset & Skill',
  'Training',
  'Hyperparameter',
  'CUDA & Compute',
  'Telemetry',
  'Architecture',
];

export function LexiconGuideDialog({ trigger }: { trigger: ReactNode }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'All' | LexiconCategory>('All');

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(LEXICON).filter((item) => {
      if (category !== 'All' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.term.toLowerCase().includes(q) ||
        item.short.toLowerCase().includes(q) ||
        item.explanation.toLowerCase().includes(q) ||
        item.ruleOfThumb.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-[760px]">
        <DialogHeader>
          <p className="eyebrow mb-1 flex items-center gap-1.5 text-[10px] text-primary">
            <Sparkles size={12} /> Hover-Activated Lexicon &amp; Setting Field Guide
          </p>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <BookOpen size={20} className="text-primary" />
            Froge Trainer Lexicon &amp; Settings
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings, QLoRA, SKILL.md, entropy, grad norm, VRAM…"
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  category === cat
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <article
              key={entry.key}
              className="rounded-xl border border-border bg-background p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{entry.term}</h3>
                <span
                  className={`rounded border px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[entry.category]}`}
                >
                  {entry.category}
                </span>
              </div>
              <p className="mt-1.5 text-xs font-medium text-foreground/90">{entry.short}</p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {entry.explanation}
              </p>
              <p className="mt-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary">
                <span className="font-semibold">Rule of thumb: </span>
                {entry.ruleOfThumb}
              </p>
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
