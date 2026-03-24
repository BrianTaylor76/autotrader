import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { cancelAllSpeech } from "@/hooks/useSpeech";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import StockChart from "./StockChart";
import { getAddedAt } from "@/utils/watchlist";
import AIAnalysisSection from "./AIAnalysisSection";
import CongressActivity from "./CongressActivity";
import NewsFeed from "./NewsFeed";
import ActionBar from "./ActionBar";

const ANALYZE_STAGES = [
  "Fetching price data…",
  "Analyzing with Claude…",
  "Analyzing with GPT-4o…",
  "Loading news…",
  "Finishing up…",
];

function calcRiskScore(stock) {
  let score = 5;
  if ((stock?.vol_ratio || 0) > 3) score += 2;
  else if ((stock?.vol_ratio || 0) > 2) score += 1;
  if ((stock?.price || 0) < 5) score += 2;
  else if ((stock?.price || 0) < 20) score += 1;
  if (stock?.market === "Crypto") score += 2;
  if (Math.abs(stock?.change_pct || 0) > 10) score += 2;
  else if (Math.abs(stock?.change_pct || 0) > 5) score += 1;
  return Math.min(10, Math.max(1, score));
}

function RiskBadge({ score }) {
  if (!score) return null;
  const c = score <= 3 ? "text-primary bg-primary/10 border-primary/20"
    : score <= 6 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
    : "text-destructive bg-destructive/10 border-destructive/20";
  return <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${c}`}>Risk {score}/10</span>;
}

export default function ResearchPanel({ stock, savedResearch, isModal, watchlist = [] }) {
  const [assetInfo, setAssetInfo] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [congressTrades, setCongressTrades] = useState([]);
  const [congressLoaded, setCongressLoaded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [stage, setStage] = useState(0);
  const [showChart, setShowChart] = useState(false);

  useEffect(() => {
    if (!stock) return;
    setAnalysis(null);
    setAnalyzeError(null);
    setAssetInfo(null);
    setCongressTrades([]);
    setCongressLoaded(false);
    setShowChart(false);
    cancelAllSpeech();

    const isCrypto = /^[A-Z]+USD$/.test(stock.symbol) || stock.symbol.includes("/");

    // Crypto: mark fractional immediately without API call
    if (isCrypto) {
      setAssetInfo({ fractionable: true, exchange: "Crypto" });
    } else {
      base44.functions.invoke("fetchStockData", { action: "asset", symbol: stock.symbol })
        .then(res => setAssetInfo(res.data))
        .catch(() => setAssetInfo({ fractionable: false }));
    }

    // Delay chart fetch by 200ms to stagger API calls
    const chartTimer = setTimeout(() => setShowChart(true), 200);

    // Load saved research if provided
    if (savedResearch) {
      setAnalysis({
        claude_analysis: savedResearch.claude_analysis,
        gpt_analysis: savedResearch.gpt_analysis,
        consensus_sentiment: savedResearch.consensus_sentiment,
        agreement_summary: savedResearch.agreement_summary,
        news: savedResearch.news_links || [],
      });
    }

    return () => clearTimeout(chartTimer);
  }, [stock?.symbol]);

  async function handleAnalyze() {
    setAnalyzing(true);
    setStage(0);
    setAnalyzeError(null);
    const stageInterval = setInterval(() => setStage(s => Math.min(s + 1, ANALYZE_STAGES.length - 1)), 5000);
    try {
      const res = await base44.functions.invoke("analyzeStock", {
        symbol: stock.symbol,
        company_name: stock.name || stock.symbol,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setAnalysis(res.data);
    } catch (e) {
      const msg = e.message || "";
      if (msg.includes("429") || msg.includes("Rate") || msg.includes("rate")) {
        setAnalyzeError("Rate limited — please wait a moment and try again");
      } else {
        setAnalyzeError("Analysis temporarily unavailable — please try again");
      }
    } finally {
      clearInterval(stageInterval);
      setAnalyzing(false);
    }
  }

  if (!stock) {
    if (isModal) return null;
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-80 text-center p-8">
        <TrendingUp className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <p className="text-foreground font-medium">Select a stock to research</p>
        <p className="text-sm text-muted-foreground mt-1">Browse the list or click a hot mover card above</p>
      </div>
    );
  }

  const riskScore = calcRiskScore(stock);
  const up = (stock.change_pct || 0) >= 0;
  const isCrypto = /^[A-Z]+USD$/.test(stock.symbol) || stock.symbol.includes("/");
  const isFractional = isCrypto ? true : (assetInfo?.fractionable ?? stock.is_fractional);

  return (
    <div className="space-y-5 pb-8">
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-2xl font-bold font-mono text-foreground">{stock.symbol}</h2>
              <RiskBadge score={riskScore} />
            </div>
            <p className="text-sm text-muted-foreground">{stock.name}</p>
            {assetInfo?.exchange && <p className="text-xs text-muted-foreground">{assetInfo.exchange}</p>}
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold font-mono text-foreground">
              {stock.price ? `$${stock.price.toFixed(2)}` : "—"}
            </p>
            {stock.change_pct != null && (
              <p className={`text-sm font-mono font-semibold flex items-center gap-1 justify-end ${up ? "text-primary" : "text-destructive"}`}>
                {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {up ? "+" : ""}{stock.change_pct.toFixed(2)}% today
              </p>
            )}
          </div>
        </div>
        {stock.volume != null && (
          <p className="text-xs text-muted-foreground">Volume: <span className="text-foreground font-mono">{stock.volume.toLocaleString()}</span></p>
        )}
        <div className={`mt-3 text-xs px-3 py-2 rounded-lg border ${isFractional ? "bg-primary/5 border-primary/20 text-primary" : "bg-secondary border-border text-muted-foreground"}`}>
          {isFractional
            ? "✅ Fractional shares available — minimum $1"
            : `⚠️ Whole shares only — current price: ${stock.price ? `$${stock.price.toFixed(2)}` : "—"}`}
        </div>
      </div>

      {/* Chart — lazy loaded after 200ms */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3">6-Month Chart</h4>
        {showChart ? <StockChart symbol={stock.symbol} addedAt={getAddedAt(watchlist, stock.symbol)} /> : <div className="h-64 bg-secondary/30 animate-pulse rounded-xl" />}
      </div>

      {/* Analyze Button */}
      {!analysis && (
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col items-center gap-4">
          {!analyzing ? (
            <>
              <p className="text-sm text-muted-foreground text-center">Get a full AI-powered analysis with dual Claude & GPT-4o opinions, news, and insights.</p>
              {analyzeError && <p className="text-xs text-destructive">{analyzeError}</p>}
              <Button onClick={handleAnalyze} className="bg-primary hover:bg-primary/90 font-semibold px-8 h-11">
                Analyze {stock.symbol}
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-foreground font-medium">{ANALYZE_STAGES[stage]}</p>
              <div className="flex gap-1.5">
                {ANALYZE_STAGES.map((_, i) => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i <= stage ? "bg-primary" : "bg-secondary"}`} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Analysis */}
      {analysis && (
        <div className="bg-card border border-border rounded-xl p-5">
          <AIAnalysisSection analysis={analysis} symbol={stock.symbol} />
        </div>
      )}

      {/* Congressional Activity — only when analysis is ready */}
      {analysis && (
        <div className="bg-card border border-border rounded-xl p-5">
          <CongressActivity trades={congressTrades} loaded={congressLoaded} />
        </div>
      )}

      {/* News Feed — only when analysis is ready */}
      {analysis && (
        <div className="bg-card border border-border rounded-xl p-5">
          <NewsFeed symbol={stock.symbol} />
        </div>
      )}

      {/* Action Bar */}
      {analysis && (
        <div className="bg-card border border-border rounded-xl p-5">
          <ActionBar
            stock={{ ...stock, is_fractional: isFractional }}
            analysis={analysis}
            congressTrades={congressTrades}
            news={analysis.news || []}
          />
        </div>
      )}
    </div>
  );
}