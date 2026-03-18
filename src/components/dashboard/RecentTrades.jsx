import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";

export default function RecentTrades({ trades }) {
  return (
    <Card className="bg-card border-border overflow-hidden">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Recent Trades</h3>
        <Link to="/TradeHistory" className="text-xs text-primary hover:underline">View all</Link>
      </div>
      {trades.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-muted-foreground text-sm">No trades yet</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {trades.slice(0, 5).map((trade) => {
            const isBuy = trade.action === "buy";
            return (
              <div key={trade.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-accent/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isBuy ? "bg-primary/10" : "bg-destructive/10"
                  }`}>
                    {isBuy ? (
                      <ArrowUpRight className="w-4 h-4 text-primary" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-destructive" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-foreground text-sm">{trade.symbol}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                        isBuy ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive"
                      }`}>
                        {trade.action?.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {trade.quantity} shares @ ${trade.price?.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-foreground">${trade.total_value?.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">
                    {trade.executed_at ? format(new Date(trade.executed_at), "MMM d, h:mm a") : "—"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}