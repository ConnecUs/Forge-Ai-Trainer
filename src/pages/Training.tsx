import PageHeading from '@/components/layout/PageHeading';
import NewRunDialog from '@/components/features/NewRunDialog';
import ActiveRun from '@/components/features/ActiveRun';
import EnvironmentPanel from '@/components/features/EnvironmentPanel';
import RunHistory from '@/components/features/RunHistory';

export default function Training() {
  return (
    <>
      <PageHeading
        eyebrow="Experiment → Evaluate → Iterate"
        title="Training runs"
        description="Shape a base model into your personal assistant."
        action={<NewRunDialog />}
      />

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ActiveRun />
        <EnvironmentPanel />
      </div>

      <RunHistory />
    </>
  );
}
