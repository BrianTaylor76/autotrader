import React, { useMemo } from "react";
import { X, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function PartyDot({ party }) {
  const color = party === "Democrat" ? "bg-blue-500" : party === "Republican" ? "bg-red-500" : "bg-muted-foreground";
  return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5`} />;
}

export default function MemberPanel({ member, trades, isWatched, onToggleWatch, onClose }) {
  const buys = trades.filter(t => t.transaction === "buy").length;
  const sells = trades.filter(t => t.transaction === "sell").length;
  const buyPct = trades.length ? Math.round((buys / trades.length) * 100) : 0;

  const topSymbols = useMemo(() => {
    const counts = {};
    trades.forEach(t => { if (t.symbol) counts[t.symbol] = (counts[t.symbol] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([sym]) => sym);
  }, [trades]);

  const info = trades[0] || {};

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-card border-l border-border shadow-2xl overflow-y-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div>
            <h3 className="font-bold text-foreground text-lg leading-tight">{member}</h3>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <PartyDot party={info.party} />
              <span>{info.party || "Unknown"}</span>
              <span>·</span>
              <span>{info.chamber}</span>
              {info.state && <><span>·</span><span>{info.state}</span></>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isWatched ? "default" : "outline"}
              onClick={onToggleWatch}
              className="gap-1.5 text-xs"
            >
              <Star className={`w-3.5 h-3.5 ${isWatched ? "fill-current" : ""}`} />
              {isWatched ? "Watching" : "Watch"}
            </Button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="p-5 space-y-4 border-b border-border">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-foreground">{trades.length}</p>
              <p className="text-xs text-muted-foreground">Total Trades</p>
            </div>
            <div className="bg-primary/10 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-primary">{buys}</p>
              <p className="text-xs text-muted-foreground">Buys</p>
            </div>
            <div className="bg-destructive/10 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-destructive">{sells}</p>
              <p className="text-xs text-muted-foreground">Sells</p>
            </div>
          </div>

          {/* Buy/sell bar */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Buy/Sell Ratio</span>
              <span>{buyPct}% buys</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${buyPct}%` }} />
            </div>
          </div>

          {/* Top symbols */}
          {topSymbols.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Most Traded Symbols</p>
              <div className="flex flex-wrap gap-1.5">
                {topSymbols.map(sym => (
                  <span key={sym} className="px-2 py-1 bg-secondary rounded-md text-xs font-mono font-semibold text-foreground">
                    {sym}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Trade history */}
        <div className="flex-1 p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Trade History</p>
          <div className="space-y-2">
            {trades.slice(0, 50).map((t, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/40">
                <div>
                  <span className="font-mono font-bold text-sm text-foreground">{t.symbol}</span>
                  <span className={`ml-2 text-xs font-medium uppercase ${t.transaction === "buy" ? "text-primary" : "text-destructive"}`}>
                    {t.transaction}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{t.disclosure_date}</p>
                  <p className="text-xs text-muted-foreground">{t.amount_range}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}