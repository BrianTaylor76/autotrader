import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { Card } from "@/components/ui/card";
import { Loader2, FlaskConical } from "lucide-react";
import BacktestConfig from "@/components/backtest/BacktestConfig";
import BacktestStats from "@/components/backtest/BacktestStats";
import BacktestChart from "@/components/backtest/BacktestChart";
import BacktestTradeLog from "@/components/backtest/BacktestTradeLog";
import BacktestHistory from "@/components/backtest/BacktestHistory";

export default function Backtest() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // { runId, simple, consensus }
  const [trades, setTrades] = useState([]);

  const { data: runs = [] } = useQuery({
    queryKey: ["backtest_runs"],
    queryFn: () => base44.entities.BacktestRun.list("-created_at", 10),
  });

  async function handleRun(config) {
    setRunning(true);
    setResult(null);
    setTrades([]);
    try {
      const res = await base44.functions.invoke("runBacktest", config);
      const data = res.data;
      if (data.error) throw new Error(data.error);

      setResult(data);

      // Fetch trades for this run
      const runTrades = await base44.entities.BacktestTrade.filter({ run_id: data.run_id }, "-date", 2000);
      setTrades(runTrades);

      queryClient.invalidateQueries({ queryKey: ["backtest_runs"] });
      toast({ title: "Backtest complete!", description: `Simulation finished successfully.` });
    } catch (err) {
      toast({ title: "Backtest failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  async function handleLoadRun(run) {
    const runTrades = await base44.entities.BacktestTrade.filter({ run_id: run.id }, "-date", 2000);
    setTrades(runTrades);

    // Reconstruct daily values from trade log isn't feasible here — just show stats
    setResult({
      run_id: run.id,
      simple: run.simple_total_return_pct != null ? {
        stats: {
          total_return_pct: run.simple_total_return_pct,
          total_return_dollars: run.simple_total_return_dollars,
          win_rate: run.simple_win_rate,
          total_trades: run.simple_total_trades,
          winning_trades: run.simple_winning_trades,
          losing_trades: run.simple_losing_trades,
          avg_gain: run.simple_avg_gain,
          avg_loss: run.simple_avg_loss,
          max_drawdown: run.simple_max_drawdown,
          sharpe_ratio: run.simple_sharpe_ratio,
          final_value: run.simple_final_value,
        },
        dailyValues: null,
      } : null,
      consensus: run.consensus_total_return_pct != null ? {
        stats: {
          total_return_pct: run.consensus_total_return_pct,
          total_return_dollars: run.consensus_total_return_dollars,
          win_rate: run.consensus_win_rate,
          total_trades: run.consensus_total_trades,
          winning_trades: run.consensus_winning_trades,
          losing_trades: run.consensus_losing_trades,
          avg_gain: run.consensus_avg_gain,
          avg_loss: run.consensus_avg_loss,
          max_drawdown: run.consensus_max_drawdown,
          sharpe_ratio: run.consensus_sharpe_ratio,
          final_value: run.consensus_final_value,
        },
        dailyValues: null,
      } : null,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-primary" />
          Backtest
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Run historical simulations of trading strategies</p>
      </div>

      <BacktestConfig onRun={handleRun} running={running} />

      {running && (
        <Card className="bg-card border-border p-10 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-foreground font-medium">Running simulation…</p>
          <p className="text-sm text-muted-foreground">Fetching price history and simulating trades. This may take ~15 seconds.</p>
        </Card>
      )}

      {result && !running && (
        <>
          <BacktestStats
            simpleStats={result.simple?.stats}
            consensusStats={result.consensus?.stats}
          />

          {(result.simple?.dailyValues || result.consensus?.dailyValues) && (
            <BacktestChart
              simpleValues={result.simple?.dailyValues}
              consensusValues={result.consensus?.dailyValues}
              initialCapital={10000}
            />
          )}

          {trades.length > 0 && <BacktestTradeLog trades={trades} />}
        </>
      )}

      <BacktestHistory runs={runs} onLoadRun={handleLoadRun} />
    </div>
  );
}