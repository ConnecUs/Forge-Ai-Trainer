import { ArrowUpRight, Cpu, HardDrive, MemoryStick, ShieldCheck, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTrainer } from '@/hooks/useTrainer';

export default function EnvironmentPanel() {
  const { environment, repairEnvironment } = useTrainer();
  const gpu = environment?.gpu;
  const hub = environment?.hub;

  const vramText = gpu
    ? `${(gpu.freeMb / 1024).toFixed(1)} / ${(gpu.totalMb / 1024).toFixed(1)} GB free`
    : 'Not detected';

  const specs = [
    { icon: MemoryStick, label: 'GPU memory', value: vramText },
    {
      icon: HardDrive,
      label: 'Model Hub (:8899)',
      value: hub?.connected ? `${hub.modelCount} models · ${hub.totalSizeFormatted}` : 'Offline',
    },
  ];

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Local compute</h2>
          <Cpu size={19} className="text-muted-foreground" />
        </div>

        <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              environment?.trainingReady
                ? 'bg-primary'
                : environment?.agentConnected
                  ? 'bg-amber-400'
                  : 'bg-muted-foreground'
            }`}
          />
          {environment?.trainingReady
            ? 'CUDA training worker ready'
            : environment?.agentConnected
              ? 'Agent connected · CUDA/PEFT setup needed'
              : 'Waiting for local agent'}
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-background p-4">
          <Cpu size={26} className={gpu ? 'text-primary' : 'text-muted-foreground'} />
          <div>
            <p className="text-sm font-medium">{gpu ? gpu.name : 'No GPU detected'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {gpu
                ? `Util ${gpu.utilizationPct}% · ${gpu.temperatureC}°C`
                : 'Check nvidia-smi & local agent'}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {specs.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Icon size={14} />
                {label}
              </span>
              <span>{value}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs leading-5 text-muted-foreground">
            {environment?.python?.pythonVersion
              ? `Python ${environment.python.pythonVersion} · CUDA ${
                  environment.python.cudaAvailable
                    ? environment.python.cudaVersion || 'active'
                    : 'unavailable'
                }${environment.python.tritonCudaReady ? ' · Triton ready' : ''}`
              : 'Install server/requirements.txt with CUDA PyTorch to enable GPU fine-tuning.'}
          </p>
          {environment?.agentConnected && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-9 w-full gap-2 text-xs"
              onClick={() => void repairEnvironment()}
            >
              <Wrench size={14} />
              {environment?.trainingReady ? 'Verify / Auto-fix CUDA' : 'Auto-fix CUDA / Python'}
            </Button>
          )}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.055] p-6">
        <span className="absolute -right-5 -top-5 flex h-24 w-24 items-center justify-center rounded-full border border-primary/10">
          <ShieldCheck className="text-primary/20" size={44} />
        </span>
        <p className="eyebrow text-[10px] text-primary">Built for local</p>
        <h2 className="mt-3 max-w-[200px] text-xl font-semibold leading-7 tracking-tight">
          A little more you.
          <br />A lot less cloud.
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Turn your knowledge into a dataset for your own personal assistant.
        </p>
        <Link
          to="/capture"
          className="mt-5 flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:opacity-80"
        >
          Open capture studio <ArrowUpRight size={15} />
        </Link>
      </section>
    </div>
  );
}
