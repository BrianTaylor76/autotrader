import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Hardcoded party lookup for most active congressional traders
const PARTY_LOOKUP = {
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
  "Tommy Tubervill": "Republican",
  "Nancy Pelosi": "Democrat", "Ro Khanna": "Democrat", "Raja Krishnamoorthi": "Democrat",
  "Lois Frankel": "Democrat", "Josh Gottheimer": "Democrat", "Seth Moulton": "Democrat",
  "Suzan DelBene": "Democrat", "Mikie Sherrill": "Democrat", "Abigail Spanberger": "Democrat",
  "Kurt Schrader": "Democrat", "Adam Schiff": "Democrat", "Eric Swalwell": "Democrat",
  "Kyrsten Sinema": "Democrat", "Mark Warner": "Democrat", "Sheldon Whitehouse": "Democrat",
  "Jon Ossoff": "Democrat", "Raphael Warnock": "Democrat", "John Hickenlooper": "Democrat",
  "Michael Bennet": "Democrat", "Jacky Rosen": "Democrat", "Catherine Cortez Masto": "Democrat",
  "Chris Murphy": "Democrat", "Richard Blumenthal": "Democrat", "Elizabeth Warren": "Democrat",
  "Ed Markey": "Democrat", "Daniel Goldman": "Democrat", "Alexandria Ocasio-Cortez": "Democrat",
  "Bernie Sanders": "Independent", "Angus King": "Independent",
};

function inferParty(name) {
  if (!name) return "Unknown";
  const direct = PARTY_LOOKUP[name.trim()];
  if (direct) return direct;
  // Try last name match
  const lastName = name.trim().split(/\s+/).pop();
  for (const [key, party] of Object.entries(PARTY_LOOKUP)) {
    if (key.endsWith(lastName) && lastName.length > 3) return party;
  }
  return "Unknown";
}

function normalizeTransaction(raw) {
  if (!raw) return "buy";
  const lower = raw.toLowerCase().replace(/[\s_\-()]+/g, '');
  if (lower.includes('purchase') || lower.includes('buy') || lower.includes('bought')) return "buy";
  if (lower.includes('sale') || lower.includes('sell') || lower.includes('sold')) return "sell";
  if (lower.includes('exchange')) return "exchange";
  return "buy";
}

function inferChamber(name, raw) {
  if (raw?.Chamber) return raw.Chamber === 'Senate' ? 'Senate' : 'House';
  // Senators tend to have title Sen., Representatives have Rep.
  if (/\bsen\b/i.test(name)) return 'Senate';
  return 'House';
}

async function fetchQuiverQuantitative() {
  const url = 'https://api.quiverquant.com/beta/live/congresstrading';
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; AutoTrader/1.0)',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Quiver API error: ${res.status} ${await res.text().catch(() => '')}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const rawRecords = await fetchQuiverQuantitative();

    if (rawRecords.length === 0) {
      return Response.json({ total_fetched: 0, inserted: 0, skipped: 0, message: 'No records from Quiver API' });
    }

    // Map Quiver fields to CongressTrade entity schema
    // Quiver fields: Name, Ticker, Transaction, Amount, Date, ReportDate, House/Senate, State, Party
    const mapped = rawRecords
      .filter(r => r.Ticker && r.Ticker.trim() && r.Ticker !== '--' && r.Name)
      .map(r => {
        const name = (r.Name || '').trim();
        const chamber = r.Chamber === 'Senate' ? 'Senate' : 'House';
        const party = r.Party
          ? (r.Party.includes('R') ? 'Republican' : r.Party.includes('D') ? 'Democrat' : 'Unknown')
          : inferParty(name);
        const transactionDate = r.Date || r.TransactionDate || '';
        const disclosureDate = r.ReportDate || r.FiledDate || transactionDate;
        return {
          representative: name,
          chamber,
          state: r.State || '',
          party,
          symbol: r.Ticker.toUpperCase().trim(),
          transaction: normalizeTransaction(r.Transaction),
          amount_range: r.Amount || r.Range || 'Undisclosed',
          disclosure_date: disclosureDate,
          transaction_date: transactionDate,
          description: r.Description || r.Comment || '',
          source_id: `quiver-${disclosureDate}-${name}-${r.Ticker}-${transactionDate}`,
        };
      });

    // Deduplicate against existing records
    const existing = await base44.asServiceRole.entities.CongressTrade.list('-disclosure_date', 5000);
    const existingIds = new Set(existing.map(e => e.source_id).filter(Boolean));
    const newRecords = mapped.filter(r => r.source_id && !existingIds.has(r.source_id));

    // Insert in batches
    let inserted = 0;
    const BATCH = 50;
    for (let i = 0; i < newRecords.length; i += BATCH) {
      await base44.asServiceRole.entities.CongressTrade.bulkCreate(newRecords.slice(i, i + BATCH));
      inserted += Math.min(BATCH, newRecords.length - i);
    }

    return Response.json({
      total_fetched: rawRecords.length,
      mapped: mapped.length,
      inserted,
      skipped: mapped.length - newRecords.length,
      sample_raw: rawRecords.slice(0, 3),
      sample_mapped: newRecords.slice(0, 3),
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});