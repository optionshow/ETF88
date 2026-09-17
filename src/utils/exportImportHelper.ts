import { FundData, HoldingItem, FundHoldingSnapshot } from '../types';
import { normalizeDateString } from '../services/fundService';

/**
 * 匯出單一基金歷史或特定期別持股明細為 Google 試算表相容 CSV
 * 欄位：日期, 個股名稱, 目前股價, 持股市值(萬), 投資股數, 比例(%)
 */
export function exportFundToCsv(fund: FundData, snapshotDate?: string): string {
  const headers = ['日期', '個股名稱', '目前股價', '持股市值(萬)', '投資股數', '比例(%)'];
  const rows: string[][] = [headers];

  const snapshots = (fund.snapshots || []).filter((s) => {
    if (!snapshotDate) return true;
    return normalizeDateString(s.date || s.asOfDate) === normalizeDateString(snapshotDate);
  });

  // 排序：由新到舊，限制最多最新 30 天
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    const da = normalizeDateString(a.date || a.asOfDate).replace(/\//g, '-');
    const db = normalizeDateString(b.date || b.asOfDate).replace(/\//g, '-');
    return new Date(db).getTime() - new Date(da).getTime();
  }).slice(0, 30);

  sortedSnapshots.forEach((snap) => {
    const dateStr = normalizeDateString(snap.date || snap.asOfDate);
    const holdings = snap.holdings || [];

    holdings.slice(0, 20).forEach((h) => {
      const priceStr = h.price ? Number(h.price).toLocaleString() : '-';
      const sharesNum = Number(h.shares) || 0;
      const mv = h.marketValue || (h.price ? Math.round((Number(h.price) * sharesNum) / 10000) : 0);
      const mvStr = mv > 0 ? `${mv.toLocaleString()} 萬` : '-';
      const sharesStr = h.sharesFormatted || (sharesNum ? sharesNum.toLocaleString() : '0');
      const ratioStr = `${h.ratio}%`;

      rows.push([
        dateStr,
        h.stockName || '',
        priceStr,
        mvStr,
        sharesStr,
        ratioStr,
      ]);
    });
  });

  // 加入 UTF-8 BOM 避免 Excel 或 Google 試算表匯入時中文亂碼
  return '\uFEFF' + rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
}

/**
 * 匯出全部追蹤基金之歷史持股明細為 CSV
 * 包含基金代號與基金名稱欄位
 */
export function exportAllFundsToCsv(funds: FundData[]): string {
  const headers = ['基金代碼', '基金名稱', '日期', '個股名稱', '目前股價', '持股市值(萬)', '投資股數', '比例(%)'];
  const rows: string[][] = [headers];

  funds.forEach((fund) => {
    const fundCode = fund.code.replace('.TW', '');
    const fundName = fund.name;

    const sortedSnapshots = [...(fund.snapshots || [])].sort((a, b) => {
      const da = normalizeDateString(a.date || a.asOfDate).replace(/\//g, '-');
      const db = normalizeDateString(b.date || b.asOfDate).replace(/\//g, '-');
      return new Date(db).getTime() - new Date(da).getTime();
    }).slice(0, 30);

    sortedSnapshots.forEach((snap) => {
      const dateStr = normalizeDateString(snap.date || snap.asOfDate);
      const holdings = snap.holdings || [];

      holdings.slice(0, 20).forEach((h) => {
        const priceStr = h.price ? Number(h.price).toLocaleString() : '-';
        const sharesNum = Number(h.shares) || 0;
        const mv = h.marketValue || (h.price ? Math.round((Number(h.price) * sharesNum) / 10000) : 0);
        const mvStr = mv > 0 ? `${mv.toLocaleString()} 萬` : '-';
        const sharesStr = h.sharesFormatted || (sharesNum ? sharesNum.toLocaleString() : '0');
        const ratioStr = `${h.ratio}%`;

        rows.push([
          fundCode,
          fundName,
          dateStr,
          h.stockName || '',
          priceStr,
          mvStr,
          sharesStr,
          ratioStr,
        ]);
      });
    });
  });

  return '\uFEFF' + rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
}

/**
 * 匯出完整網頁備份資料為 JSON
 */
export function exportAllFundsToJson(funds: FundData[]): string {
  const backupObject = {
    version: '2.1',
    exportedAt: new Date().toISOString(),
    fundsCount: funds.length,
    funds: funds.map((f) => ({
      ...f,
      snapshots: (f.snapshots || []).slice(0, 30),
    })),
  };
  return JSON.stringify(backupObject, null, 2);
}

/**
 * 觸發瀏覽器下載檔案
 */
export function triggerFileDownload(content: string, filename: string, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 複製純文字到剪貼簿
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {}

  // Fallback using textarea
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    textArea.remove();
    return successful;
  } catch (err) {
    return false;
  }
}

/**
 * CSV 單元格逸出處理
 */
function escapeCsvCell(cell: any): string {
  if (cell === null || cell === undefined) return '""';
  const str = String(cell);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * 解析 CSV / TSV 行字串 (支援引號內逗號與換行)
 */
export function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '').trim();
  if (!clean) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === ',' || char === '\t') && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export interface ParsedImportResult {
  success: boolean;
  format: 'json' | 'csv' | 'table';
  message: string;
  totalHoldingsCount: number;
  distinctDatesCount: number;
  affectedFunds: string[];
  fundsToApply?: FundData[];
  customFundHoldings?: {
    fundCode: string;
    snapshots: FundHoldingSnapshot[];
  }[];
}

