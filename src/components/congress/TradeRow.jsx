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
  const symbol = trade.symbol || "N/A";
  const representative = trade.representative || "Unknown";
  const transaction = trade.transaction || "N/A";
  const amountRange = trade.amount_range || "Undisclosed";
  const displayDate = trade.disclosure_date || trade.transaction_date || "—";
  const party = trade.party || "Unknown";
  const state = trade.state || "N/A";
  const chamber = trade.chamber || "Unknown";
  const isBuy = transaction === "buy";
  const isSell = transaction === "sell";

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
          {displayDate}
        </td>
        <td className="px-4 py-3">
          <span className="font-medium text-foreground text-xs">
            {representative}
            {isWatched && <span className="ml-1.5 text-yellow-400">★</span>}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{chamber}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{state}</td>
        <td className="px-4 py-3 text-xs">
          <span className="flex items-center">
            <PartyDot party={party} />
            <span className="text-muted-foreground">{party}</span>
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="font-mono font-bold text-foreground text-xs">{symbol}</span>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs font-semibold uppercase ${isBuy ? "text-primary" : isSell ? "text-destructive" : "text-muted-foreground"}`}>
            {transaction}
          </span>
        </td>
        <td className="px-4 py-3">
          <AmountBadge amount={amountRange} />
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