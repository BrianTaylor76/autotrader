import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function SentimentBadge({ sentiment }) {
  const colors = { bullish: "bg-primary/10 text-primary border-primary/20", neutral: "bg-secondary text-muted-foreground border-border", bearish: "bg-destructive/10 text-destructive border-destructive/20" };
  return <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium capitalize ${colors[sentiment] || colors.neutral}`}>{sentiment}</span>;
}

export default function AIAnalysisSection({ analysis }) {
  if (!analysis) return null;
  const { claude_analysis, gpt_analysis, claude_sentiment, gpt_sentiment, consensus_sentiment, agreement_summary, disagreement_summary } = analysis;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">AI Analysis</h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Consensus:</span>
          <SentimentBadge sentiment={consensus_sentiment} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Claude */}
        <div className="bg-secondary/40 border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #E07A5F, #8B4FBF)" }}>
                <span className="text-[8px] text-white font-bold">C</span>
              </div>
              <span className="text-sm font-semibold text-foreground">Claude's Take</span>
            </div>
            <SentimentBadge sentiment={claude_sentiment} />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{claude_analysis}</p>
        </div>

        {/* GPT */}
        <div className="bg-secondary/40 border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-[#10a37f] flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">G</span>
              </div>
              <span className="text-sm font-semibold text-foreground">GPT-4o's Take</span>
            </div>
            <SentimentBadge sentiment={gpt_sentiment} />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{gpt_analysis}</p>
        </div>
      </div>

      {(agreement_summary || disagreement_summary) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {agreement_summary && (
            <div className="bg-primary/5 border border-primary/15 rounded-lg px-4 py-3">
              <p className="text-[10px] text-primary font-semibold uppercase tracking-wide mb-1">Where They Agree</p>
              <p className="text-xs text-muted-foreground">{agreement_summary}</p>
            </div>
          )}
          {disagreement_summary && (
            <div className="bg-secondary border border-border rounded-lg px-4 py-3">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Where They Differ</p>
              <p className="text-xs text-muted-foreground">{disagreement_summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}