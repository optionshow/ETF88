import {
  FundData,
  HoldingChange,
  StockOverlap,
  HoldingItem,
} from '../types';
import { INITIAL_FUNDS } from '../data/presetFunds';

const STORAGE_KEY = 'moneydj_funds_data_v10';

export function normalizeDateString(str: string): string {
  if (!str) return '';
  const s = String(str).trim();
  if (s.includes('GMT') || s.includes('Taiwan') || s.includes('T00:00') || (s.length > 15 && !isNaN(Date.parse(s)))) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}/${m}/${day}`;
    }
  }
  const clean = s.replace(/-/g, '/');
  const parts = clean.split('/');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return `${y}/${m}/${day}`;
  }
  return clean;
}

function cleanFundName(name: string, code: string): string {
  if (!name) return name;
  let clean = name;
  if (code) {
    const escapedCode = code.replace('.', '\\.');
    const regex = new RegExp(`\\s*\\(${escapedCode}\\)`, 'gi');
    clean = clean.replace(regex, '');
  }
  return clean.trim();
}

function deduplicateSnapshotHoldings(holdings: any[]): any[] {
  if (!Array.isArray(holdings)) return [];
  const map = new Map<string, any>();
  holdings.forEach((h) => {
    const name = String(h.stockName || h.name || '').trim();
    if (!name) return;
    const codeMatch = name.match(/(\d{4})/);
    const key = codeMatch ? codeMatch[1] : name.replace(/\s+/g, '');

    let ratio = parseFloat(String(h.ratio || 0).replace('%', '')) || 0;
    if (ratio > 0 && ratio <= 1.0 && !String(h.ratio || '').includes('%')) {
      ratio = Math.round(ratio * 10000) / 100;
    }

    const item = {
      ...h,
      stockName: name,
      ratio,
    };

    if (!map.has(key) || (h.price && !map.get(key).price)) {
      map.set(key, item);
    }
  });
  const sorted = Array.from(map.values()).sort((a, b) => Number(b.ratio) - Number(a.ratio));

  let tsmcIdx = sorted.findIndex((item) =>
    (item.stockCode === '2330') || (item.stockName && item.stockName.includes('台積電'))
  );
  if (tsmcIdx < 0) tsmcIdx = 0;

  const tsmcRatio = sorted[tsmcIdx]?.ratio || 100;

  return sorted
    .slice(tsmcIdx)
    .filter((item) => Number(item.ratio) <= tsmcRatio && Number(item.ratio) >= 1.0)
    .slice(0, 20);
}

export const OFFICIAL_FUND_METADATA: Record<string, { code: string; name: string; url: string; manager: string; category: string }> = {
  '00981A.TW': {
    code: '00981A.TW',
    name: '統一台股增長',
    url: 'https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=49YTW',
    manager: '統一投信',
    category: '台灣股票型 ETF / 主動動能型',
  },
  '00403A.TW': {
    code: '00403A.TW',
    name: '統一升級50',
    url: 'https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=63YTW',
    manager: '統一投信',
    category: '台灣股票型 ETF / 主動型',
  },
  '00982A.TW': {
    code: '00982A.TW',
    name: '群益台灣強棒',
    url: 'https://www.capitalfund.com.tw/etf/product/detail/399/portfolio',
    manager: '群益投信',
    category: '台灣股票型 ETF / 主動型',
  },
  '00992A.TW': {
    code: '00992A.TW',
    name: '群益科技創新',
    url: 'https://www.capitalfund.com.tw/etf/product/detail/500/portfolio',
    manager: '群益投信',
    category: '台灣科技型 ETF / 主動型',
  },
  '00407A.TW': {
    code: '00407A.TW',
    name: '凱基台灣精選強棒',
    url: 'https://www.kgifund.com.tw/Fund/Detail?fundID=J024',
    manager: '凱基投信',
    category: '台灣股票型 ETF / 主動精選型',
  },
};

export function getOfficialMetadata(str: string) {
  if (!str) return null;
  const s = str.toUpperCase().trim();
  if (s.includes('00981A') || s.includes('49YTW')) return OFFICIAL_FUND_METADATA['00981A.TW'];
  if (s.includes('00403A') || s.includes('63YTW')) return OFFICIAL_FUND_METADATA['00403A.TW'];
  if (s.includes('00982A') || s.includes('399')) return OFFICIAL_FUND_METADATA['00982A.TW'];
  if (s.includes('00992A') || s.includes('500')) return OFFICIAL_FUND_METADATA['00992A.TW'];
  if (s.includes('00407A') || s.includes('J024')) return OFFICIAL_FUND_METADATA['00407A.TW'];
  return null;
}

export function deduplicateFunds(funds: FundData[]): FundData[] {
  const map = new Map<string, FundData>();
  
  funds.forEach((f) => {
    const rawKey = (f.code || f.id || f.name || '').toUpperCase().trim();
    const official = getOfficialMetadata(rawKey) || getOfficialMetadata(f.id) || getOfficialMetadata(f.name) || getOfficialMetadata(f.url);
    const key = official?.code || rawKey;

    const cleanSnapshots = (f.snapshots || []).map((s) => ({
      ...s,
      date: normalizeDateString(s.date || s.asOfDate),
      asOfDate: normalizeDateString(s.asOfDate || s.date),
      holdings: deduplicateSnapshotHoldings(s.holdings || []),
    }));

    if (!map.has(key)) {
      map.set(key, {
        ...f,
        id: official?.code || f.id || key,
        code: official?.code || f.code || key,
        name: official?.name || cleanFundName(f.name, f.code),
        url: official?.url || f.url || '',
        manager: official?.manager || f.manager,
        category: official?.category || f.category,
        snapshots: cleanSnapshots,
      });
    } else {
      // Merge snapshots into existing fund entry without losing newer/valid data
      const existingFund = map.get(key)!;
      const snapMap = new Map<string, any>();
      (existingFund.snapshots || []).forEach((s) => {
        const k = normalizeDateString(s.date || s.asOfDate);
        if (k) snapMap.set(k, s);
      });

      cleanSnapshots.forEach((s) => {
        const k = normalizeDateString(s.date || s.asOfDate);
        if (!k) return;
        const prev = snapMap.get(k);
        const prevValid = prev && Array.isArray(prev.holdings) && prev.holdings.some((h: any) => Number(h.shares) > 0 || Number(h.ratio) > 0);
        const currValid = Array.isArray(s.holdings) && s.holdings.some((h: any) => Number(h.shares) > 0 || Number(h.ratio) > 0);

        if (!prev || (!prevValid && currValid)) {
          snapMap.set(k, s);
        }
      });

      const mergedSnaps = Array.from(snapMap.values()).sort(
        (a, b) => new Date((b.date || b.asOfDate).replace(/\//g, '-')).getTime() - new Date((a.date || a.asOfDate).replace(/\//g, '-')).getTime()
      );

      map.set(key, {
        ...existingFund,
        id: official?.code || existingFund.id,
        code: official?.code || existingFund.code,
        name: official?.name || existingFund.name,
        url: official?.url || existingFund.url,
        manager: official?.manager || existingFund.manager,
        category: official?.category || existingFund.category,
        asOfDate: mergedSnaps[0]?.asOfDate || existingFund.asOfDate,
        navDate: mergedSnaps[0]?.asOfDate || existingFund.navDate,
        snapshots: mergedSnaps,
      });
    }
  });

  // Ensure all 5 official preset funds exist in the output map
  INITIAL_FUNDS.forEach((preset) => {
    const pOfficial = getOfficialMetadata(preset.code);
    const pKey = pOfficial?.code || preset.code;
    if (!map.has(pKey)) {
      map.set(pKey, preset);
    }
  });

  return Array.from(map.values());
}

export function getSavedFunds(): FundData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Clean out invalid snapshots if present, merge preset updates, and deduplicate
        const sanitized = parsed.map((fund: FundData) => {
          const codeUpper = (fund.code || fund.id || '').toUpperCase().trim();
          const official = getOfficialMetadata(codeUpper) || getOfficialMetadata(fund.id) || getOfficialMetadata(fund.name);
          const presetMatch = INITIAL_FUNDS.find((p) => p.code.toUpperCase().trim() === codeUpper || p.code === official?.code);

          let snapshots = (fund.snapshots || []).filter(
            (snap) => !snap.date?.includes('05/31') && !snap.asOfDate?.includes('05/31') && !snap.date?.includes('5/31') && !snap.asOfDate?.includes('5/31')
          );

          // If preset fund exists, ensure fresh preset snapshots overwrite stale dummy holdings
          if (presetMatch && presetMatch.snapshots && presetMatch.snapshots.length > 0) {
            const snapMap = new Map<string, any>();
            snapshots.forEach((s) => {
              const k = normalizeDateString(s.date || s.asOfDate);
              if (k) snapMap.set(k, s);
            });

            presetMatch.snapshots.forEach((presetSnap) => {
              const pk = normalizeDateString(presetSnap.date || presetSnap.asOfDate);
              const existingSnap = snapMap.get(pk);
              const hasOldDummyIds = existingSnap && existingSnap.holdings && existingSnap.holdings.some((h: any) => h.id && (h.id.startsWith('e3_') || h.id.startsWith('e2_')));
              const lacksValidData = existingSnap && (!Array.isArray(existingSnap.holdings) || !existingSnap.holdings.some((h: any) => Number(h.shares) > 0 || Number(h.price) > 0));

              const isManualSnap = existingSnap && existingSnap.isManual;
              if (!isManualSnap && (!snapMap.has(pk) || hasOldDummyIds || lacksValidData)) {
                snapMap.set(pk, presetSnap);
              }
            });

            snapshots = Array.from(snapMap.values());
          }

          // Sort snapshots descending by date
          snapshots.sort(
            (a, b) => new Date((b.date || b.asOfDate).replace(/\//g, '-')).getTime() - new Date((a.date || a.asOfDate).replace(/\//g, '-')).getTime()
          );

          return {
            ...fund,
            id: official?.code || fund.id,
            code: official?.code || fund.code,
            name: official?.name || cleanFundName(fund.name, fund.code),
            url: official?.url || fund.url || '',
            manager: official?.manager || fund.manager,
            category: official?.category || fund.category,
            currentNav: presetMatch?.currentNav || fund.currentNav || 8.80,
            navDate: snapshots[0]?.asOfDate || snapshots[0]?.date || fund.navDate || '2026/08/05',
            asOfDate: snapshots[0]?.asOfDate || snapshots[0]?.date || fund.asOfDate || '2026/08/05',
            snapshots,
          };
        });

        // Ensure missing preset funds are also included in user state
        INITIAL_FUNDS.forEach((preset) => {
          const key = preset.code.toUpperCase().trim();
          if (!sanitized.some((f) => (f.code || f.id).toUpperCase().trim() === key)) {
            sanitized.push(preset);
          }
        });

        return deduplicateFunds(sanitized);
      }
    }
  } catch (e) {
    console.error('Error reading saved funds:', e);
  }
  return deduplicateFunds(INITIAL_FUNDS);
}

export function saveFunds(funds: FundData[]): void {
  try {
    const clean = deduplicateFunds(funds);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (e) {
    console.error('Error saving funds:', e);
  }
}

// Scrape live fund from backend endpoint
export async function fetchLiveFundData(fundCodeOrUrl: string): Promise<FundData | null> {
  try {
    const res = await fetch('/api/scrape-fund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fundCode: fundCodeOrUrl, fundUrl: fundCodeOrUrl }),
    });

    const resText = await res.text();
    let result: any = {};
    try {
      result = JSON.parse(resText);
    } catch {
      result = {};
    }

    if (result.success && result.data) {
      const scraped = result.data;
      const officialMeta = getOfficialMetadata(scraped.fundCode || fundCodeOrUrl);
      const existing = getSavedFunds().find((f) => f.code.toUpperCase().trim() === (officialMeta?.code || scraped.fundCode).toUpperCase().trim() || f.id.toUpperCase().trim() === (officialMeta?.code || scraped.fundCode).toUpperCase().trim());

      const normDate = normalizeDateString(scraped.asOfDate || new Date().toISOString().slice(0, 10).replace(/-/g, '/'));

      const newSnapshot = {
        date: normDate,
        asOfDate: normDate,
        holdings: scraped.holdings || [],
      };

      const snapMap = new Map<string, any>();
      (existing?.snapshots || []).forEach((s) => {
        const k = normalizeDateString(s.date || s.asOfDate);
        if (k) snapMap.set(k, s);
      });

      // If current date already has manual data, do NOT overwrite it!
      const existingSnap = snapMap.get(normDate);
      if (existingSnap && existingSnap.isManual) {
        console.log(`[Scraper] Date ${normDate} has manual holdings, skipping auto-overwrite.`);
      } else {
        snapMap.set(normDate, newSnapshot);
      }

      const updatedSnapshots = Array.from(snapMap.values()).map((s) => ({
        ...s,
        date: normalizeDateString(s.date || s.asOfDate),
        asOfDate: normalizeDateString(s.asOfDate || s.date),
      })).sort(
        (a, b) => new Date(b.date.replace(/\//g, '-')).getTime() - new Date(a.date.replace(/\//g, '-')).getTime()
      );

      const latestDate = updatedSnapshots[0]?.asOfDate || normDate;

      const updatedFund: FundData = {
        id: officialMeta?.code || scraped.fundCode,
        code: officialMeta?.code || scraped.fundCode,
        name: officialMeta?.name || scraped.fundName || existing?.name || `基金 ${scraped.fundCode}`,
        manager: officialMeta?.manager || existing?.manager || '台灣公開募集基金',
        category: officialMeta?.category || existing?.category || '台灣股票型基金',
        url: officialMeta?.url || scraped.url || existing?.url || '',
        currentNav: scraped.currentNav || existing?.currentNav || 8.80,
        navDate: latestDate,
        oneYearReturn: existing?.oneYearReturn || 35.0,
        threeYearReturn: existing?.threeYearReturn || 110.0,
        asOfDate: latestDate,
        snapshots: updatedSnapshots,
        lastUpdated: new Date().toLocaleString('zh-TW'),
      };

      return updatedFund;
    }
  } catch (err) {
    console.warn('Scraping service failed or backend unreachable, fallbacking to cached preset:', err);
  }

  // Fallback if network or live scraping fails
  const code = fundCodeOrUrl.toUpperCase().trim();
  const officialMeta = getOfficialMetadata(code);
  const searchKey = officialMeta?.code || code;
  const found = getSavedFunds().find((f) => f.code.toUpperCase().trim() === searchKey || f.id.toUpperCase().trim() === searchKey);
  return found || null;
}

// Calculate Date-to-Date Holding Changes (新進/加碼/減碼/出清)
export function calculateHoldingChanges(
  latestHoldings: any[],
  previousHoldings: any[],
  latestDate: string,
  previousDate: string
): HoldingChange[] {
  const changes: HoldingChange[] = [];
  const latestMap = new Map<string, any>();
  const prevMap = new Map<string, any>();

  latestHoldings.forEach((item) => {
    const key = (item.stockCode || item.stockName).trim();
    latestMap.set(key, item);
  });

  previousHoldings.forEach((item) => {
    const key = (item.stockCode || item.stockName).trim();
    prevMap.set(key, item);
  });

  // Check latest holdings for new or changed
  latestMap.forEach((item, key) => {
    const prevItem = prevMap.get(key);
    if (!prevItem) {
      changes.push({
        stockName: item.stockName,
        stockCode: item.stockCode,
        price: item.price,
        latestDate,
        previousDate,
        latestShares: item.shares,
        previousShares: 0,
        diffShares: item.shares,
        latestRatio: item.ratio,
        previousRatio: 0,
        diffRatio: item.ratio,
        status: 'new',
      });
    } else {
      const diffShares = item.shares - prevItem.shares;
      const diffRatio = +(item.ratio - prevItem.ratio).toFixed(2);
      let status: HoldingChange['status'] = 'unchanged';

      if (diffShares > 0) status = 'increase';
      else if (diffShares < 0) status = 'decrease';

      changes.push({
        stockName: item.stockName,
        stockCode: item.stockCode,
        price: item.price || prevItem.price,
        latestDate,
        previousDate,
        latestShares: item.shares,
        previousShares: prevItem.shares,
        diffShares,
        latestRatio: item.ratio,
        previousRatio: prevItem.ratio,
        diffRatio,
        status,
      });
    }
  });

  // Check prev holdings for exits
  prevMap.forEach((prevItem, key) => {
    if (!latestMap.has(key)) {
      changes.push({
        stockName: prevItem.stockName,
        stockCode: prevItem.stockCode,
        price: prevItem.price,
        latestDate,
        previousDate,
        latestShares: 0,
        previousShares: prevItem.shares,
        diffShares: -prevItem.shares,
        latestRatio: 0,
        previousRatio: prevItem.ratio,
        diffRatio: -prevItem.ratio,
        status: 'exit',
      });
    }
  });

  return changes.sort((a, b) => Math.abs(b.diffRatio) - Math.abs(a.diffRatio));
}

// Calculate Cross-Fund Stock Overlap (跨基金持股重疊分析)
export function calculateStockOverlap(funds: FundData[]): StockOverlap[] {
  const stockMap = new Map<string, StockOverlap>();

  funds.forEach((fund) => {
    const latestSnapshot = fund.snapshots[0];
    if (!latestSnapshot) return;

    latestSnapshot.holdings.forEach((item) => {
      // Clean stock name
      let cleanName = item.stockName;
      let code = item.stockCode;
      const codeMatch = cleanName.match(/(\d{4})/);
      if (codeMatch && !code) code = codeMatch[1];

      const key = code || cleanName;

      if (!stockMap.has(key)) {
        stockMap.set(key, {
          stockName: cleanName,
          stockCode: code,
          price: item.price,
          funds: [],
          totalRatio: 0,
          totalShares: 0,
          fundCount: 0,
        });
      }

      const existing = stockMap.get(key)!;
      if (!existing.price && item.price) {
        existing.price = item.price;
      }

      existing.funds.push({
        fundId: fund.id,
        fundCode: fund.code,
        fundName: fund.name,
        shares: item.shares,
        ratio: item.ratio,
        price: item.price,
      });
      existing.totalRatio += item.ratio;
      existing.totalShares += item.shares;
      existing.fundCount += 1;
    });
  });

  return Array.from(stockMap.values())
    .map((s) => ({
      ...s,
      totalRatio: +s.totalRatio.toFixed(2),
    }))
    .sort((a, b) => b.fundCount - a.fundCount || b.totalRatio - a.totalRatio);
}

/**
 * Auto-fetch live TW stock prices from backend endpoint and update funds state
 */
export async function fetchAndUpdateLiveStockPrices(funds: FundData[]): Promise<FundData[]> {
  const stockCodeSet = new Set<string>();

  funds.forEach((fund) => {
    fund.snapshots.forEach((snap) => {
      snap.holdings.forEach((h) => {
        let code = h.stockCode;
        if (!code) {
          const match = h.stockName.match(/(\d{4})/);
          if (match) code = match[1];
        }
        if (code) stockCodeSet.add(code);
      });
    });
  });

  const codes = Array.from(stockCodeSet);
  if (codes.length === 0) return funds;

  try {
    const res = await fetch('/api/fetch-stock-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stockCodes: codes }),
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
    if (data.success && data.priceMap) {
      const priceMap: Record<string, { price: number }> = data.priceMap;

      const updatedFunds = funds.map((fund) => {
        const updatedSnapshots = fund.snapshots.map((snap) => {
          const updatedHoldings = snap.holdings.map((h) => {
            let code = h.stockCode;
            if (!code) {
              const match = h.stockName.match(/(\d{4})/);
              if (match) code = match[1];
            }

            const liveInfo = code ? priceMap[code] : undefined;
            const newPrice = liveInfo?.price || h.price;

            return {
              ...h,
              stockCode: code || h.stockCode,
              price: newPrice,
              marketValue: newPrice ? newPrice * h.shares : h.marketValue,
            };
          });

          return {
            ...snap,
            holdings: updatedHoldings,
          };
        });

        return {
          ...fund,
          snapshots: updatedSnapshots,
          lastUpdated: new Date().toLocaleString('zh-TW'),
        };
      });

      saveFunds(updatedFunds);
      return updatedFunds;
    }
  } catch (err) {
    console.warn('Failed to fetch live stock prices:', err);
  }

  return funds;
}

/**
 * Push APP's active fund holdings (with exact shares, ratio, price, marketValue) directly to Google Sheets database.
 * Priority: APP active data overwrites Google Sheets data.
 */
export async function pushAppDataToSheets(
  funds: FundData[],
  webAppUrl?: string,
  uploadedAt?: string
): Promise<{ success: boolean; message?: string }> {
  const savedUrl = typeof window !== 'undefined' ? localStorage.getItem('tw_fund_web_app_url') : null;
  const defaultWebAppUrl = (webAppUrl || savedUrl || 'https://script.google.com/macros/s/AKfycbyAPZfZYLT1Igoo1BRAc6GDdvUcWYTV9HubJVQOGjK1NHqNsjSCpnR0kH4VCgM_6xMm/exec').trim();

  const uploadTimestamp = uploadedAt || new Date().toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/-/g, '/');
  try {
    localStorage.setItem('db_last_uploaded_time', uploadTimestamp);
  } catch (e) {}

  const fundDataList = funds.map((fund) => {
    const activeSnap = fund.snapshots[0];
    return {
      code: fund.code,
      asOfDate: normalizeDateString(activeSnap?.asOfDate || fund.asOfDate || '2026/08/03'),
      holdings: (activeSnap?.holdings || []).map((h) => ({
        stockName: h.stockName,
        stockCode: h.stockCode,
        price: h.price || 0,
        marketValue: Math.round(h.marketValue || ((h.price || 0) * h.shares)),
        shares: h.shares,
        sharesFormatted: h.sharesFormatted || h.shares.toLocaleString(),
        ratio: h.ratio,
      })),
    };
  });

  try {
    const pushRes = await fetch('/api/push-app-data-to-sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webAppUrl: defaultWebAppUrl,
        fundDataList,
        uploadedAt: uploadTimestamp,
      }),
    });
    const responseText = await pushRes.text();
    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      return {
        success: false,
        message: 'Google 試算表 Web App 回傳非 JSON 格式 (請於試算表確認 Web App 部署且權限設為「所有人」)',
      };
    }

    if (result.success === false || result.error) {
      return {
        success: false,
        message: result.error || '無法存取 Google 試算表 Web App',
      };
    }

    return {
      success: true,
      message: result.message || '✅ 成功將目前網頁資料上傳至 Google 試算表資料庫！',
    };
  } catch (err: any) {
    console.warn('Push app data to sheets warning:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Automatically fetch and sync database records & historical periods between Google Sheets & local web app memory.
 * Performs bidirectional deduplication, date normalization, and saves result to local storage.
 * APP Priority Rule: APP active data takes priority over Google Sheets.
 */
export async function syncAndMergeSheetsDatabase(
  inputFunds?: FundData[] | string,
  webAppUrl?: string,
  spreadsheetId?: string
): Promise<{
  updatedFunds: FundData[];
  syncedPeriodsCount: number;
  totalFundsSynced: number;
  latestUploadTime?: string;
  source: string;
}> {
  let targetFunds: FundData[];
  let targetWebAppUrl: string | undefined = webAppUrl;
  let targetSpreadsheetId: string | undefined = spreadsheetId;

  if (Array.isArray(inputFunds)) {
    targetFunds = inputFunds;
  } else {
    if (typeof inputFunds === 'string') {
      targetWebAppUrl = inputFunds;
    }
    targetFunds = getSavedFunds();
  }

  const savedUrl = typeof window !== 'undefined' ? localStorage.getItem('tw_fund_web_app_url') : null;
  const savedSpreadsheetId = typeof window !== 'undefined' ? localStorage.getItem('tw_fund_spreadsheet_id') : null;

  const defaultSpreadsheetId = targetSpreadsheetId || savedSpreadsheetId || '1u4F6xNbGf2HqkwJL2kXxolEKUObzHWnMdHaGsbI5ypo';
  const defaultWebAppUrl = targetWebAppUrl || savedUrl || 'https://script.google.com/macros/s/AKfycbyAPZfZYLT1Igoo1BRAc6GDdvUcWYTV9HubJVQOGjK1NHqNsjSCpnR0kH4VCgM_6xMm/exec';

  let rawSheetData: any[] | null = null;
  let dataSource = 'Google Sheets 資料庫';
  let fetchedLatestUploadTime = '';

  try {
    const res = await fetch('/api/read-sheets-database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webAppUrl: defaultWebAppUrl,
        spreadsheetId: defaultSpreadsheetId,
        fundCodes: targetFunds.map((f) => f.code),
      }),
    });

    if (res.ok) {
      const resText = await res.text();
      let result: any = {};
      try {
        result = JSON.parse(resText);
      } catch {
        result = {};
      }
      if (result.success && Array.isArray(result.data)) {
        rawSheetData = result.data;
        if (result.source) dataSource = result.source;
        if (result.latestUploadTime) {
          fetchedLatestUploadTime = result.latestUploadTime;
          try {
            localStorage.setItem('db_last_uploaded_time', fetchedLatestUploadTime);
          } catch (e) {}
        }
      }
    }
  } catch (err) {
    console.log('Server /api/read-sheets-database unavailable, falling back to direct Google Apps Script Web App fetch...');
  }

  // Fallback for static client environment (GitHub Pages): Direct client-side fetch from Google Apps Script
  if (!rawSheetData && defaultWebAppUrl) {
    try {
      const directRes = await fetch(defaultWebAppUrl);
      if (directRes.ok) {
        const text = await directRes.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        if (json && (json.status === 'success' || Array.isArray(json.data)) && Array.isArray(json.data || json)) {
          rawSheetData = json.data || json;
          dataSource = 'Google Apps Script 雲端資料庫';
          if (json.latestUploadTime) {
            fetchedLatestUploadTime = json.latestUploadTime;
            try {
              localStorage.setItem('db_last_uploaded_time', fetchedLatestUploadTime);
            } catch (e) {}
          }
        }
      }
    } catch (directErr) {
      console.warn('Direct Google Apps Script fetch warning:', directErr);
    }
  }

  if (rawSheetData && Array.isArray(rawSheetData)) {
    try {
      let totalSyncedPeriods = 0;
      let totalFundsSynced = 0;

      // 1. Merge Sheets data into existing local funds
      const updatedFundsList = targetFunds.map((fund) => {
        const official = getOfficialMetadata(fund.code) || getOfficialMetadata(fund.id) || getOfficialMetadata(fund.name);
        const cleanFundCode = fund.code.replace('.TW', '').toUpperCase();

        const sheetData = rawSheetData!.find((item: any) => {
          const itemMeta = getOfficialMetadata(item.code) || getOfficialMetadata(item.sheetName);
          if (official && itemMeta) return official.code === itemMeta.code;
          return (item.code || '').toUpperCase().trim() === cleanFundCode;
        });

        const existingSnapshots = fund.snapshots || [];
        const existingDateMap = new Map(
          existingSnapshots.map((s) => [normalizeDateString(s.date || s.asOfDate), s])
        );

        if (sheetData && Array.isArray(sheetData.snapshots) && sheetData.snapshots.length > 0) {
          totalFundsSynced++;
          sheetData.snapshots.forEach((newSnap: any) => {
            const rawKey = newSnap.date || newSnap.asOfDate;
            const dateKey = normalizeDateString(rawKey);
            if (dateKey) {
              const prev = existingDateMap.get(dateKey);
              const prevHasValidData = prev && Array.isArray(prev.holdings) && prev.holdings.some((h: any) => Number(h.shares) > 0 || Number(h.ratio) > 0);

              if (!prev) {
                // App does not have this period snapshot; populate from Google Sheets
                existingDateMap.set(dateKey, {
                  date: dateKey,
                  asOfDate: dateKey,
                  holdings: newSnap.holdings || [],
                });
                totalSyncedPeriods++;
              } else if (!prevHasValidData && newSnap.holdings && newSnap.holdings.length > 0) {
                // App snapshot lacked valid shares/prices; update from Google Sheets
                existingDateMap.set(dateKey, {
                  date: dateKey,
                  asOfDate: dateKey,
                  holdings: newSnap.holdings || [],
                });
              }
            }
          });
        }

        const mergedSnapshots = Array.from(existingDateMap.values()).map((s) => ({
          ...s,
          date: normalizeDateString(s.date || s.asOfDate),
          asOfDate: normalizeDateString(s.asOfDate || s.date),
        })).sort(
          (a, b) => new Date(b.date.replace(/\//g, '-')).getTime() - new Date(a.date.replace(/\//g, '-')).getTime()
        );

        const latestDate = mergedSnapshots[0]?.asOfDate || fund.asOfDate;

        return {
          ...fund,
          id: official?.code || fund.id,
          code: official?.code || fund.code,
          name: official?.name || fund.name,
          url: official?.url || fund.url,
          manager: official?.manager || fund.manager,
          category: official?.category || fund.category,
          asOfDate: normalizeDateString(latestDate),
          snapshots: mergedSnapshots,
          lastUpdated: new Date().toLocaleString('zh-TW'),
        };
      });

      // 2. Add any funds from Google Sheets that were missing locally
      rawSheetData.forEach((sheetItem: any) => {
        const sheetCode = (sheetItem.code || '').toUpperCase().trim();
        const sheetMeta = getOfficialMetadata(sheetCode) || getOfficialMetadata(sheetItem.sheetName);
        if (!sheetCode && !sheetMeta) return;

        const exists = updatedFundsList.some((f) => {
          const fMeta = getOfficialMetadata(f.code) || getOfficialMetadata(f.id) || getOfficialMetadata(f.name);
          if (sheetMeta && fMeta) return sheetMeta.code === fMeta.code;
          return f.code.replace('.TW', '').toUpperCase() === sheetCode;
        });

        if (!exists && Array.isArray(sheetItem.snapshots) && sheetItem.snapshots.length > 0) {
          const newSnapshots = sheetItem.snapshots.map((s: any) => ({
            ...s,
            date: normalizeDateString(s.date || s.asOfDate),
            asOfDate: normalizeDateString(s.asOfDate || s.date),
          })).sort(
            (a: any, b: any) => new Date(b.date.replace(/\//g, '-')).getTime() - new Date(a.date.replace(/\//g, '-')).getTime()
          );

          const codeToUse = sheetMeta?.code || (sheetCode.includes('.') ? sheetCode : `${sheetCode}.TW`);
          updatedFundsList.push({
            id: codeToUse,
            code: codeToUse,
            name: sheetMeta?.name || (sheetItem.sheetName ? sheetItem.sheetName.replace('基金明細_', '') : `基金 ${sheetCode}`),
            manager: sheetMeta?.manager || '公開資訊',
            category: sheetMeta?.category || '股票型',
            url: sheetMeta?.url || `https://www.google.com/search?q=${sheetCode}`,
            currentNav: 0,
            navDate: newSnapshots[0]?.asOfDate || '2026/08/05',
            oneYearReturn: 0,
            threeYearReturn: 0,
            asOfDate: newSnapshots[0]?.asOfDate || '2026/08/05',
            snapshots: newSnapshots,
            lastUpdated: new Date().toLocaleString('zh-TW'),
          });
          totalFundsSynced++;
        }
      });

      // 3. Bidirectional Sync: Push merged complete dataset back to Google Sheets
      const itemsToPush: Array<{ code: string; asOfDate: string; holdings: any[] }> = [];
      updatedFundsList.forEach((fund) => {
        const cleanCode = fund.code.replace('.TW', '');
        (fund.snapshots || []).forEach((snap) => {
          const dateStr = normalizeDateString(snap.asOfDate || snap.date);
          if (dateStr && snap.holdings && snap.holdings.length > 0) {
            itemsToPush.push({
              code: cleanCode,
              asOfDate: dateStr,
              holdings: snap.holdings,
            });
          }
        });
      });

      if (itemsToPush.length > 0) {
        try {
          await fetch('/api/push-app-data-to-sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              webAppUrl: defaultWebAppUrl,
              fundDataList: itemsToPush,
            }),
          });
        } catch (pushErr) {
          try {
            await fetch(defaultWebAppUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fundDataList: itemsToPush }),
              mode: 'no-cors',
            });
          } catch (e) {}
        }
      }

      // 4. Save to local web app memory (localStorage)
      saveFunds(updatedFundsList);

      return {
        updatedFunds: updatedFundsList,
        syncedPeriodsCount: totalSyncedPeriods,
        totalFundsSynced,
        latestUploadTime: fetchedLatestUploadTime || (typeof window !== 'undefined' ? localStorage.getItem('db_last_uploaded_time') || undefined : undefined),
        source: dataSource,
      };
    } catch (err) {
      console.warn('Error syncing with Google Sheets database:', err);
    }
  }

  // Fallback: save target funds to localStorage and return
  saveFunds(targetFunds);
  return {
    updatedFunds: targetFunds,
    syncedPeriodsCount: 0,
    totalFundsSynced: targetFunds.length,
    source: '本機記憶體',
  };
}

