import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw } from "lucide-react";

function calcMA(closes, period, idx) {
  if (idx < period - 1) return null;
  return closes.slice(idx - period + 1, idx + 1).reduce((s, v) => s + v, 0) / period;
}

export default function StockChart({ symbol }) {
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [crossover, setCrossover] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    const end = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 180 * 86400000);
    const start = startDate.toISOString().split("T")[0];
    base44.functions.invoke("fetchStockData", { action: "bars", symbol, start, end })
      .then(res => {
        if (res.data?.error) throw new Error(res.data.error);
        const bars = res.data?.bars || [];
        if (!bars.length) throw new Error("No price data available");
        const closes = bars.map(b => b.c);
        const data = bars.map((b, i) => ({
          date: (b.t || "").split("T")[0],
          o: b.o, h: b.h, l: b.l, c: b.c, v: b.v,
          ma5: calcMA(closes, 5, i),
          ma13: calcMA(closes, 13, i),
        }));
        // Detect crossover in last 30 days
        for (let i = data.length - 1; i >= Math.max(0, data.length - 30); i--) {
          const cur = data[i], prev = data[i - 1];
          if (cur?.ma5 && cur?.ma13 && prev?.ma5 && prev?.ma13) {
            if (prev.ma5 <= prev.ma13 && cur.ma5 > cur.ma13) { setCrossover({ date: cur.date, type: "golden" }); break; }
            if (prev.ma5 >= prev.ma13 && cur.ma5 < cur.ma13) { setCrossover({ date: cur.date, type: "death" }); break; }
          }
        }
        setChartData(data);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [symbol]);

  // Draw chart on canvas
  useEffect(() => {
    if (!chartData.length || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const PAD = { top: 10, right: 10, bottom: 40, left: 55 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    ctx.clearRect(0, 0, W, H);

    const highs = chartData.map(d => d.h);
    const lows = chartData.map(d => d.l);
    const minP = Math.min(...lows) * 0.998;
    const maxP = Math.max(...highs) * 1.002;
    const priceRange = maxP - minP;

    function px(price) { return PAD.top + chartH - ((price - minP) / priceRange) * chartH; }
    function x(i) { return PAD.left + (i / (chartData.length - 1)) * chartW; }

    // Background
    ctx.fillStyle = "hsl(220 18% 9%)";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + (i / 4) * chartH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      const price = maxP - (i / 4) * priceRange;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "10px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`$${price.toFixed(0)}`, PAD.left - 4, y + 3);
    }

    // Candles
    const candleW = Math.max(1, (chartW / chartData.length) * 0.7);
    chartData.forEach((d, i) => {
      const xi = x(i);
      const up = d.c >= d.o;
      const color = up ? "hsl(142 70% 45%)" : "hsl(0 72% 51%)";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      // Wick
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xi, px(d.h));
      ctx.lineTo(xi, px(d.l));
      ctx.stroke();

      // Body
      const bodyTop = px(Math.max(d.o, d.c));
      const bodyBot = px(Math.min(d.o, d.c));
      const bodyH = Math.max(1, bodyBot - bodyTop);
      ctx.fillRect(xi - candleW / 2, bodyTop, candleW, bodyH);
    });

    // MA lines
    function drawMA(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      chartData.forEach((d, i) => {
        if (d[key] == null) return;
        const xi = x(i), yi = px(d[key]);
        if (!started) { ctx.moveTo(xi, yi); started = true; }
        else ctx.lineTo(xi, yi);
      });
      ctx.stroke();
    }
    drawMA("ma5", "hsl(142 70% 45%)");
    drawMA("ma13", "#3b82f6");

    // X axis dates (show ~6 labels)
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    const step = Math.floor(chartData.length / 6);
    for (let i = 0; i < chartData.length; i += step) {
      const d = chartData[i];
      if (d) ctx.fillText(d.date.slice(5), x(i), H - PAD.bottom + 14);
    }

    // Legend
    ctx.font = "10px monospace";
    ctx.fillStyle = "hsl(142 70% 45%)";
    ctx.textAlign = "left";
    ctx.fillText("— MA5", PAD.left, PAD.top - 2);
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("— MA13", PAD.left + 50, PAD.top - 2);
  }, [chartData]);

  if (loading) return <div className="h-64 bg-secondary/30 animate-pulse rounded-xl" />;
  if (error) return (
    <div className="h-40 flex flex-col items-center justify-center gap-2">
      <p className="text-sm text-destructive">{error}</p>
      <button onClick={() => { setError(null); setLoading(true); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Retry</button>
    </div>
  );

  return (
    <div>
      {crossover && (
        <p className={`text-xs mb-2 px-3 py-1.5 rounded-lg border inline-block ${crossover.type === "golden" ? "bg-primary/10 text-primary border-primary/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
          {crossover.type === "golden" ? "🟢 Golden cross" : "🔴 Death cross"} detected — {crossover.date}
        </p>
      )}
      <canvas
        ref={canvasRef}
        width={canvasRef.current?.parentElement?.offsetWidth || 700}
        height={280}
        className="w-full rounded-lg"
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
}