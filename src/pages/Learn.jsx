import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, PlayCircle, BookOpen } from "lucide-react";

const CATEGORIES = [
  {
    title: "Moving Average Strategies",
    description: "Understand the technical signals powering your AutoTrader bot",
    videos: [
      { title: "Moving Averages Explained for Beginners", channel: "Rayner Teo", url: "https://www.youtube.com/results?search_query=Moving+Averages+Explained+for+Beginners+Rayner+Teo", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "The 9 and 21 EMA Strategy", channel: "Trade Brigade", url: "https://www.youtube.com/results?search_query=9+and+21+EMA+Strategy+Trade+Brigade", level: "Intermediate", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "Golden Cross vs Death Cross Explained", channel: "Investopedia", url: "https://www.youtube.com/results?search_query=Golden+Cross+Death+Cross+Investopedia", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "How to Use Moving Averages to Buy Stocks", channel: "Cameron Stewart CFA", url: "https://www.youtube.com/results?search_query=How+to+Use+Moving+Averages+to+Buy+Stocks+Cameron+Stewart+CFA", level: "Intermediate", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
    ],
  },
  {
    title: "Reading Market Sentiment",
    description: "Learn how crowd psychology moves markets",
    videos: [
      { title: "What is Market Sentiment?", channel: "The Plain Bagel", url: "https://www.youtube.com/results?search_query=What+is+Market+Sentiment+The+Plain+Bagel", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "How to Use StockTwits for Trading", channel: "Humbled Trader", url: "https://www.youtube.com/results?search_query=How+to+Use+StockTwits+for+Trading+Humbled+Trader", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "Fear and Greed Index Explained", channel: "Andrei Jikh", url: "https://www.youtube.com/results?search_query=Fear+and+Greed+Index+Explained+Andrei+Jikh", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "Sentiment Analysis in Trading", channel: "Trading 212", url: "https://www.youtube.com/results?search_query=Sentiment+Analysis+in+Trading+212", level: "Intermediate", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
    ],
  },
  {
    title: "How Congress Trading Works",
    description: "Understand how congressional disclosures can signal market moves",
    videos: [
      { title: "How Politicians Trade Stocks (STOCK Act Explained)", channel: "Logically Answered", url: "https://www.youtube.com/results?search_query=How+Politicians+Trade+Stocks+STOCK+Act+Logically+Answered", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "Nancy Pelosi Stock Trades Explained", channel: "Mark Tilbury", url: "https://www.youtube.com/results?search_query=Nancy+Pelosi+Stock+Trades+Explained+Mark+Tilbury", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "Can You Beat the Market by Following Congress?", channel: "The Plain Bagel", url: "https://www.youtube.com/results?search_query=Beat+the+Market+Following+Congress+The+Plain+Bagel", level: "Intermediate", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "Congress Stock Trading Controversy", channel: "CNBC", url: "https://www.youtube.com/results?search_query=Congress+Stock+Trading+Controversy+CNBC", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
    ],
  },
  {
    title: "Understanding ETFs (SPY & QQQ)",
    description: "Master the two assets your bot trades most",
    videos: [
      { title: "ETFs Explained for Beginners", channel: "NerdWallet", url: "https://www.youtube.com/results?search_query=ETFs+Explained+for+Beginners+NerdWallet", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "SPY vs QQQ — Which ETF is Better?", channel: "Humphrey Yang", url: "https://www.youtube.com/results?search_query=SPY+vs+QQQ+Which+ETF+Humphrey+Yang", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "How SPY Tracks the S&P 500", channel: "Patrick Boyle", url: "https://www.youtube.com/results?search_query=How+SPY+Tracks+SP500+Patrick+Boyle", level: "Intermediate", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "QQQ ETF Full Breakdown", channel: "Jarrad Morrow", url: "https://www.youtube.com/results?search_query=QQQ+ETF+Full+Breakdown+Jarrad+Morrow", level: "Intermediate", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
    ],
  },
  {
    title: "Risk Management Basics",
    description: "Protect your capital — the most important skill in trading",
    videos: [
      { title: "Risk Management in Trading Explained", channel: "Rayner Teo", url: "https://www.youtube.com/results?search_query=Risk+Management+Trading+Explained+Rayner+Teo", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "Position Sizing Strategies", channel: "Trading 212", url: "https://www.youtube.com/results?search_query=Position+Sizing+Strategies+Trading+212", level: "Intermediate", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "How to Set Stop Losses", channel: "Warrior Trading", url: "https://www.youtube.com/results?search_query=How+to+Set+Stop+Losses+Warrior+Trading", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "The 1% Risk Rule Explained", channel: "Humbled Trader", url: "https://www.youtube.com/results?search_query=1+Percent+Risk+Rule+Explained+Humbled+Trader", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
    ],
  },
  {
    title: "Technical Analysis Fundamentals",
    description: "Read price charts like a professional trader",
    videos: [
      { title: "Technical Analysis for Beginners", channel: "Trading 212", url: "https://www.youtube.com/results?search_query=Technical+Analysis+for+Beginners+Trading+212", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "How to Read Stock Charts", channel: "Investopedia", url: "https://www.youtube.com/results?search_query=How+to+Read+Stock+Charts+Investopedia", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "Support and Resistance Levels Explained", channel: "Rayner Teo", url: "https://www.youtube.com/results?search_query=Support+Resistance+Levels+Explained+Rayner+Teo", level: "Intermediate", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "Candlestick Patterns Cheat Sheet", channel: "Trading Fraternity", url: "https://www.youtube.com/results?search_query=Candlestick+Patterns+Cheat+Sheet+Trading+Fraternity", level: "Intermediate", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
    ],
  },
  {
    title: "Understanding Market Cycles",
    description: "Know where the market is in its cycle before you trade",
    videos: [
      { title: "Market Cycles Explained", channel: "Andrei Jikh", url: "https://www.youtube.com/results?search_query=Market+Cycles+Explained+Andrei+Jikh", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "Bull vs Bear Markets", channel: "The Plain Bagel", url: "https://www.youtube.com/results?search_query=Bull+vs+Bear+Markets+The+Plain+Bagel", level: "Beginner", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "How the Fed Affects the Stock Market", channel: "Humphrey Yang", url: "https://www.youtube.com/results?search_query=How+the+Fed+Affects+Stock+Market+Humphrey+Yang", level: "Intermediate", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "Economic Indicators Every Trader Should Know", channel: "Patrick Boyle", url: "https://www.youtube.com/results?search_query=Economic+Indicators+Every+Trader+Should+Know+Patrick+Boyle", level: "Advanced", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
    ],
  },
  {
    title: "AI and Algorithmic Trading",
    description: "Understand the technology behind your bot",
    videos: [
      { title: "Algorithmic Trading Explained", channel: "Bybit Learn", url: "https://www.youtube.com/results?search_query=Algorithmic+Trading+Explained+Bybit+Learn", level: "Intermediate", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "How AI is Used in Stock Trading", channel: "Two Minute Papers", url: "https://www.youtube.com/results?search_query=How+AI+is+Used+in+Stock+Trading+Two+Minute+Papers", level: "Intermediate", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "Building a Trading Bot — What You Need to Know", channel: "Coding Jesus", url: "https://www.youtube.com/results?search_query=Building+Trading+Bot+What+You+Need+to+Know+Coding+Jesus", level: "Advanced", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
      { title: "Quantitative Trading for Beginners", channel: "Quantopian", url: "https://www.youtube.com/results?search_query=Quantitative+Trading+for+Beginners+Quantopian", level: "Advanced", thumbnail: "https://img.youtube.com/vi/4R2CDbw4g88/hqdefault.jpg" },
    ],
  },
];

const LEVEL_COLORS = {
  Beginner: "bg-primary/15 text-primary border-primary/25",
  Intermediate: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  Advanced: "bg-destructive/15 text-destructive border-destructive/25",
};

function VideoCard({ video }) {
  return (
    <div className="bg-secondary/30 border border-border rounded-xl overflow-hidden hover:border-primary/40 transition-all group flex flex-col">
      <div className="relative aspect-video bg-secondary flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
        <PlayCircle className="w-12 h-12 text-primary/40 group-hover:text-primary/70 transition-colors z-10" />
        <div className="absolute bottom-2 right-2">
          <Badge className={`text-[10px] border ${LEVEL_COLORS[video.level]}`}>{video.level}</Badge>
        </div>
      </div>
      <div className="p-4 flex flex-col flex-1 gap-2">
        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{video.title}</p>
        <p className="text-xs text-muted-foreground">{video.channel}</p>
        <div className="mt-auto pt-2">
          <Button
            onClick={() => window.open(video.url, "_blank")}
            size="sm"
            className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 font-medium text-xs h-8"
            variant="ghost"
          >
            <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
            Watch on YouTube
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Learn() {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("All");

  const levels = ["All", "Beginner", "Intermediate", "Advanced"];

  const filteredCategories = useMemo(() => {
    const q = search.toLowerCase();
    return CATEGORIES
      .map((cat) => ({
        ...cat,
        videos: cat.videos.filter((v) => {
          const matchesSearch = !q || v.title.toLowerCase().includes(q) || cat.title.toLowerCase().includes(q) || v.channel.toLowerCase().includes(q);
          const matchesLevel = levelFilter === "All" || v.level === levelFilter;
          return matchesSearch && matchesLevel;
        }),
      }))
      .filter((cat) => cat.videos.length > 0);
  }, [search, levelFilter]);

  const totalVideos = filteredCategories.reduce((sum, c) => sum + c.videos.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <BookOpen className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Learning Center</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Curated YouTube videos to help you understand how AutoTrader works and master trading concepts.
        </p>
      </div>

      {/* Search + Filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search videos by title, category, or channel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {levels.map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                levelFilter === lvl
                  ? lvl === "All"
                    ? "bg-primary text-primary-foreground border-primary"
                    : `border ${LEVEL_COLORS[lvl]} bg-opacity-100`
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              {lvl}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-auto">{totalVideos} video{totalVideos !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Categories */}
      {filteredCategories.length === 0 ? (
        <Card className="bg-card border-border p-12 text-center">
          <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No videos found for your search.</p>
        </Card>
      ) : (
        <div className="space-y-10">
          {filteredCategories.map((cat) => (
            <section key={cat.title}>
              <div className="mb-4">
                <h3 className="text-base font-semibold text-foreground">{cat.title}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{cat.description}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {cat.videos.map((video) => (
                  <VideoCard key={video.title} video={video} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}