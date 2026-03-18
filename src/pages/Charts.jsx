import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import ChartWidget from "../components/chart/ChartWidget";
import { Card } from "@/components/ui/card";
import { BarChart2 } from "lucide-react";

const DEFAULT_SYMBOLS = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "AMZN"];

export default function Charts() {
  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: () => base44.entities.StrategySettings.list("-created_date", 1),
  });

  const watchlist = settings[0]?.watchlist || [];
  const symbols = watchlist.length > 0 ? watchlist : DEFAULT_SYMBOLS;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">Charts</h2>
        <p className="text-sm text-muted-foreground mt-1">Real-time candlestick charts · auto-refreshes every 30s</p>
      </div>

      <ChartWidget symbols={symbols} defaultSymbol={symbols[0]} height={420} />
    </div>
  );
}