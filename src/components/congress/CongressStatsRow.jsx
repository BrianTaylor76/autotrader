import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";

export default function CongressStatsRow({ trades }) {
  const stats = useMemo(() => {
    if (!trades.length) return null;
    const buys = trades.filter(t => t.transaction === "buy").length;
    const sells = trades.filter(t => t.transaction === "sell").length;

    const memberCounts = {};
    trades.forEach(t => {
      if (t.representative) memberCounts[t.representative] = (memberCounts[t.representative] || 0) + 1;
    });
    const topMember = Object.entries(memberCounts).sort((a, b) => b[1] - a[1])[0];

    return { total: trades.length, buys, sells, topMember };
  }, [trades]);

  if (!stats) return null;

  const cards = [
    { label: "Total Trades", value: stats.total.toLocaleString(), sub: "last 500 trades analyzed" },
    {
      label: "Buys vs Sells",
      value: `${stats.buys} / ${stats.sells}`,
      sub: `${stats.total ? Math.round((stats.buys / stats.total) * 100) : 0}% buys`,
    },
    { label: "Most Active Member", value: stats.topMember?.[0] || "—", sub: `${stats.topMember?.[1] || 0} trades` },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map(c => (
        <Card key={c.label} className="bg-card border-border p-4">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className="text-lg font-bold text-foreground mt-1 truncate">{c.value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
        </Card>
      ))}
    </div>
  );
}