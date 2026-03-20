import React from "react";
import { differenceInDays, parseISO } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function PartyDot({ party }) {
  const color = party === "Democrat" ? "bg-blue-500" : party === "Republican" ? "bg-red-500" : "bg-muted-foreground";
  return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5`} />;
}

function AmountBadge({ amount }) {
  const label = amount || "Unknown";
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary border border-border text-muted-foreground whitespace-nowrap">
      {label}
    </span>
  );
}

export default function TradeRow({ trade, isHot, expanded, onToggleExpand, isWatched, idx }) {
  const isBuy = trade.transaction === "buy";
  const isSell = trade.transaction === "sell";

  let daysToDisclose = null;
  try {
    if (trade.transaction_date && trade.disclosure_date) {
      daysToDisclose = differenceInDays(parseISO(trade.disclosure_date), parseISO(trade.transaction_date));
    }
  } catch {}

  const rowBg = isBuy
    ? "hover:bg-primary/5"
    : isSell
    ? "hover:bg-destructive/5"
    : "hover:bg-accent/30";

  const leftBorder = isBuy
    ? "border-l-2 border-l-primary"
    : isSell
    ? "border-l-2 border-l-destructive"
    : "";

  return (
    <>
      <tr
        className={`border-b border-border/50 transition-colors cursor-pointer ${rowBg} ${leftBorder} ${idx % 2 === 0 ? "" : "bg-secondary/10"}`}
        onClick={onToggleExpand}
      >
        <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
          {trade.disclosure_date || "—"}
        </td>
        <td className="px-4 py-3">
          <span className="font-medium text-foreground text-xs">
            {trade.representative}
            {isWatched && <span className="ml-1.5 text-yellow-400">★</span>}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{trade.chamber}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{trade.state || "—"}</td>
        <td className="px-4 py-3 text-xs">
          <span className="flex items-center">
            <PartyDot party={trade.party} />
            <span className="text-muted-foreground">{trade.party || "Unknown"}</span>
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="font-mono font-bold text-foreground text-xs">{trade.symbol || "—"}</span>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs font-semibold uppercase ${isBuy ? "text-primary" : isSell ? "text-destructive" : "text-muted-foreground"}`}>
            {trade.transaction}
          </span>
        </td>
        <td className="px-4 py-3">
          <AmountBadge amount={trade.amount_range} />
        </td>
        <td className="px-4 py-3 text-xs font-mono">
          {daysToDisclose !== null ? (
            <span className={daysToDisclose > 30 ? "text-destructive font-semibold" : "text-muted-foreground"}>
              {daysToDisclose}d {daysToDisclose > 30 ? "⚠️" : ""}
            </span>
          ) : "—"}
        </td>
        <td className="px-4 py-3">
          {isHot ? (
            <span className="text-xs font-medium text-yellow-400">🔥 Hot Signal</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          <span className="ml-1 text-muted-foreground">
            {expanded ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
          </span>
        </td>
      </tr>
      {expanded && trade.description && (
        <tr className="border-b border-border/30 bg-secondary/20">
          <td colSpan={10} className="px-6 py-3 text-xs text-muted-foreground italic">
            {trade.description}
          </td>
        </tr>
      )}
    </>
  );
}