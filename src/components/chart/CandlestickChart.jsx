import React, { useMemo } from "react";
import {
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  Cell,
} from "recharts";
import { format } from "date-fns";

// Custom candlestick shape
function CandlestickBar(props) {
  const { x, y, width, payload } = props;
  if (!payload) return null;

  const { open, close, high, low } = payload;
  const isUp = close >= open;
  const color = isUp ? "#22c55e" : "#ef4444";
  const bodyTop = Math.min(open, close);
  const bodyBottom = Math.max(open, close);
  const { yAxis } = props;

  // We need yScale from the chart — passed via custom tick or computed manually
  // recharts doesn't expose yScale directly on Bar shapes, so we receive it via props.background
  const scale = props.background;
  if (!scale || !scale.yScale) return null;

  const yScale = scale.yScale;
  const yHigh = yScale(high);
  const yLow = yScale(low);
  const yBodyTop = yScale(bodyTop);
  const yBodyBottom = yScale(bodyBottom);
  const bodyHeight = Math.max(1, yBodyBottom - yBodyTop);
  const cx = x + width / 2;

  return (
    <g>
      {/* Wick */}
      <line x1={cx} y1={yHigh} x2={cx} y2={yBodyTop} stroke={color} strokeWidth={1.5} />
      <line x1={cx} y1={yBodyBottom} x2={cx} y2={yLow} stroke={color} strokeWidth={1.5} />
      {/* Body */}
      <rect
        x={x + 1}
        y={yBodyTop}
        width={Math.max(2, width - 2)}
        height={bodyHeight}
        fill={isUp ? color : color}
        fillOpacity={isUp ? 0.9 : 1}
        stroke={color}
        strokeWidth={1}
        rx={1}
      />
    </g>
  );
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const isUp = d.close >= d.open;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2.5 shadow-xl text-xs font-mono space-y-1">
      <p className="text-muted-foreground">{format(new Date(d.time), "MMM d, h:mm a")}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-muted-foreground">O</span><span className="text-foreground">${d.open?.toFixed(2)}</span>
        <span className="text-muted-foreground">H</span><span className="text-primary">${d.high?.toFixed(2)}</span>
        <span className="text-muted-foreground">L</span><span className="text-destructive">${d.low?.toFixed(2)}</span>
        <span className="text-muted-foreground">C</span>
        <span className={isUp ? "text-primary" : "text-destructive"}>${d.close?.toFixed(2)}</span>
        <span className="text-muted-foreground">V</span><span className="text-foreground">{d.volume?.toLocaleString()}</span>
      </div>
    </div>
  );
};

// We'll render candlesticks using a custom approach with recharts Bar + custom shape
// This uses a hidden bar for positioning + custom SVG overlay
function CandlestickShape(props) {
  const { x, y, width, height, payload, yAxisMap, offset } = props;
  if (!payload) return null;
  const { open, close, high, low } = payload;
  const isUp = close >= open;
  const color = isUp ? "#22c55e" : "#ef4444";

  // Get the yAxis scale from the chart context
  // recharts passes the yScale via the yAxis domain + the chart height
  // We'll derive it from the rendered y positions passed through the Bar
  // The Bar's y/height correspond to the 'value' field we set
  // We set value = high, so y = yScale(high), height = yScale(low) - yScale(high)
  const yHigh = y;
  const yLow = y + height;
  const totalRange = yLow - yHigh;
  const priceRange = low === high ? 1 : high - low;

  const yOpen = yHigh + ((high - open) / priceRange) * totalRange;
  const yClose = yHigh + ((high - close) / priceRange) * totalRange;

  const bodyTop = Math.min(yOpen, yClose);
  const bodyBottom = Math.max(yOpen, yClose);
  const bodyHeight = Math.max(1, bodyBottom - bodyTop);
  const cx = x + width / 2;

  return (
    <g>
      <line x1={cx} y1={yHigh} x2={cx} y2={bodyTop} stroke={color} strokeWidth={1.5} />
      <line x1={cx} y1={bodyBottom} x2={cx} y2={yLow} stroke={color} strokeWidth={1.5} />
      <rect
        x={x + 1}
        y={bodyTop}
        width={Math.max(2, width - 2)}
        height={bodyHeight}
        fill={color}
        fillOpacity={isUp ? 0.85 : 1}
        stroke={color}
        strokeWidth={1}
        rx={1}
      />
    </g>
  );
}

export default function CandlestickChart({ bars = [], height = 300 }) {
  const data = useMemo(() => bars.map((b) => ({
    ...b,
    // For the Bar domain, use high as value so y/height spans full candle
    value: b.high,
    lowValue: b.low,
    // recharts needs a numeric x
    timeLabel: format(new Date(b.time), "h:mm"),
  })), [bars]);

  const allPrices = bars.flatMap((b) => [b.high, b.low]);
  const minPrice = allPrices.length ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length ? Math.max(...allPrices) : 100;
  const padding = (maxPrice - minPrice) * 0.05;

  if (!bars.length) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-muted-foreground text-sm">No chart data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
        <XAxis
          dataKey="timeLabel"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: "hsl(var(--border))" }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[minPrice - padding, maxPrice + padding]}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
          width={55}
          orientation="right"
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
        <Bar
          dataKey="value"
          minPointSize={1}
          shape={<CandlestickShape />}
          isAnimationActive={false}
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.close >= entry.open ? "#22c55e" : "#ef4444"} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}