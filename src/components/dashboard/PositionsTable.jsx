import React from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function PositionsTable({ positions, loading }) {
  if (loading) {
    return (
      <Card className="p-5 bg-card border-border">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">Active Positions</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-secondary/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border overflow-hidden">
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Active Positions</h3>
          <Badge variant="outline" className="text-xs font-mono">{positions.length} open</Badge>
        </div>
      </div>
      {positions.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-muted-foreground text-sm">No active positions</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Symbol</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Qty</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Avg Entry</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Current</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Market Value</TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">P&L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((pos) => {
                const isPositive = (pos.unrealized_pl || 0) >= 0;
                return (
                  <TableRow key={pos.id} className="border-border">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold font-mono ${
                          isPositive ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                        }`}>
                          {pos.symbol?.slice(0, 2)}
                        </div>
                        <span className="font-mono font-semibold text-foreground">{pos.symbol}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-foreground">{pos.quantity}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">${pos.avg_entry_price?.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-foreground">${pos.current_price?.toFixed(2) || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-foreground">${pos.market_value?.toFixed(2) || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isPositive ? (
                          <TrendingUp className="w-3 h-3 text-primary" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-destructive" />
                        )}
                        <span className={`font-mono font-medium ${isPositive ? "text-primary" : "text-destructive"}`}>
                          {isPositive ? "+" : ""}${(pos.unrealized_pl || 0).toFixed(2)}
                        </span>
                        {pos.unrealized_pl_pct != null && (
                          <span className={`text-xs font-mono ml-1 ${isPositive ? "text-primary/70" : "text-destructive/70"}`}>
                            ({isPositive ? "+" : ""}{pos.unrealized_pl_pct?.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}