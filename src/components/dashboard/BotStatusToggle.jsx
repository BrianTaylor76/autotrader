import React from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Activity, Power } from "lucide-react";

export default function BotStatusToggle({ enabled, onToggle, loading }) {
  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${enabled ? "bg-primary/10" : "bg-secondary"}`}>
            <Power className={`w-4 h-4 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Trading Bot</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {enabled ? (
                <>
                  <Activity className="w-3 h-3 text-primary animate-pulse" />
                  <span className="text-xs text-primary font-medium">Active</span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Inactive</span>
              )}
            </div>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={loading}
          className="data-[state=checked]:bg-primary"
        />
      </div>
    </Card>
  );
}