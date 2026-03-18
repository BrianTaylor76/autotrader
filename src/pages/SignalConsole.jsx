import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { RefreshCw, TrendingUp, Building2, Users, MessageSquare, Gauge } from "lucide-react";
import { format } from "date-fns";

const SIGNAL_COLS = [
  { key: "ma_signal", label: "MA", icon: TrendingUp, description: "Moving Average crossover" },
  { key: "ark_signal", label: "ARK", icon: Building2, description: "ARK Invest holdings" },
  { key: "congress_signal", label: "Congress", icon: Users, description: "Congress trading activity" },
  { key: "sentiment_signal", label: "Sentiment", icon: MessageSquare, description: "StockTwits sentiment" },
];

function SignalCell({ value }) {
  if (value === "bullish") {
    return (
      <div className="flex items-center justify-center">
        <span className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">▲</span>
      </div>
    );
  }
  if (value === "bearish") {
    return (
      <div className="flex items-center justify-center">
        <span className="w-8 h-8 rounded-lg bg-destructive/15 border border-destructive/30 flex items-center justify-center text-xs font-bold text-destructive">▼</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center">
      <span className="w-8 h-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-xs font-bold text-muted-foreground">–</span>
    </div>
  );
}

function ScoreBar({ score }) {
  const pct = (score / 4) * 100;
  const color = score >= 3 ? "bg-primary" : score === 2 ? "bg-chart-4" : "bg-destructive";
  const textColor = score >= 3 ? "text-primary" : score === 2 ? "text-chart-4" : "text-destructive";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-mono text-xs font-bold w-6 text-right ${textColor}`}>{score}/4</span>
    </div>
  );
}

function RecommendationBadge({ rec }) {
  if (rec === "buy") return <Badge className="bg-primary/15 text-primary border-primary/30 border text-[10px] px-2">BUY</Badge>;
  if (rec === "sell") return <Badge className="bg-destructive/15 text-destructive border-destructive/30 border text-[10px] px-2">SELL</Badge>;
  return <Badge className="bg-secondary text-muted-foreground border-border border text-[10px] px-2">HOLD</Badge>;
}

export default function SignalConsole() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: scores = [], isLoading: loadingScores } = useQuery({
    queryKey: ["consensus-scores"],
    queryFn: () => base44.entities.ConsensusScore.list("-scored_at", 100),
  });

  const { data: arkSignals = [] } = useQuery({
    queryKey: ["ark-signals"],
    queryFn: () => base44.entities.ARKSignal.list("-created_date", 1),
  });

  const { data: congressSignals = [] } = useQuery({
    queryKey: ["congress-signals"],
    queryFn: () => base44.entities.CongressSignal.list("-created_date", 1),
  });

  const { data: sentimentSignals = [] } = useQuery({
    queryKey: ["sentiment-signals"],
    queryFn: () => base44.entities.SentimentSignal.list("-created_date", 1),
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: () => base44.entities.StrategySettings.list("-created_date", 1),
  });

  const watchlist = settings[0]?.watchlist || [];

  // Deduplicate: keep latest score per symbol
  const latestScores = {};
  for (const s of scores) {
    if (!latestScores[s.symbol]) latestScores[s.symbol] = s;
  }
  const rows = watchlist.length > 0 ? watchlist.map(sym => latestScores[sym] || { symbol: sym, total_score: null }) : Object.values(latestScores);

  const lastArk = arkSignals[0]?.created_date;
  const lastCongress = congressSignals[0]?.created_date;
  const lastSentiment = sentimentSignals[0]?.created_date;
  const lastScore = scores[0]?.scored_at;

  const handleRefresh = async () => {
    setRefreshing(true);
    toast({ title: "Refreshing signals…", description: "Fetching latest data from all sources." });
    try {
      await base44.functions.invoke("fetchARKSignals", {});
      await base44.functions.invoke("fetchCongressSignals", {});
      await base44.functions.invoke("fetchSentimentSignals", {});
      await base44.functions.invoke("scoreConsensus", {});
      await queryClient.invalidateQueries();
      toast({ title: "Signals refreshed", description: "All signal sources updated successfully." });
    } catch (e) {
      toast({ title: "Refresh error", description: e.message, variant: "destructive" });
    }
    setRefreshing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Signal Console</h2>
          <p className="text-sm text-muted-foreground mt-1">Multi-source consensus heatmap for your watchlist</p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={refreshing}
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh Signals"}
        </Button>
      </div>

      {/* Source timestamps */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "MA / Score", icon: Gauge, ts: lastScore },
          { label: "ARK Signals", icon: Building2, ts: lastArk },
          { label: "Congress", icon: Users, ts: lastCongress },
          { label: "Sentiment", icon: MessageSquare, ts: lastSentiment },
        ].map(({ label, icon: SrcIcon, ts }) => (
          <Card key={label} className="bg-card border-border p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary shrink-0">
              <SrcIcon className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{label}</p>
              <p className="text-xs font-mono text-foreground truncate">
                {ts ? format(new Date(ts), "MMM d, h:mm a") : "Never"}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* Heatmap */}
      <Card className="bg-card border-border overflow-hidden">
        {loadingScores ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-secondary/50 rounded-lg animate-pulse" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground text-sm">No signals found. Add symbols to your watchlist and click Refresh Signals.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground w-24">Symbol</th>
                  {SIGNAL_COLS.map(col => (
                    <th key={col.key} className="text-center px-3 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <div className="flex flex-col items-center gap-1">
                        <col.icon className="w-3.5 h-3.5" />
                        <span>{col.label}</span>
                      </div>
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Score</th>
                  <th className="text-center px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Signal</th>
                  <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground hidden md:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.symbol} className={`border-b border-border last:border-0 ${idx % 2 === 0 ? "" : "bg-secondary/10"}`}>
                    <td className="px-4 py-3.5">
                      <span className="font-mono font-bold text-foreground">{row.symbol}</span>
                    </td>
                    {SIGNAL_COLS.map(col => (
                      <td key={col.key} className="px-3 py-3.5">
                        <SignalCell value={row[col.key]} />
                      </td>
                    ))}
                    <td className="px-4 py-3.5">
                      {row.total_score !== null && row.total_score !== undefined
                        ? <ScoreBar score={row.total_score} />
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {row.recommendation ? <RecommendationBadge rec={row.recommendation} /> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right hidden md:table-cell">
                      <span className="text-xs font-mono text-muted-foreground">
                        {row.scored_at ? format(new Date(row.scored_at), "MMM d, h:mm a") : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-primary/15 border border-primary/30 flex items-center justify-center text-primary text-[9px] font-bold">▲</span> Bullish</div>
        <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive text-[9px] font-bold">▼</span> Bearish</div>
        <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-secondary border border-border flex items-center justify-center text-muted-foreground text-[9px] font-bold">–</span> Neutral / No data</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-primary inline-block" /> Score ≥ 3 = Buy zone</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-chart-4 inline-block" /> Score = 2 = Caution</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-destructive inline-block" /> Score ≤ 1 = Sell zone</div>
      </div>
    </div>
  );
}