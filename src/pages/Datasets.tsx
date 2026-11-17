import { Link } from 'react-router-dom';
import { Database, FileCheck2, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeading from '@/components/layout/PageHeading';
import DatasetTable from '@/components/features/DatasetTable';
import { useTrainer } from '@/hooks/useTrainer';

export default function Datasets() {
  const { datasets } = useTrainer();

  const summaryCards = [
    {
      icon: Database,
      label: 'Total examples',
      value: datasets.reduce((total, dataset) => total + dataset.examples, 0).toLocaleString(),
    },
    {
      icon: FileCheck2,
      label: 'Datasets available',
      value: `${datasets.length} datasets`,
    },
    {
      icon: ShieldCheck,
      label: 'Storage destination',
      value: 'This browser',
    },
  ];

  return (
    <>
      <PageHeading
        eyebrow="Good data. Better intelligence."
        title="Your knowledge, organized."
        description="Bring documents, conversations, and captured workflows together."
        action={
          <Button asChild className="h-11 gap-2">
            <Link to="/capture">
              <Plus size={16} />
              Import dataset
            </Link>
          </Button>
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
        Sample datasets show the intended workflow. Imported data is stored in this browser, not
        uploaded to a server.
      </p>
    </>
  );
}