/**
 * Generates date strings for +/- 3 business days (excluding weekends) around baseDateStr.
 */
export function getBusinessDayOptions(baseDateStr: string): string[] {
  const normalized = normalizeDateString(baseDateStr || '2026/08/04');
  const parts = normalized.split('/').map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return [normalized || '2026/08/04'];
  }

  const baseDate = new Date(parts[0], parts[1] - 1, parts[2]);

  // Generate -3 business days
  const past: Date[] = [];
  let curr = new Date(baseDate);
  while (past.length < 3) {
    curr.setDate(curr.getDate() - 1);
    const day = curr.getDay();
    if (day !== 0 && day !== 6) {
      past.unshift(new Date(curr));
    }
  }

  // Generate +3 business days
  const future: Date[] = [];
  curr = new Date(baseDate);
  while (future.length < 3) {
    curr.setDate(curr.getDate() + 1);
    const day = curr.getDay();
    if (day !== 0 && day !== 6) {
      future.push(new Date(curr));
    }
  }

  const all = [...past, baseDate, ...future];
  return all.map((d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  });
}

/**
 * Parses user input multiline raw holdings text into top 20 holdings items.
 * Supports both horizontal table format (tab/comma/space separated lines)
 * and vertical single-column format (4 sequential lines per stock item).
 * Filters out stocks with ratio < 1%, sorts descending, and returns Top 20.
 */
