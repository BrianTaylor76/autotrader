import React from "react";
import { Landmark } from "lucide-react";

export default function CongressActivity({ trades, loaded }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground mb-3">Congressional Activity</h4>
      {!loaded ? (
        <div className="h-8 bg-secondary animate-pulse rounded" />
      ) : trades.length > 0 ? (
        <>
          <div className="flex items-center gap-2 mb-3 px-3 py-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <Landmark className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-yellow-400 font-medium">🏛️ Congress is trading this stock</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Member</th>
                  <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Chamber</th>
                  <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Transaction</th>
                  <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Amount</th>
                  <th className="text-left py-2 text-muted-foreground font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-accent/10">
                    <td className="py-2 pr-3 text-foreground font-medium">{t.representative}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{t.chamber}</td>
                    <td className={`py-2 pr-3 font-semibold capitalize ${t.transaction === "buy" || t.transaction === "Purchase" ? "text-primary" : "text-destructive"}`}>{t.transaction}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{t.amount_range}</td>
                    <td className="py-2 text-muted-foreground font-mono">{t.disclosure_date || t.transaction_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground py-2">
          No congressional activity in the last 90 days.
          {trades.length === 0 && loaded && (
            <span className="block mt-1 text-muted-foreground/70">If you expect data here, visit Congress Watch and click Refresh Data first.</span>
          )}
        </p>
      )}
    </div>
  );
}