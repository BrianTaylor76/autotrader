import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;

function fmt2(n) { return n != null ? n.toFixed(2) : "—"; }
function fmtDollar(n) {
  if (n == null) return "—";
  return (n >= 0 ? "+" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export default function BacktestTradeLog({ trades }) {
  const [stratFilter, setStratFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(0);

  const filtered = trades.filter(t => {
    if (stratFilter !== "all" && t.strategy !== stratFilter) return false;
    if (actionFilter !== "all" && t.action !== actionFilter) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageSlice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function rowClass(t) {
    if (t.is_covid_period) return "bg-yellow-500/5 border-yellow-500/20";
    if (t.action === "sell" && t.result_dollars > 0) return "bg-primary/5";
    if (t.action === "sell" && t.result_dollars <= 0) return "bg-destructive/5";
    return "";
  }

  return (
    <Card className="bg-card border-border overflow-hidden">
      <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-foreground flex-1">Trade Log</h3>
        <Select value={stratFilter} onValueChange={v => { setStratFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36 bg-secondary border-border h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Strategies</SelectItem>
            <SelectItem value="simple">Simple</SelectItem>
            <SelectItem value="consensus">Consensus</SelectItem>
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-28 bg-secondary border-border h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="buy">Buy</SelectItem>
            <SelectItem value="sell">Sell</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} trades</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Date</th>
              <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Strategy</th>
              <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Action</th>
              <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Price</th>
              <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Qty</th>
              <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Trade Result</th>
              <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Portfolio Value</th>
            </tr>
          </thead>
          <tbody>
            {pageSlice.map((t, i) => (
              <tr key={i} className={`border-b border-border/30 ${rowClass(t)}`}>
                <td className="px-4 py-2.5 font-mono text-foreground">
                  <div className="flex items-center gap-1.5">
                    {t.is_covid_period && <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0" />}
                    {t.date}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="secondary" className="text-[10px] capitalize px-1.5">{t.strategy}</Badge>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`font-semibold capitalize ${t.action === "buy" ? "text-primary" : "text-destructive"}`}>
                    {t.action}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground">${fmt2(t.price)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground">{t.quantity}</td>
                <td className={`px-3 py-2.5 text-right font-mono font-semibold ${
                  t.result_dollars == null ? "text-muted-foreground" :
                  t.result_dollars > 0 ? "text-primary" : "text-destructive"
                }`}>
                  {t.result_dollars != null ? fmtDollar(t.result_dollars) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-foreground">
                  ${t.cumulative_portfolio_value?.toLocaleString("en-US", { minimumFractionDigits: 2 }) || "—"}
                </td>
              </tr>
            ))}
            {pageSlice.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No trades match current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-3 border-t border-border flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-secondary text-muted-foreground disabled:opacity-40 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-secondary text-muted-foreground disabled:opacity-40 hover:text-foreground transition-colors"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </Card>
  );
}