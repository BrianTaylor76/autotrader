import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Key, ShieldCheck, ExternalLink, AlertTriangle } from "lucide-react";

export default function ApiSettings() {
  const { toast } = useToast();
  const [paperKey, setPaperKey] = useState("");
  const [paperSecret, setPaperSecret] = useState("");
  const [liveKey, setLiveKey] = useState("");
  const [liveSecret, setLiveSecret] = useState("");
  const [savedPaper, setSavedPaper] = useState(false);
  const [savedLive, setSavedLive] = useState(false);

  const handleSavePaper = () => {
    if (!paperKey.trim() || !paperSecret.trim()) {
      toast({ title: "Error", description: "Both API Key and Secret are required.", variant: "destructive" });
      return;
    }
    toast({ title: "Note", description: "Set ALPACA_API_KEY and ALPACA_API_SECRET in your dashboard Environment Variables." });
    setSavedPaper(true);
    setPaperKey("");
    setPaperSecret("");
  };

  const handleSaveLive = () => {
    if (!liveKey.trim() || !liveSecret.trim()) {
      toast({ title: "Error", description: "Both Live API Key and Secret are required.", variant: "destructive" });
      return;
    }
    toast({ title: "Note", description: "Set ALPACA_LIVE_API_KEY and ALPACA_LIVE_API_SECRET in your dashboard Environment Variables." });
    setSavedLive(true);
    setLiveKey("");
    setLiveSecret("");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">API Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Connect your Alpaca brokerage accounts</p>
      </div>

      {/* Paper Trading Section */}
      <Card className="bg-card border-border p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <Key className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">🧪 Paper Trading Account</h3>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/25">
            Currently Active (Default)
          </span>
        </div>

        <div className="p-3 rounded-lg bg-accent/30 border border-border text-xs text-muted-foreground">
          Set <span className="font-mono text-foreground">ALPACA_API_KEY</span> and{" "}
          <span className="font-mono text-foreground">ALPACA_API_SECRET</span> in your Base44 dashboard → Settings → Environment Variables.
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Paper API Key</Label>
            <Input type="password" placeholder="PK..." value={paperKey} onChange={(e) => setPaperKey(e.target.value)} className="bg-secondary border-border font-mono" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Paper API Secret</Label>
            <Input type="password" placeholder="Paper secret..." value={paperSecret} onChange={(e) => setPaperSecret(e.target.value)} className="bg-secondary border-border font-mono" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Base URL</Label>
            <div className="px-3 py-2 rounded-md bg-secondary/60 border border-border font-mono text-xs text-muted-foreground">
              https://paper-api.alpaca.markets (locked)
            </div>
          </div>
        </div>

        <Button onClick={handleSavePaper} variant="outline" className="w-full border-primary/30 text-primary hover:bg-primary/10 h-10">
          <ShieldCheck className="w-4 h-4 mr-2" />
          View Paper Key Instructions
        </Button>
        {savedPaper && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm text-primary flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Set ALPACA_API_KEY and ALPACA_API_SECRET in your dashboard env variables.
          </div>
        )}
      </Card>

      {/* Live Trading Section */}
      <Card className="bg-card border-destructive/30 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <Key className="w-4 h-4 text-destructive" />
            <h3 className="font-semibold">💰 Live Trading Account</h3>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-destructive/15 text-destructive border border-destructive/30">
            Real Money — Use With Caution
          </span>
        </div>

        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-destructive mb-1">⚠️ Live trading uses real money.</p>
            <p>Ensure you have tested thoroughly with paper trading before switching. Hard cap of $25 per order applies in live mode.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Live API Key</Label>
            <Input type="password" placeholder="Live key..." value={liveKey} onChange={(e) => setLiveKey(e.target.value)} className="bg-secondary border-border font-mono" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Live API Secret</Label>
            <Input type="password" placeholder="Live secret..." value={liveSecret} onChange={(e) => setLiveSecret(e.target.value)} className="bg-secondary border-border font-mono" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Base URL</Label>
            <div className="px-3 py-2 rounded-md bg-secondary/60 border border-border font-mono text-xs text-muted-foreground">
              https://api.alpaca.markets (locked)
            </div>
          </div>
        </div>

        <Button onClick={handleSaveLive} variant="outline" className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 h-10">
          <ShieldCheck className="w-4 h-4 mr-2" />
          View Live Key Instructions
        </Button>
        {savedLive && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Set ALPACA_LIVE_API_KEY and ALPACA_LIVE_API_SECRET in your dashboard env variables.
          </div>
        )}
      </Card>

      {/* Instructions */}
      <Card className="bg-card border-border p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Getting Your Alpaca API Keys</h3>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground shrink-0">1</span>
            Go to{" "}
            <a href="https://alpaca.markets" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
              alpaca.markets <ExternalLink className="w-3 h-3" />
            </a>{" "}
            → Your Account → API Keys
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground shrink-0">2</span>
            For paper keys: select <span className="font-medium text-foreground">Paper</span> environment when generating
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground shrink-0">3</span>
            For live keys: select <span className="font-medium text-destructive">Live</span> environment — requires funded account
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground shrink-0">4</span>
            Add keys to your Base44 dashboard → Settings → Environment Variables
          </li>
        </ol>
      </Card>
    </div>
  );
}