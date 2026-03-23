import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Hardcoded party lookup for most active congressional traders
const PARTY_LOOKUP = {
  // Republicans
  "Tommy Tuberville": "Republican", "Markwayne Mullin": "Republican", "Bill Hagerty": "Republican",
  "John Boozman": "Republican", "Roger Marshall": "Republican", "Rand Paul": "Republican",
  "Mike Crapo": "Republican", "Kevin Hern": "Republican", "Pat Fallon": "Republican",
  "David Rouzer": "Republican", "Morgan Griffith": "Republican", "Michael McCaul": "Republican",
  "Pete Sessions": "Republican", "Greg Gianforte": "Republican", "Marjorie Taylor Greene": "Republican",
  "Jim Banks": "Republican", "Rick Scott": "Republican", "Marco Rubio": "Republican",
  "Ron Johnson": "Republican", "Mitch McConnell": "Republican", "Mitt Romney": "Republican",
  "Dan Crenshaw": "Republican", "Chip Roy": "Republican", "Barry Moore": "Republican",
  "Jeff Van Drew": "Republican", "Carlos Gimenez": "Republican", "Mario Diaz-Balart": "Republican",
  "Bill Foster": "Republican", "Mike Kelly": "Republican", "Glenn Thompson": "Republican",
  "John Joyce": "Republican", "Lloyd Smucker": "Republican", "Scott Perry": "Republican",
  "Brad Wenstrup": "Republican", "Steve Chabot": "Republican", "Warren Davidson": "Republican",
  "Bob Gibbs": "Republican", "Jim Jordan": "Republican", "Troy Balderson": "Republican",
  "David McKinley": "Republican", "Alex Mooney": "Republican", "Carol Miller": "Republican",
  "Tom Cole": "Republican", "Tom Cotton": "Republican", "John Cornyn": "Republican",
  "Mike Rounds": "Republican", "Shelley Moore Capito": "Republican", "Ted Cruz": "Republican",
  "Thom Tillis": "Republican", "Richard Burr": "Republican", "Rob Portman": "Republican",
  // Democrats
  "Nancy Pelosi": "Democrat", "Ro Khanna": "Democrat", "Raja Krishnamoorthi": "Democrat",
  "Lois Frankel": "Democrat", "Josh Gottheimer": "Democrat", "Seth Moulton": "Democrat",
  "Suzan DelBene": "Democrat", "Mikie Sherrill": "Democrat", "Abigail Spanberger": "Democrat",
  "Kurt Schrader": "Democrat", "Adam Schiff": "Democrat", "Eric Swalwell": "Democrat",
  "Kyrsten Sinema": "Democrat", "Mark Warner": "Democrat", "Sheldon Whitehouse": "Democrat",
  "Jon Ossoff": "Democrat", "Raphael Warnock": "Democrat", "John Hickenlooper": "Democrat",
  "Michael Bennet": "Democrat", "Jacky Rosen": "Democrat", "Catherine Cortez Masto": "Democrat",
  "Chris Murphy": "Democrat", "Richard Blumenthal": "Democrat", "Elizabeth Warren": "Democrat",
  "Ed Markey": "Democrat", "Bernie Sanders": "Independent", "Angus King": "Independent",
};

function inferParty(name) {
  if (!name) return "Unknown";
  const lookup = PARTY_LOOKUP[name.trim()];
  if (lookup) return lookup;
  // Try partial match
  for (const [key, party] of Object.entries(PARTY_LOOKUP)) {
    if (name.includes(key.split(' ').pop())) return party; // last name match
  }
  return "Unknown";
}

function normalizeTransaction(raw) {
  if (!raw) return "buy";
  const lower = raw.toLowerCase().replace(/[\s_()-]+/g, ' ').trim();
  if (lower.includes('purchase') || lower.includes('buy') || lower.includes('bought')) return "buy";
  if (lower.includes('sale') || lower.includes('sell') || lower.includes('sold')) return "sell";
  if (lower.includes('exchange')) return "exchange";
  return "buy";
}

function normalizeAmount(amt) {
  if (!amt) return "";
  return String(amt).trim();
}

async function fetchHouse() {
  const res = await fetch("https://housestockwatcher.com/api/transactions_json", {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`House API error: ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((r) => ({
    representative: r.representative || r.name || "",
    chamber: "House",
    state: r.state || "",
    party: r.party || inferParty(r.representative),
    symbol: (r.ticker || r.symbol || "").toUpperCase().trim(),
    transaction: normalizeTransaction(r.type || r.transaction_type || r.transaction),
    amount_range: normalizeAmount(r.amount),
    disclosure_date: r.disclosure_date || r.filed_at_date || "",
    transaction_date: r.transaction_date || r.disclosure_date || "",
    description: r.asset_description || r.description || "",
    source_id: `house-${r.disclosure_date}-${r.representative}-${r.ticker || r.symbol}-${r.transaction_date}`,
  })).filter(r => r.symbol && r.symbol !== "--" && r.representative);
}

async function fetchSenate() {
  const res = await fetch("https://senatestockwatcher.com/api/transactions_json", {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Senate API error: ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((r) => ({
    representative: r.senator || r.name || r.representative || "",
    chamber: "Senate",
    state: r.state || "",
    party: r.party || inferParty(r.senator || r.name),
    symbol: (r.ticker || r.symbol || "").toUpperCase().trim(),
    transaction: normalizeTransaction(r.type || r.transaction_type || r.transaction),
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