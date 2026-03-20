import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import StatCard from "../components/dashboard/StatCard";
import BotStatusToggle from "../components/dashboard/BotStatusToggle";
import PositionsTable from "../components/dashboard/PositionsTable";
import RecentTrades from "../components/dashboard/RecentTrades";
import ChartWidget from "../components/chart/ChartWidget";
import { Wallet, TrendingUp, BarChart3, Zap } from "lucide-react";

export default function Dashboard() {
  const queryClient = useQueryClient();

  const { data: positions = [], isLoading: loadingPositions } = useQuery({
    queryKey: ["positions"],
    queryFn: () => base44.entities.Position.list("-created_date"),
  });

  const { data: trades = [] } = useQuery({
    queryKey: ["trades"],
    queryFn: () => base44.entities.Trade.list("-executed_at", 10),
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: () => base44.entities.StrategySettings.list("-created_date", 1),
  });

  const currentSettings = settings[0];

  const toggleBot = useMutation({
    mutationFn: async () => {
      if (!currentSettings?.id) throw new Error("Settings not loaded yet");
      await base44.entities.StrategySettings.update(currentSettings.id, {
        bot_enabled: !currentSettings.bot_enabled,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
    onError: (err) => console.error("Toggle bot failed:", err.message),
  });

  const portfolioValue = positions.reduce((sum, p) => sum + (p.market_value || 0), 0);
  const totalUnrealizedPL = positions.reduce((sum, p) => sum + (p.unrealized_pl || 0), 0);

  const today = new Date().toISOString().split("T")[0];
  const todaysTrades = trades.filter((t) => t.executed_at?.startsWith(today));
  const todaysPL = todaysTrades.reduce((sum, t) => sum + (t.result || 0), 0);

  const portfolioPct = portfolioValue > 0 ? (totalUnrealizedPL / (portfolioValue - totalUnrealizedPL)) * 100 : 0;

  const simplePL = trades.filter((t) => t.strategy === "Simple").reduce((sum, t) => sum + (t.result || 0), 0);
  const consensusPL = trades.filter((t) => t.strategy === "Consensus").reduce((sum, t) => sum + (t.result || 0), 0);
  const strategyMode = currentSettings?.strategy_mode || "simple";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">Monitor your portfolio and bot activity</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="Portfolio Value"
          value={`$${portfolioValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          icon={Wallet}
          trend={portfolioPct}
          trendLabel="total"
        />
        <StatCard
          title="Today's P&L"
          value={`${todaysPL >= 0 ? "+" : ""}$${todaysPL.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          icon={TrendingUp}
          variant={todaysPL >= 0 ? "gain" : "loss"}
        />
        <StatCard
          title="Active Positions"
          value={positions.length}
          icon={BarChart3}
        />
        <StatCard
          title="Trades Today"
          value={todaysTrades.length}
          icon={Zap}
        />
      </div>

      {(strategyMode === "both") && (
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <StatCard
            title="Simple P&L"
            value={`${simplePL >= 0 ? "+" : ""}$${simplePL.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            icon={TrendingUp}
            variant={simplePL >= 0 ? "gain" : "loss"}
          />
          <StatCard
            title="Consensus P&L"
            value={`${consensusPL >= 0 ? "+" : ""}$${consensusPL.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            icon={TrendingUp}
            variant={consensusPL >= 0 ? "gain" : "loss"}
          />
        </div>
      )}

      <BotStatusToggle
        enabled={currentSettings?.bot_enabled || false}
        onToggle={() => toggleBot.mutate()}
        loading={toggleBot.isPending || !currentSettings}
      />

      <ChartWidget
        symbols={currentSettings?.watchlist?.length > 0 ? currentSettings.watchlist : ["SPY", "QQQ", "AAPL", "TSLA"]}
        defaultSymbol={currentSettings?.watchlist?.[0] || "SPY"}
        height={260}
        compact
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <PositionsTable positions={positions} loading={loadingPositions} />
        </div>
        <div>
          <RecentTrades trades={trades} />
        </div>
      </div>
    </div>
  );
}