import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowUpRight, ArrowDownRight, Search } from "lucide-react";
import { format } from "date-fns";

export default function TradeHistory() {
  const [actionFilter, setActionFilter] = useState("all");
  const [symbolFilter, setSymbolFilter] = useState("");

  const { data: trades = [], isLoading } = useQuery({
    queryKey: ["all-trades"],
    queryFn: () => base44.entities.Trade.list("-executed_at", 200),
  });

  const filtered = trades.filter((t) => {
    if (actionFilter !== "all" && t.action !== actionFilter) return false;
    if (symbolFilter && !t.symbol?.toLowerCase().includes(symbolFilter.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">Trade History</h2>
        <p className="text-sm text-muted-foreground mt-1">Complete log of all executed trades</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search symbol..."
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-32 bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="buy">Buy</SelectItem>
            <SelectItem value="sell">Sell</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-secondary/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground">No trades found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Symbol</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Action</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Qty</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Price</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Total</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Result</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((trade) => {
                  const isBuy = trade.action === "buy";
                  const resultPositive = (trade.result || 0) >= 0;
                  return (
                    <TableRow key={trade.id} className="border-border">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {trade.executed_at ? format(new Date(trade.executed_at), "MMM d, yyyy h:mm a") : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono font-semibold text-foreground">{trade.symbol}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {isBuy ? (
                            <ArrowUpRight className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />
                          )}
                          <Badge variant="outline" className={`text-[10px] ${
                            isBuy ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive"
                          }`}>
                            {trade.action?.toUpperCase()}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-foreground">{trade.quantity}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">${trade.price?.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-foreground">${trade.total_value?.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        {trade.result != null ? (
                          <span className={`font-mono font-medium ${resultPositive ? "text-primary" : "text-destructive"}`}>
                            {resultPositive ? "+" : ""}${trade.result?.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${
                          trade.status === "executed" ? "border-primary/30 text-primary" :
                          trade.status === "failed" ? "border-destructive/30 text-destructive" :
                          "border-border text-muted-foreground"
                        }`}>
                          {trade.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{trade.reason || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}