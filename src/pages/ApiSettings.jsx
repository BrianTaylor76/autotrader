import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { Key, ShieldCheck, ExternalLink, AlertTriangle } from "lucide-react";

export default function ApiSettings() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!apiKey.trim() || !apiSecret.trim()) {
      toast({ title: "Error", description: "Both API Key and Secret are required.", variant: "destructive" });
      return;
    }
    await base44.auth.updateMe({
      alpaca_api_key: apiKey.trim(),
      alpaca_api_secret: apiSecret.trim(),
    });
    setSaved(true);
    toast({ title: "Saved", description: "Alpaca credentials stored securely." });
    setApiKey("");
    setApiSecret("");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">API Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Connect your Alpaca brokerage account</p>
      </div>

      <Card className="bg-card border-border p-6 space-y-5">
        <div className="flex items-center gap-2 text-foreground">
          <Key className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Alpaca API Credentials</h3>
        </div>

        <div className="p-4 rounded-lg bg-accent/30 border border-border flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Important Security Note</p>
            <p>For production use, API keys should be stored as environment variables in the dashboard settings. This form stores them on your user profile for quick setup. Navigate to Dashboard → Settings → Environment Variables for the secure approach.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">API Key</Label>
            <Input
              type="password"
              placeholder="Enter your Alpaca API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="bg-secondary border-border font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">API Secret</Label>
            <Input
              type="password"
              placeholder="Enter your Alpaca API secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              className="bg-secondary border-border font-mono"
            />
          </div>
        </div>

        <Button
          onClick={handleSave}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-11"
        >
          <ShieldCheck className="w-4 h-4 mr-2" />
          Save Credentials
        </Button>

        {saved && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary">Credentials saved to your profile.</span>
          </div>
        )}
      </Card>

      <Card className="bg-card border-border p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Getting Started with Alpaca</h3>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground shrink-0">1</span>
            Create a free account at <a href="https://alpaca.markets" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">alpaca.markets <ExternalLink className="w-3 h-3" /></a>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground shrink-0">2</span>
            Navigate to Paper Trading → API Keys
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground shrink-0">3</span>
            Generate new API keys and paste them above
          </li>
        </ol>
      </Card>
    </div>
  );
}