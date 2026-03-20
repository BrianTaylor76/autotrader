import React, { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import CandlestickChart from "./CandlestickChart";
import { RefreshCw, TrendingUp, TrendingDown, Wifi } from "lucide-react";

const TIMEFRAMES = [
  { label: "1m", value: "1Min", limit: 120 },
  { label: "5m", value: "5Min", limit: 78 },
  { label: "15m", value: "15Min", limit: 56 },
  { label: "1h", value: "1Hour", limit: 48 },
  { label: "1D", value: "1Day", limit: 60 },
];

const REFRESH_INTERVAL = 30000; // 30 seconds

export default function ChartWidget({ symbols = [], defaultSymbol, height = 320, compact = false }) {
  const [symbol, setSymbol] = useState(defaultSymbol || symbols[0] || "SPY");
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[1]);
  const [bars, setBars] = useState([]);
  const [latestPrice, setLatestPrice] = useState(null);
  const [prevPrice, setPrevPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pulsing, setPulsing] = useState(false);
  const isFetching = useRef(false);
  const symbolRef = useRef(symbol);
  const timeframeRef = useRef(timeframe);

  const fetchData = useCallback(async () => {
    const sym = symbolRef.current;
    const tf = timeframeRef.current;
    if (!sym || isFetching.current) return;
    isFetching.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("getChartData", {
        symbol: sym,
        timeframe: tf.value,
        limit: tf.limit,
      });
      const data = res.data;
      if (data?.bars) {
        setBars(data.bars);
        setLatestPrice(data.latestPrice);
        setLastUpdated(new Date());
        setPulsing(true);
        setTimeout(() => setPulsing(false), 1000);
      }
    } catch {
      setError("Failed to load chart data");
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, []);

  // Initial fetch + symbol/timeframe change
  useEffect(() => {
    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
    setBars([]);
    setLatestPrice(null);
    fetchData();
  }, [symbol, timeframe]);

  // Auto-refresh every 30s — stable, no dependency on fetchData
  useEffect(() => {
    const interval = setInterval(() => fetchData(), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Sync symbol if parent changes defaultSymbol
  useEffect(() => {
    if (defaultSymbol) setSymbol(defaultSymbol);
  }, [defaultSymbol]);

  const priceChange = bars.length >= 2 ? bars[bars.length - 1].close - bars[0].open : null;
  const pricePct = priceChange != null && bars[0].open ? (priceChange / bars[0].open) * 100 : null;
  const isUp = (priceChange || 0) >= 0;

  return (
    <Card className="bg-card border-border overflow-hidden">
      <div className={`border-b border-border ${compact ? "p-3" : "p-4 md:p-5"}`}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Symbol selector */}
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className={`bg-secondary border-border font-mono font-bold ${compact ? "w-24 h-8 text-sm" : "w-28"}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {symbols.length > 0 ? (
                  symbols.map((s) => (
                    <SelectItem key={s} value={s} className="font-mono">{s}</SelectItem>
                  ))
                ) : (
                  <SelectItem value={symbol} className="font-mono">{symbol}</SelectItem>
                )}
              </SelectContent>
            </Select>

            {/* Price display */}
            {latestPrice != null && (
              <div className={`flex items-center gap-2 transition-all duration-300 ${pulsing ? "opacity-60" : "opacity-100"}`}>
                <span className={`font-mono font-bold ${compact ? "text-base" : "text-xl"} text-foreground`}>
                  ${latestPrice.toFixed(2)}
                </span>
                {pricePct != null && (
                  <Badge className={`gap-1 text-xs font-mono ${isUp ? "bg-primary/10 text-primary border-primary/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                    {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {isUp ? "+" : ""}{pricePct.toFixed(2)}%
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Timeframe buttons */}
            <div className="flex gap-1">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2 py-1 rounded text-xs font-mono font-medium transition-colors ${
                    timeframe.value === tf.value
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {/* Live indicator */}
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${loading ? "bg-yellow-500 animate-pulse" : "bg-primary animate-pulse"}`} />
              <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">
                {loading ? "updating" : lastUpdated ? `${Math.floor((Date.now() - lastUpdated) / 1000)}s ago` : "live"}
              </span>
            </div>

            <button
              onClick={fetchData}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      <div className={compact ? "p-2" : "p-2 md:p-3"}>
        {error ? (
          <div className="flex items-center justify-center" style={{ height }}>
            <div className="flex flex-col items-center gap-3">
              <Wifi className="w-5 h-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <button onClick={fetchData} className="text-xs text-primary hover:underline">Retry</button>
            </div>
          </div>
        ) : loading && bars.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height }}>
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Loading {symbol}...</p>
            </div>
          </div>
        ) : (
          <CandlestickChart bars={bars} height={height} />
        )}
      </div>
    </Card>
  );
}