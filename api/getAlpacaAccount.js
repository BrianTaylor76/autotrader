// api/getAlpacaAccount.js
// Fetches real account balance from Alpaca paper or live account

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Check trading mode from request body or default to paper
    const { mode = 'paper' } = req.body || req.query || {};

    const isLive = mode === 'live';
    const apiKey = isLive ? process.env.ALPACA_LIVE_API_KEY : process.env.ALPACA_API_KEY;
    const apiSecret = isLive ? process.env.ALPACA_LIVE_API_SECRET : process.env.ALPACA_API_SECRET;
    const baseUrl = isLive ? 'https://api.alpaca.markets' : 'https://paper-api.alpaca.markets';

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Alpaca API keys not configured' });
    }

    const headers = {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': apiSecret,
    };

    // Fetch account info and positions in parallel
    const [accountRes, positionsRes] = await Promise.all([
      fetch(`${baseUrl}/v2/account`, { headers, signal: AbortSignal.timeout(8000) }),
      fetch(`${baseUrl}/v2/positions`, { headers, signal: AbortSignal.timeout(8000) }),
    ]);

    if (!accountRes.ok) {
      const err = await accountRes.text();
      return res.status(accountRes.status).json({ error: `Alpaca account error: ${err}` });
    }

    const account = await accountRes.json();
    const positions = positionsRes.ok ? await positionsRes.json() : [];

    // Calculate today's P&L from positions
    const unrealizedPL = positions.reduce((sum, p) => sum + parseFloat(p.unrealized_pl || 0), 0);
    const portfolioValue = parseFloat(account.portfolio_value || account.equity || 0);
    const buyingPower = parseFloat(account.buying_power || 0);
    const cash = parseFloat(account.cash || 0);

    return res.status(200).json({
      portfolio_value: portfolioValue,
      buying_power: buyingPower,
      cash,
      unrealized_pl: unrealizedPL,
      positions_count: positions.length,
      positions: positions.map(p => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty),
        avg_entry_price: parseFloat(p.avg_entry_price),
        current_price: parseFloat(p.current_price || 0),
        market_value: parseFloat(p.market_value || 0),
        unrealized_pl: parseFloat(p.unrealized_pl || 0),
        unrealized_plpc: parseFloat(p.unrealized_plpc || 0),
        side: p.side,
      })),
      mode,
      account_status: account.status,
    });

  } catch (error) {
    console.error('getAlpacaAccount error:', error);
    return res.status(500).json({ error: error.message });
  }
}
