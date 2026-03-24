import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { getAllStocks } from "@/utils/stockLists";
import { Input } from "@/components/ui/input";
import { Search, Flame, X, BookmarkCheck } from "lucide-react";

const ALL_STOCKS = getAllStocks();
const PAGE_SIZE = 20;
const BATCH_SIZE = 10;
const CACHE_TTL = 60000;
const priceCache = {};

function getCached(sym) {
  const e = priceCache[sym];
  return e && Date.now() - e.ts < CACHE_TTL ? e.data : null;
}
function setCached(sym, data) {
  priceCache[sym] = { ts: Date.now(), data };
}

function Highlight({ text, query }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

const MARKETS = ["All", "S&P 500", "NASDAQ 100", "ETF", "Crypto", "Small Cap"];

export default function StockBrowser({ onSelect, watchlist = [], onWatchlistChange }) {
  const defaultTab = new URLSearchParams(window.location.search).get("tab") === "watchlist" ? "My Watchlist" : "All";
  const [search, setSearch] = useState("");
  const [market, setMarket] = useState(defaultTab);
  const [underHundred, setUnderHundred] = useState(true);
  const [fractionalOnly, setFractionalOnly] = useState(false);
  const [sort, setSort] = useState("Alphabetical");
  const [page, setPage] = useState(0);
  const [prices, setPrices] = useState({});
  const [loadingSyms, setLoadingSyms] = useState(new Set());
  const [removing, setRemoving] = useState(null);
  const fetchingRef = useRef(new Set());
  const listScrollRef = useRef(null);

  const isWatchlistTab = market === "My Watchlist";

  // Watchlist stocks: map from symbol → stock info (with fallback for unlisted symbols)
  const watchlistStocks = useMemo(() => {
    return watchlist.map(sym => {
      const found = ALL_STOCKS.find(s => s.symbol === sym);
      return found || { symbol: sym, name: sym, market: "Custom" };
    });
  }, [watchlist]);

  const filtered = useMemo(() => {
    if (isWatchlistTab) return watchlistStocks;
    let list = ALL_STOCKS;
    if (market !== "All") list = list.filter(s => s.market === market);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    } else {
      // Only apply underHundred/fractional when not searching
      if (fractionalOnly) list = list.filter(s => prices[s.symbol]?.is_fractional !== false);
      if (underHundred) {
        list = list.filter(s => {
          const p = prices[s.symbol]?.price;
          const hot = Math.abs(prices[s.symbol]?.change_pct || 0) > 3;
          return !p || p <= 100 || hot;
        });
      }
    }
    if (fractionalOnly && search) list = list.filter(s => prices[s.symbol]?.is_fractional !== false);
    if (sort === "Most Active") list = [...list].sort((a, b) => (prices[b.symbol]?.volume || 0) - (prices[a.symbol]?.volume || 0));
    else if (sort === "Biggest Movers") list = [...list].sort((a, b) => Math.abs(prices[b.symbol]?.change_pct || 0) - Math.abs(prices[a.symbol]?.change_pct || 0));
    else list = [...list].sort((a, b) => a.symbol.localeCompare(b.symbol));
    return list;
  }, [search, market, underHundred, fractionalOnly, sort, prices, isWatchlistTab, watchlistStocks]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageStocks = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  useEffect(() => { setPage(0); }, [search, market, underHundred, fractionalOnly, sort]);

  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [page]);

  useEffect(() => {
    const toFetch = pageStocks.filter(s => !getCached(s.symbol) && !fetchingRef.current.has(s.symbol));
    if (!toFetch.length) {
      const cached = {};
      pageStocks.forEach(s => { const d = getCached(s.symbol); if (d) cached[s.symbol] = d; });
      if (Object.keys(cached).length) setPrices(prev => ({ ...prev, ...cached }));
      return;
    }
    const syms = toFetch.map(s => s.symbol);
    syms.forEach(s => fetchingRef.current.add(s));
    setLoadingSyms(prev => new Set([...prev, ...syms]));
    const batches = [];
    for (let i = 0; i < syms.length; i += BATCH_SIZE) batches.push(syms.slice(i, i + BATCH_SIZE));
    batches.reduce((promise, batch, batchIdx) =>
      promise.then(() => new Promise(resolve => { if (batchIdx > 0) setTimeout(resolve, 500); else resolve(); }))
        .then(() =>
          base44.functions.invoke("fetchStockData", { action: "snapshots", symbols: batch })
            .then(res => {
              const snap = res.data?.snapshots || {};
              batch.forEach(s => { const d = snap[s] || null; if (d) setCached(s, d); fetchingRef.current.delete(s); });
              setPrices(prev => ({ ...prev, ...snap }));
              setLoadingSyms(prev => { const n = new Set(prev); batch.forEach(s => n.delete(s)); return n; });
            })
            .catch(() => {
              batch.forEach(s => fetchingRef.current.delete(s));
              setLoadingSyms(prev => { const n = new Set(prev); batch.forEach(s => n.delete(s)); return n; });
            })
        ),
      Promise.resolve()
    );
  }, [pageStocks]);

  async function handleRemoveFromWatchlist(sym) {
    setRemoving(sym);
    const settings = await base44.entities.StrategySettings.list("-created_date", 1);
    const current = settings[0];
    if (current) {
      const newList = (current.watchlist || []).filter(s => s !== sym);
      await base44.entities.StrategySettings.update(current.id, { watchlist: newList });
      onWatchlistChange?.(newList);
    }
    setRemoving(null);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="space-y-2.5 mb-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search symbol or name…"
            className="pl-9 pr-8 bg-secondary border-border h-8 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Market tabs + Watchlist tab */}
        <div className="flex flex-wrap gap-1">
          {MARKETS.map(m => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${market === m ? "bg-primary/10 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-border hover:text-foreground"}`}
            >
              {m}
            </button>
          ))}
          <button
            onClick={() => setMarket("My Watchlist")}
            className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors flex items-center gap-1 ${market === "My Watchlist" ? "bg-primary/10 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-border hover:text-foreground"}`}
          >
            <BookmarkCheck className="w-3 h-3" />
            My Watchlist
            {watchlist.length > 0 && (
              <span className={`px-1 rounded-full text-[9px] font-bold ${market === "My Watchlist" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                {watchlist.length}
              </span>
            )}
          </button>
        </div>

        {!isWatchlistTab && (
          <div className="flex flex-wrap gap-3 text-xs items-center">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={underHundred} onChange={e => setUnderHundred(e.target.checked)} className="accent-primary w-3 h-3" />
              <span className="text-muted-foreground">Under $100</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={fractionalOnly} onChange={e => setFractionalOnly(e.target.checked)} className="accent-primary w-3 h-3" />
              <span className="text-muted-foreground">Fractional only</span>
            </label>
            <select value={sort} onChange={e => setSort(e.target.value)} className="bg-secondary border border-border rounded px-2 py-0.5 text-muted-foreground text-xs ml-auto">
              <option>Alphabetical</option>
              <option>Most Active</option>
              <option>Biggest Movers</option>
            </select>
          </div>
        )}
      </div>

      {/* Stock list */}
      <div ref={listScrollRef} className="flex-1 overflow-y-auto min-h-0" style={{ scrollPaddingBottom: "120px" }}>

        {/* My Watchlist empty state */}
        {isWatchlistTab && watchlist.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm px-4">
            <BookmarkCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No stocks in your watchlist yet</p>
            <p className="text-xs mt-1 opacity-70">Browse stocks and tap Add to Watchlist</p>
          </div>
        )}

        {/* No search results */}
        {!isWatchlistTab && search && filtered.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No results for <span className="text-foreground font-mono">"{search}"</span></p>
          </div>
        )}

        {pageStocks.map(stock => {
          const d = prices[stock.symbol];
          const isLoading = loadingSyms.has(stock.symbol);
          const up = (d?.change_pct || 0) >= 0;
          const isHot = Math.abs(d?.change_pct || 0) > 3 || (d?.vol_ratio || 0) > 2;
          const inWatchlist = watchlist.includes(stock.symbol);

          return (
            <div key={stock.symbol} className="flex items-center gap-1">
              <button
                onClick={() => onSelect({ ...stock, ...(d || {}), name: stock.name })}
                className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent/30 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-foreground text-xs">
                      {search ? <Highlight text={stock.symbol} query={search} /> : stock.symbol}
                    </span>
                    {isHot && <Flame className="w-3 h-3 text-orange-400" />}
                    {inWatchlist && !isWatchlistTab && <BookmarkCheck className="w-3 h-3 text-primary opacity-60" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {search ? <Highlight text={stock.name} query={search} /> : stock.name}
                  </p>
                </div>
                <div className="text-right shrink-0 min-w-[60px]">
                  {isLoading && !d ? (
                    <div className="space-y-1">
                      <div className="h-2.5 w-12 bg-secondary animate-pulse rounded ml-auto" />
                      <div className="h-2 w-8 bg-secondary animate-pulse rounded ml-auto" />
                    </div>
                  ) : d?.price ? (
                    <>
                      <p className="font-mono text-xs text-foreground font-medium">${d.price < 1 ? d.price.toFixed(4) : d.price.toFixed(2)}</p>
                      <p className={`text-[10px] font-mono ${up ? "text-primary" : "text-destructive"}`}>{up ? "+" : ""}{d.change_pct?.toFixed(2)}%</p>
                    </>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">—</p>
                  )}
                </div>
              </button>

              {/* Watchlist tab: remove button */}
              {isWatchlistTab && (
                <button
                  onClick={() => handleRemoveFromWatchlist(stock.symbol)}
                  disabled={removing === stock.symbol}
                  className="shrink-0 mr-2 px-2 py-1 text-[10px] text-destructive border border-destructive/30 rounded hover:bg-destructive/10 transition-colors disabled:opacity-40"
                >
                  {removing === stock.symbol ? "…" : "✕"}
                </button>
              )}
            </div>
          );
        })}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-border mt-2 mb-20 md:mb-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 px-2 py-1 rounded bg-secondary">Prev</button>
            <span className="text-[10px] text-muted-foreground">{page + 1}/{totalPages} · {filtered.length}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 px-2 py-1 rounded bg-secondary">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}