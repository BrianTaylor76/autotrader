import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

function calcMA(data, period, idx) {
  if (idx < period - 1) return null;
  const sum = data.slice(idx - period + 1, idx + 1).reduce((s, d) => s + d.c, 0);
  return sum / period;
}

const CustomCandleBar = (props) => {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;
  const { o, c, h, l } = payload;
  const isUp = c >= o;
  const color = isUp ? "hsl(142 70% 45%)" : "hsl(0 72% 51%)";
  const centerX = x + width / 2;
  const barTop = Math.min(y, y + height);
  const barH = Math.abs(height) || 1;
  return (
    <g>
      <line x1={centerX} y1={props.yAxis?.scale?.(h) || barTop - 2} x2={centerX} y2={props.yAxis?.scale?.(l) || barTop + barH + 2} stroke={color} strokeWidth={1} />
      <rect x={x + 1} y={barTop} width={Math.max(width - 2, 1)} height={barH} fill={color} fillOpacity={0.85} />
    </g>
  );
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
      <p className="text-muted-foreground mb-2 font-mono">{label}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-muted-foreground">Open</span><span className="font-mono text-foreground">${d.o?.toFixed(2)}</span>
        <span className="text-muted-foreground">High</span><span className="font-mono text-primary">${d.h?.toFixed(2)}</span>
        <span className="text-muted-foreground">Low</span><span className="font-mono text-destructive">${d.l?.toFixed(2)}</span>
        <span className="text-muted-foreground">Close</span><span className="font-mono text-foreground">${d.c?.toFixed(2)}</span>
        <span className="text-muted-foreground">Volume</span><span className="font-mono text-foreground">{d.v?.toLocaleString()}</span>
      </div>
    </div>
  );
}

export default function StockChart({ symbol }) {
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [crossover, setCrossover] = useState(null);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    const end = new Date().toISOString().split("T")[0];
    const start = new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
    base44.functions.invoke("fetchStockData", { action: "bars", symbol, start, end })
      .then(res => {
        const bars = res.data?.bars || [];
        const data = bars.map((b, i) => {
          const close = b.c || b.C;
          const open = b.o || b.O;
          const high = b.h || b.H;
          const low = b.l || b.L;
          const volume = b.v || b.V;
          return { date: (b.t || "").split("T")[0], o: open, h: high, l: low, c: close, v: volume, idx: i };
        });
        // Add MAs
        const withMA = data.map((d, i) => ({
          ...d,
          ma5: calcMA(data, 5, i),
          ma13: calcMA(data, 13, i),
          range: [d.l, d.h],
        }));
        // Detect recent crossover
        for (let i = withMA.length - 1; i >= Math.max(0, withMA.length - 30); i--) {
          const cur = withMA[i];
          const prev = withMA[i - 1];
          if (cur?.ma5 && cur?.ma13 && prev?.ma5 && prev?.ma13) {
            if (prev.ma5 <= prev.ma13 && cur.ma5 > cur.ma13) { setCrossover({ date: cur.date, type: "golden" }); break; }
            if (prev.ma5 >= prev.ma13 && cur.ma5 < cur.ma13) { setCrossover({ date: cur.date, type: "death" }); break; }
          }
        }
        setChartData(withMA);
      })
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) return <div className="h-64 bg-secondary/30 animate-pulse rounded-xl" />;
  if (!chartData.length) return <p className="text-sm text-muted-foreground py-4">No chart data available.</p>;

  return (
    <div>
      {crossover && (
        <p className={`text-xs mb-2 px-3 py-1.5 rounded-lg border inline-block ${crossover.type === "golden" ? "bg-primary/10 text-primary border-primary/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
          {crossover.type === "golden" ? "🟢 Golden cross" : "🔴 Death cross"} on {crossover.date} (last 30 days)
        </p>
      )}
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
          <YAxis domain={["auto","auto"]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} tickLine={false} width={50} tickFormatter={v => `$${v.toFixed(0)}`} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="c" shape={<CustomCandleBar />}>
            {chartData.map((d, i) => <Cell key={i} fill={d.c >= d.o ? "hsl(142 70% 45%)" : "hsl(0 72% 51%)"} />)}
          </Bar>
          <Line type="monotone" dataKey="ma5" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} name="MA5" />
          <Line type="monotone" dataKey="ma13" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="MA13" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}