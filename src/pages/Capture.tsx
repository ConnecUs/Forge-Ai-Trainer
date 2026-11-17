import { ShieldCheck } from 'lucide-react';
import PageHeading from '@/components/layout/PageHeading';
import FileImport from '@/components/features/FileImport';
import ConversationForm from '@/components/forms/ConversationForm';
import ScreenCapture from '@/components/features/ScreenCapture';

export default function Capture() {
  return (
    <>
      <PageHeading
        eyebrow="Turn everyday context into knowledge"
        title="Capture what makes you, you."
        description="Collect the examples your personal assistant should learn from."
      />

      <div className="mb-6 flex items-center gap-3 rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-sm">
        <ShieldCheck size={18} className="shrink-0 text-primary" />
        <p className="text-muted-foreground">
          Private by default. All captured content stays in this browser.
        </p>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <FileImport />
        <ConversationForm />
      </div>

      <ScreenCapture />

      <p className="mt-5 text-xs leading-5 text-muted-foreground">
        Preview storage is limited. Export your datasets for backup. Training logs can be exported
        from Training runs.
      </p>
    </>
  );
}
