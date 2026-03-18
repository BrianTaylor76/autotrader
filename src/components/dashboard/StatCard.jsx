import React from "react";
import { Card } from "@/components/ui/card";

export default function StatCard({ title, value, icon: Icon, trend, trendLabel, variant = "default" }) {
  const isPositive = trend > 0;
  const isNegative = trend < 0;

  return (
    <Card className="p-5 bg-card border-border relative overflow-hidden group hover:border-primary/20 transition-colors duration-300">
      <div className="absolute top-0 right-0 w-24 h-24 opacity-5 group-hover:opacity-10 transition-opacity">
        {Icon && <Icon className="w-24 h-24" />}
      </div>
      <div className="flex items-start justify-between relative">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className={`text-2xl font-bold font-mono tracking-tight ${
            variant === "gain" ? "text-primary" : variant === "loss" ? "text-destructive" : "text-foreground"
          }`}>
            {value}
          </p>
          {trendLabel && (
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-mono font-medium ${
                isPositive ? "text-primary" : isNegative ? "text-destructive" : "text-muted-foreground"
              }`}>
                {isPositive ? "+" : ""}{trend?.toFixed(2)}%
              </span>
              <span className="text-xs text-muted-foreground">{trendLabel}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className="p-2.5 rounded-lg bg-secondary">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
      </div>
    </Card>
  );
}