import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, BookmarkCheck } from "lucide-react";
import { getAllStocks } from "@/utils/stockLists";

const ALL_STOCKS = getAllStocks();

export default function AddStockModal({ open, onClose, watchlistSymbols = [], onAdd }) {
  const [search, setSearch] = useState("");

  const filtered = search.length >= 1
    ? ALL_STOCKS.filter(s =>
        s.symbol.toLowerCase().includes(search.toLowerCase()) ||
        s.name.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 30)
    : [];

  function handleAdd(stock) {
    onAdd(stock.symbol);
    setSearch("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setSearch(""); onClose(); } }}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle>Add Stock to Watchlist</DialogTitle>
        </DialogHeader>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search symbol or company…"
            className="pl-9 bg-secondary border-border"
            autoFocus
          />
        </div>
        <div className="mt-2 max-h-72 overflow-y-auto space-y-1">
          {search.length < 1 && (
            <p className="text-sm text-muted-foreground text-center py-6">Start typing to search stocks</p>
          )}
          {filtered.length === 0 && search.length >= 1 && (
            <p className="text-sm text-muted-foreground text-center py-6">No results for "{search}"</p>
          )}
          {filtered.map(stock => {
            const already = watchlistSymbols.includes(stock.symbol);
            return (
              <button
                key={stock.symbol}
                onClick={() => !already && handleAdd(stock)}
                disabled={already}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors
                  ${already ? "opacity-50 cursor-default" : "hover:bg-accent/40"}`}
              >
                <div>
                  <span className="font-mono font-bold text-sm text-foreground">{stock.symbol}</span>
                  <p className="text-xs text-muted-foreground truncate max-w-[260px]">{stock.name}</p>
                </div>
                {already && <BookmarkCheck className="w-4 h-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}