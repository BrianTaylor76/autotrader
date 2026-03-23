import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

function SentimentDot({ s }) {
  const c = s === "bullish" ? "bg-primary" : s === "bearish" ? "bg-destructive" : "bg-yellow-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${c}`} />;
}

export default function SavedResearch({ onLoadResearch }) {
  const [open, setOpen] = useState(false);
  const { data: saved = [] } = useQuery({
    queryKey: ["saved_research"],
    queryFn: () => base44.entities.StockResearch.list("-researched_at", 20),
  });

  if (!saved.length) return null;

  return (
    <Card className="bg-card border-border overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between p-4 hover:bg-accent/20 transition-colors">
        <span className="text-sm font-semibold text-foreground">Saved Research Library</span>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs">{saved.length} saved</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-border">
          {saved.map(r => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0 hover:bg-accent/10 transition-colors">
              <span className="font-mono font-bold text-foreground text-sm">{r.symbol}</span>
              <span className="text-xs text-muted-foreground">{r.company_name}</span>
              <div className="flex items-center gap-1.5">
                <SentimentDot s={r.consensus_sentiment} />
                <span className="text-xs text-muted-foreground capitalize">{r.consensus_sentiment || "—"}</span>
              </div>
              <span className="text-xs text-muted-foreground font-mono ml-auto">{r.researched_at?.split("T")[0]}</span>
              <Button size="sm" variant="outline" className="h-7 text-xs border-border" onClick={() => onLoadResearch(r)}>View</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}