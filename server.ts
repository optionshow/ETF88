import express from "express";
import path from "path";
import { execSync } from "child_process";
import * as cheerio from "cheerio";
import cron from "node-cron";
import iconv from "iconv-lite";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

export function normalizeDateString(str: string): string {
  if (!str) return "";
  const s = String(str).trim();
  if (s.includes("GMT") || s.includes("Taiwan") || s.includes("T00:00") || (s.length > 15 && !isNaN(Date.parse(s)))) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}/${m}/${day}`;
    }
  }
  const clean = s.replace(/-/g, "/");
  const parts = clean.split("/");
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, "0");
    const day = parts[2].padStart(2, "0");
    return `${y}/${m}/${day}`;
  }
  return clean;
}

// Helper function to execute complete live fund scraping across all 5 funds
async function executeAutoScrapeAll() {
  const nowStr = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  console.log(`[Scraper Engine] Executing scheduled live fund scraping at ${nowStr}...`);
  const results: any[] = [];
  
  try {
    const ez981 = await fetchEzMoneyFund("49YTW");
    if (ez981) results.push(ez981);
  } catch (e) {
    console.error("[Scraper Engine] 00981A scrape error:", e);
  }

  try {
    const ez403 = await fetchEzMoneyFund("63YTW");
    if (ez403) results.push(ez403);
  } catch (e) {
    console.error("[Scraper Engine] 00403A scrape error:", e);
  }

  try {
    const cp982 = await fetchCapitalFund("399");
    if (cp982) results.push(cp982);
  } catch (e) {
    console.error("[Scraper Engine] 00982A scrape error:", e);
  }

  try {
    const cp992 = await fetchCapitalFund("500");
    if (cp992) results.push(cp992);
  } catch (e) {
    console.error("[Scraper Engine] 00992A scrape error:", e);
  }

  try {
    const kgi407 = await fetchKgiFund("J024");
    if (kgi407) results.push(kgi407);
  } catch (e) {
    console.error("[Scraper Engine] 00407A scrape error:", e);
  }

  console.log(`[Scraper Engine] Completed auto-scraping ${results.length} funds.`);
  return results;
}

// Automated twice-daily scheduled task: 08:00 and 18:00 (Asia/Taipei)
const TRACKED_CODES = ["00981A.TW", "00403A.TW", "00982A.TW", "00992A.TW", "00407A.TW"];

cron.schedule("0 8,18 * * *", async () => {
  await executeAutoScrapeAll();
}, {
  timezone: "Asia/Taipei"
});

// API: Batch auto-scrape all 5 primary funds
app.get("/api/scrape-all", async (req, res) => {
  try {
    const scrapedData = await executeAutoScrapeAll();
    res.json({ success: true, count: scrapedData.length, data: scrapedData });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Check cron schedule status
app.get("/api/cron-status", (req, res) => {
  res.json({
    active: true,
    schedules: ["08:00 AM (Asia/Taipei)", "06:00 PM / 18:00 (Asia/Taipei)"],
    timezone: "Asia/Taipei",
    trackedFunds: TRACKED_CODES,
  });
});

// Helper to fetch live or previous close stock prices from TWSE MIS API / Yahoo Chart API
async function fetchBatchStockPrices(stockCodes: string[]): Promise<Record<string, { price: number; isLive: boolean; time: string }>> {
  const priceMap: Record<string, { price: number; isLive: boolean; time: string }> = {};
  const cleanCodes = Array.from(new Set(stockCodes.map(c => String(c).replace(/\.TW/gi, "").replace(/\.TWO/gi, "").trim()))).filter(c => /^\d{4}$/.test(c));

  if (cleanCodes.length === 0) return priceMap;

  const nowTimeStr = new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });

  // 1. Query TWSE MIS API (Batch)
  try {
    const exChParam = cleanCodes.map(c => `tse_${c}.tw|otc_${c}.tw`).join("|");
    const twseUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exChParam}`;
    const res = await fetch(twseUrl, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.msgArray)) {
        json.msgArray.forEach((item: any) => {
          const code = item.c;
          if (!code) return;
          const z = parseFloat(item.z); // live trade price
          const y = parseFloat(item.y); // yesterday close price
          // If market is open, z > 0; if market is closed or not opened, fallback to y (yesterday close)
          const p = (z && !isNaN(z) && z > 0) ? z : ((y && !isNaN(y) && y > 0) ? y : undefined);
          if (p) {
            priceMap[code] = {
              price: p,
              isLive: !!(z && z > 0),
              time: nowTimeStr
            };
          }
        });
      }
    }
  } catch (e) {
    console.warn("[Stock API] TWSE query warning:", e);
  }

  // 2. Query Yahoo Chart API for missing codes
  const missingCodes = cleanCodes.filter(c => !priceMap[c]);
  if (missingCodes.length > 0) {
    await Promise.all(missingCodes.map(async (code) => {
      try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.TW?interval=1d`;
        const res = await fetch(yahooUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (res.ok) {
          const json = await res.json();
          const meta = json?.chart?.result?.[0]?.meta;
          const p = meta?.regularMarketPrice || meta?.chartPreviousClose || meta?.previousClose;
          if (p && !isNaN(p) && p > 0) {
            priceMap[code] = {
              price: p,
              isLive: !!meta?.regularMarketPrice,
              time: nowTimeStr
            };
          }
        }
      } catch (e) {}
    }));
  }

  // 3. Fallback price map dictionary if remote API is blocked or offline
  const DEFAULT_STOCK_PRICES: Record<string, number> = {
    "2330": 2320, "2454": 3865, "2317": 250, "2382": 300, "3017": 2600,
    "3661": 3390, "6669": 6205, "2059": 8635, "3324": 720, "2308": 1580,
    "2345": 2320, "3231": 115, "8210": 310, "3653": 3770, "6805": 1470,
    "6515": 1150, "3131": 1550, "6187": 380, "6223": 5805, "2449": 234,
    "2303": 118, "2603": 195, "2891": 38, "2379": 580, "4938": 102,
    "3711": 610, "2356": 55, "2886": 39, "2892": 27, "3044": 210,
    "2383": 5140, "3037": 924, "5536": 990, "6139": 786, "5274": 15975,
    "2327": 552, "3665": 2095, "8046": 953, "2368": 872, "6274": 1220
  };

  cleanCodes.forEach(code => {
    if (!priceMap[code]) {
      const fallback = DEFAULT_STOCK_PRICES[code] || 500;
      priceMap[code] = {
        price: fallback,
        isLive: false,
        time: nowTimeStr
      };
    }
  });

  return priceMap;
}

// Helper function for ezmoney crawler
async function fetchEzMoneyFund(urlOrCode: string) {
  try {
    let ezUrl = urlOrCode;
    let code4Digit = "00981A.TW";
    let ezName = "統一台股增長";

    if (urlOrCode.includes("63YTW") || urlOrCode.includes("00403A")) {
      ezUrl = "https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=63YTW";
      code4Digit = "00403A.TW";
      ezName = "統一升級50";
    } else if (urlOrCode.includes("49YTW") || urlOrCode.includes("00981A")) {
      ezUrl = "https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=49YTW";
      code4Digit = "00981A.TW";
      ezName = "統一台股增長";
    } else if (!ezUrl.startsWith("http")) {
      ezUrl = `https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=${urlOrCode}`;
    }

    if (ezUrl.includes("63YTW") || ezUrl.includes("00403A")) {
      code4Digit = "00403A.TW";
      ezName = "統一升級50";
    }

    const html = execSync(`curl -sL -b /tmp/cookies.txt -c /tmp/cookies.txt -k "${ezUrl}" -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)"`, { encoding: "utf-8", timeout: 10000 });
    const $ = cheerio.load(html);
    const dataAssetRaw = $("#DataAsset").attr("data-content");
    if (!dataAssetRaw) return null;

    const assetData = JSON.parse(dataAssetRaw);
    const navObj = assetData.find((x: any) => x.AssetCode === "NAV");
    const nav = navObj ? navObj.Value : 0;
    const stockGroup = assetData.find((x: any) => x.AssetCode === "ST" && x.Details);
    if (!stockGroup) return null;

    const rawDetails = stockGroup.Details || [];
    const stockCodes = rawDetails.map((x: any) => x.DetailCode).filter(Boolean);
    const livePrices = await fetchBatchStockPrices(stockCodes);

    const holdings = rawDetails.map((item: any, idx: number) => {
      const ratio = nav > 0 ? Number(((item.Amount / nav) * 100).toFixed(2)) : 0;
      const dateStr = item.TranDate ? item.TranDate.split("T")[0].replace(/-/g, "/") : "2026/08/03";
      const code = item.DetailCode;
      const liveP = livePrices[code]?.price;
      const price = liveP || (item.Share > 0 ? Math.round(item.Amount / item.Share) : 0);
      const marketValue = price && item.Share ? (price * item.Share) : item.Amount;

      return {
        id: `ez_${idx + 1}`,
        stockName: `${item.DetailName} (${code})`,
        stockCode: code,
        shares: item.Share,
        sharesFormatted: item.Share.toLocaleString(),
        ratio: ratio,
        date: dateStr,
        price,
        marketValue
      };
    });

    return {
      fundCode: code4Digit,
      fundName: ezName,
      asOfDate: holdings[0] ? holdings[0].date : "2026/08/03",
      totalAssetsMillion: Math.round(nav / 1000000),
      holdings
    };
  } catch (err) {
    console.error("[Scraper] EzMoney error:", err);
    return null;
  }
}

// Helper function for Capital Fund (群益投信 00982A / 00992A) crawler
async function fetchCapitalFund(fundIdOrUrl: string = "399") {
  try {
    let fundId = "399";
    let code4Digit = "00982A.TW";
    let cpName = "群益精選強棒";

    if (fundIdOrUrl.includes("500") || fundIdOrUrl.includes("00992A")) {
      fundId = "500";
      code4Digit = "00992A.TW";
      cpName = "群益科技創新";
    } else if (fundIdOrUrl.includes("399") || fundIdOrUrl.includes("00982A")) {
      fundId = "399";
      code4Digit = "00982A.TW";
      cpName = "群益精選強棒";
    }

    const res = execSync(
      `curl -sL -k "https://www.capitalfund.com.tw/CFWeb/api/etf/buyback" -X POST -H "Content-Type: application/json" -H "User-Agent: Mozilla/5.0" -d '{"fundId": ${fundId}}'`,
      { encoding: "utf-8", timeout: 10000 }
    );
    const json = JSON.parse(res);
    if (!json || !json.data || !json.data.stocks) return null;

    const pcf = json.data.pcf || {};
    const dateStr = pcf.date2 ? pcf.date2.replace(/-/g, "/") : "2026/08/03";
    const nav = pcf.nav || 0;

    const rawStocks = json.data.stocks.slice(0, 20);
    const stockCodes = rawStocks.map((x: any) => x.stocNo).filter(Boolean);
    const livePrices = await fetchBatchStockPrices(stockCodes);

    const holdings = rawStocks.map((item: any, idx: number) => {
      const cleanName = item.stocName.replace(/\*/g, "").trim();
      const code = item.stocNo;
      const ratio = Number(item.weightRound || item.weight.toFixed(2));
      const liveP = livePrices[code]?.price;
      const estPrice = nav > 0 && item.share > 0 ? Math.round((nav * (item.weight / 100)) / item.share) : 0;
      const price = liveP || estPrice;
      const marketValue = price && item.share ? (price * item.share) : Math.round(nav * (item.weight / 100));

      return {
        id: `cp_${idx + 1}`,
        stockName: `${cleanName} (${code})`,
        stockCode: code,
        shares: item.share,
        sharesFormatted: item.shareFormat || item.share.toLocaleString(),
        ratio,
        date: dateStr,
        price,
        marketValue
      };
    });

    return {
      fundCode: code4Digit,
      fundName: cpName,
      asOfDate: dateStr,
      totalAssetsMillion: Math.round(nav / 1000000),
      holdings
    };
  } catch (err) {
    console.error("[Scraper] CapitalFund error:", err);
    return null;
  }
}

// Helper function for KGI Fund (凱基投信 00407A / J024) crawler
async function fetchKgiFund(fundId: string = "J024") {
  try {
    const html = execSync(
      `curl -sL -k "https://www.kgifund.com.tw/Fund/Detail?fundID=${fundId}" -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)"`,
      { encoding: "utf-8", timeout: 10000 }
    );
    const $ = cheerio.load(html);

    const navDateInput = $("#LatestNAVDate").val();
    const dateStr = typeof navDateInput === "string" && navDateInput.trim() ? navDateInput.trim() : "2026/08/03";

    let currentNav = 0;
    $(".FundNavDiv, .nav-price, .Price").each((_i, el) => {
      const text = $(el).text().trim();
      const match = text.match(/\d+(\.\d+)?/);
      if (match && !currentNav) {
        currentNav = parseFloat(match[0]);
      }
    });

    const rawHoldings: any[] = [];
    $("table").each((_tblIdx, tableEl) => {
      const headers = $(tableEl).find("th").text();
      if (headers.includes("股票代號") || headers.includes("股票名稱") || headers.includes("權重")) {
        $(tableEl).find("tbody tr").each((i, tr) => {
          const tds = $(tr).find("td");
          if (tds.length >= 4) {
            const code = $(tds[0]).text().trim();
            const name = $(tds[1]).text().replace(/\*/g, "").trim();
            const sharesStr = $(tds[2]).text().trim();
            const ratioStr = $(tds[3]).text().trim();

            const shares = parseInt(sharesStr.replace(/,/g, ""), 10) || 0;
            const ratio = parseFloat(ratioStr) || 0;

            if (code && name && !isNaN(ratio) && ratio > 0) {
              rawHoldings.push({
                code,
                name,
                shares,
                sharesStr,
                ratio
              });
            }
          }
        });
      }
    });

    const top20Raw = rawHoldings.slice(0, 20);
    const stockCodes = top20Raw.map((x) => x.code).filter(Boolean);
    const livePrices = await fetchBatchStockPrices(stockCodes);

    const holdings = top20Raw.map((item, idx) => {
      const liveP = livePrices[item.code]?.price;
      const fallbackP = 500;
      const price = liveP || fallbackP;
      const marketValue = price * item.shares;

      return {
        id: `kgi_${idx + 1}`,
        stockName: `${item.name} (${item.code})`,
        stockCode: item.code,
        shares: item.shares,
        sharesFormatted: item.sharesStr || item.shares.toLocaleString(),
        ratio: item.ratio,
        date: dateStr,
        price,
        marketValue
      };
    });

    return {
      fundCode: "00407A.TW",
      fundName: "主動凱基台灣",
      asOfDate: dateStr,
      currentNav: currentNav || 8.80,
      holdings
    };
  } catch (err) {
    console.error("[Scraper] KGI Fund error:", err);
    return null;
  }
}

// API: Scrape MoneyDJ / EzMoney / CapitalFund / KGIFund Details live
app.post("/api/scrape-fund", async (req, res) => {
  try {
    const { fundUrl, fundCode } = req.body;
    let targetCode = (fundCode || "").trim().toUpperCase();
    
    // Check if kgifund URL or 00407A / J024
    if ((fundUrl && fundUrl.includes("kgifund.com.tw")) || targetCode === "00407A.TW" || targetCode === "00407A" || targetCode === "J024") {
      const kgiResult = await fetchKgiFund("J024");
      if (kgiResult) {
        return res.json({ success: true, data: kgiResult });
      }
    }

    // Check if capitalfund URL or 00982A / 399 / 00992A / 500
    if ((fundUrl && fundUrl.includes("capitalfund.com.tw")) || targetCode === "00982A.TW" || targetCode === "00982A" || targetCode === "399" || targetCode === "00992A.TW" || targetCode === "00992A" || targetCode === "500") {
      let fundIdToFetch = fundUrl || "399";
      if (targetCode === "00992A.TW" || targetCode === "00992A" || targetCode === "500" || (fundUrl && fundUrl.includes("500"))) {
        fundIdToFetch = "500";
      } else if (targetCode === "00982A.TW" || targetCode === "00982A" || targetCode === "399" || (fundUrl && fundUrl.includes("399"))) {
        fundIdToFetch = "399";
      }
      const cpResult = await fetchCapitalFund(fundIdToFetch);
      if (cpResult) {
        return res.json({ success: true, data: cpResult });
      }
    }

    // Check if ezmoney URL or 00981A / 49YTW / 00403A / 63YTW
    if ((fundUrl && fundUrl.includes("ezmoney.com.tw")) || targetCode === "00981A.TW" || targetCode === "00981A" || targetCode === "49YTW" || targetCode === "00403A.TW" || targetCode === "00403A" || targetCode === "63YTW") {
      let codeToFetch = fundUrl || "49YTW";
      if (targetCode === "00403A.TW" || targetCode === "00403A" || targetCode === "63YTW" || (fundUrl && fundUrl.includes("63YTW"))) {
        codeToFetch = "63YTW";
      } else if (targetCode === "00981A.TW" || targetCode === "00981A" || targetCode === "49YTW" || (fundUrl && fundUrl.includes("49YTW"))) {
        codeToFetch = "49YTW";
      }
      const ezResult = await fetchEzMoneyFund(codeToFetch);
      if (ezResult) {
        return res.json({ success: true, data: ezResult });
      }
    }

    let isEtf = false;
    if (fundUrl) {
      if (fundUrl.toLowerCase().includes("etfid=")) {
        isEtf = true;
        const match = fundUrl.match(/etfid=([A-Za-z0-9\.]+)/i);
        if (match) targetCode = match[1].toUpperCase();
      } else if (fundUrl.toLowerCase().includes("a=")) {
        const match = fundUrl.match(/a=([A-Za-z0-9]+)/i);
        if (match) targetCode = match[1].toUpperCase();
      }
    }

    if (!targetCode) {
      return res.status(400).json({ success: false, error: "請提供有效的基金/ETF代碼或網址" });
    }

    if (targetCode.includes(".TW") || targetCode.startsWith("00")) {
      isEtf = true;
    }

    let targetUrl = fundUrl && fundUrl.startsWith("http")
      ? fundUrl
      : isEtf
      ? `https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid=${targetCode}`
      : `https://www.moneydj.com/funddj/yp/yp013000.djhtm?a=${targetCode}`;

    console.log(`[Scraper] Fetching MoneyDJ holding details from: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!response.ok) {
      throw new Error(`MoneyDJ 回應 HTTP ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    let htmlText = iconv.decode(Buffer.from(buffer), "big5");
    if (htmlText.includes("") || !htmlText.includes("<html")) {
      htmlText = iconv.decode(Buffer.from(buffer), "utf-8");
    }
    const $ = cheerio.load(htmlText);

    // Extract fund title
    let fundName = $("h1, .head1, title").first().text().trim();
    if (fundName.includes("-")) {
      fundName = fundName.split("-")[0].trim();
    }
    fundName = fundName.replace(/MoneyDJ.*/g, "").replace(/基金投資明細.*/g, "").trim();

    // Extract date
    let asOfDate = "2026/08/03";
    const bodyText = $.text();
    const dateMatch = bodyText.match(/(?:資料日期|截至日期|明細日期)[：:\s]*(\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2})/);
    if (dateMatch) {
      asOfDate = dateMatch[1].replace(/-/g, "/");
    }

    // Extract holding table
    const holdings: Array<{
      id: string;
      stockName: string;
      stockCode?: string;
      shares: number;
      sharesFormatted: string;
      ratio: number;
      date: string;
      price?: number;
      marketValue?: number;
    }> = [];

    // Find table with holding details
    $("table").each((_, table) => {
      const rows = $(table).find("tr");
      rows.each((idx, tr) => {
        if (idx === 0) return; // skip header
        const tds = $(tr).find("td");
        if (tds.length >= 3) {
          const col1 = $(tds[0]).text().trim();
          const col2 = $(tds[1]).text().trim();
          const col3 = $(tds[2]).text().trim();

          // Check if col1 looks like a stock name or code
          if (col1 && !col1.includes("股票名稱") && !col1.includes("項目") && !col1.includes("合計")) {
            const ratioNum = parseFloat(col3.replace("%", "").replace(/,/g, "")) || 0;
            const sharesNum = parseInt(col2.replace(/,/g, ""), 10) || 0;

            if (col1.length > 1 && ratioNum > 0) {
              const codeMatch = col1.match(/(\d{4})/);
              const code = codeMatch ? codeMatch[1] : undefined;

              // Fallback estimated prices based on common TW stocks if code exists
              const stockPriceMap: Record<string, number> = {
                "2330": 980, "2454": 1350, "2317": 205, "2382": 300, "3017": 680,
                "3661": 2850, "6669": 2400, "2059": 1280, "3324": 720, "2308": 410,
                "2345": 590, "3231": 115, "8210": 310, "3653": 1120, "6805": 820,
                "6515": 1150, "3131": 1550, "6187": 380, "6223": 780, "2449": 125,
                "2303": 54, "2603": 195, "2891": 38, "2379": 580, "4938": 102,
                "3711": 165, "2356": 55, "2886": 39, "2892": 27, "3044": 210,
                "3702": 82, "3036": 140, "2385": 175, "5434": 260, "2809": 55
              };
              const estPrice = code ? (stockPriceMap[code] || 150) : undefined;

              holdings.push({
                id: `scraped_${Date.now()}_${idx}`,
                stockName: col1,
                stockCode: code,
                shares: sharesNum,
                sharesFormatted: sharesNum.toLocaleString(),
                ratio: ratioNum,
                date: asOfDate,
                price: estPrice,
                marketValue: estPrice ? (estPrice * sharesNum) : undefined
              });
            }
          }
        }
      });
    });

    // Ensure we fetch up to 20 holdings as requested
    const finalHoldings = holdings.slice(0, 20);

    return res.json({
      success: true,
      data: {
        code: targetCode,
        name: fundName || `基金 (${targetCode})`,
        url: targetUrl,
        asOfDate,
        holdingsCount: finalHoldings.length,
        holdings: finalHoldings,
        lastUpdated: new Date().toLocaleString("zh-TW"),
      },
    });
  } catch (err: any) {
    console.error("[Scraper Error]", err);
    return res.status(500).json({
      success: false,
      error: `擷取失敗: ${err.message || err}`,
    });
  }
});

// API: Auto-fetch live TW stock prices (live trade price or fallback to close price) from TWSE / Yahoo Chart API
app.post("/api/fetch-stock-prices", async (req, res) => {
  try {
    const { stockCodes } = req.body;
    const codes: string[] = Array.isArray(stockCodes) ? stockCodes : [];
    const priceMap = await fetchBatchStockPrices(codes);
    return res.json({ success: true, priceMap });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API: Export CSV
app.post("/api/export-csv", (req, res) => {
  try {
    const { fundName, holdings } = req.body;
    let csv = "\uFEFF日期,個股名稱,目前股價,持股市值(萬),投資股數,比例(%)\n"; // UTF-8 BOM for Excel/Google Sheets
    if (Array.isArray(holdings)) {
      holdings.forEach((item: any) => {
        const cleanName = `"${(item.stockName || "").replace(/"/g, '""')}"`;
        const priceVal = item.price ? item.price : "-";
        const mv = item.marketValue || (item.price && item.shares ? item.price * item.shares : 0);
        const mvVal = mv > 0 ? `${(mv / 10000).toFixed(2)} 萬` : "-";
        csv += `${item.date || ""},${cleanName},${priceVal},${mvVal},${item.shares || 0},${item.ratio || 0}%\n`;
      });
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fundName || "Fund_Holdings")}_投資明細.csv"`
    );
    return res.send(csv);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// API: Generate Google Apps Script code (supports both doPost web app receiving from APP and standalone scraping)
app.post("/api/generate-google-script", (req, res) => {
  const { fundCodes, spreadsheetId } = req.body;
  const codesList = Array.isArray(fundCodes) && fundCodes.length > 0 
    ? fundCodes 
    : ["00981A.TW", "00982A.TW", "00407A.TW", "ACPS09", "ACDD04", "ACPS10"];
  const targetSpreadsheetId = spreadsheetId || "1u4F6xNbGf2HqkwJL2kXxolEKUObzHWnMdHaGsbI5ypo";

  const scriptCode = `/**
 * Google Apps Script - MoneyDJ 基金/ETF 持股明細自動接收與匯出腳本 (含目前股價與持股市值欄位)
 * 
 * ✨ 本腳本特點:
 * 1. 【APP 主動推送】包含 doPost(e) Web App 接收端，由 APP 擷取個股名稱、目前股價與持股市值後直接寫入試算表！
 * 2. 【每日 08:00 自動定時】也可由腳本自行定時抓取 (setupDailyTrigger)
 * 3. 【6欄完整紀錄】包含「日期」、「個股名稱」、「目前股價」、「持股市值(萬)」、「投資股數」、「比例(%)」
 * 4. 【統一日期格式與去重】自動將所有日期統一格式化為 YYYY/MM/DD，覆蓋相同日期數據，歷史紀錄不重疊
 * 5. 【自動清理】自動刪除 60 天前的歷史資料
 * 
 * 指定目標試算表: https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit
 */

// 目標試算表 ID
var SPREADSHEET_ID = "${targetSpreadsheetId}";

/**
 * 🛠️ 日期與比例規範與去重工具
 */
function parseAndFormatDate(val) {
  if (!val) return "";
  if (Object.prototype.toString.call(val) === "[object Date]" || val instanceof Date) {
    try {
      return Utilities.formatDate(val, "Asia/Taipei", "yyyy/MM/dd");
    } catch (e) {
      var yyyy = val.getFullYear();
      var mm = ("0" + (val.getMonth() + 1)).slice(-2);
      var dd = ("0" + val.getDate()).slice(-2);
      return yyyy + "/" + mm + "/" + dd;
    }
  }
  var str = String(val).trim();
  if (!str) return "";

  var match = str.match(/(\\d{4})[\\/\\.-](\\d{1,2})[\\/\\.-](\\d{1,2})/);
  if (match) {
    var yyyy = match[1];
    var mm = ("0" + match[2]).slice(-2);
    var dd = ("0" + match[3]).slice(-2);
    return yyyy + "/" + mm + "/" + dd;
  }

  if (str.indexOf("GMT") !== -1 || str.indexOf("Taiwan") !== -1 || str.indexOf("T00:00") !== -1 || (str.length > 15 && !isNaN(Date.parse(str)))) {
    try {
      var d = new Date(str);
      if (!isNaN(d.getTime())) {
        return Utilities.formatDate(d, "Asia/Taipei", "yyyy/MM/dd");
      }
    } catch (e) {}
  }
  var clean = str.replace(/[-.]/g, "/");
  var parts = clean.split("/");
  if (parts.length === 3) {
    var p0 = parts[0].trim();
    var p1 = ("0" + parts[1].trim()).slice(-2);
    var p2 = ("0" + parts[2].trim()).slice(-2);
    if (p0.length === 4 && !isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
      return p0 + "/" + p1 + "/" + p2;
    }
  }
  try {
    var d2 = new Date(str);
    if (!isNaN(d2.getTime())) {
      return Utilities.formatDate(d2, "Asia/Taipei", "yyyy/MM/dd");
    }
  } catch (e) {}
  return str;
}

function parseAndFormatRatio(val) {
  if (val === null || val === undefined || val === '') return '0%';
  var str = String(val).trim();
  var num = parseFloat(str.replace(/%/g, '').replace(/,/g, ''));
  if (isNaN(num)) return '0%';
  return (Math.round(num * 100) / 100) + '%';
}

function extractStockKey(nameStr) {
  if (!nameStr) return '';
  var clean = String(nameStr).trim();
  var match = clean.match(/(\\d{4})/);
  if (match) return match[1];
  return clean.replace(/\\s+/g, '').replace(/\\*/g, '');
}

function deduplicateAndCleanRows(rows) {
  var map = {};
  rows.forEach(function(r) {
    var d = parseAndFormatDate(r[0]);
    var name = String(r[1] || '').trim();
    if (!d || !name) return;

    var stockKey = extractStockKey(name);
    var key = d + "||" + stockKey;

    var price = r[2] || '-';
    var mv = r[3] || '-';
    var shares = r[4] || '0';
    var ratio = parseAndFormatRatio(r[5] || r[3] || '0%');

    // Quality score to keep the best formatted row among duplicates
    var score = 0;
    if (price !== '-' && price !== '') score += 10;
    if (mv !== '-' && mv !== '') score += 5;
    if (String(shares).indexOf(',') !== -1) score += 2;
    if (String(r[5] || '').indexOf('%') !== -1) score += 3;

    var candidate = [d, name, price, mv, shares, ratio, score];

    if (!map[key] || candidate[6] >= map[key][6]) {
      map[key] = candidate;
    }
  });

  // Group by unique date to strictly limit each date to top 20 holdings
  var byDate = {};
  Object.keys(map).forEach(function(k) {
    var item = map[k];
    var dKey = item[0];
    if (!byDate[dKey]) byDate[dKey] = [];
    byDate[dKey].push(item);
  });

  var result = [];
  var dateKeys = Object.keys(byDate);
  dateKeys.sort(function(a, b) {
    var dA = new Date(a.split("/").join("-")).getTime() || 0;
    var dB = new Date(b.split("/").join("-")).getTime() || 0;
    return dB - dA;
  });

  dateKeys.forEach(function(dKey) {
    var list = byDate[dKey];
    // Sort items by weight ratio descending
    list.sort(function(a, b) {
      var rA = parseFloat(String(a[5]).replace('%', '')) || 0;
      var rB = parseFloat(String(b[5]).replace('%', '')) || 0;
      return rB - rA;
    });
    // STRICT CAP: Maximum 20 stock rows per unique day!
    var top20 = list.slice(0, 20);
    top20.forEach(function(c) {
      result.push([c[0], c[1], c[2], c[3], c[4], c[5]]);
    });
  });

  return result;
}

/**
 * 1️⃣ 接收與讀取處理 (doGet / doPost)
 */
function doGet(e) {
  try {
    var ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();
    var fundDataList = [];

    sheets.forEach(function(sheet) {
      var name = sheet.getName();
      if (name.indexOf("基金明細_") === 0) {
        var fundCode = name.replace("基金明細_", "");
        var lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          var numCols = Math.max(sheet.getLastColumn(), 6);
          var values = sheet.getRange(2, 1, lastRow - 1, numCols).getDisplayValues();
          var periodMap = {};

          values.forEach(function(row) {
            var dateStr = parseAndFormatDate(row[0]);
            var stockName = String(row[1] || '').trim();
            var priceStr = '-';
            var mvStr = '-';
            var sharesStr = '0';
            var ratioStr = '0%';

            if (row.length >= 6) {
              priceStr = String(row[2] || '').trim();
              mvStr = String(row[3] || '').trim();
              sharesStr = String(row[4] || '').trim();
              ratioStr = String(row[5] || '').trim();
            } else if (row.length === 5) {
              priceStr = String(row[2] || '').trim();
              sharesStr = String(row[3] || '').trim();
              ratioStr = String(row[4] || '').trim();
            } else {
              sharesStr = String(row[2] || '').trim();
              ratioStr = String(row[3] || '').trim();
            }

            if (dateStr && stockName) {
              if (!periodMap[dateStr]) {
                periodMap[dateStr] = [];
              }
              var stockKey = extractStockKey(stockName);
              var existsIdx = periodMap[dateStr].findIndex(function(item) {
                return extractStockKey(item.stockName) === stockKey;
              });

              var sharesNum = parseFloat(sharesStr.replace(/,/g, '')) || 0;
              var formattedRatioStr = parseAndFormatRatio(ratioStr);
              var ratioNum = parseFloat(formattedRatioStr.replace('%', '')) || 0;
              var priceNum = parseFloat(priceStr.replace(/[^0-9\.]/g, '')) || undefined;
              var rawMv = parseFloat(mvStr.replace(/[^0-9\.]/g, ''));
              var mvNum = rawMv ? (rawMv * 10000) : (priceNum && sharesNum ? priceNum * sharesNum : undefined);

              var holdingItem = {
                id: fundCode + '_' + stockName,
                stockName: stockName,
                price: priceNum,
                marketValue: mvNum,
                shares: sharesNum,
                sharesFormatted: sharesStr || sharesNum.toLocaleString(),
                ratio: ratioNum,
                date: dateStr
              };

              if (existsIdx >= 0) {
                periodMap[dateStr][existsIdx] = holdingItem;
              } else {
                periodMap[dateStr].push(holdingItem);
              }
            }
          });

          var snapshots = [];
          Object.keys(periodMap).forEach(function(d) {
            snapshots.push({
              date: d,
              asOfDate: d,
              holdings: periodMap[d]
            });
          });

          snapshots.sort(function(a, b) {
            var dA = new Date(a.date.split("/").join("-")).getTime() || 0;
            var dB = new Date(b.date.split("/").join("-")).getTime() || 0;
            return dB - dA;
          });

          fundDataList.push({
            code: fundCode,
            sheetName: name,
            periods: Object.keys(periodMap),
            snapshots: snapshots
          });
        }
      }
    });

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      count: fundDataList.length,
      data: fundDataList
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === "read") {
      return doGet(e);
    }
    var fundList = data.fundDataList || [];
    var ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    
    var now = new Date();
    var cutoffTime = now.getTime() - (60 * 24 * 60 * 60 * 1000); // 60天前

    fundList.forEach(function(item) {
      var code = item.code || "UNKNOWN";
      var asOfDate = parseAndFormatDate(item.asOfDate || Utilities.formatDate(now, "Asia/Taipei", "yyyy/MM/dd"));
      var holdings = item.holdings || [];

      var sheetName = "基金明細_" + code.replace(".TW", "");
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }

      var existingRows = [];
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      if (lastRow > 1 && lastCol > 0) {
        existingRows = sheet.getRange(2, 1, lastRow - 1, Math.max(lastCol, 6)).getDisplayValues();
      }

      // 1. 過濾並標準化舊資料：若日期與目前寫入的 asOfDate 相同則先排除，以新推送之完整持股為準
      var normalizedExisting = existingRows.filter(function(row) {
        var rowDateStr = parseAndFormatDate(row[0]);
        return rowDateStr !== asOfDate;
      }).map(function(row) {
        var d = parseAndFormatDate(row[0]);
        var name = String(row[1] || '').trim();
        var price = '-';
        var mv = '-';
        var shares = '0';
        var ratio = '0%';

        if (row.length >= 6) {
          price = row[2] || '-';
          mv = row[3] || '-';
          shares = row[4] || '0';
          ratio = parseAndFormatRatio(row[5] || '0%');
        } else if (row.length === 5) {
          price = row[2] || '-';
          shares = row[3] || '0';
          ratio = parseAndFormatRatio(row[4] || '0%');
        } else if (row.length >= 3) {
          shares = row[2] || '0';
          ratio = parseAndFormatRatio(row[3] || '0%');
        }
        return [d, name, price, mv, shares, ratio];
      });

      // 2. 建立新資料列 (嚴格保證 6 個欄位與去重比對)
      var newRows = holdings.slice(0, 20).map(function(h) {
        var priceDisplay = h.price ? Number(h.price) : "-";
        var sharesNum = Number(h.shares) || 0;
        var mv = h.marketValue || (h.price ? (Number(h.price) * sharesNum) : 0);
        var mvDisplay = mv > 0 ? (mv / 10000).toFixed(2) + " 萬" : "-";
        var ratioFormatted = parseAndFormatRatio(h.ratio);

        return [
          asOfDate,
          h.stockName || h.name || '',
          priceDisplay,
          mvDisplay,
          h.sharesFormatted || (sharesNum ? sharesNum.toLocaleString() : "0"),
          ratioFormatted
        ];
      });

      // 3. 合併與過濾 60 天前舊資料，並執行徹底去重 (deduplicateAndCleanRows)
      var combinedRows = normalizedExisting.concat(newRows);
      var cleanedRows = combinedRows.filter(function(row) {
        var dStr = parseAndFormatDate(row[0]);
        if (!dStr) return false;
        var rDate = new Date(dStr.split("/").join("-"));
        if (isNaN(rDate.getTime())) return true;
        return rDate.getTime() >= cutoffTime;
      });

      var deduplicatedRows = deduplicateAndCleanRows(cleanedRows);

      // 4. 依日期降冪排序
      deduplicatedRows.sort(function(a, b) {
        var dA = new Date(parseAndFormatDate(a[0]).split("/").join("-")).getTime() || 0;
        var dB = new Date(parseAndFormatDate(b[0]).split("/").join("-")).getTime() || 0;
        return dB - dA;
      });

      // 5. 確保每一列都是長度為 6 的陣列
      var finalRows = deduplicatedRows.map(function(r) {
        return [
          parseAndFormatDate(r[0]),
          r[1] || '',
          r[2] || '-',
          r[3] || '-',
          r[4] || '0',
          parseAndFormatRatio(r[5] || '0%')
        ];
      });

      // 6. 清空重寫並設定完整的 6 個欄位標題與純文字日期格式，刪除多餘舊列
      sheet.clearContents();
      sheet.getRange(1, 1, 1, 6).setValues([["日期", "個股名稱", "目前股價", "持股市值(萬)", "投資股數", "比例(%)"]]);
      sheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#EFEFEF");

      if (finalRows.length > 0) {
        sheet.getRange(2, 1, finalRows.length, 6).setValues(finalRows);
        sheet.getRange(2, 1, finalRows.length, 1).setNumberFormat("@");
        sheet.autoResizeColumns(1, 6);
      }

      var maxRowNow = sheet.getLastRow();
      var expectedMaxRow = finalRows.length + 1;
      if (maxRowNow > expectedMaxRow && maxRowNow > 1) {
        try {
          sheet.deleteRows(expectedMaxRow + 1, maxRowNow - expectedMaxRow);
        } catch (e) {}
      }
    });

    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "成功接收 APP 推送資料並已自動完成重複紀錄徹底清理 (含 6 欄與 8.44% 格式化)" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 2️⃣ 建立每日 08:00 自動執行觸發器
 */
function setupDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "updateFundDetails") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("updateFundDetails")
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
  Logger.log("✅ 已成功註冊每日 08:00 自動排程觸發器！");
}

/**
 * 3️⃣ 備用自行抓取主函式 (若不透過 APP 推送，亦可由試算表自動排程抓取)
 */
function updateFundDetails() {
  var fundCodes = ${JSON.stringify(codesList)};
  var ss;
  try {
    ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  
  var now = new Date();
  var cutoffTime = now.getTime() - (60 * 24 * 60 * 60 * 1000);

  fundCodes.forEach(function(code) {
    var sheetName = "基金明細_" + code.replace(".TW", "");
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    var existingRows = [];
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow > 1 && lastCol > 0) {
      existingRows = sheet.getRange(2, 1, lastRow - 1, Math.max(lastCol, 6)).getDisplayValues();
    }
    
    try {
      var isETF = code.indexOf(".TW") !== -1 || code.indexOf("00") === 0;
      var url = isETF 
        ? "https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid=" + code
        : "https://www.moneydj.com/funddj/yp/yp013000.djhtm?a=" + code;

      var response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });
      
      var html = response.getContentText("UTF-8");
      var dateMatch = html.match(/(?:資料日期|截至日期|明細日期)[：:\\s]*(\\d{4}[\\/\\.-]\\d{1,2}[\\/\\.-]\\d{1,2})/);
      var rawDate = dateMatch ? dateMatch[1] : Utilities.formatDate(now, "Asia/Taipei", "yyyy/MM/dd");
      var asOfDate = parseAndFormatDate(rawDate);
      
      var newRows = [];
      var trRegex = /<tr[^>]*>([\\s\\S]*?)<\\/tr>/gi;
      var match;
      
      while ((match = trRegex.exec(html)) !== null) {
        var trContent = match[1];
        var tdRegex = /<td[^>]*>([\\s\\S]*?)<\\/td>/gi;
        var tds = [];
        var tdMatch;
        while ((tdMatch = tdRegex.exec(trContent)) !== null) {
          var cleanTd = tdMatch[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim();
          tds.push(cleanTd);
        }
        
        if (tds.length >= 3) {
          var name = tds[0];
          var shares = tds[1];
          var ratio = parseAndFormatRatio(tds[2]);
          
          if (name && !name.includes("股票名稱") && !name.includes("項目") && !name.includes("合計")) {
            newRows.push([asOfDate, name, "-", "-", shares, ratio]);
          }
        }
      }
      
      if (newRows.length > 20) {
        newRows = newRows.slice(0, 20);
      }

      var normalizedExisting = existingRows.filter(function(row) {
        return parseAndFormatDate(row[0]) !== asOfDate;
      }).map(function(row) {
        var d = parseAndFormatDate(row[0]);
        var name = String(row[1] || '').trim();
        var price = '-';
        var mv = '-';
        var shares = '0';
        var ratio = '0%';

        if (row.length >= 6) {
          price = row[2] || '-';
          mv = row[3] || '-';
          shares = row[4] || '0';
          ratio = parseAndFormatRatio(row[5] || '0%');
        } else if (row.length === 5) {
          price = row[2] || '-';
          shares = row[3] || '0';
          ratio = parseAndFormatRatio(row[4] || '0%');
        } else if (row.length >= 3) {
          shares = row[2] || '0';
          ratio = parseAndFormatRatio(row[3] || '0%');
        }
        return [d, name, price, mv, shares, ratio];
      });

      var combinedRows = normalizedExisting.concat(newRows);
      var cleanedRows = combinedRows.filter(function(row) {
        var dStr = parseAndFormatDate(row[0]);
        if (!dStr) return false;
        var rDate = new Date(dStr.split("/").join("-"));
        if (isNaN(rDate.getTime())) return true;
        return rDate.getTime() >= cutoffTime;
      });

      var deduplicatedRows = deduplicateAndCleanRows(cleanedRows);

      deduplicatedRows.sort(function(a, b) {
        var dA = new Date(parseAndFormatDate(a[0]).split("/").join("-")).getTime() || 0;
        var dB = new Date(parseAndFormatDate(b[0]).split("/").join("-")).getTime() || 0;
        return dB - dA;
      });

      var finalRows = deduplicatedRows.map(function(r) {
        return [
          parseAndFormatDate(r[0]),
          r[1] || '',
          r[2] || '-',
          r[3] || '-',
          r[4] || '0',
          parseAndFormatRatio(r[5] || '0%')
        ];
      });

      sheet.clearContents();
      sheet.getRange(1, 1, 1, 6).setValues([["日期", "個股名稱", "目前股價", "持股市值(萬)", "投資股數", "比例(%)"]]);
      sheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#EFEFEF");

      if (finalRows.length > 0) {
        sheet.getRange(2, 1, finalRows.length, 6).setValues(finalRows);
        sheet.getRange(2, 1, finalRows.length, 1).setNumberFormat("@");
        sheet.autoResizeColumns(1, 6);
      }

      var maxRowNow = sheet.getLastRow();
      var expectedMaxRow = finalRows.length + 1;
      if (maxRowNow > expectedMaxRow && maxRowNow > 1) {
        try {
          sheet.deleteRows(expectedMaxRow + 1, maxRowNow - expectedMaxRow);
        } catch (e) {}
      }
    } catch(e) {
      Logger.log("❌ 擷取 " + code + " 錯誤: " + e.toString());
    }
  });
}
`;

  return res.json({ success: true, script: scriptCode });
});

// API: Proxy APP push payload directly to Google Apps Script Web App Endpoint
app.post("/api/push-app-data-to-sheets", async (req, res) => {
  const { webAppUrl, fundDataList } = req.body;

  if (!webAppUrl) {
    return res.status(400).json({ error: "請提供 Google Apps Script Web App URL" });
  }

  try {
    const response = await fetch(webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fundDataList }),
    });

    const resultText = await response.text();
    let resultJson;
    try {
      resultJson = JSON.parse(resultText);
    } catch (e) {
      resultJson = { raw: resultText };
    }

    return res.json({ success: true, message: "成功由 APP 將持股明細推送至 Google 試算表！", result: resultJson });
  } catch (err: any) {
    return res.status(500).json({ error: "推送至 Google 試算表失敗: " + err.message });
  }
});

// API: Read database (historical periods and holdings) from Google Apps Script / Google Sheets
app.post("/api/read-sheets-database", async (req, res) => {
  const { webAppUrl, spreadsheetId, fundCodes } = req.body;
  const targetSpreadsheetId = spreadsheetId || "1u4F6xNbGf2HqkwJL2kXxolEKUObzHWnMdHaGsbI5ypo";
  const targetWebAppUrl = webAppUrl || "https://script.google.com/macros/s/AKfycbyAPZfZYLT1Igoo1BRAc6GDdvUcWYTV9HubJVQOGjK1NHqNsjSCpnR0kH4VCgM_6xMm/exec";

  let fetchedFromScript = false;
  let resultData: any[] = [];

  // Strategy 1: Attempt to query Google Apps Script WebApp endpoint
  if (targetWebAppUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const scriptRes = await fetch(targetWebAppUrl, {
        method: "GET",
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (scriptRes.ok) {
        const json = await scriptRes.json();
        if (json && json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
          resultData = json.data;
          fetchedFromScript = true;
        }
      }
    } catch (e) {
      console.log("WebApp GET request error or redirect required, trying POST read action fallback...");
    }

    if (!fetchedFromScript) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const scriptRes = await fetch(targetWebAppUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "read" }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (scriptRes.ok) {
          const json = await scriptRes.json();
          if (json && json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
            resultData = json.data;
            fetchedFromScript = true;
          }
        }
      } catch (e) {
        console.log("WebApp POST read action error:", e);
      }
    }
  }

  // Strategy 2: If WebApp didn't return data, fetch public/gviz CSV for requested fund codes
  if (!fetchedFromScript) {
    const codesToFetch: string[] = Array.isArray(fundCodes) && fundCodes.length > 0
      ? fundCodes
      : ["00981A", "00982A", "00407A", "ACPS10", "00878", "0050"];

    for (const code of codesToFetch) {
      const cleanCode = code.replace(".TW", "");
      const sheetName = `基金明細_${cleanCode}`;
      const csvUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

      try {
        const csvRes = await fetch(csvUrl);
        if (csvRes.ok) {
          const csvText = await csvRes.text();
          const lines = csvText.split("\n").map(l => l.trim()).filter(Boolean);
          if (lines.length > 1) {
            const periodMap: Record<string, any[]> = {};

            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(",").map(c => c.replace(/^"|"$/g, "").trim());
              if (cols.length >= 4) {
                const dateStr = normalizeDateString(cols[0]);
                const stockName = cols[1];
                let priceStr = "-";
                let mvStr = "-";
                let sharesStr = "0";
                let ratioStr = "0";

                if (cols.length >= 6) {
                  priceStr = cols[2];
                  mvStr = cols[3];
                  sharesStr = cols[4];
                  ratioStr = cols[5].replace("%", "");
                } else if (cols.length === 5) {
                  priceStr = cols[2];
                  sharesStr = cols[3];
                  ratioStr = cols[4].replace("%", "");
                } else {
                  sharesStr = cols[2];
                  ratioStr = cols[3].replace("%", "");
                }

                if (dateStr && stockName) {
                  if (!periodMap[dateStr]) periodMap[dateStr] = [];
                  const sharesNum = parseFloat(sharesStr.replace(/,/g, "")) || 0;
                  let ratioNum = parseFloat(ratioStr) || 0;
                  // If raw value is decimal e.g. 0.0844 (without % in string), convert to percentage 8.44
                  if (ratioNum > 0 && ratioNum <= 1.0 && !ratioStr.includes("%")) {
                    ratioNum = Math.round(ratioNum * 10000) / 100;
                  }

                  const priceNum = parseFloat(priceStr.replace(/[^0-9\.]/g, "")) || undefined;
                  const rawMv = parseFloat(mvStr.replace(/[^0-9\.]/g, ""));
                  const mvNum = rawMv ? (rawMv * 10000) : (priceNum && sharesNum ? priceNum * sharesNum : undefined);

                  // Extract stock code or clean stock name to deduplicate
                  const codeMatch = stockName.match(/(\d{4})/);
                  const stockKey = codeMatch ? codeMatch[1] : stockName.replace(/\s+/g, "");

                  const existingIdx = periodMap[dateStr].findIndex((h: any) => {
                    const hCode = h.stockName.match(/(\d{4})/);
                    const k = hCode ? hCode[1] : h.stockName.replace(/\s+/g, "");
                    return k === stockKey;
                  });

                  const item = {
                    id: `${cleanCode}_${stockName}`,
                    stockName,
                    price: priceNum,
                    marketValue: mvNum,
                    shares: sharesNum,
                    sharesFormatted: sharesStr || sharesNum.toLocaleString(),
                    ratio: ratioNum,
                    date: dateStr
                  };

                  if (existingIdx >= 0) {
                    periodMap[dateStr][existingIdx] = item;
                  } else {
                    periodMap[dateStr].push(item);
                  }
                }
              }
            }

            const snapshots = Object.keys(periodMap).map(d => ({
              date: d,
              asOfDate: d,
              holdings: periodMap[d]
            })).sort((a, b) => new Date(b.date.replace(/\//g, "-")).getTime() - new Date(a.date.replace(/\//g, "-")).getTime());

            if (snapshots.length > 0) {
              resultData.push({
                code: cleanCode,
                sheetName,
                periods: Object.keys(periodMap),
                snapshots
              });
            }
          }
        }
      } catch (err) {
        console.warn(`Error fetching CSV for ${sheetName}:`, err);
      }
    }
  }

  return res.json({
    success: true,
    source: fetchedFromScript ? "Google Apps Script WebApp" : "Google Sheets CSV Export",
    count: resultData.length,
    data: resultData
  });
});

async function startServer() {
  // Vite middleware for dev
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening at http://localhost:${PORT}`);
  });
}

startServer();
