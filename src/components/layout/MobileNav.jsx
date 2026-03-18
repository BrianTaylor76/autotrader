import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, History, Settings, Key, Menu, X, TrendingUp } from "lucide-react";

const navItems = [
  { path: "/Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/TradeHistory", label: "History", icon: History },
  { path: "/StrategySettings", label: "Strategy", icon: Settings },
  { path: "/ApiSettings", label: "API Keys", icon: Key },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="lg:hidden">
      <div className="fixed top-0 left-0 right-0 h-16 bg-card border-b border-border flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <span className="font-bold text-foreground">AutoTrader</span>
        </div>
        <button onClick={() => setOpen(!open)} className="p-2 text-foreground">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 bg-background/95 z-30 pt-16">
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}