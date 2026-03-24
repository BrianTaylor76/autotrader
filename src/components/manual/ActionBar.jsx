import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Bookmark, FileText, Star } from "lucide-react";

export default function ActionBar({ stock, analysis, congressTrades, news, onWatchlistAdd }) {
  const { toast } = useToast();
  const [paperOpen, setPaperOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [side, setSide] = useState("buy");
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleAddWatchlist() {
    const settings = await base44.entities.StrategySettings.list("-created_date", 1);
    const current = settings[0];
    if (!current) { toast({ title: "No strategy settings found", variant: "destructive" }); return; }
    const watchlist = current.watchlist || [];
    if (watchlist.includes(stock.symbol)) { toast({ title: "Already in watchlist" }); return; }
    await base44.entities.StrategySettings.update(current.id, { watchlist: [...watchlist, stock.symbol] });
    toast({ title: `${stock.symbol} added to watchlist` });
    onWatchlistAdd?.();
  }

  async function handlePaperTrade() {
    setSubmitting(true);
    const price = stock.price || 0;
    const total = qty * price;
    await base44.entities.ManualTrade.create({
      symbol: stock.symbol,
      action: side,
      quantity: qty,
      price,
      total_value: total,
      trade_type: !Number.isInteger(qty) ? "fractional" : "whole",
      executed_at: new Date().toISOString(),
      notes: "Paper trade via Manual Mode",
      status: "executed",
    });
    toast({ title: `Paper ${side} logged`, description: `${qty} shares of ${stock.symbol} @ $${price.toFixed(2)}` });
    setPaperOpen(false);
    setSubmitting(false);
  }

  async function handleSaveResearch() {
    if (!analysis) { toast({ title: "Run analysis first", variant: "destructive" }); return; }
    setSaving(true);
    await base44.entities.StockResearch.create({
      symbol: stock.symbol,
      company_name: stock.name,
      current_price: stock.price,
      price_change_pct: stock.change_pct,
      volume: stock.volume,
      is_fractional: stock.is_fractional,
      claude_analysis: analysis.claude_analysis,
      gpt_analysis: analysis.gpt_analysis,
      consensus_sentiment: analysis.consensus_sentiment,
      agreement_summary: analysis.agreement_summary,
      news_links: news || [],
      congress_trades: congressTrades || [],
      researched_at: new Date().toISOString(),
    });
    toast({ title: "Research saved!" });
    setSaving(false);
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-4 border-t border-border" style={{ paddingBottom: "env(safe-area-inset-bottom, 20px)" }}>
        <Button variant="outline" className="border-border gap-1.5 h-12 sm:h-9 text-sm" onClick={handleAddWatchlist}>
          <Bookmark className="w-4 h-4" /> Add to Watchlist
        </Button>
        <Button variant="outline" className="border-border gap-1.5 h-12 sm:h-9 text-sm" onClick={() => setPaperOpen(true)}>
          <FileText className="w-4 h-4" /> Paper Trade
        </Button>
        <Button variant="outline" className="border-border gap-1.5 h-12 sm:h-9 text-sm" onClick={handleSaveResearch} disabled={saving}>
          <Star className="w-4 h-4" /> {saving ? "Saving…" : "Save Research"}
        </Button>
      </div>

      <Dialog open={paperOpen} onOpenChange={setPaperOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Paper Trade — {stock?.symbol}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">Current price: <span className="text-foreground font-mono">${stock?.price?.toFixed(2)}</span></p>
            <div className="flex gap-2">
              {["buy","sell"].map(s => (
                <button key={s} onClick={() => setSide(s)} className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors capitalize ${side === s ? (s === "buy" ? "bg-primary/10 text-primary border-primary/30" : "bg-destructive/10 text-destructive border-destructive/30") : "bg-secondary text-muted-foreground border-border"}`}>{s}</button>
              ))}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Quantity (supports fractional)</label>
              <Input type="number" step="0.01" min="0.01" value={qty} onChange={e => setQty(parseFloat(e.target.value))} className="bg-secondary border-border" />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total value</span>
              <span className="font-mono text-foreground">${(qty * (stock?.price || 0)).toFixed(2)}</span>
            </div>
            <Button onClick={handlePaperTrade} disabled={submitting} className="w-full">
              {submitting ? "Submitting…" : `Submit Paper ${side}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}