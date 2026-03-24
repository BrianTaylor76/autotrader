import React, { useState, useMemo, useRef, useEffect } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { X, Star, TrendingUp, BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const TABS = ["All Trades", "Top Symbols", "Timeline", "Stock Research"];

function PartyDot({ party }) {
  const color = party === "Democrat" ? "bg-blue-500" : party === "Republican" ? "bg-red-500" : "bg-muted-foreground";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />;
}

function MemberAvatar({ name, party }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const bg = party === "Democrat" ? "bg-blue-600" : party === "Republican" ? "bg-red-600" : "bg-muted";
  return (
    <div className={`w-12 h-12 rounded-full ${bg} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
      {initials}
    </div>
  );
}

function StockResearchTab({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    base44.functions.invoke("fetchStockData", { action: "ticker_bar", symbol })
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [symbol]);

  if (!symbol) return <p className="text-muted-foreground text-sm text-center py-8">No recent trade found</p>;

  return (
    <div className="space-y-4">
      <div className="bg-secondary/50 rounded-xl p-4">
        <p className="text-xs text-muted-foreground mb-1">Most Recent Trade Symbol</p>
        <p className="font-mono font-bold text-2xl text-foreground">{symbol}</p>
        {loading && <p className="text-xs text-muted-foreground mt-1">Fetching price…</p>}
        {data && (
          <div className="mt-2 flex gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Current Price</p>
              <p className="font-mono font-bold text-primary">${data.price?.toFixed(2) || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Change</p>
              <p className={`font-mono font-bold text-xs ${(data.change_pct || 0) >= 0 ? "text-primary" : "text-destructive"}`}>
                {(data.change_pct || 0) >= 0 ? "+" : ""}{data.change_pct?.toFixed(2)}%
              </p>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Open <span className="text-foreground font-semibold">Manual Mode</span> for full AI analysis and chart of {symbol}
      </p>
    </div>
  );
}

export default function MemberPanel({ member, trades, isWatched, onToggleWatch, onClose, onResearchStock }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("All Trades");
  const [touchStartY, setTouchStartY] = useState(null);
  const [copying, setCopying] = useState(false);

  const info = trades[0] || {};
  const buys = trades.filter(t => t.transaction === "buy").length;
  const sells = trades.filter(t => t.transaction === "sell").length;
  const buyPct = trades.length ? Math.round((buys / trades.length) * 100) : 0;

  const latestTrade = trades[0];
  const latestBuy = trades.find(t => t.transaction === "buy");

  const topSymbols = useMemo(() => {
    const counts = {};
    trades.forEach(t => { if (t.symbol) counts[t.symbol] = (counts[t.symbol] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([sym, count]) => ({ sym, count }));
  }, [trades]);

  const maxCount = topSymbols[0]?.count || 1;

  function handleTouchStart(e) { setTouchStartY(e.touches[0].clientY); }
  function handleTouchEnd(e) {
    if (touchStartY !== null) {
      const delta = e.changedTouches[0].clientY - touchStartY;
      if (delta > 80) onClose();
    }
    setTouchStartY(null);
  }

  async function handleCopyTrade() {
    if (!latestBuy) { toast({ title: "No recent buy trade found" }); return; }
    setCopying(true);
    const settings = await base44.entities.StrategySettings.list("-created_date", 1);
    const current = settings[0];
    if (!current) { toast({ title: "No strategy settings found", variant: "destructive" }); setCopying(false); return; }
    const watchlist = current.watchlist || [];
    if (watchlist.includes(latestBuy.symbol)) {
      toast({ title: `${latestBuy.symbol} already in watchlist` });
    } else {
      await base44.entities.StrategySettings.update(current.id, { watchlist: [...watchlist, latestBuy.symbol] });
      toast({ title: `${latestBuy.symbol} added to AutoTrader watchlist` });
    }
    setCopying(false);
  }

  const sortedTrades = [...trades].sort((a, b) => new Date(b.disclosure_date) - new Date(a.disclosure_date));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />

        {/* Modal */}
        <motion.div
          className="relative w-full md:max-w-2xl max-h-[92vh] md:max-h-[85vh] bg-card border border-border rounded-t-2xl md:rounded-2xl flex flex-col shadow-2xl"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 280 }}
          onClick={e => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0 md:hidden">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          {/* Header */}
          <div className="px-5 py-4 border-b border-border flex items-start gap-3 shrink-0">
            <MemberAvatar name={member} party={info.party} />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-foreground text-base leading-tight truncate">{member}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <PartyDot party={info.party} />
                  <span className="text-xs text-muted-foreground">{info.party || "Unknown"}</span>
                </div>
                {info.chamber && <span className="text-xs text-muted-foreground">· {info.chamber}</span>}
                {info.state && <span className="text-xs text-muted-foreground">· {info.state}</span>}
              </div>
              <div className="flex gap-3 mt-2 text-xs">
                <span className="text-muted-foreground">{trades.length} trades</span>
                <span className="text-primary">{buyPct}% buys</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={onToggleWatch}
                className={`p-2 rounded-lg border transition-colors ${isWatched ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                <Star className={`w-4 h-4 ${isWatched ? "fill-current" : ""}`} />
              </button>
              <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Buy/sell bar */}
          <div className="px-5 py-3 border-b border-border shrink-0">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>{buys} buys</span>
              <span>{sells} sells</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${buyPct}%` }} />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border shrink-0 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab
                    ? "text-primary border-primary"
                    : "text-muted-foreground border-transparent hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            {activeTab === "All Trades" && (
              <div className="space-y-1">
                {sortedTrades.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">No trades found</p>}
                <div className="grid grid-cols-5 gap-2 px-2 pb-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  <span>Date</span><span>Symbol</span><span>Type</span><span>Amount</span><span>Days</span>
                </div>
                {sortedTrades.slice(0, 100).map((t, i) => {
                  let days = null;
                  try {
                    if (t.transaction_date && t.disclosure_date)
                      days = differenceInDays(parseISO(t.disclosure_date), parseISO(t.transaction_date));
                  } catch {}
                  const isBuy = t.transaction === "buy";
                  return (
                    <div
                      key={i}
                      className={`grid grid-cols-5 gap-2 px-2 py-2 rounded-lg text-xs ${isBuy ? "bg-primary/5 border-l-2 border-l-primary" : "bg-destructive/5 border-l-2 border-l-destructive"}`}
                    >
                      <span className="text-muted-foreground font-mono text-[10px]">{t.disclosure_date || "—"}</span>
                      <span className="font-mono font-bold text-foreground">{t.symbol}</span>
                      <span className={`font-semibold uppercase text-[10px] ${isBuy ? "text-primary" : "text-destructive"}`}>{t.transaction}</span>
                      <span className="text-muted-foreground text-[10px] truncate">{t.amount_range || "—"}</span>
                      <span className={`text-[10px] ${days > 30 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                        {days !== null ? `${days}d` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "Top Symbols" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground mb-4">Trade frequency by symbol</p>
                {topSymbols.map(({ sym, count }) => (
                  <div key={sym} className="flex items-center gap-3">
                    <span className="font-mono font-bold text-xs text-foreground w-16 shrink-0">{sym}</span>
                    <div className="flex-1 h-5 bg-secondary rounded-md overflow-hidden">
                      <div
                        className="h-full bg-primary/70 rounded-md transition-all flex items-center px-2"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                  </div>
                ))}
                {topSymbols.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">No symbol data</p>}
              </div>
            )}

            {activeTab === "Timeline" && (
              <div className="relative">
                <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-4 pl-8">
                  {sortedTrades.slice(0, 50).map((t, i) => {
                    const isBuy = t.transaction === "buy";
                    return (
                      <div key={i} className="relative">
                        <div className={`absolute -left-5 top-1 w-2.5 h-2.5 rounded-full border-2 ${isBuy ? "bg-primary border-primary" : "bg-destructive border-destructive"}`} />
                        <div className="bg-secondary/40 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-sm text-foreground">{t.symbol}</span>
                            <span className={`text-xs font-semibold uppercase ${isBuy ? "text-primary" : "text-destructive"}`}>{t.transaction}</span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-[10px] text-muted-foreground">{t.disclosure_date}</span>
                            <span className="text-[10px] text-muted-foreground">{t.amount_range}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {sortedTrades.length === 0 && <p className="text-muted-foreground text-sm py-8">No trades</p>}
                </div>
              </div>
            )}

            {activeTab === "Stock Research" && (
              <StockResearchTab symbol={latestTrade?.symbol} />
            )}
          </div>

          {/* Footer actions */}
          <div className="px-5 py-4 border-t border-border flex flex-col sm:flex-row gap-2 shrink-0" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <Button
              variant={isWatched ? "default" : "outline"}
              className="flex-1 gap-2 text-sm h-10"
              onClick={onToggleWatch}
            >
              <Star className={`w-4 h-4 ${isWatched ? "fill-current" : ""}`} />
              {isWatched ? "Watching" : "Watch Member"}
            </Button>
            {latestTrade && (
              <Button
                variant="outline"
                className="flex-1 gap-2 text-sm h-10"
                onClick={() => onResearchStock?.(latestTrade.symbol)}
              >
                <TrendingUp className="w-4 h-4" />
                Research {latestTrade.symbol}
              </Button>
            )}
            {latestBuy && (
              <Button
                variant="outline"
                className="flex-1 gap-2 text-sm h-10"
                onClick={handleCopyTrade}
                disabled={copying}
              >
                <BookmarkPlus className="w-4 h-4" />
                {copying ? "Adding…" : `Copy Trade`}
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}