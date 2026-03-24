import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, History, Settings, TrendingUp, LineChart, Radio, BookOpen, Landmark, FlaskConical, Monitor, Menu, X, BookmarkCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const ALL_NAV_ITEMS = [
  { path: "/Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/Charts", label: "Charts", icon: LineChart },
  { path: "/TradeHistory", label: "History", icon: History },
  { path: "/SignalConsole", label: "Signals", icon: Radio },
  { path: "/StrategySettings", label: "Strategy", icon: Settings },
  { path: "/CongressWatch", label: "Congress", icon: Landmark },
  { path: "/ManualMode", label: "Manual", icon: Monitor },
  { path: "/Watchlist", label: "Watchlist", icon: BookmarkCheck },
  { path: "/Backtest", label: "Backtest", icon: FlaskConical },
  { path: "/Learn", label: "Learn", icon: BookOpen },
];

const BOTTOM_NAV = ALL_NAV_ITEMS.slice(0, 6);

export default function MobileNav() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: () => base44.entities.StrategySettings.list("-created_date", 1),
    staleTime: 30000,
  });
  const strategyMode = settings[0]?.strategy_mode || "simple";
  const navItems = ALL_NAV_ITEMS.filter(item => !item.requiresConsensus || strategyMode !== "simple");

  return (
    <>
      {/* Top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <span className="font-bold text-foreground tracking-tight">AutoTrader</span>
        </div>
        <button
          onClick={() => setMenuOpen(true)}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Hamburger Drawer */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
          {/* Drawer */}
          <div className="relative ml-auto w-72 h-full bg-card border-l border-border flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <span className="font-bold text-foreground">AutoTrader</span>
              </div>
              <button onClick={() => setMenuOpen(false)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex items-center z-40 pb-safe pt-2 px-0" style={{ height: 'max(64px, calc(env(safe-area-inset-bottom) + 64px))' }}>
        {BOTTOM_NAV.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}