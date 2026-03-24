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
  const containerRef = useRef(null);

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
      .catch(e => {
        const msg = e.message || "";
        if (msg.includes("429") || msg.includes("Rate") || msg.includes("rate")) {
          setError("Rate limited — retrying shortly");
        } else if (msg.includes("No price")) {
          setError("No price data available");
        } else {
          setError("Chart temporarily unavailable");
        }
      })
      .finally(() => setLoading(false));
  }, [symbol]);

  // Draw chart on canvas — re-run when data or container width changes
  const drawChart = React.useCallback(() => {
    if (!chartData.length || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const W = containerRef.current.offsetWidth || 700;
    const TOTAL_H = 340;
    const PRICE_H = 240;
    const VOL_H = 60;
    const GAP = 10;
    canvas.width = W;
    canvas.height = TOTAL_H;
    const ctx = canvas.getContext("2d");
    const PAD = { top: 16, right: 10, bottom: 24, left: 55 };
    const chartW = W - PAD.left - PAD.right;
    const priceChartH = PRICE_H - PAD.top;

    ctx.clearRect(0, 0, W, TOTAL_H);

    // Background
    ctx.fillStyle = "hsl(220 18% 9%)";
    ctx.fillRect(0, 0, W, TOTAL_H);

    const highs = chartData.map(d => d.h);
    const lows = chartData.map(d => d.l);
    const minP = Math.min(...lows) * 0.998;
    const maxP = Math.max(...highs) * 1.002;
    const priceRange = maxP - minP;
    const n = chartData.length;

    function px(price) { return PAD.top + priceChartH - ((price - minP) / priceRange) * priceChartH; }
    function xi(i) { return PAD.left + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2); }

    // Price grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + (i / 4) * priceChartH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      const price = maxP - (i / 4) * priceRange;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "10px monospace";
      ctx.textAlign = "right";
      ctx.fillText(price >= 1000 ? `$${(price/1000).toFixed(1)}k` : `$${price.toFixed(price < 10 ? 2 : 0)}`, PAD.left - 4, y + 3);
    }

    // Candles
    const candleW = Math.max(1, (chartW / n) * 0.7);
    chartData.forEach((d, i) => {
      const cx = xi(i);
      const up = d.c >= d.o;
      const color = up ? "hsl(142 70% 45%)" : "hsl(0 72% 51%)";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      // Wick
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, px(d.h));
      ctx.lineTo(cx, px(d.l));
      ctx.stroke();
      // Body
      const bodyTop = px(Math.max(d.o, d.c));
      const bodyBot = px(Math.min(d.o, d.c));
      ctx.fillRect(cx - candleW / 2, bodyTop, candleW, Math.max(1, bodyBot - bodyTop));
    });

    // MA lines
    function drawMA(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      chartData.forEach((d, i) => {
        if (d[key] == null) return;
        const x = xi(i), y = px(d[key]);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    drawMA("ma5", "hsl(142 70% 45%)");
    drawMA("ma13", "#3b82f6");

    // X axis dates
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(n / 6));
    for (let i = 0; i < n; i += step) {
      const d = chartData[i];
      if (d) ctx.fillText(d.date.slice(5), xi(i), PRICE_H + 2);
    }

    // Legend
    ctx.font = "10px monospace";
    ctx.fillStyle = "hsl(142 70% 45%)";
    ctx.textAlign = "left";
    ctx.fillText("\u2014 MA5", PAD.left, PAD.top - 4);
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("\u2014 MA13", PAD.left + 52, PAD.top - 4);

    // ── Volume sub-chart ──
    const volTop = PRICE_H + GAP + 16;
    const volBottom = TOTAL_H - 4;
    const volChartH = volBottom - volTop;
    const maxVol = Math.max(...chartData.map(d => d.v || 0)) || 1;

    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillText("VOL", PAD.left, volTop - 4);

    chartData.forEach((d, i) => {
      const cx = xi(i);
      const barH = Math.max(1, ((d.v || 0) / maxVol) * volChartH);
      ctx.fillStyle = d.c >= d.o ? "rgba(74,222,128,0.5)" : "rgba(239,68,68,0.5)";
      ctx.fillRect(cx - candleW / 2, volBottom - barH, candleW, barH);
    });
  }, [chartData]);

  useEffect(() => {
    drawChart();
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => drawChart());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [drawChart]);

  if (loading) return <div className="h-64 bg-secondary/30 animate-pulse rounded-xl" />;
  if (error) return (
    <div className="h-40 flex flex-col items-center justify-center gap-3 bg-secondary/20 rounded-xl">
      <p className="text-sm text-muted-foreground">{error} — tap retry</p>
      <button
        onClick={() => { setError(null); setLoading(true); }}
        className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 transition-colors"
      ><RefreshCw className="w-3 h-3" /> Retry</button>
    </div>
  );

  return (
    <div ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg block"
        style={{ imageRendering: "auto" }}
      />
      {crossover && (
        <p className={`text-xs mt-2 px-3 py-1.5 rounded-lg border inline-block ${crossover.type === "golden" ? "bg-primary/10 text-primary border-primary/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
          {crossover.type === "golden" ? "🟢 Golden cross" : "🔴 Death cross"} detected — {crossover.date}
        </p>
      )}
    </div>
  );
}