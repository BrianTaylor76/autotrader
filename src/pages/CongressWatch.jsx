import React, { useState, useMemo, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Search, Clock, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import WatchedSection from "@/components/congress/WatchedSection";
import CongressStatsRow from "@/components/congress/CongressStatsRow";
import TradeRow from "@/components/congress/TradeRow";

const PAGE_SIZE = 50;

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY"
];

function FilterBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

export default function CongressWatch() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bgFetchRef = useRef(false);

  const [refreshing, setRefreshing] = useState(false);
  const [bgLoading, setBgLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [chamber, setChamber] = useState("All");
  const [party, setParty] = useState("All");
  const [txType, setTxType] = useState("All");
  const [sort, setSort] = useState("Most Recent");
  const [stateFilter, setStateFilter] = useState("All");
  const [expandedRow, setExpandedRow] = useState(null);
  const [page, setPage] = useState(1);
  const [jumpPage, setJumpPage] = useState("");
  const [watchedMembers] = useState(() => {
    try { return JSON.parse(localStorage.getItem("watched_congress_members") || "[]"); } catch { return []; }
  });

  const { data: trades = [], isLoading, isFetching } = useQuery({
    queryKey: ["congress_trades"],
    queryFn: () => base44.entities.CongressTrade.list("-transaction_date", 500),
    staleTime: 0,
  });

  const { data: consensusScores = [] } = useQuery({
    queryKey: ["consensus_scores"],
    queryFn: () => base44.entities.ConsensusScore.list("-scored_at", 100),
    staleTime: 60000,
  });

  const hotSymbols = useMemo(() => {
    return new Set(
      consensusScores.filter(s => s.total_score >= 3).map(s => s.symbol?.toUpperCase())
    );
  }, [consensusScores]);

  const lastUpdated = useMemo(() => {
    if (!trades.length) return null;
    const d = new Date(trades[0]?.updated_date || trades[0]?.created_date);
    return isNaN(d.getTime()) ? null : d;
  }, [trades]);

  useEffect(() => { setPage(1); }, [search, chamber, party, txType, stateFilter, sort]);

  const filtered = useMemo(() => {
    let result = trades;
    if (chamber !== "All") result = result.filter(t => t.chamber === chamber);
    if (party !== "All") result = result.filter(t => t.party === party);
    if (txType !== "All") result = result.filter(t => t.transaction === txType.toLowerCase());
    if (stateFilter !== "All") result = result.filter(t => t.state === stateFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.representative?.toLowerCase().includes(q) ||
        t.state?.toLowerCase().includes(q) ||
        t.symbol?.toLowerCase().includes(q)
      );
    }
    if (sort === "Most Recent") {
      result = [...result].sort((a, b) => new Date(b.disclosure_date) - new Date(a.disclosure_date));
    } else if (sort === "Symbol A-Z") {
      result = [...result].sort((a, b) => (a.symbol || "").localeCompare(b.symbol || ""));
    } else if (sort === "Most Active Member") {
      const counts = {};
      trades.forEach(t => { counts[t.representative] = (counts[t.representative] || 0) + 1; });
      result = [...result].sort((a, b) => (counts[b.representative] || 0) - (counts[a.representative] || 0));
    } else if (sort === "Largest Amount") {
      const rank = { "$500,001 +": 5, "$100,001 - $250,000": 4, "$50,001 - $100,000": 3, "$15,001 - $50,000": 2 };
      result = [...result].sort((a, b) => (rank[b.amount_range] || 0) - (rank[a.amount_range] || 0));
    }
    return result;
  }, [trades, search, chamber, party, txType, stateFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await base44.functions.invoke("fetchCongressTrades", {});
      await queryClient.refetchQueries({ queryKey: ["congress_trades"] });
      toast({ title: "Congress Watch updated", description: "Latest trades fetched." });
    } catch (e) {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    }
    setRefreshing(false);
  }

  function goToPage(p) {
    setPage(Math.max(1, Math.min(p, totalPages)));
    setExpandedRow(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Congress Watch 🏛️</h2>
          <p className="text-sm text-muted-foreground mt-1">Real-time congressional trading activity</p>
        </div>
        <div className="flex items-center gap-3">
          {bgLoading && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" /> Loading more…
            </span>
          )}
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</span>
            </div>
          )}
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline" className="border-border gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Fetching…" : "Refresh Data"}
          </Button>
        </div>
      </div>

      <Card className="bg-card border-border p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by member, state, or symbol…"
            className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Chamber:</span>
            {["All", "House", "Senate"].map(c => (
              <FilterBtn key={c} active={chamber === c} onClick={() => setChamber(c)}>{c}</FilterBtn>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Party:</span>
            {["All", "Democrat", "Republican", "Independent"].map(p => (
              <FilterBtn key={p} active={party === p} onClick={() => setParty(p)}>{p}</FilterBtn>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Transaction:</span>
            {["All", "Buy", "Sell"].map(t => (
              <FilterBtn key={t} active={txType === t} onClick={() => setTxType(t)}>{t}</FilterBtn>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort:</span>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="bg-secondary border border-border rounded-md text-xs text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {["Most Recent", "Largest Amount", "Most Active Member", "Symbol A-Z"].map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">State:</span>
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value)}
              className="bg-secondary border border-border rounded-md text-xs text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option>All</option>
              {STATES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <CongressStatsRow trades={trades} />

      {isLoading || isFetching ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-card rounded-lg animate-pulse border border-border" />)}
          {isFetching && !isLoading && <p className="text-xs text-muted-foreground text-center py-1">Refreshing data…</p>}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-card border-border p-12 text-center">
          <p className="text-muted-foreground">
            {trades.length === 0
              ? 'No trades yet — click "Refresh Data" to fetch from House & Senate APIs.'
              : "No trades match your filters."}
          </p>
        </Card>
      ) : (
        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  {["Date","Member","Chamber","State","Party","Symbol","Transaction","Amount Range","Days to Disclose","Signal"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageSlice.map((trade, idx) => (
                  <TradeRow
                    key={trade.id || idx}
                    trade={trade}
                    isHot={hotSymbols.has(trade.symbol?.toUpperCase())}
                    expanded={expandedRow === (trade.id || idx)}
                    onToggleExpand={() => setExpandedRow(expandedRow === (trade.id || idx) ? null : (trade.id || idx))}
                    isWatched={watchedMembers.includes(trade.representative)}
                    idx={idx}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border flex items-center justify-between flex-wrap gap-3">
            <span className="text-xs text-muted-foreground">
              Showing {Math.min(pageSlice.length, PAGE_SIZE)} of {filtered.length} trades (Page {safePage} of {totalPages})
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => goToPage(safePage - 1)} disabled={safePage <= 1} className="h-7 px-2">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
                const p = start + i;
                return (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
                      p === safePage ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => goToPage(safePage + 1)} disabled={safePage >= totalPages} className="h-7 px-2">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-1.5 ml-1">
                <span className="text-xs text-muted-foreground">Go:</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpPage}
                  onChange={e => setJumpPage(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { goToPage(Number(jumpPage)); setJumpPage(""); } }}
                  placeholder="…"
                  className="w-12 h-7 bg-secondary border border-border rounded text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      <WatchedSection
        trades={trades}
        watchedMembers={watchedMembers}
        onUnwatch={() => {}}
        hotSymbols={hotSymbols}
      />
    </div>
  );
}