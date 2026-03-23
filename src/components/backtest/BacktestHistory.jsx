import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

function fmt(n) { return n != null ? n.toFixed(2) : "—"; }

export default function BacktestHistory({ runs, onLoadRun }) {
  const [open, setOpen] = useState(false);

  if (!runs.length) return null;

  function bestReturn(run) {
    const vals = [run.simple_total_return_pct, run.consensus_total_return_pct].filter(v => v != null);
    return vals.length ? Math.max(...vals) : null;
  }

  return (
    <Card className="bg-card border-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-accent/20 transition-colors"
      >
        <span className="text-sm font-semibold text-foreground">Previous Backtest Runs</span>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs">{runs.length} runs</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border">
          {runs.map(run => {
            const ret = bestReturn(run);
            return (
              <div key={run.id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0 hover:bg-accent/10 transition-colors">
                <span className="font-mono font-bold text-foreground text-sm">{run.symbol}</span>
                <span className="text-xs text-muted-foreground font-mono">{run.start_date} → {run.end_date}</span>
                <Badge variant="secondary" className="text-[10px] capitalize">{run.strategy}</Badge>
                {ret != null && (
                  <span className={`text-xs font-mono font-semibold ${ret >= 0 ? "text-primary" : "text-destructive"}`}>
                    {ret >= 0 ? "+" : ""}{fmt(ret)}%
                  </span>
                )}
                <div className="ml-auto">
                  <Button size="sm" variant="outline" className="h-7 text-xs border-border" onClick={() => onLoadRun(run)}>
                    View Results
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}