/**
 * 解析使用者上傳的檔案或貼上的文字
 */
export function parseImportData(
  rawContent: string,
  targetFundCode?: string,
  existingFunds: FundData[] = []
): ParsedImportResult {
  const text = rawContent.trim();
  if (!text) {
    return {
      success: false,
      format: 'table',
      message: '請提供或貼上資料內容',
      totalHoldingsCount: 0,
      distinctDatesCount: 0,
      affectedFunds: [],
    };
  }

  // 1. 先嘗試以 JSON 解析 (完整網頁資料備份)
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      let incomingFunds: FundData[] = [];
      if (Array.isArray(parsed)) {
        incomingFunds = parsed;
      } else if (parsed && Array.isArray(parsed.funds)) {
        incomingFunds = parsed.funds;
      }

      if (incomingFunds.length > 0 && incomingFunds[0].code && incomingFunds[0].name) {
        let totalHoldings = 0;
        const affected = incomingFunds.map((f) => f.code.replace('.TW', ''));
        const dateSet = new Set<string>();

        incomingFunds.forEach((f) => {
          (f.snapshots || []).forEach((s) => {
            const d = normalizeDateString(s.date || s.asOfDate);
            if (d) dateSet.add(d);
            totalHoldings += (s.holdings || []).length;
          });
        });

        return {
          success: true,
          format: 'json',
          message: `成功解析 JSON 備份檔，包含 ${incomingFunds.length} 檔基金、${dateSet.size} 個歷史期別與 ${totalHoldings} 筆持股記錄。`,
          totalHoldingsCount: totalHoldings,
          distinctDatesCount: dateSet.size,
          affectedFunds: affected,
          fundsToApply: incomingFunds,
        };
      }
    } catch (e) {
      // JSON parse failed, proceed to CSV/TSV
    }
  }

  // 2. 解析 CSV / TSV / 複製表格
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    return {
      success: false,
      format: 'csv',
      message: '未能辨識出任何表格行列資料',
      totalHoldingsCount: 0,
      distinctDatesCount: 0,
      affectedFunds: [],
    };
  }

  // 檢查首列是否為標題欄
  const firstRow = rows[0].map((c) => c.toLowerCase());
  const hasHeader = firstRow.some((c) =>
    c.includes('日期') || c.includes('個股') || c.includes('名稱') || c.includes('股數') || c.includes('比例') || c.includes('代碼')
  );

  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (dataRows.length === 0) {
    return {
      success: false,
      format: 'csv',
      message: '表格中無資料記錄',
      totalHoldingsCount: 0,
      distinctDatesCount: 0,
      affectedFunds: [],
    };
  }

  // 偵測欄位位置
  let fundCodeCol = -1;
  let dateCol = -1;
  let nameCol = -1;
  let priceCol = -1;
  let mvCol = -1;
  let sharesCol = -1;
  let ratioCol = -1;

  if (hasHeader) {
    firstRow.forEach((colName, idx) => {
      if (colName.includes('基金代碼') || colName.includes('基金代號')) fundCodeCol = idx;
      else if (colName.includes('日期') || colName.includes('date')) dateCol = idx;
      else if (colName.includes('個股') || colName.includes('股票名稱') || colName.includes('名稱')) nameCol = idx;
      else if (colName.includes('股價') || colName.includes('市價') || colName.includes('price')) priceCol = idx;
      else if (colName.includes('市值') || colName.includes('金額')) mvCol = idx;
      else if (colName.includes('股數') || colName.includes('shares')) sharesCol = idx;
      else if (colName.includes('比例') || colName.includes('權重') || colName.includes('%') || colName.includes('ratio')) ratioCol = idx;
    });
  }

  // 若無標頭或欄位未定位，依照常見欄位順序推估
  const sampleRow = dataRows[0];
  if (sampleRow.length >= 8 && fundCodeCol === -1) {
    fundCodeCol = 0;
    dateCol = 2;
    nameCol = 3;
    priceCol = 4;
    mvCol = 5;
    sharesCol = 6;
    ratioCol = 7;
  } else if (sampleRow.length >= 6 && dateCol === -1) {
    dateCol = 0;
    nameCol = 1;
    priceCol = 2;
    mvCol = 3;
    sharesCol = 4;
    ratioCol = 5;
  } else if (sampleRow.length === 4 && nameCol === -1) {
    // 股票代碼/名稱/股數/權重
    nameCol = 1;
    sharesCol = 2;
    ratioCol = 3;
  }

  // 群組化資料：[fundCode -> [date -> HoldingItem[]]]
  const groupMap: Record<string, Record<string, HoldingItem[]>> = {};
  const defaultFundCode = (targetFundCode || (existingFunds[0] ? existingFunds[0].code : '00981A.TW')).replace('.TW', '').toUpperCase();

  const todayStr = normalizeDateString(new Date().toISOString());

  let totalParsed = 0;
  const allDates = new Set<string>();

  dataRows.forEach((row, rowIdx) => {
    let rowFundCode = defaultFundCode;
    if (fundCodeCol >= 0 && row[fundCodeCol]) {
      const parsedCode = row[fundCodeCol].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (parsedCode) rowFundCode = parsedCode;
    }

    let dateVal = todayStr;
    if (dateCol >= 0 && row[dateCol]) {
      const normD = normalizeDateString(row[dateCol]);
      if (normD) dateVal = normD;
    }

    let nameVal = nameCol >= 0 ? row[nameCol] : row[1] || row[0] || '';
    if (!nameVal || nameVal === '-' || nameVal.length < 2) return;

    let priceVal: number | undefined = undefined;
    if (priceCol >= 0 && row[priceCol]) {
      const pNum = parseFloat(String(row[priceCol]).replace(/[^0-9.]/g, ''));
      if (!isNaN(pNum) && pNum > 0) priceVal = pNum;
    }

    let sharesVal = 0;
    if (sharesCol >= 0 && row[sharesCol]) {
      const sNum = parseFloat(String(row[sharesCol]).replace(/[^0-9.]/g, ''));
      if (!isNaN(sNum)) sharesVal = Math.round(sNum);
    }

    let ratioVal = 0;
    if (ratioCol >= 0 && row[ratioCol]) {
      const rNum = parseFloat(String(row[ratioCol]).replace(/%/g, '').replace(/,/g, ''));
      if (!isNaN(rNum)) ratioVal = Math.round(rNum * 100) / 100;
    }

    let mvVal: number | undefined = undefined;
    if (mvCol >= 0 && row[mvCol]) {
      const mvClean = String(row[mvCol]).replace(/萬/g, '').replace(/,/g, '').trim();
      const mNum = parseFloat(mvClean);
      if (!isNaN(mNum) && mNum > 0) {
        mvVal = mNum > 100000 ? Math.round(mNum / 10000) : Math.round(mNum);
      }
    } else if (priceVal && sharesVal > 0) {
      mvVal = Math.round((priceVal * sharesVal) / 10000);
    }

    // 格式化股票名稱包含代碼
    let stockCodeMatch = nameVal.match(/\b([0-9]{4})\b/);
    let stockCode = stockCodeMatch ? stockCodeMatch[1] : undefined;

    if (!stockCode && row[0] && /^[0-9]{4}$/.test(row[0].trim())) {
      stockCode = row[0].trim();
      if (!nameVal.includes(stockCode)) {
        nameVal = `${nameVal} (${stockCode})`;
      }
    }

    const holding: HoldingItem = {
      id: `${rowFundCode}_${dateVal}_${rowIdx}_${stockCode || nameVal}`,
      stockName: nameVal,
      stockCode: stockCode,
      shares: sharesVal,
      sharesFormatted: sharesVal.toLocaleString(),
      ratio: ratioVal,
      date: dateVal,
      price: priceVal,
      marketValue: mvVal,
    };

    if (!groupMap[rowFundCode]) groupMap[rowFundCode] = {};
    if (!groupMap[rowFundCode][dateVal]) groupMap[rowFundCode][dateVal] = [];

    // 避免同日期同股票重複加入
    const existingList = groupMap[rowFundCode][dateVal];
    const isDup = existingList.some(
      (item) => (stockCode && item.stockCode === stockCode) || item.stockName.replace(/\s+/g, '') === nameVal.replace(/\s+/g, '')
    );
    if (!isDup) {
      existingList.push(holding);
      totalParsed++;
      allDates.add(dateVal);
    }
  });

  const affectedFunds = Object.keys(groupMap);
  if (affectedFunds.length === 0 || totalParsed === 0) {
    return {
      success: false,
      format: 'csv',
      message: '未能成功解析出有效的持股明細數據，請確認包含個股名稱、股數與比例。',
      totalHoldingsCount: 0,
      distinctDatesCount: 0,
      affectedFunds: [],
    };
  }

  // 轉換成 snapshot 結構
  const customFundHoldings = affectedFunds.map((fCode) => {
    const datesObj = groupMap[fCode];
    const snapshots: FundHoldingSnapshot[] = Object.keys(datesObj).map((d) => {
      // 依比例由高到低排序並取前 20 大
      const sortedHoldings = datesObj[d].sort((a, b) => b.ratio - a.ratio).slice(0, 20);
      return {
        date: d,
        asOfDate: d,
        holdings: sortedHoldings,
        isManual: true,
      };
    });

    return {
      fundCode: fCode,
      snapshots: snapshots,
    };
  });

  return {
    success: true,
    format: 'csv',
    message: `成功解析試算表資料！共辨識出 ${affectedFunds.length} 檔基金 (${affectedFunds.join(', ')})、${allDates.size} 個期別，合計 ${totalParsed} 筆持股記錄。`,
    totalHoldingsCount: totalParsed,
    distinctDatesCount: allDates.size,
    affectedFunds: affectedFunds,
    customFundHoldings: customFundHoldings,
  };
}

