// api/fetchStockNews.js
// Fetches stock news from Finnhub + Yahoo Finance RSS

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { symbol } = req.body || req.query || {};
    if (!symbol) return res.status(200).json({ news: [] });

    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const news = [];

    // Finnhub
    try {
      const finnhubUrl = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${thirtyDaysAgo}&to=${today}&token=${FINNHUB_KEY}`;
      const finnRes = await fetch(finnhubUrl);
      if (finnRes.ok) {
        const data = await finnRes.json();
        if (Array.isArray(data)) {
          data.slice(0, 10).forEach(item => {
            news.push({
              headline: item.headline || '',
              source: item.source || 'Finnhub',
              url: item.url || '#',
              datetime: item.datetime,
              summary: '',
            });
          });
        }
      }
    } catch (e) {
      console.error('Finnhub error:', e.message);
    }

    // Yahoo Finance RSS fallback
    if (news.length < 5 && !symbol.includes('USD')) {
      try {
        const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`;
        const rssRes = await fetch(rssUrl);
        if (rssRes.ok) {
          const rssText = await rssRes.text();
          const items = rssText.match(/<item>([\s\S]*?)<\/item>/g) || [];
          items.slice(0, 5).forEach(item => {
            const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '';
            const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '#';
            const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
            if (title && !news.find(n => n.headline === title)) {
              news.push({
                headline: title,
                source: 'Yahoo Finance',
                url: link,
                datetime: pubDate ? new Date(pubDate).getTime() / 1000 : null,
                summary: '',
              });
            }
          });
        }
      } catch (e) {
        console.error('Yahoo RSS error:', e.message);
      }
    }

    const seen = new Set();
    const unique = news.filter(n => {
      if (seen.has(n.headline)) return false;
      seen.add(n.headline);
      return true;
    }).slice(0, 10);

    return res.status(200).json({ news: unique });
  } catch (error) {
    console.error('fetchStockNews error:', error);
    return res.status(500).json({ error: error.message });
  }
}
