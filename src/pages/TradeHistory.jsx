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

function TradeCard({ trade }) {
  const isBuy = trade.action === "buy";
  const resultPositive = (trade.result || 0) >= 0;
  return (
    <div className="px-4 py-3.5 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isBuy ? "bg-primary/10" : "bg-destructive/10"}`}>
            {isBuy ? <ArrowUpRight className="w-4 h-4 text-primary" /> : <ArrowDownRight className="w-4 h-4 text-destructive" />}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-foreground">{trade.symbol}</span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isBuy ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive"}`}>
                {trade.action?.toUpperCase()}
              </Badge>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                trade.status === "executed" ? "border-primary/30 text-primary" :
                trade.status === "failed" ? "border-destructive/30 text-destructive" :
                "border-border text-muted-foreground"
              }`}>{trade.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {trade.quantity} shares @ ${trade.price?.toFixed(2)} · {trade.executed_at ? format(new Date(trade.executed_at), "MMM d, h:mm a") : "—"}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-sm font-semibold text-foreground">${trade.total_value?.toFixed(2)}</p>
          {trade.result != null && (
            <p className={`text-xs font-mono font-medium ${resultPositive ? "text-primary" : "text-destructive"}`}>
              {resultPositive ? "+" : ""}${trade.result?.toFixed(2)}
            </p>
          )}
        </div>
      </div>
      {trade.reason && (
        <p className="text-xs text-muted-foreground mt-2 ml-10 line-clamp-1">{trade.reason}</p>
      )}
    </div>
  );
}

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
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">Trade History</h2>
        <p className="text-sm text-muted-foreground mt-1">Complete log of all executed trades</p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search symbol..."
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-28 bg-card border-border shrink-0">
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
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-secondary/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground">No trades found</p>
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden">
              {filtered.map((trade) => <TradeCard key={trade.id} trade={trade} />)}
            </div>
            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
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
                            {isBuy ? <ArrowUpRight className="w-3.5 h-3.5 text-primary" /> : <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />}
                            <Badge variant="outline" className={`text-[10px] ${isBuy ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive"}`}>
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
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${
                            trade.status === "executed" ? "border-primary/30 text-primary" :
                            trade.status === "failed" ? "border-destructive/30 text-destructive" :
                            "border-border text-muted-foreground"
                          }`}>{trade.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{trade.reason || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}