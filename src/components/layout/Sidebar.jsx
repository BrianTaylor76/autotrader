import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, History, Settings, Key, Activity, TrendingUp, LineChart, Radio, BookOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const ALL_NAV_ITEMS = [
  { path: "/Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/Charts", label: "Charts", icon: LineChart },
  { path: "/TradeHistory", label: "Trade History", icon: History },
  { path: "/SignalConsole", label: "Signals", icon: Radio },
  { path: "/StrategySettings", label: "Strategy", icon: Settings },
  { path: "/ApiSettings", label: "API Keys", icon: Key },
];

export default function Sidebar() {
  const location = useLocation();

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: () => base44.entities.StrategySettings.list("-created_date", 1),
    staleTime: 30000,
  });
  const strategyMode = settings[0]?.strategy_mode || "simple";
  const navItems = ALL_NAV_ITEMS.filter(item => !item.requiresConsensus || strategyMode !== "simple");

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-card border-r border-border flex-col z-30">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-inter font-bold text-lg text-foreground tracking-tight">AutoTrader</h1>
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-primary animate-pulse" />
              <span className="text-xs text-muted-foreground font-mono">v1.0</span>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="px-4 py-3 rounded-lg bg-secondary/50">
          <p className="text-xs text-muted-foreground">Market Hours</p>
          <p className="text-sm font-mono text-foreground mt-1">9:30 AM – 4:00 PM ET</p>
        </div>
      </div>
    </aside>
  );
}