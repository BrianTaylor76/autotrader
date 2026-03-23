import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getCompanyName } from "@/utils/stockLists";
import { Flame, Zap } from "lucide-react";

function MoverCard({ mover, onClick }) {
  const isHot = Math.abs(mover.change_pct) > 3 || mover.vol_ratio > 2;
  const up = mover.change_pct >= 0;
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
        {mover.is_fractional && (
          <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-medium">F</span>
        )}
      </div>
      <p className="font-mono text-foreground text-sm font-semibold">${mover.price?.toFixed(2)}</p>
      <p className={`text-xs font-mono font-semibold mt-0.5 ${up ? "text-primary" : "text-destructive"}`}>
        {up ? "+" : ""}{mover.change_pct?.toFixed(2)}%
      </p>
      <div className="flex items-center gap-1 mt-2">
        <Zap className="w-3 h-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">{mover.vol_ratio?.toFixed(1)}x avg vol</span>
      </div>
    </button>
  );
}

export default function HotMovers({ onSelect }) {
  const [movers, setMovers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.functions.invoke("fetchStockData", { action: "hot_movers" })
      .then(res => { if (res.data?.movers) setMovers(res.data.movers); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-44 h-28 bg-card border border-border rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Flame className="w-4 h-4 text-orange-400" />
        <h3 className="text-sm font-semibold text-foreground">Hot Right Now</h3>
        <span className="text-xs text-muted-foreground">Today's most active movers</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {movers.map(m => (
          <MoverCard key={m.symbol} mover={m} onClick={onSelect} />
        ))}
      </div>
    </div>
  );
}