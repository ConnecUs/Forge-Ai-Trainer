import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LexiconKey } from '@/constants/lexicon';
import { LexiconTerm } from '@/components/ui/lexicon-tip';
import type { ProceduralChartSpec, TelemetryPoint } from '@/types/trainer';

const WIDGET_LEXICON: Record<string, LexiconKey> = {
  loss: 'trainingLoss',
  accuracy: 'meanTokenAccuracy',
  entropy: 'outputEntropy',
  gradNorm: 'gradNorm',
};

interface TrainedTelemetryChartsProps {
  widgets: ProceduralChartSpec[];
  series: TelemetryPoint[];
}

export default function TrainedTelemetryCharts({
  widgets,
  series,
}: TrainedTelemetryChartsProps) {
  if (!widgets.length || !series.length) {
    return (
      <div className="panel p-6 text-sm text-muted-foreground">
        No step-level telemetry series recorded for this adapter.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {widgets.map((widget) => {
        const strokeColor =
          widget.colorToken === 'chart' ? 'hsl(var(--chart))' : 'hsl(var(--primary))';
        const gradientId = `telemetry-${widget.id}`;
        const points = series.filter((pt) => typeof pt[widget.dataKey] === 'number');

        return (
          <section key={widget.id} className="panel min-w-0 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold tracking-tight">
                  {WIDGET_LEXICON[widget.id] ? (
                    <LexiconTerm termKey={WIDGET_LEXICON[widget.id]} label={widget.title} />
                  ) : (
                    widget.title
                  )}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">{widget.subtitle}</p>
              </div>
              <span className="badge font-mono text-[10px] text-muted-foreground">
                {points.length} pts
              </span>
            </div>

            <div className="mt-5 h-[190px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={strokeColor} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} strokeDasharray="3 5" />
                  <XAxis
                    dataKey="step"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={45}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tickCount={5}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={(value) => `Step ${value}`}
                    formatter={(value) => [
                      `${value}${widget.unit ? widget.unit : ''}`,
                      widget.title,
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey={widget.dataKey}
                    stroke={strokeColor}
                    fill={`url(#${gradientId})`}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        );
      })}
    </div>
  );
}
