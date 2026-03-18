import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Save, Plus, X, ListFilter, DollarSign, Activity, Layers } from "lucide-react";

export default function StrategySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [symbolInput, setSymbolInput] = useState("");
  const [form, setForm] = useState({
    watchlist: [],
    max_per_trade: 1000,
    daily_loss_limit: 500,
    fast_ma_period: 9,
    slow_ma_period: 21,
    bot_enabled: false,
  });

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => base44.entities.StrategySettings.list("-created_date", 1),
  });

  const current = settings[0];

  useEffect(() => {
    if (current) {
      setForm({
        watchlist: current.watchlist || [],
        max_per_trade: current.max_per_trade || 1000,
        daily_loss_limit: current.daily_loss_limit || 500,
        fast_ma_period: current.fast_ma_period || 9,
        slow_ma_period: current.slow_ma_period || 21,
        bot_enabled: current.bot_enabled || false,
      });
    }
  }, [current]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (current) {
        await base44.entities.StrategySettings.update(current.id, form);
      } else {
        await base44.entities.StrategySettings.create(form);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Settings saved", description: "Your strategy settings have been updated." });
    },
  });

  const addSymbol = () => {
    const sym = symbolInput.trim().toUpperCase();
    if (sym && !form.watchlist.includes(sym)) {
      setForm({ ...form, watchlist: [...form.watchlist, sym] });
      setSymbolInput("");
    }
  };

  const removeSymbol = (sym) => {
    setForm({ ...form, watchlist: form.watchlist.filter((s) => s !== sym) });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Strategy Settings</h2>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">Strategy Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Configure your moving average crossover strategy</p>
      </div>

      <Card className="bg-card border-border p-6 space-y-5">
        <div className="flex items-center gap-2 text-foreground">
          <ListFilter className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Watchlist</h3>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Enter symbol (e.g. AAPL)"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSymbol())}
            className="bg-secondary border-border font-mono uppercase"
          />
          <Button onClick={addSymbol} variant="outline" size="icon" className="shrink-0">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {form.watchlist.map((sym) => (
            <Badge key={sym} variant="secondary" className="px-3 py-1.5 font-mono text-sm gap-1.5 bg-secondary text-foreground">
              {sym}
              <button onClick={() => removeSymbol(sym)} className="hover:text-destructive transition-colors">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {form.watchlist.length === 0 && (
            <p className="text-sm text-muted-foreground">No symbols added yet</p>
          )}
        </div>
      </Card>

      <Card className="bg-card border-border p-6 space-y-5">
        <div className="flex items-center gap-2 text-foreground">
          <DollarSign className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Trade Limits</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Max $ Per Trade</Label>
            <Input
              type="number"
              value={form.max_per_trade}
              onChange={(e) => setForm({ ...form, max_per_trade: parseFloat(e.target.value) || 0 })}
              className="bg-secondary border-border font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Daily Loss Limit</Label>
            <Input
              type="number"
              value={form.daily_loss_limit}
              onChange={(e) => setForm({ ...form, daily_loss_limit: parseFloat(e.target.value) || 0 })}
              className="bg-secondary border-border font-mono"
            />
          </div>
        </div>
      </Card>

      <Card className="bg-card border-border p-6 space-y-5">
        <div className="flex items-center gap-2 text-foreground">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Moving Average Periods</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Fast MA Period</Label>
            <Input
              type="number"
              value={form.fast_ma_period}
              onChange={(e) => setForm({ ...form, fast_ma_period: parseInt(e.target.value) || 9 })}
              className="bg-secondary border-border font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Slow MA Period</Label>
            <Input
              type="number"
              value={form.slow_ma_period}
              onChange={(e) => setForm({ ...form, slow_ma_period: parseInt(e.target.value) || 21 })}
              className="bg-secondary border-border font-mono"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Bot buys when the fast MA crosses above the slow MA, and sells when it crosses below.
        </p>
      </Card>

      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 font-medium"
      >
        <Save className="w-4 h-4 mr-2" />
        {saveMutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}