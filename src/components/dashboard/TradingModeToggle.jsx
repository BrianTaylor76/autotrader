import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const CHECKBOXES = [
  "I understand this bot will trade real money automatically",
  "I have reviewed the backtest results and understand the risks",
  "I have set appropriate position sizes and daily loss limits",
];

export default function TradingModeToggle() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [checked, setChecked] = useState([false, false, false]);
  const [confirmText, setConfirmText] = useState("");
  const [countdown, setCountdown] = useState(null);

  const { data: modes = [] } = useQuery({
    queryKey: ["trading-mode"],
    queryFn: () => base44.entities.TradingMode.list("-activated_at", 1),
    refetchInterval: 10000,
  });

  const currentMode = modes[0]?.mode || "paper";
  const isLive = currentMode === "live";

  const switchMode = useMutation({
    mutationFn: (mode) => base44.functions.invoke("setTradingMode", { mode }),
    onSuccess: (res, mode) => {
      queryClient.invalidateQueries({ queryKey: ["trading-mode"] });
      if (mode === "paper") {
        const cancelled = res.data?.cancelled_orders || 0;
        toast({
          title: "Switched to Paper Trading",
          description: `All open orders cancelled (${cancelled}). Back to safe mode.`,
        });
      }
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function toggleChecked(i) {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  const allChecked = checked.every(Boolean);
  const textOk = confirmText === "CONFIRM LIVE TRADING";
  const canActivate = allChecked && textOk;

  function startCountdown() {
    if (!canActivate) return;
    let n = 5;
    setCountdown(n);
    const interval = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(interval);
        setCountdown(null);
        setShowModal(false);
        setChecked([false, false, false]);
        setConfirmText("");
        switchMode.mutate("live");
      } else {
        setCountdown(n);
      }
    }, 1000);
  }

  function handleSwitchToPaper() {
    if (window.confirm("Switch back to paper trading? All open live orders will be cancelled.")) {
      switchMode.mutate("paper");
    }
  }

  return (
    <>
      {/* Toggle Banner */}
      <div
        className={`rounded-xl border p-4 flex items-center justify-between gap-4 transition-all duration-300 ${
          isLive
            ? "bg-destructive/10 border-destructive/40"
            : "bg-primary/5 border-primary/20"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              isLive ? "bg-destructive animate-pulse" : "bg-primary"
            }`}
          />
          <div>
            <p className={`font-semibold text-sm ${isLive ? "text-destructive" : "text-primary"}`}>
              {isLive ? "💰 LIVE TRADING — Real Money Active" : "🧪 Paper Trading — Safe Mode"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLive
                ? "All trades use real funds from your Alpaca live account"
                : "All trades use simulated money"}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={isLive ? "destructive" : "outline"}
          onClick={isLive ? handleSwitchToPaper : () => setShowModal(true)}
          disabled={switchMode.isPending}
          className={isLive ? "" : "border-primary/30 text-primary hover:bg-primary/10"}
        >
          {switchMode.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : isLive ? (
            "Switch to Paper"
          ) : (
            "Switch to Live"
          )}
        </Button>
      </div>

      {/* Live Activation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
          <div className="bg-card border border-destructive/40 rounded-xl p-6 max-w-md w-full space-y-5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-destructive shrink-0" />
              <h3 className="text-lg font-bold text-foreground">Activate Live Trading</h3>
            </div>

            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <p className="text-sm text-destructive font-medium">
                ⚠️ This will use REAL MONEY. The bot will place actual trades on your Alpaca live account.
              </p>
            </div>

            <div className="space-y-3">
              {CHECKBOXES.map((label, i) => (
                <label key={i} className="flex items-start gap-3 cursor-pointer">
                  <div
                    onClick={() => toggleChecked(i)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      checked[i] ? "bg-destructive border-destructive" : "border-border bg-secondary"
                    }`}
                  >
                    {checked[i] && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm text-foreground">{label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Type <span className="font-mono text-foreground">CONFIRM LIVE TRADING</span> to proceed:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CONFIRM LIVE TRADING"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground font-mono text-sm focus:outline-none focus:ring-1 focus:ring-destructive"
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowModal(false);
                  setChecked([false, false, false]);
                  setConfirmText("");
                  setCountdown(null);
                }}
              >
                Cancel
              </Button>
              {countdown !== null ? (
                <div className="flex-1 flex items-center justify-center rounded-lg bg-destructive/20 border border-destructive/40 text-destructive font-bold text-sm">
                  Going live in {countdown}...
                </div>
              ) : (
                <Button
                  className="flex-1 bg-destructive hover:bg-destructive/90 text-white"
                  disabled={!canActivate}
                  onClick={startCountdown}
                >
                  Activate Live Trading
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}