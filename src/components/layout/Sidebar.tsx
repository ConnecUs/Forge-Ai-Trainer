import { NavLink } from 'react-router-dom';
import {
  ArrowUpRight,
  Box,
  Cpu,
  Database,
  Layers3,
  LayoutDashboard,
  ScanLine,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTrainer } from '@/hooks/useTrainer';

const NAV_LINKS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/training', label: 'Training runs', icon: Layers3 },
  { to: '/trained', label: 'Trained models', icon: Sparkles },
  { to: '/datasets', label: 'Datasets', icon: Database },
  { to: '/capture', label: 'Capture studio', icon: ScanLine },
  { to: '/models', label: 'Model library', icon: Box },
];

export default function Sidebar() {
  const { environment } = useTrainer();
  const gpuName = environment?.gpu?.name || 'Local agent';
  const agentConnected = Boolean(environment?.agentConnected);

  return (
    <aside className="flex flex-col border-b border-border bg-card lg:fixed lg:inset-y-0 lg:w-[232px] lg:border-b-0 lg:border-r">
      <NavLink to="/" className="flex h-24 items-center gap-3 px-7">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Layers3 size={23} strokeWidth={2.5} />
        </span>
        <span className="text-2xl font-bold tracking-tight">
          froge<span className="text-primary">.</span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Trainer studio
          </span>
        </span>
      </NavLink>

      <div className="eyebrow hidden px-7 pb-3 pt-6 lg:block">Workspace</div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-4">
        {NAV_LINKS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-transform hover:translate-x-0.5',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )
            }
          >
            <Icon size={18} />
            {label}
            {to === '/capture' && (
              <span className="ml-auto hidden rounded border border-border px-1.5 py-0.5 text-[9px] lg:block">
                NEW
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto hidden p-4 lg:block">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Cpu size={17} className="text-primary" />
            Local environment
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {gpuName}
            <br />
            {environment?.hub?.connected
              ? `Hub :8899 (${environment.hub.totalSizeFormatted})`
              : 'Model Hub :8899 offline'}
          </p>
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                agentConnected ? 'bg-primary' : 'bg-muted-foreground'
              }`}
            />
            {agentConnected ? 'Agent connected' : 'Agent not connected'}
          </div>
        </div>

        <NavLink
          to="/models"
          className="mt-4 flex min-h-11 items-center gap-2 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Box size={15} />
          Browse Model Hub
          <ArrowUpRight size={14} className="ml-auto" />
        </NavLink>

        <div className="mt-4 flex items-center gap-3 border-t border-border px-2 pt-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
            FT
          </span>
          <div>
            <p className="text-sm font-medium">Local workspace</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Froge Trainer</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
