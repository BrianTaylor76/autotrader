import React, { useState } from "react";
import { Monitor } from "lucide-react";
import TickerBar from "@/components/manual/TickerBar";
import HotMovers from "@/components/manual/HotMovers";
import StockBrowser from "@/components/manual/StockBrowser";
import ResearchPanel from "@/components/manual/ResearchPanel";
import SavedResearch from "@/components/manual/SavedResearch";

export default function ManualMode() {
  const [selectedStock, setSelectedStock] = useState(null);
  const [savedResearchToLoad, setSavedResearchToLoad] = useState(null);

  function handleSelectStock(stock) {
    setSelectedStock(stock);
    setSavedResearchToLoad(null);
  }

  function handleLoadSavedResearch(research) {
    setSelectedStock({ symbol: research.symbol, name: research.company_name, price: research.current_price, change_pct: research.price_change_pct, volume: research.volume });
    setSavedResearchToLoad(research);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col min-h-screen -mx-6 -mt-6">
      {/* Ticker Bar */}
      <TickerBar />

      <div className="px-6 pt-5 pb-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Monitor className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground tracking-tight">Manual Mode</h2>
          <span className="text-sm text-muted-foreground">— Smart Stock Research Terminal</span>
        </div>

        {/* Hot Movers */}
        <HotMovers onSelect={handleSelectStock} />

        {/* Main Panel: Browser + Research */}
        <div className="flex flex-col lg:flex-row gap-5">
          {/* Left: Stock Browser */}
          <div className="lg:w-2/5 bg-card border border-border rounded-xl p-4 flex flex-col" style={{ maxHeight: "80vh" }}>
            <h3 className="text-sm font-semibold text-foreground mb-3">Stock Browser</h3>
            <StockBrowser onSelect={handleSelectStock} />
          </div>

          {/* Right: Research Panel */}
          <div className="lg:w-3/5 overflow-y-auto">
            <ResearchPanel stock={selectedStock} savedResearch={savedResearchToLoad} />
          </div>
        </div>

        {/* Saved Research Library */}
        <SavedResearch onLoadResearch={handleLoadSavedResearch} />
      </div>
    </div>
  );
}