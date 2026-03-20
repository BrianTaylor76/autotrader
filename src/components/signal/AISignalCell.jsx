import React, { useState } from "react";
import React, { useState } from "react";
import { Shield } from "lucide-react";

function sentimentColor(sentiment) {
  if (sentiment === "bullish") return "bg-primary/15 text-primary border-primary/20";
  if (sentiment === "bearish") return "bg-destructive/15 text-destructive border-destructive/20";
  return "bg-muted text-muted-foreground border-border";
}

function verdictColor(verdict) {
  if (verdict === "allow") return "text-primary";
  if (verdict === "block") return "text-destructive";
  return "text-yellow-400";
}

export function ShieldVerdict({ verdict }) {
  if (!verdict) return null;
  return (
    <Shield
      className={`w-3.5 h-3.5 inline-block ml-1 ${verdictColor(verdict)}`}
      fill="currentColor"
      title={`AI Guard: ${verdict}`}
    />
  );
}

export function AISignalCell({ aiSignal }) {
  const [open, setOpen] = useState(false);

  if (!aiSignal) {
    return (
      <div className="text-center text-xs text-muted-foreground">—</div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex flex-col gap-0.5 cursor-pointer group"
        title="Click for AI analysis details"
      >
        <span className={`w-full text-center py-0.5 rounded-t-md text-[10px] font-semibold border ${sentimentColor(aiSignal.claude_sentiment)}`}>
          C: {aiSignal.claude_sentiment || "—"} ({aiSignal.claude_score || "?"})
        </span>
        <span className={`w-full text-center py-0.5 rounded-b-md text-[10px] font-semibold border ${sentimentColor(aiSignal.gpt_sentiment)}`}>
          G: {aiSignal.gpt_sentiment || "—"} ({aiSignal.gpt_score || "?"})
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground text-lg font-mono">{aiSignal.symbol} — AI Analysis</h3>
              <span className={`text-sm font-semibold px-2 py-0.5 rounded border ${
                aiSignal.overall_verdict === "allow" ? "bg-primary/10 text-primary border-primary/20" :
                aiSignal.overall_verdict === "block" ? "bg-destructive/10 text-destructive border-destructive/20" :
                "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
              }`}>
                {aiSignal.overall_verdict === "allow_caution" ? "Allow (Caution)" : aiSignal.overall_verdict?.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-secondary/50 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Claude</p>
                <p className={`text-sm font-bold ${sentimentColor(aiSignal.claude_sentiment).split(" ").find(c => c.startsWith("text-"))}`}>
                  {aiSignal.claude_sentiment} · {aiSignal.claude_score}/10
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">{aiSignal.claude_reasoning}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">GPT-4o</p>
                <p className={`text-sm font-bold ${sentimentColor(aiSignal.gpt_sentiment).split(" ").find(c => c.startsWith("text-"))}`}>
                  {aiSignal.gpt_sentiment} · {aiSignal.gpt_score}/10
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">{aiSignal.gpt_reasoning}</p>
              </div>
            </div>

            {aiSignal.headlines_analyzed?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Headlines Analyzed ({aiSignal.headlines_analyzed.length})
                </p>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {aiSignal.headlines_analyzed.map((h, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-2">
                      <span className="text-border shrink-0">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={() => setOpen(false)}
              className="w-full py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}