import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ExternalLink, RefreshCw } from "lucide-react";

function timeAgo(ts) {
  if (!ts) return "";
  const d = new Date(typeof ts === "number" ? ts * 1000 : ts);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NewsFeed({ symbol }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("fetchStockNews", { symbol });
      if (res.data?.news) setNews(res.data.news);
      else throw new Error("No news returned");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [symbol]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-foreground">Recent News</h4>
        {error && <button onClick={load} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><RefreshCw className="w-3 h-3" /> Retry</button>}
      </div>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 bg-secondary animate-pulse rounded w-full" />
              <div className="h-2.5 bg-secondary animate-pulse rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : !news.length ? (
        <p className="text-xs text-muted-foreground py-3">No recent news found for {symbol}.</p>
      ) : (
        <div className="space-y-3">
          {news.map((item, i) => (
            <div key={i} className="border-b border-border/30 pb-3 last:border-0 last:pb-0">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-1.5 hover:text-primary transition-colors">
                <span className="text-xs text-foreground group-hover:text-primary font-medium leading-snug flex-1">{item.headline}</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
              </a>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-muted-foreground font-medium">{item.source}</span>
                <span className="text-[10px] text-muted-foreground">{timeAgo(item.datetime)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}