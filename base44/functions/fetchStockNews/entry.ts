import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const FINNHUB_KEY = Deno.env.get("FINNHUB_API_KEY");

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { symbol } = await req.json();
    if (!symbol) return Response.json({ news: [] });

    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

    const news = [];

    // Finnhub
    try {
      const finnhubUrl = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${thirtyDaysAgo}&to=${today}&token=${FINNHUB_KEY}`;
      const res = await fetch(finnhubUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          data.slice(0, 10).forEach(item => {
            news.push({
              headline: item.headline || "",
              source: item.source || "Finnhub",
              url: item.url || "#",
              datetime: item.datetime,
              summary: "",
            });
          });
        }
      }
    } catch (e) {
      console.error("Finnhub error:", e.message);
    }

    // Yahoo Finance RSS
    if (news.length < 10 && !symbol.includes("USD")) {
      try {
        const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`;
        const rssRes = await fetch(rssUrl);
        if (rssRes.ok) {
          const rssText = await rssRes.text();
          const items = rssText.match(/<item>([\s\S]*?)<\/item>/g) || [];
          items.slice(0, 5).forEach(item => {
            const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || "";
            const link = item.match(/<link>(.*?)<\/link>/)?.[1] || "#";
            const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
            if (title && !news.find(n => n.headline === title)) {
              news.push({ headline: title, source: "Yahoo Finance", url: link, datetime: pubDate ? new Date(pubDate).getTime() / 1000 : null, summary: "" });
            }
          });
        }
      } catch (e) {
        console.error("Yahoo RSS error:", e.message);
      }
    }

    // Deduplicate and return top 10
    const seen = new Set();
    const unique = news.filter(n => {
      if (seen.has(n.headline)) return false;
      seen.add(n.headline);
      return true;
    }).slice(0, 10);

    return Response.json({ news: unique });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});