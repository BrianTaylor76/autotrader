import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, History, Settings, Key, TrendingUp, LineChart } from "lucide-react";

const navItems = [
  { path: "/Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/Charts", label: "Charts", icon: CandlestickChart },
  { path: "/TradeHistory", label: "History", icon: History },
  { path: "/StrategySettings", label: "Strategy", icon: Settings },
];

export default function MobileNav() {
  const location = useLocation();

  return (
    <>
      {/* Top bar - logo only */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border flex items-center px-4 z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <span className="font-bold text-foreground tracking-tight">AutoTrader</span>
        </div>
      </div>

      {/* Bottom tab bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center z-40 safe-area-bottom">
        {navItems.map((item) => {
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