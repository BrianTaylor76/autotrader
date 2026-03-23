import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { TrendingUp, TrendingDown } from "lucide-react";

const DISPLAY_SYMBOLS = [
  { key: "SPY", label: "SPY" },
  { key: "QQQ", label: "QQQ" },
  { key: "DIA", label: "DIA" },
  { key: "IWM", label: "IWM" },
  { key: "BTCUSD", label: "BTC" },
  { key: "ETHUSD", label: "ETH" },
];

export default function TickerBar() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchTicker() {
    try {
      const res = await base44.functions.invoke("fetchStockData", { action: "ticker_bar" });
      if (res.data?.ticker) {
        setData(prev => ({ ...prev, ...res.data.ticker }));
        setError(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTicker();
    const interval = setInterval(fetchTicker, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full bg-card border-b border-border overflow-x-auto">
      <div className="flex items-center gap-6 px-4 py-2.5 min-w-max">
        {DISPLAY_SYMBOLS.map(({ key, label }) => {
          const d = data[key];
          const up = (d?.change_pct || 0) >= 0;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="font-mono font-semibold text-foreground text-xs">{label}</span>
              {loading && !d ? (
                <span className="h-3 w-14 bg-secondary animate-pulse rounded inline-block" />
              ) : d?.price ? (
                <>
                  <span className="font-mono text-foreground text-xs">
                    ${d.price >= 1000 ? d.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : d.price.toFixed(2)}
                  </span>
                  <span className={`flex items-center gap-0.5 text-xs font-mono ${up ? "text-primary" : "text-destructive"}`}>
                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {up ? "+" : ""}{d.change_pct?.toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          );
        })}
        {error && <span className="text-xs text-destructive ml-4">⚠ Ticker unavailable</span>}
      </div>
    </div>
  );
}