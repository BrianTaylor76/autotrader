import React from "react";

export default function SparklineChart({ prices = [], width = 80, height = 32 }) {
  if (!prices || prices.length < 2) {
    return <div style={{ width, height }} className="bg-secondary/30 rounded animate-pulse" />;
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  const up = prices[prices.length - 1] >= prices[0];
  const color = up ? "hsl(142 70% 45%)" : "hsl(0 72% 51%)";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}