import PageHeading from '@/components/layout/PageHeading';
import NewRunDialog from '@/components/features/NewRunDialog';
import StatOverview from '@/components/features/StatOverview';
import ActiveRun from '@/components/features/ActiveRun';
import EnvironmentPanel from '@/components/features/EnvironmentPanel';
import DatasetTable from '@/components/features/DatasetTable';

export default function Index() {
  return (
    <>
      <PageHeading
        eyebrow="Your workspace, at a glance"
        title="Make intelligence your own."
        description="Fine-tune local models from your Model Hub. Keep everything on your machine."
        action={<NewRunDialog />}
      />

      <StatOverview />

      <div className="mb-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ActiveRun />
        <EnvironmentPanel />
      </div>

      <DatasetTable compact />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <p>LoRA &amp; QLoRA · Connected to Model Hub (:8899)</p>
        <p>
          Datasets &amp; adapters saved locally <span className="mx-2">·</span> Runs on your GPU
        </p>
      </div>
    </>
  );
}
