import React, { useState, useMemo } from 'react';
import { FundData, HoldingItem, FundHoldingSnapshot } from '../types';
import { validateAndNormalizeDate } from '../utils/dateValidator';
import { X, Upload, FileText, AlertTriangle, CheckCircle2, Info, ArrowRight, Layers } from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  funds: FundData[];
  selectedFundId?: string;
  onImportSuccess: (updatedFunds: FundData[], message: string) => void;
  onSwitchToExport?: () => void;
}

interface ParsedRecord {
  fundId: string;
  fundCode: string;
  fundName: string;
  date: string;
  stockCode: string;
  stockName: string;
  shares: number;
  ratio: number;
  price?: number;
  marketValue?: number;
}

interface FundImportTarget {
  fund: FundData;
  dates: Record<string, ParsedRecord[]>;
  totalRecords: number;
}

// Helper to parse a line into columns respecting quotes
function parseCsvLine(line: string): string[] {
  if (line.includes('\t')) {
    return line.split('\t').map((c) => c.replace(/^["']|["']$/g, '').trim());
  }
  if (line.includes(',')) {
    const res: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuote = !inQuote;
      } else if (c === ',' && !inQuote) {
        res.push(cur.trim().replace(/^["']|["']$/g, ''));
        cur = '';
      } else {
        cur += c;
      }
    }
    res.push(cur.trim().replace(/^["']|["']$/g, ''));
    return res;
  }
  return line.split(/\s+/).map((c) => c.replace(/^["']|["']$/g, '').trim());
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  funds,
  selectedFundId,
  onImportSuccess,
  onSwitchToExport,
}) => {
  const validFunds = useMemo(() => {
    if (!Array.isArray(funds)) return [];
    return funds.filter((f): f is FundData => Boolean(f && typeof f === 'object' && (f.id || f.code || f.name)));
  }, [funds]);

  const [targetFundId, setTargetFundId] = useState<string>(() => {
    return selectedFundId || (funds?.[0]?.id ? String(funds[0].id) : '');
  });
  const [inputText, setInputText] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [isJsonBackup, setIsJsonBackup] = useState(false);
  const [parsedJsonFunds, setParsedJsonFunds] = useState<FundData[] | null>(null);

  React.useEffect(() => {
    if (selectedFundId) {
      setTargetFundId(selectedFundId);
    } else if (validFunds.length > 0 && validFunds[0]?.id) {
      setTargetFundId(String(validFunds[0].id));
    }
  }, [selectedFundId, isOpen, validFunds]);

  const currentFund = validFunds.find((f) => String(f.id) === String(targetFundId)) || validFunds[0];

  // Helper to match fund from raw code or name
  const findFundMatch = (rawCode?: string, rawName?: string): FundData | undefined => {
    const cCode = (rawCode || '').replace(/\.TW/i, '').replace(/[^0-9A-Za-z]/g, '').trim().toUpperCase();
    const cName = (rawName || '').trim();

    return validFunds.find((f) => {
      const fCode = (f.code || '').replace(/\.TW/i, '').replace(/[^0-9A-Za-z]/g, '').trim().toUpperCase();
      const fName = (f.name || '').trim();

      // 1. Direct code match (e.g. 00981A, 00403A, 00982A, 00992A, 00407A)
      if (cCode && (fCode === cCode || f.code.toUpperCase().includes(cCode))) return true;

      // 2. Trust internal code match (投信代碼)
      if (cCode === '49YTW' && (fCode === '00981A' || fName.includes('統一台股增長'))) return true;
      if (cCode === '63YTW' && (fCode === '00403A' || fName.includes('統一升級50'))) return true;
      if (cCode === '399' && (fCode === '00982A' || fName.includes('群益台灣強棒'))) return true;
      if (cCode === '500' && (fCode === '00992A' || fName.includes('群益科技創新'))) return true;
      if (cCode === 'J024' && (fCode === '00407A' || fName.includes('凱基台灣精選強棒'))) return true;

      // 3. Fund name matching
      if (cName && fName) {
        if (fName === cName || fName.includes(cName) || cName.includes(fName)) return true;
        const cleanF = fName.replace(/(基金|ETF|主動|被動|臺灣|台灣)/g, '');
        const cleanC = cName.replace(/(基金|ETF|主動|被動|臺灣|台灣)/g, '');
        if (cleanF && cleanC && (cleanF.includes(cleanC) || cleanC.includes(cleanF))) return true;
      }

      return false;
    });
  };

  // Load A~H multi-fund sample
  const handleLoadAtoHSample = () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const lines = [
      '基金代碼\t基金名稱\t日期\t個股名稱\t目前股價\t持股市值(元)\t投資股數\t比例(%)',
      `00981A\t統一台股增長\t${today}\t台積電 (2330)\t1080\t13104720000\t12,134,000\t9.50%`,
      `00981A\t統一台股增長\t${today}\t台光電 (2383)\t485\t2358555000\t4,863,000\t8.31%`,
      `00403A\t統一升級50\t${today}\t台積電 (2330)\t1080\t12915720000\t11,959,000\t9.30%`,
      `00403A\t統一升級50\t${today}\t聯發科 (2454)\t1450\t7899600000\t5,448,000\t7.10%`,
      `00982A\t群益台灣強棒\t${today}\t奇鋐 (3017)\t650\t3160950000\t4,863,000\t6.85%`,
      `00982A\t群益台灣強棒\t${today}\t智邦 (2345)\t580\t2820540000\t4,863,000\t5.90%`,
      `00992A\t群益科技創新\t${today}\t台積電 (2330)\t1080\t10243800000\t9,485,000\t9.10%`,
      `00407A\t凱基台灣精選強棒\t${today}\t台積電 (2330)\t1080\t9855000000\t9,125,000\t8.90%`,
    ];
    setInputText(lines.join('\n'));
    setIsJsonBackup(false);
    setParsedJsonFunds(null);
  };

  // Load single-fund sample
  const handleLoadCurrentFundSample = () => {
    if (!currentFund) return;
    const snap = currentFund.snapshots?.[0];
    const snapDate = String(snap?.date || snap?.asOfDate || '2026/08/15').replace(/-/g, '/');
    const holdings = Array.isArray(snap?.holdings) ? snap.holdings : [];
    const fCode = (currentFund.code || '').replace('.TW', '');

    const lines = ['基金代碼\t基金名稱\t日期\t個股名稱\t目前股價\t持股市值(元)\t投資股數\t比例(%)'];
    if (holdings.length > 0) {
      holdings.slice(0, 8).forEach((h) => {
        const sName = String(h?.stockName || '');
        const sShares = Number(h?.shares) || 0;
        const sRatio = Number(h?.ratio) || 0;
        const sPrice = Number(h?.price) || 0;
        const sMv = sPrice && sShares ? sPrice * sShares : 0;
        lines.push(`${fCode}\t${currentFund.name}\t${snapDate}\t${sName}\t${sPrice || ''}\t${sMv || ''}\t${sShares.toLocaleString()}\t${sRatio}%`);
      });
    } else {
      lines.push(`${fCode}\t${currentFund.name}\t${snapDate}\t台積電 (2330)\t1080\t13104720000\t12,134,000\t9.5%`);
      lines.push(`${fCode}\t${currentFund.name}\t${snapDate}\t台光電 (2383)\t485\t2358555000\t4,863,000\t8.31%`);
      lines.push(`${fCode}\t${currentFund.name}\t${snapDate}\t聯發科 (2454)\t1450\t7899600000\t5,448,000\t7.1%`);
    }
    setInputText(lines.join('\n'));
    setIsJsonBackup(false);
    setParsedJsonFunds(null);
  };

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();

    if (file.name.endsWith('.json')) {
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].snapshots) {
            setIsJsonBackup(true);
            setParsedJsonFunds(parsed as FundData[]);
            setInputText(`[已載入 JSON 備份檔: ${file.name}，共 ${parsed.length} 檔基金]`);
          } else {
            alert('JSON 格式不符，請上傳由此系統匯出的完整基金備份檔。');
          }
        } catch (err) {
          alert('JSON 解析失敗，請確認檔案格式正確。');
        }
      };
      reader.readAsText(file);
    } else {
      setIsJsonBackup(false);
      setParsedJsonFunds(null);
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setInputText(text || '');
      };
      reader.readAsText(file, 'UTF-8');
    }
  };

  // Parsing & Date Validation Logic with A~H column order support
  const parseResult = useMemo(() => {
    try {
      if (isJsonBackup && parsedJsonFunds) {
        let validSnapshotsCount = 0;
        let invalidSnapshotsCount = 0;

        parsedJsonFunds.forEach((fund) => {
          (fund.snapshots || []).forEach((snap) => {
            const normDate = validateAndNormalizeDate(snap.date || snap.asOfDate);
            if (normDate) {
              validSnapshotsCount++;
            } else {
              invalidSnapshotsCount++;
            }
          });
        });

        return {
          records: [] as ParsedRecord[],
          fundTargets: {} as Record<string, FundImportTarget>,
          validCount: validSnapshotsCount,
          skippedDueToInvalidDateCount: invalidSnapshotsCount,
          isJson: true,
          detectedFundsCount: parsedJsonFunds.length,
        };
      }

      if (!inputText.trim()) {
        return {
          records: [] as ParsedRecord[],
          fundTargets: {} as Record<string, FundImportTarget>,
          validCount: 0,
          skippedDueToInvalidDateCount: 0,
          isJson: false,
          detectedFundsCount: 0,
        };
      }

      const lines = inputText.split(/\r?\n/);
      const validRecords: ParsedRecord[] = [];
      const fundTargets: Record<string, FundImportTarget> = {};
      let skippedCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = parseCsvLine(line);
        if (cols.length < 3) continue;

        // Skip table headers
        const isHeader = cols.some((c) =>
          /^(基金代碼|基金名稱|個股名稱|目前股價|持股市值|投資股數|比例|股票代號|股票名稱|持股權重|代號|名稱|日期)$/i.test(
            c.replace(/[\(（\)）%％]/g, '').trim()
          )
        );
        if (isHeader) continue;

        // Check if Col C (index 2) is a valid calendar date -> Exact A~H format!
        const dateAt2 = cols.length >= 3 ? validateAndNormalizeDate(cols[2]) : null;

        if (dateAt2) {
          // A: 基金代碼 (0), B: 基金名稱 (1), C: 日期 (2), D: 個股名稱 (3), E: 目前股價 (4), F: 持股市值 (5), G: 投資股數 (6), H: 比例(%) (7)
          const rawCode = cols[0] || '';
          const rawName = cols[1] || '';
          const matchedFund = findFundMatch(rawCode, rawName) || currentFund;
          if (!matchedFund) {
            skippedCount++;
            continue;
          }

          const rawStock = cols[3] || '';
          const codeMatch = rawStock.match(/(\d{4,6})/);
          const stockCode = codeMatch ? codeMatch[1] : '';
          let pureName = rawStock
            .replace(/\(\s*\d+\s*\)/g, '')
            .replace(/\d{4,6}/g, '')
            .replace(/\*/g, '')
            .trim();
          if (!pureName && stockCode) pureName = stockCode;
          const stockDisplayName = stockCode ? `${pureName} (${stockCode})` : pureName;

          if (!stockDisplayName) {
            skippedCount++;
            continue;
          }

          // Price (Col 4)
          const priceNum = cols[4] ? parseFloat(cols[4].replace(/,/g, '')) : undefined;
          const price = priceNum && !isNaN(priceNum) && priceNum > 0 ? priceNum : undefined;

          // Market Value (Col 5)
          const mvNum = cols[5] ? parseFloat(cols[5].replace(/,/g, '')) : undefined;
          const rawMarketValue = mvNum && !isNaN(mvNum) ? mvNum : undefined;

          // Shares (Col 6)
          const sharesNum = cols[6] ? parseFloat(cols[6].replace(/,/g, '')) : 0;
          let shares = !isNaN(sharesNum) ? Math.round(sharesNum) : 0;
          if (shares === 0 && price && rawMarketValue && rawMarketValue > price) {
            shares = Math.round(rawMarketValue / price);
          }

          // Calculated MV
          const finalMv = rawMarketValue !== undefined ? rawMarketValue : (price && shares ? price * shares : undefined);

          // Ratio (Col 7)
          const ratioNum = cols[7] ? parseFloat(cols[7].replace(/%/g, '').replace(/,/g, '')) : 0;
          const ratio = !isNaN(ratioNum) ? ratioNum : 0;

          const record: ParsedRecord = {
            fundId: matchedFund.id,
            fundCode: matchedFund.code,
            fundName: matchedFund.name,
            date: dateAt2,
            stockCode,
            stockName: stockDisplayName,
            shares,
            ratio,
            price,
            marketValue: finalMv,
          };

          validRecords.push(record);

          // Group by fund and date
          if (!fundTargets[matchedFund.id]) {
            fundTargets[matchedFund.id] = {
              fund: matchedFund,
              dates: {},
              totalRecords: 0,
            };
          }
          if (!fundTargets[matchedFund.id].dates[dateAt2]) {
            fundTargets[matchedFund.id].dates[dateAt2] = [];
          }
          fundTargets[matchedFund.id].dates[dateAt2].push(record);
          fundTargets[matchedFund.id].totalRecords++;
          continue;
        }

        // Fallback: Check if Col A (index 0) is a valid date (Legacy format)
        let detectedDate: string | null = null;
        let dateColIndex = -1;

        for (let cIdx = 0; cIdx < cols.length; cIdx++) {
          const norm = validateAndNormalizeDate(cols[cIdx]);
          if (norm) {
            detectedDate = norm;
            dateColIndex = cIdx;
            break;
          }
        }

        // If no valid calendar date, skip per user rule
        if (!detectedDate) {
          skippedCount++;
          continue;
        }

        const remainingCols = cols.filter((_, idx) => idx !== dateColIndex);
        let stockCode = '';
        let stockName = '';
        let shares = 0;
        let ratio = 0;
        let price: number | undefined = undefined;

        for (const col of remainingCols) {
          if (/^\d{4,6}$/.test(col) && !stockCode) {
            stockCode = col;
            continue;
          }
          if (col.includes('%')) {
            const rVal = parseFloat(col.replace(/%/g, ''));
            if (!isNaN(rVal)) ratio = rVal;
            continue;
          }
          const numClean = col.replace(/,/g, '');
          if (/^\d+(\.\d+)?$/.test(numClean)) {
            const num = parseFloat(numClean);
            if (num >= 1000 && shares === 0) {
              shares = Math.round(num);
            } else if (ratio === 0 && num > 0 && num <= 30 && col.includes('.')) {
              ratio = num;
            } else if (!price && num > 0 && num < 10000) {
              price = num;
            }
            continue;
          }
          if (/[\u4e00-\u9fa5A-Za-z]/.test(col) && !stockName) {
            const codeInNameMatch = col.match(/\(?(\d{4,6})\)?/);
            if (codeInNameMatch && !stockCode) {
              stockCode = codeInNameMatch[1];
            }
            stockName = col.replace(/\(?\d{4,6}\)?/g, '').replace(/\*/g, '').trim();
          }
        }

        if (!stockName && stockCode) stockName = stockCode;

        if (stockName && currentFund) {
          const record: ParsedRecord = {
            fundId: currentFund.id,
            fundCode: currentFund.code,
            fundName: currentFund.name,
            date: detectedDate,
            stockCode,
            stockName: stockCode ? `${stockName} (${stockCode})` : stockName,
            shares,
            ratio,
            price,
            marketValue: price && shares ? price * shares : undefined,
          };

          validRecords.push(record);

          if (!fundTargets[currentFund.id]) {
            fundTargets[currentFund.id] = {
              fund: currentFund,
              dates: {},
              totalRecords: 0,
            };
          }
          if (!fundTargets[currentFund.id].dates[detectedDate]) {
            fundTargets[currentFund.id].dates[detectedDate] = [];
          }
          fundTargets[currentFund.id].dates[detectedDate].push(record);
          fundTargets[currentFund.id].totalRecords++;
        } else {
          skippedCount++;
        }
      }

      return {
        records: validRecords,
        fundTargets,
        validCount: validRecords.length,
        skippedDueToInvalidDateCount: skippedCount,
        isJson: false,
        detectedFundsCount: Object.keys(fundTargets).length,
      };
    } catch (err) {
      console.error('Failed to parse input:', err);
      return {
        records: [] as ParsedRecord[],
        fundTargets: {} as Record<string, FundImportTarget>,
        validCount: 0,
        skippedDueToInvalidDateCount: 0,
        isJson: false,
        detectedFundsCount: 0,
      };
    }
  }, [inputText, isJsonBackup, parsedJsonFunds, validFunds, currentFund]);

  const handleConfirmImport = () => {
    try {
      if (parseResult.validCount === 0) {
        alert('未偵測到具有正確日期的有效資料，請確認匯入內容包含合法日期 (如 2026/08/15) 與個股資料。');
        return;
      }

      // 1. JSON backup import (無天數限制，合併現有資料與匯入期別)
      if (isJsonBackup && parsedJsonFunds) {
        // Initialize map with all current valid funds
        const resultMap = new Map<string, FundData>();
        validFunds.forEach((f) => {
          const match = findFundMatch(f.code, f.name);
          const key = match?.id || f.id;
          resultMap.set(key, { ...f });
        });

        parsedJsonFunds.forEach((fund) => {
          const matchedExisting = findFundMatch(fund.code, fund.name) ||
            validFunds.find((f) => (f.code || '').replace('.TW', '').toUpperCase() === (fund.code || '').replace('.TW', '').toUpperCase());
          const targetFund = matchedExisting || fund;
          const targetKey = targetFund.id;

          const existingInMap = resultMap.get(targetKey) || targetFund;
          const snapMap = new Map<string, any>();

          // 先載入目前系統中的現有期別（如今日已自動抓取的 9/18 即時最新資料）
          (existingInMap?.snapshots || []).forEach((s) => {
            const normDate = validateAndNormalizeDate(s.date || s.asOfDate);
            if (normDate) {
              snapMap.set(normDate, {
                ...s,
                date: normDate,
                asOfDate: normDate,
              });
            }
          });

          // 再將備份檔中的所有歷史期別合併進來（無天數限制）
          (fund.snapshots || []).forEach((s) => {
            const normDate = validateAndNormalizeDate(s.date || s.asOfDate);
            if (normDate) {
              const prev = snapMap.get(normDate);
              const prevValid = prev && Array.isArray(prev.holdings) && prev.holdings.length > 0;
              const currValid = Array.isArray(s.holdings) && s.holdings.length > 0;
              if (!prev || (!prevValid && currValid)) {
                snapMap.set(normDate, {
                  ...s,
                  date: normDate,
                  asOfDate: normDate,
                });
              }
            }
          });

          const allSnapshots = Array.from(snapMap.values()).sort((a, b) => {
            const dA = String(a.date || a.asOfDate || '');
            const dB = String(b.date || b.asOfDate || '');
            return dB.localeCompare(dA);
          });

          resultMap.set(targetKey, {
            ...existingInMap,
            id: targetFund.id,
            code: targetFund.code,
            name: targetFund.name,
            url: targetFund.url || existingInMap.url,
            manager: targetFund.manager || existingInMap.manager,
            category: targetFund.category || existingInMap.category,
            asOfDate: allSnapshots[0]?.date || existingInMap.asOfDate,
            navDate: allSnapshots[0]?.date || existingInMap.navDate,
            snapshots: allSnapshots,
            lastUpdated: new Date().toLocaleString('zh-TW'),
          });
        });

        const mergedFunds = Array.from(resultMap.values());

        const msg = `✅ 成功自備份檔匯入 ${parsedJsonFunds.length} 檔基金！共載入 ${parseResult.validCount} 個有效期別（無天數限制，完整保留並合併所有歷史期別）` +
          (parseResult.skippedDueToInvalidDateCount > 0 ? `（已自動省略 ${parseResult.skippedDueToInvalidDateCount} 筆日期不合法的期別）` : '');

        onImportSuccess(mergedFunds, msg);
        onClose();
        return;
      }

      // 2. Multi-fund and Single-fund CSV / Text import
      const targets = Object.values(parseResult.fundTargets);
      if (targets.length === 0) {
        alert('未解析到任何有效基金持股資料');
        return;
      }

      const updatedFundsMap = new Map<string, FundData>();
      validFunds.forEach((f) => updatedFundsMap.set(f.id, { ...f }));

      let totalUpdatedFunds = 0;
      let totalUpdatedHoldings = 0;
      const affectedFundNames: string[] = [];

      targets.forEach((target) => {
        const fundId = target.fund.id;
        const existingFund = updatedFundsMap.get(fundId) || target.fund;
        const updatedSnapshots = [...(existingFund.snapshots || [])];

        Object.keys(target.dates).forEach((dateStr) => {
          const items = target.dates[dateStr];
          // Sort holdings by ratio descending
          const sortedItems = [...items].sort((a, b) => b.ratio - a.ratio);

          const holdings: HoldingItem[] = sortedItems.map((item, idx) => ({
            id: `${fundId}-${String(dateStr).replace(/\//g, '')}-${item.stockCode || idx}`,
            stockName: item.stockName,
            stockCode: item.stockCode,
            shares: item.shares,
            sharesFormatted: item.shares > 0 ? item.shares.toLocaleString() : '-',
            ratio: item.ratio,
            date: dateStr,
            price: item.price,
            marketValue: item.marketValue !== undefined ? item.marketValue : (item.price && item.shares ? item.price * item.shares : undefined),
          }));

          const existingIndex = updatedSnapshots.findIndex(
            (s) => s.date === dateStr || s.asOfDate === dateStr
          );

          const newSnapshot: FundHoldingSnapshot = {
            date: dateStr,
            asOfDate: dateStr,
            holdings,
            isManual: true,
          };

          if (existingIndex >= 0) {
            updatedSnapshots[existingIndex] = newSnapshot;
          } else {
            updatedSnapshots.push(newSnapshot);
          }

          totalUpdatedHoldings += holdings.length;
        });

        // Sort snapshots by date descending (latest first) without 30-day limit
        updatedSnapshots.sort((a, b) => {
          const dA = String(a.date || a.asOfDate || '');
          const dB = String(b.date || b.asOfDate || '');
          return dB.localeCompare(dA);
        });

        updatedFundsMap.set(fundId, {
          ...existingFund,
          asOfDate: updatedSnapshots[0]?.date || existingFund.asOfDate,
          snapshots: updatedSnapshots,
          lastUpdated: new Date().toLocaleString('zh-TW'),
        });

        totalUpdatedFunds++;
        affectedFundNames.push(existingFund.name);
      });

      const updatedFundsList = Array.from(updatedFundsMap.values());
      const namesStr = affectedFundNames.slice(0, 3).join('、') + (affectedFundNames.length > 3 ? ` 等 ${affectedFundNames.length} 檔基金` : '');
      const msg = `✅ 成功依 A～H 順序分別匯入 ${namesStr}！共更新 ${totalUpdatedHoldings} 筆持股記錄。` +
        (parseResult.skippedDueToInvalidDateCount > 0 ? `（已自動略過 ${parseResult.skippedDueToInvalidDateCount} 筆日期不符之資料）` : '');

      onImportSuccess(updatedFundsList, msg);
      onClose();
    } catch (err: any) {
      console.error('Import processing error:', err);
      alert(`匯入處理失敗: ${err.message || '未知錯誤'}`);
    }
  };

  if (!isOpen) return null;

  const targetList = Object.values(parseResult.fundTargets);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">匯入基金持股資料 (A～H 欄對應)</h2>
              <p className="text-xs text-slate-500">
                依據內容 <span className="text-blue-700 font-bold">A～H 欄</span> 相對各別匯入基金個股，支援多檔基金一次性匯入
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Column A~H Specification Card */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 space-y-2 text-xs text-blue-950">
            <div className="font-bold flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-blue-900">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>CSV 欄位順序規範 (A～H 欄)：</span>
              </span>
              <span className="text-[11px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono font-bold">
                A ➔ H 順序
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[11px]">
              <div className="bg-white px-2 py-1 rounded border border-blue-100 shadow-2xs">
                <strong className="text-blue-700 font-black">A:</strong> 基金代碼
              </div>
              <div className="bg-white px-2 py-1 rounded border border-blue-100 shadow-2xs">
                <strong className="text-blue-700 font-black">B:</strong> 基金名稱
              </div>
              <div className="bg-white px-2 py-1 rounded border border-blue-100 shadow-2xs">
                <strong className="text-blue-700 font-black">C:</strong> 日期 (如 2026/08/15)
              </div>
              <div className="bg-white px-2 py-1 rounded border border-blue-100 shadow-2xs">
                <strong className="text-blue-700 font-black">D:</strong> 個股名稱
              </div>
              <div className="bg-white px-2 py-1 rounded border border-blue-100 shadow-2xs">
                <strong className="text-blue-700 font-black">E:</strong> 目前股價
              </div>
              <div className="bg-white px-2 py-1 rounded border border-blue-100 shadow-2xs">
                <strong className="text-blue-700 font-black">F:</strong> 持股市值(元)
              </div>
              <div className="bg-white px-2 py-1 rounded border border-blue-100 shadow-2xs">
                <strong className="text-blue-700 font-black">G:</strong> 投資股數
              </div>
              <div className="bg-white px-2 py-1 rounded border border-blue-100 shadow-2xs">
                <strong className="text-blue-700 font-black">H:</strong> 比例(%)
              </div>
            </div>
            <div className="text-[11px] text-blue-800 pt-0.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>系統會自動讀取 <strong>[A 基金代碼]</strong> 或 <strong>[B 基金名稱]</strong>，分別自動路由匯入至各基金個股清單（網頁與匯入無天數限制）！</span>
            </div>
          </div>

          {/* Default Scope Indicator: 全部基金 */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-blue-600 ring-4 ring-blue-100"></span>
              <span className="font-bold text-slate-800">匯入預設範圍：全部基金 ({validFunds.length} 檔，無天數限制)</span>
            </div>
            <span className="text-slate-500 font-mono text-[11px]">
              依 A 欄 (代碼) 或 B 欄 (名稱) 自動各別匯入各基金
            </span>
          </div>

          {/* File upload button */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700">上傳 CSV / 試算表檔案：</label>
              {uploadedFileName && (
                <span className="text-[11px] text-blue-700 font-mono font-semibold">
                  已載入: {uploadedFileName}
                </span>
              )}
            </div>
            <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-lg p-3 flex items-center justify-center space-x-2 bg-slate-50 hover:bg-blue-50/50 cursor-pointer transition-colors">
              <Upload className="w-4 h-4 text-blue-600" />
              <span className="text-slate-600 font-medium">點擊選擇檔案 (.csv, .tsv, .txt, .json)</span>
              <input
                type="file"
                accept=".csv,.tsv,.txt,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Textarea for direct paste */}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <label className="font-bold text-slate-700">或直接貼上 CSV 表格文字：</label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleLoadAtoHSample}
                  className="text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors"
                  title="帶入包含全部基金的 A~H 格式範本"
                >
                  帶入 A～H 範本 (全部基金)
                </button>
                {inputText && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputText('');
                      setIsJsonBackup(false);
                      setParsedJsonFunds(null);
                      setUploadedFileName('');
                    }}
                    className="text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors"
                  >
                    清空
                  </button>
                )}
              </div>
            </div>
            <textarea
              rows={6}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setIsJsonBackup(false);
                setParsedJsonFunds(null);
              }}
              placeholder={`支援格式範例 (A～H 順序)：\n基金代碼\t基金名稱\t日期\t個股名稱\t目前股價\t持股市值(元)\t投資股數\t比例(%)\n00981A\t統一台股增長\t2026/08/15\t台積電 (2330)\t1080\t13104720000\t12,134,000\t9.50%\n00403A\t統一升級50\t2026/08/15\t聯發科 (2454)\t1450\t7899600000\t5,448,000\t7.10%`}
              className="w-full p-2.5 font-mono text-xs bg-slate-900 text-slate-100 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>

          {/* Real-time date & fund routing validation feedback card */}
          {inputText.trim() && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>有效資料解析：</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold rounded-full">
                    {parseResult.validCount} 筆個股記錄
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full">
                    跨 {parseResult.detectedFundsCount} 檔基金
                  </span>
                </div>
              </div>

              {/* Multi-fund Breakdown Cards */}
              {targetList.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    <span>即將分別匯入之基金清單：</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {targetList.map((target) => {
                      const cleanCode = (target.fund.code || '').replace('.TW', '');
                      const dateKeys = Object.keys(target.dates).sort();
                      return (
                        <div
                          key={target.fund.id}
                          className="bg-white border border-slate-200 rounded-md p-2 shadow-2xs text-left"
                        >
                          <div className="flex items-center justify-between font-bold text-slate-900">
                            <span className="truncate">{target.fund.name}</span>
                            <span className="font-mono text-blue-700 text-[11px] ml-1 shrink-0">
                              {cleanCode}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                            <span>持股筆數: <strong>{target.totalRecords}</strong> 檔</span>
                            <span>期別: <strong className="font-mono text-slate-700">{dateKeys.join(', ')}</strong></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Invalid date skip indicator */}
              {parseResult.skippedDueToInvalidDateCount > 0 && (
                <div className="flex items-start space-x-2 bg-amber-50 border border-amber-200 text-amber-800 p-2.5 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">
                      已自動省略無有效日期的資料：{parseResult.skippedDueToInvalidDateCount} 筆
                    </div>
                    <div className="text-[11px] text-amber-700 mt-0.5">
                      規則嚴格檢驗：欄位中若未包含合法之日曆日期（例如標題字、非日期格式、無效月份或天數），系統已自動略過不予匯入。
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          {onSwitchToExport && (
            <button
              onClick={onSwitchToExport}
              className="text-blue-700 hover:text-blue-900 font-semibold text-xs cursor-pointer"
            >
              ➔ 切換至匯出資料
            </button>
          )}

          <div className="flex items-center space-x-2 ml-auto">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-md text-xs cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={parseResult.validCount === 0}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-md text-xs shadow-sm flex items-center space-x-1.5 cursor-pointer"
            >
              <span>確認匯入 (各別寫入 {parseResult.detectedFundsCount} 檔基金)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
