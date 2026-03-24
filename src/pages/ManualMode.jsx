import React, { useState } from "react";
import { Monitor } from "lucide-react";
import TickerBar from "@/components/manual/TickerBar";
import HotMovers from "@/components/manual/HotMovers";
import StockBrowser from "@/components/manual/StockBrowser";
import StockModal from "@/components/manual/StockModal";
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
  }

  function handleCloseModal() {
    setSelectedStock(null);
    setSavedResearchToLoad(null);
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

        {/* Stock Browser */}
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col" style={{ maxHeight: "80vh" }}>
          <h3 className="text-sm font-semibold text-foreground mb-3">Stock Browser</h3>
          <StockBrowser onSelect={handleSelectStock} />
        </div>

        {/* Stock Research Modal */}
        <StockModal
          stock={selectedStock}
          savedResearch={savedResearchToLoad}
          onClose={handleCloseModal}
        />

        {/* Saved Research Library */}
        <SavedResearch onLoadResearch={handleLoadSavedResearch} />
      </div>
    </div>
  );
}