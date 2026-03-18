import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, TrendingUp, TrendingDown, Minus, Clock } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

const SIGNAL_COLS = [
  { key: "ma_signal", label: "MA Cross" },
  { key: "ark_signal", label: "ARK" },
  { key: "congress_signal", label: "Congress" },
  { key: "sentiment_signal", label: "Sentiment" },
];

function SignalCell({ value }) {
  if (value === "bullish") return (
    <div className="flex items-center justify-center">
      <span className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
        <TrendingUp className="w-4 h-4 text-primary" />
      </span>
    </div>
  );
  if (value === "bearish") return (
    <div className="flex items-center justify-center">
      <span className="w-7 h-7 rounded-lg bg-destructive/15 flex items-center justify-center">
        <TrendingDown className="w-4 h-4 text-destructive" />
      </span>
    </div>
  );
  return (
    <div className="flex items-center justify-center">
      <span className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
        <Minus className="w-4 h-4 text-muted-foreground" />
      </span>
    </div>
  );
}

function ScoreBar({ score }) {
  const color =
    score >= 3 ? "bg-primary" :
    score === 2 ? "bg-chart-4" :
    "bg-destructive";
  const label =
    score >= 3 ? "BUY" :
    score <= 1 ? "SELL" :
    "HOLD";
  const labelColor =
    score >= 3 ? "text-primary" :
    score <= 1 ? "text-destructive" :
    "text-chart-4";

  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex gap-0.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-3.5 h-3.5 rounded-sm ${i < score ? color : "bg-secondary"}`}
          />
        ))}
      </div>
      <span className={`text-xs font-bold font-mono ${labelColor}`}>{label}</span>
    </div>
  );
}

export default function SignalConsole() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: () => base44.entities.StrategySettings.list("-created_date", 1),
  });

  const { data: scores = [], isLoading } = useQuery({
    queryKey: ["consensusScores"],
    queryFn: () => base44.entities.ConsensusScore.list("-scored_at", 100),
  });

  const currentSettings = settings[0];
  const watchlist = currentSettings?.watchlist || [];

  // Deduplicate: latest score per symbol
  const scoreMap = {};
  for (const s of scores) {
    if (!scoreMap[s.symbol]) scoreMap[s.symbol] = s;
  }

  const lastUpdated = scores.length > 0
    ? scores.reduce((latest, s) => s.scored_at > latest ? s.scored_at : latest, scores[0].scored_at)
    : null;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await base44.functions.invoke("fetchARKSignals", {});
      await base44.functions.invoke("fetchCongressSignals", {});
      await base44.functions.invoke("fetchSentimentSignals", {});
      await base44.functions.invoke("scoreConsensus", {});
      await queryClient.invalidateQueries({ queryKey: ["consensusScores"] });
      toast({ title: "Signals refreshed", description: "All signal sources updated successfully." });
    } catch (e) {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    }
    setRefreshing(false);
  };

  const displaySymbols = watchlist.length > 0 ? watchlist : Object.keys(scoreMap);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Signal Console</h2>
          <p className="text-sm text-muted-foreground mt-1">Multi-source consensus heatmap for your watchlist</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>Updated {format(new Date(lastUpdated), "MMM d, h:mm a")}</span>
            </div>
          )}
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh Signals"}
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-primary/15 flex items-center justify-center"><TrendingUp className="w-3 h-3 text-primary" /></span>
          <span>Bullish</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-destructive/15 flex items-center justify-center"><TrendingDown className="w-3 h-3 text-destructive" /></span>
          <span>Bearish</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-secondary flex items-center justify-center"><Minus className="w-3 h-3 text-muted-foreground" /></span>
          <span>Neutral</span>
        </div>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-secondary/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : displaySymbols.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <p>No symbols in watchlist. Add symbols in Strategy Settings and click Refresh Signals.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3.5 text-xs font-medium uppercase tracking-wider text-muted-foreground w-24">Symbol</th>
                  {SIGNAL_COLS.map((col) => (
                    <th key={col.key} className="text-center px-4 py-3.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {col.label}
                    </th>
                  ))}
                  <th className="text-left px-5 py-3.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Score</th>
                  <th className="text-left px-4 py-3.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Scored</th>
                </tr>
              </thead>
              <tbody>
                {displaySymbols.map((symbol, idx) => {
                  const row = scoreMap[symbol];
                  return (
                    <tr key={symbol} className={`border-b border-border last:border-0 ${idx % 2 === 0 ? "" : "bg-secondary/10"}`}>
                      <td className="px-5 py-3.5">
                        <span className="font-mono font-bold text-foreground">{symbol}</span>
                      </td>
                      {SIGNAL_COLS.map((col) => (
                        <td key={col.key} className="px-4 py-3.5">
                          <SignalCell value={row ? row[col.key] : undefined} />
                        </td>
                      ))}
                      <td className="px-5 py-3.5">
                        {row ? (
                          <ScoreBar score={row.total_score} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono">
                        {row?.scored_at ? format(new Date(row.scored_at), "h:mm a") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}