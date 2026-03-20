import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function WatchedSection({ trades, watchedMembers, onUnwatch, hotSymbols }) {
  const [open, setOpen] = useState(false);

  const watchedTrades = useMemo(() => {
    if (!watchedMembers.length) return [];
    return trades
      .filter(t => watchedMembers.includes(t.representative))
      .sort((a, b) => new Date(b.disclosure_date) - new Date(a.disclosure_date))
      .slice(0, 100);
  }, [trades, watchedMembers]);

  if (!watchedMembers.length) return null;

  return (
    <Card className="bg-card border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-yellow-400">★</span>
          <span className="font-semibold text-foreground text-sm">Watched Members</span>
          <span className="text-xs text-muted-foreground">({watchedMembers.length} members · {watchedTrades.length} trades)</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border">
          {/* Watched member tags */}
          <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-border">
            {watchedMembers.map(m => (
              <span key={m} className="flex items-center gap-1 px-2.5 py-1 bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 rounded-full text-xs">
                {m}
                <button onClick={() => onUnwatch(m)}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          {/* Trades table */}
          {watchedTrades.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No trades yet from watched members.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/20">
                    {["Date","Member","Symbol","Transaction","Amount","Signal"].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {watchedTrades.map((t, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-accent/20">
                      <td className="px-4 py-2 text-xs text-muted-foreground font-mono">{t.disclosure_date}</td>
                      <td className="px-4 py-2 text-xs text-foreground font-medium">{t.representative}</td>
                      <td className="px-4 py-2 text-xs font-mono font-bold text-foreground">{t.symbol}</td>
                      <td className={`px-4 py-2 text-xs font-semibold uppercase ${t.transaction === "buy" ? "text-primary" : "text-destructive"}`}>
                        {t.transaction}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{t.amount_range}</td>
                      <td className="px-4 py-2 text-xs">
                        {hotSymbols?.has(t.symbol?.toUpperCase()) ? "🔥 Hot Signal" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}