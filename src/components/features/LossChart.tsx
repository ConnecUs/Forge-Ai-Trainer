import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LossPoint } from '@/types/trainer';

interface LossChartProps {
  lossHistory?: LossPoint[];
}

export default function LossChart({ lossHistory }: LossChartProps) {
  const data =
    lossHistory && lossHistory.length > 0
      ? lossHistory
      : [
          { step: 0, loss: 0 },
          { step: 1, loss: 0 },
        ];

  return (
    <div className="mt-6 h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: -25, bottom: 0 }}>
          <defs>
            <linearGradient id="loss-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.16} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} strokeDasharray="3 5" />
          <XAxis
            dataKey="step"
            tickLine={false}
            axisLine={false}
            minTickGap={55}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          />
          <YAxis
            domain={[0, 'auto']}
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
          />
          <Area
            type="monotone"
            dataKey="loss"
            name="Training loss"
            stroke="hsl(var(--primary))"
            fill="url(#loss-fill)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
