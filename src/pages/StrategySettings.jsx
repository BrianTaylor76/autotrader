import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";
import { Save, Plus, X, ListFilter, DollarSign, Activity, Layers, Shield, Bell, Send } from "lucide-react";

export default function StrategySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [symbolInput, setSymbolInput] = useState("");
  const [form, setForm] = useState({
    watchlist: [],
    max_per_trade: 1000,
    daily_loss_limit: 500,
    fast_ma_period: 5,
    slow_ma_period: 13,
    bot_enabled: false,
    strategy_mode: "simple",
    consensus_threshold: 1,
    ai_veto_enabled: true,
    veto_sensitivity: "balanced",
    notifications_enabled: true,
    notif_trade_executed: true,
    notif_ai_veto_blocked: true,
    notif_daily_loss_limit: true,
    notif_congress_large_trade: true,
    notif_sentiment_spike: true,
  });
  const [testSending, setTestSending] = useState(false);

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
        fast_ma_period: current.fast_ma_period || 5,
        slow_ma_period: current.slow_ma_period || 13,
        bot_enabled: current.bot_enabled || false,
        strategy_mode: current.strategy_mode || "simple",
        consensus_threshold: current.consensus_threshold ?? 1,
        ai_veto_enabled: current.ai_veto_enabled !== false,
        veto_sensitivity: current.veto_sensitivity || "balanced",
        notifications_enabled: current.notifications_enabled !== false,
        notif_trade_executed: current.notif_trade_executed !== false,
        notif_ai_veto_blocked: current.notif_ai_veto_blocked !== false,
        notif_daily_loss_limit: current.notif_daily_loss_limit !== false,
        notif_congress_large_trade: current.notif_congress_large_trade !== false,
        notif_sentiment_spike: current.notif_sentiment_spike !== false,
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

      <Card className="bg-card border-border p-6 space-y-4">
        <div className="flex items-center gap-2 text-foreground">
          <Layers className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Strategy Mode</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "simple", label: "Simple", desc: "MA Crossover only" },
            { value: "consensus", label: "Consensus", desc: "Signal-weighted, 1/4 minimum" },
            { value: "both", label: "Both", desc: "Run both, split budget" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setForm({ ...form, strategy_mode: opt.value })}
              className={`p-3 rounded-lg border text-left transition-all ${
                form.strategy_mode === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary/30 text-muted-foreground hover:border-border/80 hover:text-foreground"
              }`}
            >
              <p className="font-semibold text-sm">{opt.label}</p>
              <p className="text-[11px] mt-0.5 opacity-80">{opt.desc}</p>
            </button>
          ))}
        </div>
      </Card>

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
              onChange={(e) => setForm({ ...form, fast_ma_period: parseInt(e.target.value) || 5 })}
              className="bg-secondary border-border font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Slow MA Period</Label>
            <Input
              type="number"
              value={form.slow_ma_period}
              onChange={(e) => setForm({ ...form, slow_ma_period: parseInt(e.target.value) || 13 })}
              className="bg-secondary border-border font-mono"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Bot uses 5-minute price bars. Buys when the 5-period MA crosses above the 13-period MA, sells when it crosses below.
        </p>
      </Card>

      <Card className="bg-card border-border p-6 space-y-5">
        <div className="flex items-center gap-2 text-foreground">
          <Layers className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Consensus Gate</h3>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            Buy Threshold (min score) — 1/4 minimum
          </Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={4}
              value={form.consensus_threshold}
              onChange={(e) => setForm({ ...form, consensus_threshold: parseInt(e.target.value) || 0 })}
              className="bg-secondary border-border font-mono w-24"
            />
            <div className="flex gap-1">
              {[0,1,2,3].map((i) => (
                <div
                  key={i}
                  className={`h-2 w-8 rounded-full ${i < form.consensus_threshold ? "bg-primary" : "bg-secondary"}`}
                />
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          ETFs (SPY, QQQ) use MA Cross + Sentiment only. Individual stocks use all 4 signals. AI Guard vetoes any trade both AIs flag as high risk.
        </p>
      </Card>

      <Card className="bg-card border-border p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">AI Veto Guard</h3>
          </div>
          <Switch
            checked={form.ai_veto_enabled}
            onCheckedChange={(val) => setForm({ ...form, ai_veto_enabled: val })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          When enabled, Claude and GPT-4o analyze recent news headlines before any BUY order. Bearish AI verdicts can veto trades. SELL orders are never blocked.
        </p>
        {form.ai_veto_enabled && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Veto Sensitivity</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "strict", label: "Strict", desc: "Either AI bearish = block" },
                { value: "balanced", label: "Balanced", desc: "Both bearish ≤3 = block" },
                { value: "lenient", label: "Lenient", desc: "Only block score ≤ 3" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm({ ...form, veto_sensitivity: opt.value })}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    form.veto_sensitivity === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary/30 text-muted-foreground hover:border-border/80 hover:text-foreground"
                  }`}
                >
                  <p className="font-semibold text-sm">{opt.label}</p>
                  <p className="text-[11px] mt-0.5 opacity-80">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="bg-card border-border p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <Bell className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Push Notifications</h3>
          </div>
          <Switch
            checked={form.notifications_enabled}
            onCheckedChange={(val) => setForm({ ...form, notifications_enabled: val })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Sends real-time alerts to your phone via Pushover. Requires PUSHOVER_APP_TOKEN and PUSHOVER_USER_KEY in your environment variables.
        </p>

        {form.notifications_enabled && (
          <div className="space-y-3">
            {[
              { key: "notif_trade_executed", label: "Trade Executed", desc: "Every buy or sell order" },
              { key: "notif_ai_veto_blocked", label: "AI Veto Blocked", desc: "When AI Guard blocks a trade" },
              { key: "notif_daily_loss_limit", label: "Daily Loss Limit Hit", desc: "When bot stops due to losses" },
              { key: "notif_congress_large_trade", label: "Congress Large Trade", desc: "$50,000+ congressional trades" },
              { key: "notif_sentiment_spike", label: "Unusual Sentiment Spike", desc: ">80% bullish or bearish on StockTwits" },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-sm text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={form[item.key] !== false}
                  onCheckedChange={(val) => setForm({ ...form, [item.key]: val })}
                />
              </div>
            ))}

            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full border-border gap-2"
                disabled={testSending}
                onClick={async () => {
                  setTestSending(true);
                  try {
                    await base44.functions.invoke("sendPushNotification", {
                      title: "AutoTrader: Test Notification ✅",
                      message: "Your Pushover integration is working correctly.",
                      priority: 0,
                      sound: "pushover",
                      trigger_type: "test",
                    });
                    toast({ title: "Test sent!", description: "Check your Pushover app." });
                  } catch {
                    toast({ title: "Test failed", description: "Check your Pushover credentials.", variant: "destructive" });
                  }
                  setTestSending(false);
                }}
              >
                <Send className="w-4 h-4" />
                {testSending ? "Sending..." : "Send Test Notification"}
              </Button>
            </div>
          </div>
        )}
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