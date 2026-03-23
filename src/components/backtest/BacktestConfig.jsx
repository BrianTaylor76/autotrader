import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Play, Clock } from "lucide-react";

const PRESETS = [
  { label: "1 Year", years: 1 },
  { label: "3 Years", years: 3 },
  { label: "5 Years", years: 5 },
];

function getPresetDates(years) {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - years);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

export default function BacktestConfig({ onRun, running }) {
  const [symbol, setSymbol] = useState("SPY");
  const [startDate, setStartDate] = useState("2019-01-01");
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [capital, setCapital] = useState(10000);
  const [fastMA, setFastMA] = useState(5);
  const [slowMA, setSlowMA] = useState(13);
  const [strategies, setStrategies] = useState(["simple", "consensus"]);
  const [activePreset, setActivePreset] = useState(null);

  function applyPreset(preset) {
    const { start, end } = getPresetDates(preset.years);
    setStartDate(start);
    setEndDate(end);
    setActivePreset(preset.label);
  }

  function toggleStrategy(s) {
    setStrategies(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  }

  function handleRun() {
    if (!strategies.length) return;
    onRun({ symbol: symbol.toUpperCase(), start_date: startDate, end_date: endDate, fast_ma: fastMA, slow_ma: slowMA, initial_capital: capital, strategies });
  }

  return (
    <Card className="bg-card border-border p-5 space-y-5">
      <h3 className="text-sm font-semibold text-foreground">Backtest Configuration</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Symbol</label>
          <Input
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            className="font-mono uppercase bg-secondary border-border"
            placeholder="SPY"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Initial Capital</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="number"
              value={capital}
              onChange={e => setCapital(Number(e.target.value))}
              className="pl-6 bg-secondary border-border"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Fast MA</label>
            <Input type="number" value={fastMA} onChange={e => setFastMA(Number(e.target.value))} className="bg-secondary border-border" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Slow MA</label>
            <Input type="number" value={slowMA} onChange={e => setSlowMA(Number(e.target.value))} className="bg-secondary border-border" />
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-2 block">Date Range</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                activePreset === p.label
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-secondary text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setActivePreset("Custom")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              activePreset === "Custom"
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            Custom
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Start</label>
            <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setActivePreset("Custom"); }} className="bg-secondary border-border" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">End</label>
            <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setActivePreset("Custom"); }} className="bg-secondary border-border" />
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-2 block">Strategy</label>
        <div className="flex gap-2">
          {["simple", "consensus"].map(s => (
            <button
              key={s}
              onClick={() => toggleStrategy(s)}
              className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors capitalize ${
                strategies.includes(s)
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-secondary text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => setStrategies(["simple", "consensus"])}
            className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
              strategies.length === 2
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            Both
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 pt-1">
        <Button
          onClick={handleRun}
          disabled={running || strategies.length === 0}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 h-11"
        >
          <Play className="w-4 h-4 mr-2" />
          {running ? "Running…" : "Run Backtest"}
        </Button>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          Estimated time: ~15 seconds
        </div>
      </div>
    </Card>
  );
}