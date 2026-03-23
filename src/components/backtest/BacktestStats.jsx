import React from "react";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Trophy } from "lucide-react";

function fmt(n, decimals = 2) {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function fmtDollar(n) {
  if (n == null) return "—";
  return (n >= 0 ? "+" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n == null) return "—";
  return (n >= 0 ? "+" : "") + fmt(n) + "%";
}

function sharpeColor(v) {
  if (v == null) return "text-muted-foreground";
  if (v >= 2.0) return "text-primary";
  if (v >= 1.0) return "text-yellow-400";
  return "text-destructive";
}

function StatRow({ label, value, subValue, className }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-semibold font-mono ${className || "text-foreground"}`}>{value}</span>
        {subValue && <p className="text-[10px] text-muted-foreground">{subValue}</p>}
      </div>
    </div>
  );
}

function StrategyCard({ label, stats, isBetter, color }) {
  if (!stats) return null;
  const returnPositive = stats.total_return_pct >= 0;
  const drawdownBad = stats.max_drawdown > 20;
  const ratio = stats.avg_loss !== 0 ? Math.abs(stats.avg_gain / stats.avg_loss) : null;

  return (
    <Card className="bg-card border-border p-5 flex-1 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${color}`} />
          <span className="font-semibold text-foreground capitalize">{label} Strategy</span>
        </div>
        {isBetter && (
          <div className="flex items-center gap-1.5 text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2.5 py-1 rounded-full font-medium">
            <Trophy className="w-3 h-3" /> Better Strategy
          </div>
        )}
      </div>

      {/* Return — big display */}
      <div className="mb-4 pb-4 border-b border-border/40">
        <p className="text-xs text-muted-foreground mb-1">Total Return</p>
        <p className={`text-2xl font-bold font-mono ${returnPositive ? "text-primary" : "text-destructive"}`}>
          {fmtPct(stats.total_return_pct)}
        </p>
        <p className={`text-sm font-mono ${returnPositive ? "text-primary/70" : "text-destructive/70"}`}>
          {fmtDollar(stats.total_return_dollars)}
        </p>
      </div>

      <StatRow label="Win Rate" value={fmt(stats.win_rate) + "%"} subValue={`${stats.winning_trades}W / ${stats.losing_trades}L`} />
      <div className="py-2.5 border-b border-border/40">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Win Rate</span>
          <span className="text-sm font-semibold font-mono text-foreground">{fmt(stats.win_rate)}%</span>
        </div>
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(stats.win_rate, 100)}%` }} />
        </div>
      </div>
      <StatRow label="Total Trades" value={stats.total_trades} />
      <StatRow
        label="Gain : Loss Ratio"
        value={ratio != null ? `${fmt(ratio, 1)}:1` : "—"}
        subValue={`Avg gain ${fmtPct(stats.avg_gain)} / Avg loss ${fmtPct(stats.avg_loss)}`}
      />
      <div className="flex items-center justify-between py-2.5 border-b border-border/40">
        <div className="flex items-center gap-1.5">
          {drawdownBad && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
          <span className="text-xs text-muted-foreground">Max Drawdown</span>
        </div>
        <span className={`text-sm font-semibold font-mono ${drawdownBad ? "text-destructive" : "text-foreground"}`}>
          -{fmt(stats.max_drawdown)}%
        </span>
      </div>
      <div className="flex items-center justify-between py-2.5">
        <span className="text-xs text-muted-foreground">Sharpe Ratio</span>
        <span className={`text-sm font-semibold font-mono ${sharpeColor(stats.sharpe_ratio)}`}>
          {fmt(stats.sharpe_ratio)}
        </span>
      </div>
    </Card>
  );
}

export default function BacktestStats({ simpleStats, consensusStats }) {
  const simpleBetter = simpleStats && consensusStats
    ? simpleStats.total_return_pct > consensusStats.total_return_pct
    : false;
  const consensusBetter = simpleStats && consensusStats
    ? consensusStats.total_return_pct > simpleStats.total_return_pct
    : false;

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <StrategyCard label="simple" stats={simpleStats} isBetter={simpleBetter} color="bg-primary" />
      <StrategyCard label="consensus" stats={consensusStats} isBetter={consensusBetter} color="bg-blue-500" />
    </div>
  );
}