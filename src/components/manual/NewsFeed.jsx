import React from "react";
import { ExternalLink } from "lucide-react";

function timeAgo(ts) {
  if (!ts) return "";
  const d = new Date(typeof ts === "number" ? ts * 1000 : ts);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NewsFeed({ news }) {
  if (!news?.length) return <p className="text-xs text-muted-foreground py-3">No recent news found.</p>;

  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground mb-3">Recent News</h4>
      <div className="space-y-3">
        {news.map((item, i) => (
          <div key={i} className="border-b border-border/30 pb-3 last:border-0 last:pb-0">
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-1.5 hover:text-primary transition-colors">
              <span className="text-xs text-foreground group-hover:text-primary font-medium leading-snug flex-1">{item.headline}</span>
              <ExternalLink className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
            </a>
            {item.summary && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{item.summary}</p>}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] text-muted-foreground font-medium">{item.source}</span>
              <span className="text-[10px] text-muted-foreground">{timeAgo(item.datetime)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}