/**
 * 將匯入結果智能合併至現有 FundData[]
 */
export function applyImportedDataToFunds(
  existingFunds: FundData[],
  importResult: ParsedImportResult
): { updatedFunds: FundData[]; summaryMessage: string } {
  if (!importResult.success) {
    return { updatedFunds: existingFunds, summaryMessage: '匯入失敗：無有效數據' };
  }

  // 1. 若為完整的 JSON 基金物件直接套用/合併
  if (importResult.format === 'json' && importResult.fundsToApply) {
    const incomingMap = new Map<string, FundData>();
    importResult.fundsToApply.forEach((f) => {
      incomingMap.set(f.code.toUpperCase().trim(), f);
    });

    const updated = existingFunds.map((f) => {
      const incoming = incomingMap.get(f.code.toUpperCase().trim());
      if (incoming) {
        // 合併快照
        const dateMap = new Map<string, FundHoldingSnapshot>();
        (f.snapshots || []).forEach((s) => {
          const d = normalizeDateString(s.date || s.asOfDate);
          if (d) dateMap.set(d, s);
        });
        (incoming.snapshots || []).forEach((s) => {
          const d = normalizeDateString(s.date || s.asOfDate);
          if (d) dateMap.set(d, s); // 覆蓋更新
        });

        const mergedSnaps = Array.from(dateMap.values()).sort((a, b) => {
          const da = normalizeDateString(a.date || a.asOfDate).replace(/\//g, '-');
          const db = normalizeDateString(b.date || b.asOfDate).replace(/\//g, '-');
          return new Date(db).getTime() - new Date(da).getTime();
        });

        return {
          ...f,
          ...incoming,
          asOfDate: mergedSnaps[0]?.asOfDate || incoming.asOfDate || f.asOfDate,
          snapshots: mergedSnaps,
        };
      }
      return f;
    });

    return {
      updatedFunds: updated,
      summaryMessage: `✅ 成功匯入 JSON 備份！已更新 ${incomingMap.size} 檔基金與歷史期別。`,
    };
  }

  // 2. 若為 CSV / 試算表格式
  if (importResult.customFundHoldings && importResult.customFundHoldings.length > 0) {
    const updated = existingFunds.map((fund) => {
      const cleanCode = fund.code.replace('.TW', '').toUpperCase();
      const match = importResult.customFundHoldings!.find(
        (cf) => cf.fundCode.toUpperCase() === cleanCode
      );

      if (!match) return fund;

      const dateMap = new Map<string, FundHoldingSnapshot>();
      // 先放舊的
      (fund.snapshots || []).forEach((s) => {
        const d = normalizeDateString(s.date || s.asOfDate);
        if (d) dateMap.set(d, s);
      });

      // 放入匯入的新期別 (覆蓋舊同日期)
      match.snapshots.forEach((newSnap) => {
        const d = normalizeDateString(newSnap.date || newSnap.asOfDate);
        if (d) {
          dateMap.set(d, newSnap);
        }
      });

      const mergedSnaps = Array.from(dateMap.values()).sort((a, b) => {
        const da = normalizeDateString(a.date || a.asOfDate).replace(/\//g, '-');
        const db = normalizeDateString(b.date || b.asOfDate).replace(/\//g, '-');
        return new Date(db).getTime() - new Date(da).getTime();
      });

      const latestSnap = mergedSnaps[0];

      return {
        ...fund,
        asOfDate: latestSnap?.asOfDate || fund.asOfDate,
        snapshots: mergedSnaps,
      };
    });

    return {
      updatedFunds: updated,
      summaryMessage: `✅ 成功匯入試算表資料！已即時更新 ${importResult.affectedFunds.join(', ')} 的歷史期別與持股。`,
    };
  }

  return { updatedFunds: existingFunds, summaryMessage: '無變更' };
}
