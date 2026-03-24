import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import SparklineChart from "./SparklineChart";
import { X } from "lucide-react";

function calcRisk(price, changePct, volRatio, market) {
  let score = 5;
  if ((volRatio || 0) > 3) score += 2;
  else if ((volRatio || 0) > 2) score += 1;
  if ((price || 0) < 5) score += 2;
  else if ((price || 0) < 20) score += 1;
  if (market === "Crypto") score += 2;
  if (Math.abs(changePct || 0) > 10) score += 2;
  else if (Math.abs(changePct || 0) > 5) score += 1;
  return Math.min(10, Math.max(1, score));
}

function calcMA(closes, period, idx) {
  if (idx < period - 1) return null;
  return closes.slice(idx - period + 1, idx + 1).reduce((s, v) => s + v, 0) / period;
}

function detectCrossover(bars) {
  if (!bars || bars.length < 14) return null;
  const closes = bars.map(b => b.c);
  const data = closes.map((_, i) => ({
    ma5: calcMA(closes, 5, i),
    ma13: calcMA(closes, 13, i),
  }));
  for (let i = data.length - 1; i >= Math.max(0, data.length - 30); i--) {
    const cur = data[i], prev = data[i - 1];
    if (cur?.ma5 && cur?.ma13 && prev?.ma5 && prev?.ma13) {
      if (prev.ma5 <= prev.ma13 && cur.ma5 > cur.ma13) return "golden";
      if (prev.ma5 >= prev.ma13 && cur.ma5 < cur.ma13) return "death";
    }
  }
  return null;
}

export default function WatchlistCard({ item, stockInfo, hasPosition, onSelect, onRemove }) {
  const [price, setPrice] = useState(null);
  const [sparkline, setSparkline] = useState([]);
  const [crossover, setCrossover] = useState(null);
  const [loading, setLoading] = useState(true);

  const symbol = item.symbol;
  const addedAt = item.added_at;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const end = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 45 * 86400000);
    const start = startDate.toISOString().split("T")[0];

    Promise.all([
      base44.functions.invoke("fetchStockData", { action: "ticker_bar", symbol }).catch(() => ({ data: null })),
      base44.functions.invoke("fetchStockData", { action: "bars", symbol, start, end }).catch(() => ({ data: null })),
    ]).then(([tickRes, barRes]) => {
      if (cancelled) return;
      if (tickRes?.data) setPrice(tickRes.data);
      const bars = barRes?.data?.bars || [];
      if (bars.length) {
        setSparkline(bars.slice(-14).map(b => b.c));
        setCrossover(detectCrossover(bars));
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [symbol]);

  const up = (price?.change_pct || 0) >= 0;
  const riskScore = calcRisk(price?.price, price?.change_pct, price?.vol_ratio, stockInfo?.market);

  const riskColor = riskScore <= 3
    ? "text-primary bg-primary/10 border-primary/20"
    : riskScore <= 6
    ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
    : "text-destructive bg-destructive/10 border-destructive/20";

  const addedDate = addedAt ? addedAt.split("T")[0] : null;

  function handleClick(e) {
    if (e.target.closest("[data-remove]")) return;
    onSelect({
      symbol,
      name: stockInfo?.name || symbol,
      price: price?.price,
      change_pct: price?.change_pct,
      volume: price?.volume,
    });
  }

  return (
    <div
      onClick={handleClick}
      className="relative bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-primary/40 hover:bg-accent/20 transition-all group"
    >
      {/* Remove button */}
      <button
        data-remove
        onClick={e => { e.stopPropagation(); onRemove(symbol); }}
        className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-secondary hover:bg-destructive/20 hover:text-destructive flex items-center justify-center text-muted-foreground transition-colors opacity-0 group-hover:opacity-100"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Top row: symbol + badges */}
      <div className="flex items-start gap-2 mb-1 pr-6">
        <span className="font-mono font-bold text-foreground text-base">{symbol}</span>
        {crossover === "golden" && <span className="text-xs">🌟</span>}
        {crossover === "death" && <span className="text-xs">💀</span>}
        {hasPosition && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 ml-auto shrink-0">
            Active
          </span>
        )}
      </div>

      {/* Company name */}
      <p className="text-xs text-muted-foreground truncate mb-3">{stockInfo?.name || symbol}</p>

      {/* Price + sparkline */}
      <div className="flex items-end justify-between gap-2">
        <div>
          {loading && !price ? (
            <div className="space-y-1">
              <div className="h-5 w-16 bg-secondary animate-pulse rounded" />
              <div className="h-3 w-10 bg-secondary animate-pulse rounded" />
            </div>
          ) : price?.price ? (
            <>
              <p className="font-mono font-semibold text-foreground text-lg leading-tight">
                ${price.price < 1 ? price.price.toFixed(4) : price.price.toFixed(2)}
              </p>
              <p className={`text-xs font-mono font-medium ${up ? "text-primary" : "text-destructive"}`}>
                {up ? "+" : ""}{price.change_pct?.toFixed(2)}% today
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No price data</p>
          )}
        </div>
        <SparklineChart prices={sparkline} width={80} height={32} />
      </div>

      {/* Bottom row: badges */}
      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        {price && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${riskColor}`}>
            Risk {riskScore}/10
          </span>
        )}
        {stockInfo?.market && (
          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full border border-border bg-secondary/50">
            {stockInfo.market}
          </span>
        )}
        {addedDate && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            Added {addedDate}
          </span>
        )}
      </div>
    </div>
  );
}