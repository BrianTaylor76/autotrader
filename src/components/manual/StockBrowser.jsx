import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { getAllStocks } from "@/utils/stockLists";
import { Input } from "@/components/ui/input";
import { Search, Flame, RefreshCw } from "lucide-react";

const ALL_STOCKS = getAllStocks();
const PAGE_SIZE = 30;
const BATCH_SIZE = 20;
const CACHE_TTL = 60000;
const priceCache = {};

function getCached(sym) {
  const e = priceCache[sym];
  return e && Date.now() - e.ts < CACHE_TTL ? e.data : null;
}

function setCached(sym, data) {
  priceCache[sym] = { ts: Date.now(), data };
}

const MARKETS = ["All","S&P 500","NASDAQ 100","ETF","Crypto","Small Cap"];

export default function StockBrowser({ onSelect }) {
  const [search, setSearch] = useState("");
  const [market, setMarket] = useState("All");
  const [underHundred, setUnderHundred] = useState(true);
  const [fractionalOnly, setFractionalOnly] = useState(false);
  const [sort, setSort] = useState("Alphabetical");
  const [page, setPage] = useState(0);
  const [prices, setPrices] = useState({});
  const [loadingSyms, setLoadingSyms] = useState(new Set());
  const fetchingRef = useRef(new Set());

  const filtered = useMemo(() => {
    let list = ALL_STOCKS;
    if (market !== "All") list = list.filter(s => s.market === market);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    }
    if (fractionalOnly) list = list.filter(s => prices[s.symbol]?.is_fractional !== false);
    if (underHundred) {
      list = list.filter(s => {
        const p = prices[s.symbol]?.price;
        const hot = Math.abs(prices[s.symbol]?.change_pct || 0) > 3;
        return !p || p <= 100 || hot;
      });
    }
    if (sort === "Most Active") list = [...list].sort((a, b) => (prices[b.symbol]?.volume || 0) - (prices[a.symbol]?.volume || 0));
    else if (sort === "Biggest Movers") list = [...list].sort((a, b) => Math.abs(prices[b.symbol]?.change_pct || 0) - Math.abs(prices[a.symbol]?.change_pct || 0));
    else list = [...list].sort((a, b) => a.symbol.localeCompare(b.symbol));
    return list;
  }, [search, market, underHundred, fractionalOnly, sort, prices]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageStocks = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  useEffect(() => { setPage(0); }, [search, market, underHundred, fractionalOnly, sort]);

  useEffect(() => {
    const toFetch = pageStocks.filter(s => !getCached(s.symbol) && !fetchingRef.current.has(s.symbol));
    if (!toFetch.length) {
      // restore from cache
      const cached = {};
      pageStocks.forEach(s => { const d = getCached(s.symbol); if (d) cached[s.symbol] = d; });
      if (Object.keys(cached).length) setPrices(prev => ({ ...prev, ...cached }));
      return;
    }

    const syms = toFetch.map(s => s.symbol);
    syms.forEach(s => fetchingRef.current.add(s));
    setLoadingSyms(prev => new Set([...prev, ...syms]));

    // Batch in groups of BATCH_SIZE
    const batches = [];
    for (let i = 0; i < syms.length; i += BATCH_SIZE) {
      batches.push(syms.slice(i, i + BATCH_SIZE));
    }

    batches.forEach(batch => {
      base44.functions.invoke("fetchStockData", { action: "snapshots", symbols: batch })
        .then(res => {
          const snap = res.data?.snapshots || {};
          batch.forEach(s => {
            const d = snap[s] || null;
            if (d) setCached(s, d);
            fetchingRef.current.delete(s);
          });
          setPrices(prev => ({ ...prev, ...snap }));
          setLoadingSyms(prev => { const n = new Set(prev); batch.forEach(s => n.delete(s)); return n; });
        })
        .catch(() => {
          batch.forEach(s => fetchingRef.current.delete(s));
          setLoadingSyms(prev => { const n = new Set(prev); batch.forEach(s => n.delete(s)); return n; });
        });
    });
  }, [pageStocks]);

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="space-y-2.5 mb-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbol or name…" className="pl-9 bg-secondary border-border h-8 text-sm" />
        </div>
        <div className="flex flex-wrap gap-1">
          {MARKETS.map(m => (
            <button key={m} onClick={() => setMarket(m)} className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${market === m ? "bg-primary/10 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-border hover:text-foreground"}`}>{m}</button>
          ))}
        </div>
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
      </div>

      {/* Stock list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {pageStocks.map(stock => {
          const d = prices[stock.symbol];
          const isLoading = loadingSyms.has(stock.symbol);
          const up = (d?.change_pct || 0) >= 0;
          const isHot = Math.abs(d?.change_pct || 0) > 3 || (d?.vol_ratio || 0) > 2;
          return (
            <button
              key={stock.symbol}
              onClick={() => onSelect({ ...stock, ...(d || {}), name: stock.name })}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent/30 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold text-foreground text-xs">{stock.symbol}</span>
                  {isHot && <Flame className="w-3 h-3 text-orange-400" />}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{stock.name}</p>
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
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-border mt-2 shrink-0">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 px-2 py-1 rounded bg-secondary">Prev</button>
          <span className="text-[10px] text-muted-foreground">{page + 1}/{totalPages} · {filtered.length}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 px-2 py-1 rounded bg-secondary">Next</button>
        </div>
      )}
    </div>
  );
}