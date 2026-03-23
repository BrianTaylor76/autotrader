export const SP500_SYMBOLS = [
  "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","BRK.B","JPM","V",
  "UNH","XOM","JNJ","WMT","MA","PG","HD","CVX","MRK","ABBV",
  "PEP","KO","AVGO","COST","TMO","ACN","MCD","BAC","NFLX","LLY",
  "CSCO","ABT","DHR","TXN","NEE","PM","RTX","HON","LOW","UPS",
  "SCHW","SPGI","BMY","AMGN","GS","ELV","BLK","DE","SYK","ISRG"
];

export const NASDAQ100_SYMBOLS = [
  "QQQ","AAPL","MSFT","NVDA","AMZN","META","GOOGL","TSLA","AVGO","ASML",
  "ADBE","COST","AMD","NFLX","QCOM","TMUS","INTC","TXN","INTU","AMAT",
  "CSCO","BKNG","HON","SBUX","GILD","ADI","REGN","VRTX","MDLZ","LRCX",
  "MU","PANW","SNPS","CDNS","KLAC","MELI","FTNT","ORLY","MNST","CTAS",
  "NXPI","PAYX","CHTR","ADP","ROST","FAST","DXCM","IDXX","ILMN","BIIB"
];

export const ETF_SYMBOLS = [
  "SPY","QQQ","IWM","DIA","VTI","VOO","GLD","SLV","TLT","HYG",
  "XLF","XLK","XLE","XLV","ARKK","ARKG","ARKW","SCHD","VYM","JEPI"
];

export const CRYPTO_SYMBOLS = [
  "BTCUSD","ETHUSD","SOLUSD","AVAXUSD","MATICUSD","LINKUSD","UNIUSD","AAVEUSD","DOTUSD","ADAUSD"
];

export const SMALLCAP_SYMBOLS = [
  "GME","AMC","PLTR","SOFI","RIVN","LCID","HOOD","SPCE","NKLA","WKHS",
  "BLNK","CHPT","EVGO","FCEL","GOEV","PTRA","CLOV","SNDL","TLRY","BYND"
];

