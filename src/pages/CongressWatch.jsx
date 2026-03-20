import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, subDays } from "date-fns";
import { RefreshCw, Search, Clock, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import MemberPanel from "@/components/congress/MemberPanel";
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

const DATE_RANGES = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 6 months", days: 180 },
  { label: "Last 1 year", days: 365 },
  { label: "All time", days: null },
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

  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [chamber, setChamber] = useState("All");
  const [party, setParty] = useState("All");
  const [txType, setTxType] = useState("All");
  const [sort, setSort] = useState("Most Recent");
  const [stateFilter, setStateFilter] = useState("All");
  const [dateRange, setDateRange] = useState("Last 1 year");
  const [expandedRow, setExpandedRow] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [page, setPage] = useState(1);
  const [watchedMembers, setWatchedMembers] = useState(() => {
    try { return JSON.parse(localStorage.getItem("watched_congress_members") || "[]"); } catch { return []; }
  });

  // Fetch all trades — no limit so we get full history
  const { data: trades = [], isLoading } = useQuery({
    queryKey: ["congress_trades"],
    queryFn: () => base44.entities.CongressTrade.list("-disclosure_date", 10000),
    staleTime: 300000,
  });

  const { data: consensusScores = [] } = useQuery({
    queryKey: ["consensus_scores"],
    queryFn: () => base44.entities.ConsensusScore.list("-scored_at", 100),
    staleTime: 60000,
  });

  const hotSymbols = useMemo(() => {
    return new Set(consensusScores.filter(s => s.total_score >= 3).map(s => s.symbol?.toUpperCase()));
  }, [consensusScores]);

  const lastUpdated = useMemo(() => {
    if (!trades.length) return null;
    return trades.reduce((latest, t) => {
      const d = new Date(t.updated_date || t.created_date);
      return d > latest ? d : latest;
    }, new Date(0));
  }, [trades]);

  // Compute cutoff date for selected range
  const cutoffDate = useMemo(() => {
    const range = DATE_RANGES.find(r => r.label === dateRange);
    if (!range || !range.days) return null;
    return subDays(new Date(), range.days);
  }, [dateRange]);

  const filtered = useMemo(() => {
    let result = [...trades];

    // Date range filter
    if (cutoffDate) {
      result = result.filter(t => {
        if (!t.disclosure_date) return false;
        const d = new Date(t.disclosure_date);
        return !isNaN(d) && d >= cutoffDate;
      });
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.representative?.toLowerCase().includes(q) ||
        t.state?.toLowerCase().includes(q) ||
        t.symbol?.toLowerCase().includes(q)
      );
    }
    if (chamber !== "All") result = result.filter(t => t.chamber === chamber);
    if (party !== "All") result = result.filter(t => t.party === party);
    if (txType !== "All") result = result.filter(t => t.transaction === txType.toLowerCase());
    if (stateFilter !== "All") result = result.filter(t => t.state === stateFilter);

    if (sort === "Most Recent") {
      result.sort((a, b) => new Date(b.disclosure_date) - new Date(a.disclosure_date));
    } else if (sort === "Symbol A-Z") {
      result.sort((a, b) => (a.symbol || "").localeCompare(b.symbol || ""));
    } else if (sort === "Most Active Member") {
      const counts = {};
      result.forEach(t => { counts[t.representative] = (counts[t.representative] || 0) + 1; });
      result.sort((a, b) => (counts[b.representative] || 0) - (counts[a.representative] || 0));
    } else if (sort === "Largest Amount") {
      const rank = { "$500,001 +": 5, "$100,001 - $250,000": 4, "$50,001 - $100,000": 3, "$15,001 - $50,000": 2 };
      result.sort((a, b) => (rank[b.amount_range] || 0) - (rank[a.amount_range] || 0));
    }
    return result;
  }, [trades, search, chamber, party, txType, stateFilter, sort, cutoffDate]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to page 1 on filter change
  const resetPage = () => setPage(1);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const result = await base44.functions.invoke("fetchCongressTrades", {});
      queryClient.invalidateQueries({ queryKey: ["congress_trades"] });
      const inserted = result?.data?.inserted ?? 0;
      toast({
        title: "Congress Watch updated",
        description: `Fetched ${result?.data?.total_fetched ?? 0} records. ${inserted} new trades added.`,
      });
    } catch (e) {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    }
    setRefreshing(false);
  }

  function toggleWatch(memberName) {
    setWatchedMembers(prev => {
      const next = prev.includes(memberName)
        ? prev.filter(m => m !== memberName)
        : [...prev, memberName];
      localStorage.setItem("watched_congress_members", JSON.stringify(next));
      return next;
    });
  }

  const memberTrades = useMemo(() => {
    if (!selectedMember) return [];
    return trades.filter(t => t.representative === selectedMember);
  }, [trades, selectedMember]);

  return (
    <div className="space-y-5 relative">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Congress Watch 🏛️</h2>
          <p className="text-sm text-muted-foreground mt-1">Real-time congressional trading activity</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && lastUpdated.getTime() > 0 && (
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

      {/* Search + Filters */}
      <Card className="bg-card border-border p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); resetPage(); }}
            placeholder="Search by member, state, or symbol…"
            className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {search && (
            <button onClick={() => { setSearch(""); resetPage(); }} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Date Range:</span>
          {DATE_RANGES.map(r => (
            <FilterBtn key={r.label} active={dateRange === r.label} onClick={() => { setDateRange(r.label); resetPage(); }}>
              {r.label}
            </FilterBtn>
          ))}
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Chamber:</span>
            {["All", "House", "Senate"].map(c => (
              <FilterBtn key={c} active={chamber === c} onClick={() => { setChamber(c); resetPage(); }}>{c}</FilterBtn>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Party:</span>
            {["All", "Democrat", "Republican", "Independent"].map(p => (
              <FilterBtn key={p} active={party === p} onClick={() => { setParty(p); resetPage(); }}>{p}</FilterBtn>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Transaction:</span>
            {["All", "Buy", "Sell"].map(t => (
              <FilterBtn key={t} active={txType === t} onClick={() => { setTxType(t); resetPage(); }}>{t}</FilterBtn>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort:</span>
            <select
              value={sort}
              onChange={e => { setSort(e.target.value); resetPage(); }}
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
              onChange={e => { setStateFilter(e.target.value); resetPage(); }}
              className="bg-secondary border border-border rounded-md text-xs text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option>All</option>
              {STATES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Stats Row — reflects current filter */}
      <CongressStatsRow trades={filtered} />

      {/* Trade Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-card rounded-lg animate-pulse border border-border" />)}
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
                {paginated.map((trade, idx) => (
                  <TradeRow
                    key={trade.id || idx}
                    trade={trade}
                    isHot={hotSymbols.has(trade.symbol?.toUpperCase())}
                    expanded={expandedRow === (trade.id || idx)}
                    onToggleExpand={() => setExpandedRow(expandedRow === (trade.id || idx) ? null : (trade.id || idx))}
                    onMemberClick={() => setSelectedMember(trade.representative)}
                    isWatched={watchedMembers.includes(trade.representative)}
                    idx={idx}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer: count + pagination */}
          <div className="px-4 py-3 border-t border-border flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-muted-foreground">
              Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()} trades
              {trades.length !== filtered.length && ` (${trades.length.toLocaleString()} total in DB)`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="p-1.5 rounded-md bg-secondary disabled:opacity-40 hover:bg-accent transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-foreground" />
                </button>
                {/* Page number pills — show up to 7 */}
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (safePage <= 4) {
                    pageNum = i + 1;
                  } else if (safePage >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = safePage - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-7 h-7 rounded-md text-xs font-medium transition-colors ${
                        safePage === pageNum
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="p-1.5 rounded-md bg-secondary disabled:opacity-40 hover:bg-accent transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-foreground" />
                </button>
                <span className="text-xs text-muted-foreground ml-1">of {totalPages} pages</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Watched Members Section */}
      <WatchedSection
        trades={trades}
        watchedMembers={watchedMembers}
        onUnwatch={toggleWatch}
        hotSymbols={hotSymbols}
      />

      {/* Member Panel */}
      {selectedMember && (
        <MemberPanel
          member={selectedMember}
          trades={memberTrades}
          isWatched={watchedMembers.includes(selectedMember)}
          onToggleWatch={() => toggleWatch(selectedMember)}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}