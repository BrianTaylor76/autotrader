import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Radio, TrendingUp, Users, BarChart2, MessageSquare, Clock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { formatDistanceToNow } from "date-fns";

const SIGNAL_COLS = [
  { key: "ma_signal", label: "MA Cross", icon: TrendingUp },
  { key: "ark_signal", label: "ARK", icon: BarChart2 },
  { key: "congress_signal", label: "Congress", icon: Users },
  { key: "sentiment_signal", label: "Sentiment", icon: MessageSquare },
];

function SignalCell({ value }) {
  if (value === "bullish") {
    return (
      <div className="flex items-center justify-center">
        <span className="w-full text-center py-1.5 rounded-md text-xs font-semibold bg-primary/15 text-primary border border-primary/20">
          Bullish
        </span>
      </div>
    );
  }
  if (value === "bearish") {
    return (
      <div className="flex items-center justify-center">
        <span className="w-full text-center py-1.5 rounded-md text-xs font-semibold bg-destructive/15 text-destructive border border-destructive/20">
          Bearish
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center">
      <span className="w-full text-center py-1.5 rounded-md text-xs font-semibold bg-muted text-muted-foreground border border-border">
        Neutral
      </span>
    </div>
  );
}

function ScoreBar({ score }) {
  const colors = ["bg-destructive", "bg-destructive/70", "bg-yellow-500", "bg-primary/70", "bg-primary"];
  const labels = ["", "", "", "", ""];
  const filled = colors[score] || "bg-muted";

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex gap-1 flex-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full transition-all ${i < score ? filled : "bg-secondary"}`}
          />
        ))}
      </div>
      <span className={`text-sm font-bold font-mono tabular-nums w-6 text-right ${
        score >= 3 ? "text-primary" : score === 2 ? "text-yellow-400" : "text-destructive"
      }`}>
        {score}/4
      </span>
    </div>
  );
}

function RecommendationBadge({ rec }) {
  if (rec === "buy") return <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">BUY</Badge>;
  if (rec === "sell") return <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-xs">SELL</Badge>;
  return <Badge variant="secondary" className="text-xs text-muted-foreground">HOLD</Badge>;
}

export default function SignalConsole() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStep, setRefreshStep] = useState("");

  const { data: scores = [], isLoading } = useQuery({
    queryKey: ["consensus_scores"],
    queryFn: () => base44.entities.ConsensusScore.list("-scored_at", 100),
    refetchInterval: 60000,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: () => base44.entities.StrategySettings.list("-created_date", 1),
  });

  const watchlist = settings[0]?.watchlist || [];

  // Merge scores with watchlist so unscored symbols show as rows too
  const rows = watchlist.map((symbol) => {
    const score = scores.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase());
    return { symbol, score };
  });

  // If no watchlist, fall back to scores list
  const displayRows = rows.length > 0 ? rows : scores.map((s) => ({ symbol: s.symbol, score: s }));

  const lastUpdated = scores.length > 0
    ? scores.reduce((latest, s) => {
        const d = new Date(s.scored_at);
        return d > latest ? d : latest;
      }, new Date(0))
    : null;

  async function handleRefreshAll() {
    setRefreshing(true);
    setRefreshStep("Fetching all signals…");

    // Fetch all 3 signal sources in parallel, then score
    await Promise.all([
      base44.functions.invoke("fetchARKSignals", {}),
      base44.functions.invoke("fetchCongressSignals", {}),
      base44.functions.invoke("fetchSentimentSignals", {}),
    ]);

    setRefreshStep("Scoring consensus…");
    await base44.functions.invoke("scoreConsensus", {});

    setRefreshStep("");
    setRefreshing(false);
    queryClient.invalidateQueries({ queryKey: ["consensus_scores"] });
    toast({ title: "Signals refreshed", description: "All 4 signal sources updated and scored." });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Signal Console</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-source consensus heatmap across your watchlist
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && lastUpdated.getTime() > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</span>
            </div>
          )}
          <Button
            onClick={handleRefreshAll}
            disabled={refreshing}
            variant="outline"
            className="border-border gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? refreshStep || "Refreshing…" : "Refresh Signals"}
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-primary/15 border border-primary/20 inline-block" />
          Bullish
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-destructive/15 border border-destructive/20 inline-block" />
          Bearish
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-muted border border-border inline-block" />
          Neutral
        </div>
        <span className="text-border">|</span>
        <span>Score bar: 0–4 bullish signals</span>
      </div>

      {/* Heatmap Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-card rounded-xl animate-pulse border border-border" />
          ))}
        </div>
      ) : displayRows.length === 0 ? (
        <Card className="bg-card border-border p-12 text-center">
          <Radio className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No signals yet. Add symbols to your watchlist and click Refresh Signals.</p>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Card className="bg-card border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium w-24">
                        Symbol
                      </th>
                      {SIGNAL_COLS.map((col) => (
                        <th key={col.key} className="text-center px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                          <div className="flex items-center justify-center gap-1.5">
                            <col.icon className="w-3.5 h-3.5" />
                            {col.label}
                          </div>
                        </th>
                      ))}
                      <th className="text-center px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium w-36">
                        Score
                      </th>
                      <th className="text-center px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium w-24">
                        Action
                      </th>
                      <th className="text-right px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium w-32">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map(({ symbol, score }, idx) => (
                      <tr
                        key={symbol}
                        className={`border-b border-border/50 transition-colors hover:bg-accent/30 ${
                          idx % 2 === 0 ? "" : "bg-secondary/20"
                        }`}
                      >
                        <td className="px-5 py-4">
                          <span className="font-mono font-bold text-foreground text-sm">{symbol}</span>
                        </td>
                        {SIGNAL_COLS.map((col) => (
                          <td key={col.key} className="px-4 py-3">
                            {score ? (
                              <SignalCell value={score[col.key]} />
                            ) : (
                              <div className="text-center text-xs text-muted-foreground">—</div>
                            )}
                          </td>
                        ))}
                        <td className="px-5 py-3">
                          {score ? (
                            <ScoreBar score={score.total_score} />
                          ) : (
                            <div className="text-xs text-muted-foreground text-center">No data</div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {score ? (
                            <RecommendationBadge rec={score.recommendation} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {score?.scored_at ? (
                            <span className="text-xs text-muted-foreground font-mono">
                              {formatDistanceToNow(new Date(score.scored_at), { addSuffix: true })}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Never</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {displayRows.map(({ symbol, score }) => (
              <Card key={symbol} className="bg-card border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-foreground">{symbol}</span>
                  {score ? (
                    <RecommendationBadge rec={score.recommendation} />
                  ) : (
                    <Badge variant="secondary" className="text-xs text-muted-foreground">No data</Badge>
                  )}
                </div>

                {score ? (
                  <>
                    <ScoreBar score={score.total_score} />
                    <div className="grid grid-cols-2 gap-2">
                      {SIGNAL_COLS.map((col) => (
                        <div key={col.key}>
                          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                            <col.icon className="w-3 h-3" /> {col.label}
                          </p>
                          <SignalCell value={score[col.key]} />
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(score.scored_at), { addSuffix: true })}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Run "Refresh Signals" to score this symbol.</p>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Signal source info */}
      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Signal Sources</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: TrendingUp, label: "MA Crossover", desc: "Fast MA vs slow MA position (live Alpaca data)" },
            { icon: BarChart2, label: "ARK Holdings", desc: "Symbol in ARKK Innovation ETF holdings" },
            { icon: Users, label: "Congress Trades", desc: "Net House + Senate purchases vs sales (30 days)" },
            { icon: MessageSquare, label: "StockTwits", desc: "Bullish/bearish ratio from last 30 posts" },
          ].map((src) => (
            <div key={src.label} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
              <src.icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{src.label}</p>
                <p className="text-xs text-muted-foreground">{src.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}