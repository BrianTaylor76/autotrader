import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import StockChart from "./StockChart";
import AIAnalysisSection from "./AIAnalysisSection";
import CongressActivity from "./CongressActivity";
import NewsFeed from "./NewsFeed";
import ActionBar from "./ActionBar";

const RISK_STAGES = ["Fetching price data…","Analyzing with Claude…","Analyzing with GPT-4o…","Loading news…","Finishing up…"];

function RiskBadge({ score }) {
  if (!score) return null;
  const color = score <= 3 ? "text-primary bg-primary/10 border-primary/20" : score <= 6 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" : "text-destructive bg-destructive/10 border-destructive/20";
  return <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${color}`}>Risk {score}/10</span>;
}

function calcRiskScore(stock) {
  if (!stock?.price) return null;
  // Simple risk score from price range and vol ratio
  let score = 5;
  const volRatio = stock.vol_ratio || 1;
  if (volRatio > 3) score += 2;
  else if (volRatio > 2) score += 1;
  if (stock.price < 5) score += 2;
  else if (stock.price < 20) score += 1;
  if (stock.market === "Crypto") score += 2;
  const changePct = Math.abs(stock.change_pct || 0);
  if (changePct > 10) score += 2;
  else if (changePct > 5) score += 1;
  return Math.min(10, Math.max(1, score));
}

export default function ResearchPanel({ stock, savedResearch }) {
  const [assetInfo, setAssetInfo] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [congressTrades, setCongressTrades] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStage, setAnalyzeStage] = useState(0);

  useEffect(() => {
    if (!stock) return;
    setAnalysis(null);
    setCongressTrades([]);
    setAssetInfo(null);
    // Fetch asset info for fractionable
    base44.functions.invoke("fetchStockData", { action: "asset", symbol: stock.symbol })
      .then(res => setAssetInfo(res.data));
    // Fetch congress trades
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
    base44.entities.CongressTrade.filter({ symbol: stock.symbol })
      .then(trades => setCongressTrades(trades.filter(t => t.disclosure_date >= ninetyDaysAgo)));
    // Load saved research if provided
    if (savedResearch) {
      setAnalysis({
        claude_analysis: savedResearch.claude_analysis,
        gpt_analysis: savedResearch.gpt_analysis,
        consensus_sentiment: savedResearch.consensus_sentiment,
        agreement_summary: savedResearch.agreement_summary,
        news: savedResearch.news_links,
      });
    }
  }, [stock?.symbol]);

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeStage(0);
    const stageInterval = setInterval(() => setAnalyzeStage(s => Math.min(s + 1, RISK_STAGES.length - 1)), 4000);
    const res = await base44.functions.invoke("analyzeStock", {
      symbol: stock.symbol,
      company_name: stock.name || stock.symbol,
    });
    clearInterval(stageInterval);
    if (res.data && !res.data.error) setAnalysis(res.data);
    setAnalyzing(false);
  }

  if (!stock) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-80 text-center p-8">
        <TrendingUp className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <p className="text-foreground font-medium">Select a stock to research</p>
        <p className="text-sm text-muted-foreground mt-1">Browse the list or click a hot mover card</p>
      </div>
    );
  }

  const riskScore = calcRiskScore(stock);
  const up = (stock.change_pct || 0) >= 0;
  const isFractional = assetInfo?.fractionable ?? stock.is_fractional;

  return (
    <div className="space-y-6 pb-8">
      {/* Price Header */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold font-mono text-foreground">{stock.symbol}</h2>
              <RiskBadge score={riskScore} />
            </div>
            <p className="text-sm text-muted-foreground">{stock.name || assetInfo?.name}</p>
            {assetInfo?.exchange && <p className="text-xs text-muted-foreground">{assetInfo.exchange}</p>}
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold font-mono text-foreground">${stock.price?.toFixed(2) || "—"}</p>
            <p className={`text-sm font-mono font-semibold flex items-center gap-1 justify-end ${up ? "text-primary" : "text-destructive"}`}>
              {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {up ? "+" : ""}{stock.change_pct?.toFixed(2)}% today
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-3 pt-3 border-t border-border/40">
          <span>Volume: <span className="text-foreground font-mono">{stock.volume?.toLocaleString() || "—"}</span></span>
        </div>
        <div className={`mt-3 text-xs px-3 py-2 rounded-lg border ${isFractional ? "bg-primary/5 border-primary/20 text-primary" : "bg-secondary border-border text-muted-foreground"}`}>
          {isFractional
            ? "✅ Fractional shares available — minimum $1"
            : `⚠️ Whole shares only — current price: $${stock.price?.toFixed(2) || "—"}`}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3">6-Month Chart</h4>
        <StockChart symbol={stock.symbol} />
      </div>

      {/* Analyze Button */}
      {!analysis && (
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col items-center gap-4">
          {!analyzing ? (
            <>
              <p className="text-sm text-muted-foreground text-center">Get a full AI-powered analysis including Claude and GPT-4o opinions, news feed, and more.</p>
              <Button onClick={handleAnalyze} className="bg-primary hover:bg-primary/90 font-semibold px-8 h-11">
                Analyze {stock.symbol}
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-foreground font-medium">{RISK_STAGES[analyzeStage]}</p>
              <div className="flex gap-1.5">
                {RISK_STAGES.map((_, i) => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i <= analyzeStage ? "bg-primary" : "bg-secondary"}`} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Analysis */}
      {analysis && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-5">
          <AIAnalysisSection analysis={analysis} />
          <div className="border-t border-border/40 pt-5">
            <CongressActivity trades={congressTrades} />
          </div>
          <div className="border-t border-border/40 pt-5">
            <NewsFeed news={analysis.news || []} />
          </div>
          <ActionBar stock={{ ...stock, is_fractional: isFractional }} analysis={analysis} congressTrades={congressTrades} news={analysis.news} />
        </div>
      )}

      {/* Congress only (if analysis not run) */}
      {!analysis && congressTrades.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <CongressActivity trades={congressTrades} />
        </div>
      )}
    </div>
  );
}