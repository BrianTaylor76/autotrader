/**
 * Watchlist item can be either:
 *   - Old format (string): "SPY"
 *   - New format (object): { symbol: "SPY", added_at: "2026-03-24T15:00:00Z" }
 */

export function normalizeWatchlist(wl = []) {
  return wl.map(item => {
    // Handle JSON string format: '{"symbol":"SPY","added_at":null}'
    if (typeof item === "string") {
      try {
        const parsed = JSON.parse(item);
        if (parsed && typeof parsed === "object" && parsed.symbol) return parsed;
      } catch (_) {}
      return { symbol: item, added_at: null };
    }
    return item;
  });
}

export function getWatchlistSymbols(wl = []) {
  return normalizeWatchlist(wl).map(i => i.symbol);
}

export function getAddedAt(wl = [], symbol) {
  const item = normalizeWatchlist(wl).find(i => i.symbol === symbol);
  return item?.added_at || null;
}

export function addToWatchlist(wl = [], symbol) {
  const normalized = normalizeWatchlist(wl);
  if (normalized.find(i => i.symbol === symbol)) return normalized;
  return [...normalized, { symbol, added_at: new Date().toISOString() }];
}

export function removeFromWatchlist(wl = [], symbol) {
  return normalizeWatchlist(wl).filter(i => i.symbol !== symbol);
}
