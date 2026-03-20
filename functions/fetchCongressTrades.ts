import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

function inferParty(name) {
  // Basic heuristic — API doesn't always provide party
  return "Unknown";
}

function normalizeTransaction(t) {
  if (!t) return "buy";
  const lower = t.toLowerCase();
  if (lower.includes("sale") || lower.includes("sell")) return "sell";
  if (lower.includes("exchange")) return "exchange";
  return "buy";
}

function normalizeAmount(amt) {
  if (!amt) return "";
  return String(amt).trim();
}

async function fetchHouse() {
  const res = await fetch("https://housestockwatcher.com/api/transactions_json");
  if (!res.ok) throw new Error(`House API error: ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((r) => ({
    representative: r.representative || r.name || "",
    chamber: "House",
    state: r.state || "",
    party: r.party || inferParty(r.representative),
    symbol: (r.ticker || r.symbol || "").toUpperCase().trim(),
    transaction: normalizeTransaction(r.type || r.transaction_type),
    amount_range: normalizeAmount(r.amount),
    disclosure_date: r.disclosure_date || r.filed_at_date || "",
    transaction_date: r.transaction_date || r.disclosure_date || "",
    description: r.asset_description || r.description || "",
    source_id: `house-${r.disclosure_date}-${r.representative}-${r.ticker || r.symbol}-${r.transaction_date}`,
  })).filter(r => r.symbol && r.symbol !== "--" && r.representative);
}

async function fetchSenate() {
  const res = await fetch("https://senatestockwatcher.com/api/transactions_json");
  if (!res.ok) throw new Error(`Senate API error: ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((r) => ({
    representative: r.senator || r.name || r.representative || "",
    chamber: "Senate",
    state: r.state || "",
    party: r.party || inferParty(r.senator),
    symbol: (r.ticker || r.symbol || "").toUpperCase().trim(),
    transaction: normalizeTransaction(r.type || r.transaction_type),
    amount_range: normalizeAmount(r.amount),
    disclosure_date: r.disclosure_date || r.filed_at_date || "",
    transaction_date: r.transaction_date || r.disclosure_date || "",
    description: r.asset_description || r.description || "",
    source_id: `senate-${r.disclosure_date}-${(r.senator || r.name)}-${r.ticker || r.symbol}-${r.transaction_date}`,
  })).filter(r => r.symbol && r.symbol !== "--" && r.representative);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [houseRecords, senateRecords] = await Promise.allSettled([fetchHouse(), fetchSenate()]);

    const house = houseRecords.status === "fulfilled" ? houseRecords.value : [];
    const senate = senateRecords.status === "fulfilled" ? senateRecords.value : [];
    const all = [...house, ...senate];

    // Get existing source_ids to avoid duplicates
    const existing = await base44.asServiceRole.entities.CongressTrade.list("-disclosure_date", 5000);
    const existingIds = new Set(existing.map(e => e.source_id).filter(Boolean));

    const newRecords = all.filter(r => r.source_id && !existingIds.has(r.source_id));

    let inserted = 0;
    const BATCH = 50;
    for (let i = 0; i < newRecords.length; i += BATCH) {
      const batch = newRecords.slice(i, i + BATCH);
      await base44.asServiceRole.entities.CongressTrade.bulkCreate(batch);
      inserted += batch.length;
    }

    return Response.json({
      total_fetched: all.length,
      house: house.length,
      senate: senate.length,
      inserted,
      skipped: all.length - newRecords.length,
      errors: {
        house: houseRecords.status === "rejected" ? houseRecords.reason?.message : null,
        senate: senateRecords.status === "rejected" ? senateRecords.reason?.message : null,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});