export function parseManualHoldingText(rawText: string, targetDate: string): HoldingItem[] {
  if (!rawText) return [];

  const rawLines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const holdings: HoldingItem[] = [];

  // Helper to extract shares & ratio regardless of order
  const extractSharesAndRatio = (rawA: string, rawB: string): { shares: number; ratio: number } => {
    const isAPercent = rawA.includes('%');
    const isBPercent = rawB.includes('%');

    if (isAPercent && !isBPercent) {
      const ratio = parseFloat(rawA.replace('%', '').replace(/[^0-9.]/g, '')) || 0;
      const shares = parseInt(rawB.replace(/,/g, '').replace(/[^0-9]/g, ''), 10) || 0;
      return { shares, ratio };
    }

    if (!isAPercent && isBPercent) {
      const shares = parseInt(rawA.replace(/,/g, '').replace(/[^0-9]/g, ''), 10) || 0;
      const ratio = parseFloat(rawB.replace('%', '').replace(/[^0-9.]/g, '')) || 0;
      return { shares, ratio };
    }

    const valA = parseFloat(rawA.replace(/%/g, '').replace(/,/g, '')) || 0;
    const valB = parseFloat(rawB.replace(/%/g, '').replace(/,/g, '')) || 0;

    if (rawA.includes(',') || valA > 100) {
      return { shares: valA, ratio: valB };
    }
    if (rawB.includes(',') || valB > 100) {
      return { shares: valB, ratio: valA };
    }

    if (valA >= valB) {
      return { shares: valA, ratio: valB };
    } else {
      return { shares: valB, ratio: valA };
    }
  };

  // 1. Try horizontal parsing (lines with >= 4 tokens)
  const horizontalRows: string[][] = [];
  for (const line of rawLines) {
    if (
      line.includes('股票代號') ||
      line.includes('股票名稱') ||
      line.includes('代號') ||
      line.includes('持股權重')
    ) {
      continue;
    }

    let tokens: string[] = [];
    if (line.includes('\t')) {
      tokens = line.split('\t').map((t) => t.trim()).filter(Boolean);
    } else {
      tokens = line.split(/\s{2,}/).map((t) => t.trim()).filter(Boolean);
      if (tokens.length < 4) {
        tokens = line.split(/\s+/).map((t) => t.trim()).filter(Boolean);
      }
    }

    if (tokens.length >= 4) {
      horizontalRows.push(tokens);
    }
  }

  if (horizontalRows.length > 0) {
    // Parse horizontal table format
    for (const tokens of horizontalRows) {
      const rawCode = tokens[0];
      const rawName = tokens[1];
      const cleanCode = rawCode.replace(/[^0-9A-Za-z]/g, '');
      if (!cleanCode) continue;

      let cleanName = rawName.replace(/\*/g, '').trim();
      if (!cleanName.includes(`(${cleanCode})`)) {
        cleanName = `${cleanName} (${cleanCode})`;
      }

      const { shares, ratio } = extractSharesAndRatio(tokens[2], tokens[3]);

      holdings.push({
        id: `manual_${cleanCode}_${Math.random().toString(36).substring(2, 6)}`,
        stockName: cleanName,
        stockCode: cleanCode,
        shares,
        sharesFormatted: shares.toLocaleString('zh-TW'),
        ratio,
        date: targetDate,
      });
    }
  } else {
    // 2. Vertical single-column format (4 sequential lines per stock)
    const singleLines = rawLines.filter((line) => {
      return !(
        line === '股票代號' ||
        line === '股票名稱' ||
        line.includes('持股權重') ||
        line === '股數' ||
        line === '代號' ||
        line === '名稱' ||
        line === '權重'
      );
    });

    for (let i = 0; i + 3 < singleLines.length; i += 4) {
      const rawCode = singleLines[i];
      const rawName = singleLines[i + 1];
      const rawA = singleLines[i + 2];
      const rawB = singleLines[i + 3];

      const cleanCode = rawCode.replace(/[^0-9A-Za-z]/g, '');
      if (!cleanCode) continue;

      let cleanName = rawName.replace(/\*/g, '').trim();
      if (!cleanName.includes(`(${cleanCode})`)) {
        cleanName = `${cleanName} (${cleanCode})`;
      }

      const { shares, ratio } = extractSharesAndRatio(rawA, rawB);

      holdings.push({
        id: `manual_${cleanCode}_${Math.random().toString(36).substring(2, 6)}`,
        stockName: cleanName,
        stockCode: cleanCode,
        shares,
        sharesFormatted: shares.toLocaleString('zh-TW'),
        ratio,
        date: targetDate,
      });
    }
  }

  // Deduplicate by stockCode keeping highest ratio
  const map = new Map<string, HoldingItem>();
  holdings.forEach((item) => {
    const existing = map.get(item.stockCode);
    if (!existing || item.ratio > existing.ratio) {
      map.set(item.stockCode, item);
    }
  });

  const deduped = Array.from(map.values());

  // Filter out stocks with ratio < 1% (keep only ratio >= 1%)
  const filtered = deduped.filter((item) => item.ratio >= 1);

  // Sort by ratio descending
  filtered.sort((a, b) => b.ratio - a.ratio);

  // Return Top 20
  return filtered.slice(0, 20);
}



