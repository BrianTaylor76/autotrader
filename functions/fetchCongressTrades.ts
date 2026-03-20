import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

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
    party: r.party || "Unknown",
    symbol: (r.ticker || r.symbol || "").toUpperCase().trim(),
    transaction: normalizeTransaction(r.type || r.transaction_type),
    amount_range: normalizeAmount(r.amount),
    disclosure_date: r.disclosure_date || r.filed_at_date || "",
    transaction_date: r.transaction_date || r.disclosure_date || "",
    description: r.asset_description || r.description || "",
    source_id: `house-${r.disclosure_date}-${r.representative}-${r.ticker || r.symbol}-${r.transaction_date}`,
  })).filter(r => r.symbol && r.symbol !== "--" && r.symbol.length <= 10 && r.representative);
}

async function fetchSenate() {
  const res = await fetch("https://senatestockwatcher.com/api/transactions_json");
  if (!res.ok) throw new Error(`Senate API error: ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((r) => ({
    representative: r.senator || r.name || r.representative || "",
    chamber: "Senate",
    state: r.state || "",
    party: r.party || "Unknown",
    symbol: (r.ticker || r.symbol || "").toUpperCase().trim(),
    transaction: normalizeTransaction(r.type || r.transaction_type),
    amount_range: normalizeAmount(r.amount),
    disclosure_date: r.disclosure_date || r.filed_at_date || "",
    transaction_date: r.transaction_date || r.disclosure_date || "",
    description: r.asset_description || r.description || "",
    source_id: `senate-${r.disclosure_date}-${(r.senator || r.name)}-${r.ticker || r.symbol}-${r.transaction_date}`,
  })).filter(r => r.symbol && r.symbol !== "--" && r.symbol.length <= 10 && r.representative);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch full historical datasets from both APIs (no date filtering)
    const [houseResult, senateResult] = await Promise.allSettled([fetchHouse(), fetchSenate()]);

    const house = houseResult.status === "fulfilled" ? houseResult.value : [];
    const senate = senateResult.status === "fulfilled" ? senateResult.value : [];
    const all = [...house, ...senate];

    // Load all existing source_ids in batches to avoid hitting limits
    const existingIds = new Set();
    let offset = 0;
    const LOAD_BATCH = 2000;
    while (true) {
      const batch = await base44.asServiceRole.entities.CongressTrade.list("-disclosure_date", LOAD_BATCH);
      if (!batch.length) break;
      batch.forEach(e => { if (e.source_id) existingIds.add(e.source_id); });
      if (batch.length < LOAD_BATCH) break;
      offset += LOAD_BATCH;
      // Safety cap — avoid infinite loop if entity has huge dataset
      if (offset >= 50000) break;
    }

    const newRecords = all.filter(r => r.source_id && !existingIds.has(r.source_id));

    // Insert in batches of 100
    let inserted = 0;
    const BATCH = 100;
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
        house: houseResult.status === "rejected" ? houseResult.reason?.message : null,
        senate: senateResult.status === "rejected" ? senateResult.reason?.message : null,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});