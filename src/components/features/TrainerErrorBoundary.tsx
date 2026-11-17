import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { STORAGE_KEY } from '@/constants/trainer';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export default class TrainerErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Froge Trainer error', error, info);
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <section className="panel max-w-xl p-8">
          <AlertTriangle className="text-destructive" />
          <h1 className="mt-4 text-2xl font-semibold">Workspace storage needs attention</h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            A local storage or workspace error interrupted the preview. Reload to retry. If it
            continues, reset the preview data; this deletes browser-saved datasets and runs.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
              onClick={() => location.reload()}
            >
              Reload workspace
            </button>
            <button
              type="button"
              className="rounded-lg border border-border px-4 py-3 text-sm hover:bg-secondary"
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
              }}
            >
              Reset preview data
            </button>
          </div>
        </section>
      </main>
    );
  }
}