export const COMPANY_NAMES = {
  AAPL:"Apple Inc",MSFT:"Microsoft Corp",NVDA:"NVIDIA Corp",GOOGL:"Alphabet Inc",AMZN:"Amazon.com",
  META:"Meta Platforms",TSLA:"Tesla Inc","BRK.B":"Berkshire Hathaway",JPM:"JPMorgan Chase",V:"Visa Inc",
  UNH:"UnitedHealth Group",XOM:"Exxon Mobil",JNJ:"Johnson & Johnson",WMT:"Walmart",MA:"Mastercard",
  PG:"Procter & Gamble",HD:"Home Depot",CVX:"Chevron",MRK:"Merck & Co",ABBV:"AbbVie",
  PEP:"PepsiCo",KO:"Coca-Cola",AVGO:"Broadcom",COST:"Costco",TMO:"Thermo Fisher",
  ACN:"Accenture",MCD:"McDonald's",BAC:"Bank of America",NFLX:"Netflix",LLY:"Eli Lilly",
  CSCO:"Cisco Systems",ABT:"Abbott Labs",DHR:"Danaher",TXN:"Texas Instruments",NEE:"NextEra Energy",
  PM:"Philip Morris",RTX:"RTX Corp",HON:"Honeywell",LOW:"Lowe's",UPS:"United Parcel Service",
  SCHW:"Charles Schwab",SPGI:"S&P Global",BMY:"Bristol-Myers Squibb",AMGN:"Amgen",GS:"Goldman Sachs",
  ELV:"Elevance Health",BLK:"BlackRock",DE:"Deere & Company",SYK:"Stryker",ISRG:"Intuitive Surgical",
  QQQ:"Invesco QQQ Trust",AMD:"Advanced Micro Devices",ASML:"ASML Holding",ADBE:"Adobe",INTU:"Intuit",
  AMAT:"Applied Materials",BKNG:"Booking Holdings",SBUX:"Starbucks",GILD:"Gilead Sciences",ADI:"Analog Devices",
  REGN:"Regeneron",VRTX:"Vertex Pharma",MDLZ:"Mondelez",LRCX:"Lam Research",MU:"Micron Technology",
  PANW:"Palo Alto Networks",SNPS:"Synopsys",CDNS:"Cadence Design",KLAC:"KLA Corp",MELI:"MercadoLibre",
  FTNT:"Fortinet",ORLY:"O'Reilly Auto",MNST:"Monster Beverage",CTAS:"Cintas",NXPI:"NXP Semiconductors",
  PAYX:"Paychex",CHTR:"Charter Communications",ADP:"Automatic Data Processing",ROST:"Ross Stores",
  FAST:"Fastenal",DXCM:"Dexcom",IDXX:"IDEXX Labs",ILMN:"Illumina",BIIB:"Biogen",
  SPY:"SPDR S&P 500 ETF",IWM:"iShares Russell 2000",DIA:"SPDR Dow Jones ETF",VTI:"Vanguard Total Market",
  VOO:"Vanguard S&P 500",GLD:"SPDR Gold Shares",SLV:"iShares Silver Trust",TLT:"iShares 20yr Treasury",
  HYG:"iShares High Yield Bond",XLF:"Financial SPDR",XLK:"Technology SPDR",XLE:"Energy SPDR",
  XLV:"Health Care SPDR",ARKK:"ARK Innovation ETF",ARKG:"ARK Genomic ETF",ARKW:"ARK Next Gen Internet",
  SCHD:"Schwab US Dividend",VYM:"Vanguard High Dividend",JEPI:"JPMorgan Equity Premium",
  BTCUSD:"Bitcoin",ETHUSD:"Ethereum",SOLUSD:"Solana",AVAXUSD:"Avalanche",MATICUSD:"Polygon",
  LINKUSD:"Chainlink",UNIUSD:"Uniswap",AAVEUSD:"Aave",DOTUSD:"Polkadot",ADAUSD:"Cardano",
  GME:"GameStop",AMC:"AMC Entertainment",PLTR:"Palantir Technologies",SOFI:"SoFi Technologies",
  RIVN:"Rivian Automotive",LCID:"Lucid Group",HOOD:"Robinhood Markets",SPCE:"Virgin Galactic",
  NKLA:"Nikola Corp",WKHS:"Workhorse Group",BLNK:"Blink Charging",CHPT:"ChargePoint",
  EVGO:"EVgo Inc",FCEL:"FuelCell Energy",GOEV:"Canoo Inc",PTRA:"Proterra",
  CLOV:"Clover Health",SNDL:"SNDL Inc",TLRY:"Tilray Brands",BYND:"Beyond Meat",
};

export function getCompanyName(symbol) {
  return COMPANY_NAMES[symbol] || symbol;
}

export function getAllStocks() {
  const sp500 = SP500_SYMBOLS.map(s => ({ symbol: s, name: getCompanyName(s), market: "S&P 500" }));
  const nasdaq = NASDAQ100_SYMBOLS.filter(s => !SP500_SYMBOLS.includes(s)).map(s => ({ symbol: s, name: getCompanyName(s), market: "NASDAQ 100" }));
  const etfs = ETF_SYMBOLS.map(s => ({ symbol: s, name: getCompanyName(s), market: "ETF" }));
  const crypto = CRYPTO_SYMBOLS.map(s => ({ symbol: s, name: getCompanyName(s), market: "Crypto" }));
  const smallcap = SMALLCAP_SYMBOLS.map(s => ({ symbol: s, name: getCompanyName(s), market: "Small Cap" }));
  return [...sp500, ...nasdaq, ...etfs, ...crypto, ...smallcap];
}