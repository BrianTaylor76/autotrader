import React from "react";
import { Card } from "@/components/ui/card";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts";

const COVID_START = "2020-02-15";
const COVID_END = "2020-04-30";

function mergeChartData(simpleVals, consensusVals) {
  const map = {};
  (simpleVals || []).forEach(d => { map[d.date] = { date: d.date, simple: Math.round(d.value * 100) / 100 }; });
  (consensusVals || []).forEach(d => {
    if (!map[d.date]) map[d.date] = { date: d.date };
    map[d.date].consensus = Math.round(d.value * 100) / 100;
  });
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

function formatTick(val) {
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
  return `$${val}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
      <p className="text-muted-foreground mb-2 font-mono">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.dataKey}:</span>
          <span className="font-mono font-semibold text-foreground">${p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function BacktestChart({ simpleValues, consensusValues, initialCapital }) {
  const data = mergeChartData(simpleValues, consensusValues);
  if (!data.length) return null;

  // Sample to max 500 points for performance
  const step = Math.max(1, Math.floor(data.length / 500));
  const sampled = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <Card className="bg-card border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Portfolio Value Over Time</h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={sampled} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis
            dataKey="date"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatTick}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            tickLine={false}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={val => <span className="text-xs capitalize text-muted-foreground">{val} Strategy</span>}
          />
          {initialCapital && (
            <ReferenceLine
              y={initialCapital}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="6 3"
              label={{ value: "Breakeven", fill: "hsl(var(--muted-foreground))", fontSize: 10, position: "right" }}
            />
          )}
          {/* COVID shaded zone */}
          <ReferenceArea
            x1={COVID_START}
            x2={COVID_END}
            fill="hsl(var(--destructive))"
            fillOpacity={0.08}
            label={{ value: "COVID-19 Crash", fill: "hsl(var(--destructive))", fontSize: 10, position: "insideTop" }}
          />
          {simpleValues?.length > 0 && (
            <Line type="monotone" dataKey="simple" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="simple" />
          )}
          {consensusValues?.length > 0 && (
            <Line type="monotone" dataKey="consensus" stroke="#3b82f6" strokeWidth={2} dot={false} name="consensus" />
          )}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}