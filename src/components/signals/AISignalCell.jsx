import React, { useState } from "react";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";

function sentimentColor(sentiment) {
  if (sentiment === "bullish") return "bg-primary/15 text-primary border-primary/20";
  if (sentiment === "bearish") return "bg-destructive/15 text-destructive border-destructive/20";
  return "bg-muted text-muted-foreground border-border";
}

function sentimentLabel(sentiment) {
  if (sentiment === "bullish") return "Bullish";
  if (sentiment === "bearish") return "Bearish";
  return "Neutral";
}

export function AIVerdictShield({ verdict }) {
  if (!verdict) return <span className="text-muted-foreground text-xs">—</span>;
  if (verdict === "allow") {
    return <ShieldCheck className="w-4 h-4 text-primary" title="AI Guard: Allow" />;
  }
  return <ShieldAlert className="w-4 h-4 text-destructive" title="AI Guard: Block" />;
}

export default function AISignalCell({ aiSignal }) {
  const [open, setOpen] = useState(false);

  if (!aiSignal) {
    return (
      <div className="text-center text-xs text-muted-foreground">—</div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full space-y-1 group"
        title="Click to see AI analysis details"
      >
        <span className={`block w-full text-center py-0.5 rounded-t text-[10px] font-semibold border ${sentimentColor(aiSignal.claude_sentiment)}`}>
          C: {sentimentLabel(aiSignal.claude_sentiment)} ({aiSignal.claude_score}/10)
        </span>
        <span className={`block w-full text-center py-0.5 rounded-b text-[10px] font-semibold border ${sentimentColor(aiSignal.gpt_sentiment)}`}>
          G: {sentimentLabel(aiSignal.gpt_sentiment)} ({aiSignal.gpt_score}/10)
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground font-mono">{aiSignal.symbol} — AI Analysis</h3>
              <span className={`text-xs px-2 py-1 rounded font-semibold ${aiSignal.overall_verdict === "allow" ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"}`}>
                {aiSignal.overall_verdict === "allow" ? "🛡️ ALLOW" : "🛡️ BLOCK"}
              </span>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-secondary/40 space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Claude</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold border ${sentimentColor(aiSignal.claude_sentiment)}`}>
                    {sentimentLabel(aiSignal.claude_sentiment)}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">{aiSignal.claude_score}/10</span>
                </div>
                <p className="text-xs text-foreground/80">{aiSignal.claude_reasoning}</p>
              </div>

              <div className="p-3 rounded-lg bg-secondary/40 space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">GPT-4o</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold border ${sentimentColor(aiSignal.gpt_sentiment)}`}>
                    {sentimentLabel(aiSignal.gpt_sentiment)}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">{aiSignal.gpt_score}/10</span>
                </div>
                <p className="text-xs text-foreground/80">{aiSignal.gpt_reasoning}</p>
              </div>

              {aiSignal.headlines_analyzed?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Headlines Analyzed</p>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {aiSignal.headlines_analyzed.map((h, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground border-l-2 border-border pl-2">{h}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              onClick={() => setOpen(false)}
              className="w-full text-xs text-muted-foreground hover:text-foreground py-2 border border-border rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}