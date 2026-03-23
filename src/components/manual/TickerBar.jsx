import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { TrendingUp, TrendingDown } from "lucide-react";

const SYMBOLS = ["SPY","QQQ","DIA","IWM","BTC/USD","ETH/USD"];

export default function TickerBar() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  async function fetchTicker() {
    const res = await base44.functions.invoke("fetchStockData", { action: "ticker_bar" });
    if (res.data?.ticker) setData(res.data.ticker);
    setLoading(false);
  }

  useEffect(() => {
    fetchTicker();
    const interval = setInterval(fetchTicker, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full bg-card border-b border-border overflow-x-auto">
      <div className="flex items-center gap-6 px-4 py-2.5 min-w-max">
        {SYMBOLS.map(sym => {
          const d = data[sym];
          const up = d?.change_pct >= 0;
          const price = d?.price;
          const pct = d?.change_pct;
          return (
            <div key={sym} className="flex items-center gap-2 text-sm">
              <span className="font-mono font-semibold text-foreground text-xs">{sym.replace("/USD","")}</span>
              {loading || !price ? (
                <span className="h-3 w-14 bg-secondary animate-pulse rounded" />
              ) : (
                <>
                  <span className="font-mono text-foreground text-xs">${price >= 1000 ? price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : price.toFixed(2)}</span>
                  <span className={`flex items-center gap-0.5 text-xs font-mono ${up ? "text-primary" : "text-destructive"}`}>
                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {up ? "+" : ""}{pct?.toFixed(2)}%
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}