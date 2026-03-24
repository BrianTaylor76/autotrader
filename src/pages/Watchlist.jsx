import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { BookmarkCheck, Plus, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { normalizeWatchlist, getWatchlistSymbols, addToWatchlist, removeFromWatchlist } from "@/utils/watchlist";
import { getAllStocks } from "@/utils/stockLists";
import WatchlistCard from "@/components/watchlist/WatchlistCard";
import AddStockModal from "@/components/watchlist/AddStockModal";
import StockModal from "@/components/manual/StockModal";

const ALL_STOCKS = getAllStocks();
const stockMap = Object.fromEntries(ALL_STOCKS.map(s => [s.symbol, s]));

export default function Watchlist() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);

  const { data: settings = [] } = useQuery({
    queryKey: ["strategy_settings"],
    queryFn: () => base44.entities.StrategySettings.list("-created_date", 1),
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["positions"],
    queryFn: () => base44.entities.Position.list(),
  });

  const rawWatchlist = settings[0]?.watchlist || [];
  const watchlistItems = normalizeWatchlist(rawWatchlist);
  const watchlistSymbols = getWatchlistSymbols(rawWatchlist);
  const positionSymbols = new Set(positions.map(p => p.symbol));

  async function handleAdd(symbol) {
    const current = settings[0];
    if (!current) return;
    const updated = addToWatchlist(current.watchlist || [], symbol);
    await base44.entities.StrategySettings.update(current.id, { watchlist: updated });
    queryClient.invalidateQueries({ queryKey: ["strategy_settings"] });
  }

  async function handleRemove(symbol) {
    const current = settings[0];
    if (!current) return;
    const updated = removeFromWatchlist(current.watchlist || [], symbol);
    await base44.entities.StrategySettings.update(current.id, { watchlist: updated });
    queryClient.invalidateQueries({ queryKey: ["strategy_settings"] });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <BookmarkCheck className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight">My Watchlist</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Your tracked stocks and ETFs</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            {watchlistItems.length} {watchlistItems.length === 1 ? "stock" : "stocks"} being tracked
          </span>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-1.5 shrink-0">
          <Plus className="w-4 h-4" /> Add Stock
        </Button>
      </div>

      {/* Empty state */}
      {watchlistItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-card border border-border rounded-xl">
          <BookmarkCheck className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-foreground font-semibold mb-1">Your watchlist is empty</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            Head to Manual Mode to research and add stocks you want to track
          </p>
          <Button variant="outline" asChild className="gap-2">
            <Link to="/ManualMode">
              <Monitor className="w-4 h-4" /> Go to Manual Mode
            </Link>
          </Button>
        </div>
      )}

      {/* Cards grid */}
      {watchlistItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {watchlistItems.map(item => (
            <WatchlistCard
              key={item.symbol}
              item={item}
              stockInfo={stockMap[item.symbol]}
              hasPosition={positionSymbols.has(item.symbol)}
              onSelect={setSelectedStock}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {/* Bot Integration Section */}
      {watchlistItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Bot Status</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {watchlistItems.map(item => {
              const hasPos = positionSymbols.has(item.symbol);
              return (
                <div key={item.symbol} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${hasPos ? "bg-primary" : "bg-yellow-400"}`} />
                  <span className="font-mono font-semibold text-xs text-foreground">{item.symbol}</span>
                  <span className={`text-xs ml-auto ${hasPos ? "text-primary" : "text-yellow-400"}`}>
                    {hasPos ? "Active Position" : "Watching"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      <AddStockModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        watchlistSymbols={watchlistSymbols}
        onAdd={handleAdd}
      />

      <StockModal
        stock={selectedStock}
        savedResearch={null}
        watchlist={rawWatchlist}
        onClose={() => setSelectedStock(null)}
      />
    </div>
  );
}