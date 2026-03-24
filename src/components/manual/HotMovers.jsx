import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getCompanyName } from "@/utils/stockLists";
import { Flame, Zap, RefreshCw } from "lucide-react";

function MoverCard({ mover, onClick }) {
  const isHot = Math.abs(mover.change_pct || 0) > 3 || (mover.vol_ratio || 0) > 2;
  const up = (mover.change_pct || 0) >= 0;
  const price = mover.price || 0;
  return (
    <button
      onClick={() => onClick(mover)}
      className="flex-shrink-0 w-44 bg-card border border-border rounded-xl p-3.5 hover:border-primary/40 hover:bg-accent/20 transition-all text-left"
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-foreground text-sm">{mover.symbol}</span>
            {isHot && <Flame className="w-3.5 h-3.5 text-orange-400" />}
          </div>
          <p className="text-[10px] text-muted-foreground truncate max-w-[110px]">{getCompanyName(mover.symbol)}</p>
        </div>
      </div>
      <p className="font-mono text-foreground text-sm font-semibold">
        {price ? `$${price.toFixed(2)}` : "—"}
      </p>
      <p className={`text-xs font-mono font-semibold mt-0.5 ${up ? "text-primary" : "text-destructive"}`}>
        {mover.change_pct != null ? `${up ? "+" : ""}${mover.change_pct.toFixed(2)}%` : "—"}
      </p>
      <div className="flex items-center gap-1 mt-2">
        <Zap className="w-3 h-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">
          {mover.vol_ratio ? `${mover.vol_ratio.toFixed(1)}x avg vol` : "— avg vol"}
        </span>
      </div>
    </button>
  );
}

export default function HotMovers({ onSelect }) {
  const [movers, setMovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("fetchStockData", { action: "hot_movers" });
      if (res.data?.movers) setMovers(res.data.movers);
      else throw new Error("No data returned");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Flame className="w-4 h-4 text-orange-400" />
        <h3 className="text-sm font-semibold text-foreground">Hot Right Now</h3>
        <span className="text-xs text-muted-foreground">Today's most active movers</span>
        {error && (
          <button onClick={load} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {loading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-44 h-28 bg-card border border-border rounded-xl animate-pulse" />
          ))
        ) : error ? (
          <p className="text-sm text-destructive px-2">{error}</p>
        ) : (
          movers.map(m => (
            <MoverCard key={m.symbol} mover={m} onClick={s => onSelect({ ...s, name: getCompanyName(s.symbol) })} />
          ))
        )}
      </div>
    </div>
  );
}