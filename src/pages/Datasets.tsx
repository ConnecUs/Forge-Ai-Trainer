import { Link } from 'react-router-dom';
import { BookMarked, Database, FileCheck2, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeading from '@/components/layout/PageHeading';
import DatasetTable from '@/components/features/DatasetTable';
import { LexiconTerm } from '@/components/ui/lexicon-tip';
import { useTrainer } from '@/hooks/useTrainer';

export default function Datasets() {
  const { datasets } = useTrainer();

  const readyCount = datasets.filter((d) => Boolean(d.filePath || d.content)).length;

  const summaryCards = [
    {
      icon: Database,
      label: 'Total examples',
      value: datasets.reduce((total, dataset) => total + dataset.examples, 0).toLocaleString(),
    },
    {
      icon: FileCheck2,
      label: 'Ready on disk',
      value: `${readyCount} / ${datasets.length} datasets`,
    },
    {
      icon: ShieldCheck,
      label: 'Storage destination',
      value: 'Local disk (data/datasets/)',
    },
  ];

  return (
    <>
      <PageHeading
        eyebrow="Good data. Better intelligence."
        title="Your knowledge, organized."
        description={
          <>
            Inspect your <LexiconTerm termKey="trainingDataset" label="JSONL datasets" />, compile
            new ones from books and <LexiconTerm termKey="agentSkill" label="Agent Skills" />, or
            capture conversations directly.
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-11 gap-2">
              <Link to="/skills">
                <BookMarked size={16} />
                Skill &amp; knowledge studio
              </Link>
            </Button>
            <Button asChild className="h-11 gap-2">
              <Link to="/capture">
                <Plus size={16} />
                Capture / import
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {summaryCards.map(({ icon: Icon, label, value }) => (
          <div key={label} className="panel p-5">
            <div className="flex gap-2 text-sm text-muted-foreground">
              <Icon size={17} />
              {label}
            </div>
            <p className="mt-4 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <DatasetTable />

      <p className="mt-5 text-sm leading-6 text-muted-foreground">
        Sample datasets show the intended schema. Extracted and compiled datasets are stored locally
        on disk under <code>data/datasets/</code> and never uploaded externally.
      </p>
    </>
  );
}
