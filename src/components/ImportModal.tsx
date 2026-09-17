import React, { useState, useMemo } from 'react';
import { FundData, HoldingItem, FundHoldingSnapshot } from '../types';
import { validateAndNormalizeDate } from '../utils/dateValidator';
import { X, Upload, FileText, AlertTriangle, CheckCircle2, Info, ArrowRight } from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  funds: FundData[];
  selectedFundId?: string;
  onImportSuccess: (updatedFunds: FundData[], message: string) => void;
  onSwitchToExport?: () => void;
}

interface ParsedRecord {
  date: string;
  stockCode: string;
  stockName: string;
  shares: number;
  ratio: number;
  price?: number;
  fundCode?: string;
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

  if (!isOpen) return null;

  const currentFund = validFunds.find((f) => String(f.id) === String(targetFundId)) || validFunds[0];

  const handleLoadCurrentFundSample = () => {
    if (!currentFund) return;
    const snap = currentFund.snapshots?.[0];
    const snapDate = String(snap?.date || snap?.asOfDate || '2026/08/15').replace(/-/g, '/');
    const holdings = Array.isArray(snap?.holdings) ? snap.holdings : [];

    const lines = ['日期\t股票代號\t股票名稱\t投資股數\t比例(%)'];
    if (holdings.length > 0) {
      holdings.slice(0, 10).forEach((h) => {
        const sName = String(h?.stockName || '').replace(/\s*\(\d+\)/, '');
        const sCode = String(h?.stockCode || '');
        const sShares = Number(h?.shares) || 0;
        const sRatio = Number(h?.ratio) || 0;
        lines.push(`${snapDate}\t${sCode}\t${sName}\t${sShares.toLocaleString()}\t${sRatio}%`);
      });
    } else {
      lines.push(`${snapDate}\t2330\t台積電\t12,134,000\t9.5%`);
      lines.push(`${snapDate}\t2383\t台光電\t4,863,000\t8.31%`);
      lines.push(`${snapDate}\t2454\t聯發科\t5,448,000\t7.1%`);
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

  // Parsing & Date Validation Logic
  // 核心規則：若匯入的日期，不是正確日期，就省略那些資料
  const parseResult = useMemo(() => {
    try {
      if (isJsonBackup && parsedJsonFunds) {
      let validSnapshotsCount = 0;
      let invalidSnapshotsCount = 0;

      // 檢查各基金之 snapshots 中的日期是否合法
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
        dateGroups: {} as Record<string, ParsedRecord[]>,
        validCount: validSnapshotsCount,
        skippedDueToInvalidDateCount: invalidSnapshotsCount,
        isJson: true,
      };
    }

    if (!inputText.trim()) {
      return {
        records: [],
        dateGroups: {},
        validCount: 0,
        skippedDueToInvalidDateCount: 0,
        isJson: false,
      };
    }

    const lines = inputText.split(/\r?\n/);
    const validRecords: ParsedRecord[] = [];
    let skippedCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // 偵測分隔符號 (逗號、Tab 或 多個空白)
      let cols: string[];
      if (line.includes('\t')) {
        cols = line.split('\t').map((c) => c.trim());
      } else if (line.includes(',')) {
        cols = line.split(',').map((c) => c.replace(/^["']|["']$/g, '').trim());
      } else {
        cols = line.split(/\s+/).map((c) => c.trim());
      }

      if (cols.length < 3) {
        continue;
      }

      // 忽略純表頭列 (如 日期, 股票名稱, 股數, 比例 等)
      if (cols.some((c) => /^(股票代號|股票名稱|持股權重|投資股數|權重\(%\)|代號|名稱)$/i.test(c))) {
        continue;
      }

      // 1. 尋找並驗證日期
      // 依序檢查欄位以判定何者為日期
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

      // 關鍵規則：若這筆資料中沒有合法/正確的日曆日期，直接省略！
      if (!detectedDate) {
        skippedCount++;
        continue;
      }

      // 2. 提取股票名稱、代碼、股數、比例
      // 剩餘非日期欄位
      const remainingCols = cols.filter((_, idx) => idx !== dateColIndex);

      let stockCode = '';
      let stockName = '';
      let shares = 0;
      let ratio = 0;
      let price: number | undefined = undefined;

      for (const col of remainingCols) {
        // 檢查是否為 4~6 碼純數字股票代碼
        if (/^\d{4,6}$/.test(col) && !stockCode) {
          stockCode = col;
          continue;
        }

        // 檢查比例 (帶 % 或 小於等於 100 的浮點小數)
        if (col.includes('%')) {
          const rVal = parseFloat(col.replace(/%/g, ''));
          if (!isNaN(rVal)) ratio = rVal;
          continue;
        }

        // 檢查純數字：可能是股數或股價
        const numClean = col.replace(/,/g, '');
        if (/^\d+(\.\d+)?$/.test(numClean)) {
          const num = parseFloat(numClean);
          // 若數值大於 1000 通常為股數
          if (num >= 1000 && shares === 0) {
            shares = Math.round(num);
          } else if (ratio === 0 && num > 0 && num <= 30 && col.includes('.')) {
            // 小數點且 <= 30 可能是持股比例
            ratio = num;
          } else if (!price && num > 0 && num < 10000) {
            price = num;
          }
          continue;
        }

        // 中英文字元通常為股票名稱
        if (/[\u4e00-\u9fa5A-Za-z]/.test(col) && !stockName) {
          // 檢查字串內是否附帶代碼 如 "台積電(2330)" 或 "台積電 2330"
          const codeInNameMatch = col.match(/\(?(\d{4,6})\)?/);
          if (codeInNameMatch && !stockCode) {
            stockCode = codeInNameMatch[1];
          }
          stockName = col.replace(/\(?\d{4,6}\)?/g, '').replace(/\*/g, '').trim();
        }
      }

      // 若未找到股票名稱但有代碼
      if (!stockName && stockCode) {
        stockName = stockCode;
      }

      if (stockName) {
        validRecords.push({
          date: detectedDate,
          stockCode,
          stockName: stockCode ? `${stockName} (${stockCode})` : stockName,
          shares,
          ratio,
          price,
        });
      } else {
        skippedCount++;
      }
    }

    // 將有效資料依日期分組
    const groups: Record<string, ParsedRecord[]> = {};
    validRecords.forEach((r) => {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });

    return {
      records: validRecords,
      dateGroups: groups,
      validCount: validRecords.length,
      skippedDueToInvalidDateCount: skippedCount,
      isJson: false,
    };
  } catch (err) {
    console.error('Failed to parse input:', err);
    return {
      records: [] as ParsedRecord[],
      dateGroups: {} as Record<string, ParsedRecord[]>,
      validCount: 0,
      skippedDueToInvalidDateCount: 0,
      isJson: false,
    };
  }
  }, [inputText, isJsonBackup, parsedJsonFunds]);

  const handleConfirmImport = () => {
    try {
      if (parseResult.validCount === 0) {
        alert('未偵測到具有正確日期的有效資料，請確認匯入內容包含合法日期 (如 2026/08/15) 與個股資料。');
        return;
      }

      // 1. JSON 備份檔匯入模式
      if (isJsonBackup && parsedJsonFunds) {
        // 嚴格過濾：僅保留含有正確日期的 snapshots
        const cleanedFunds = parsedJsonFunds.map((fund) => {
          const validSnapshots = (fund.snapshots || []).filter((s) => {
            const norm = validateAndNormalizeDate(s.date || s.asOfDate);
            return norm !== null;
          }).map((s) => {
            const normDate = validateAndNormalizeDate(s.date || s.asOfDate)!;
            return {
              ...s,
              date: normDate,
              asOfDate: normDate,
            };
          });

          // 依日期降冪排序 (新到舊)
          validSnapshots.sort((a, b) => {
            const tA = new Date(String(a.date || a.asOfDate || '').replace(/\//g, '-')).getTime() || 0;
            const tB = new Date(String(b.date || b.asOfDate || '').replace(/\//g, '-')).getTime() || 0;
            return tB - tA;
          });

          return {
            ...fund,
            asOfDate: validSnapshots[0]?.date || fund.asOfDate,
            snapshots: validSnapshots,
            lastUpdated: new Date().toLocaleString('zh-TW'),
          };
        });

        const msg = `✅ 成功自備份檔匯入 ${cleanedFunds.length} 檔基金！共載入 ${parseResult.validCount} 個有效期別` +
          (parseResult.skippedDueToInvalidDateCount > 0 ? `（已自動省略 ${parseResult.skippedDueToInvalidDateCount} 筆日期不合法的期別）` : '');

        onImportSuccess(cleanedFunds, msg);
        onClose();
        return;
      }

      // 2. CSV / 貼上文字匯入模式
      if (!currentFund) {
        alert('請先選取欲匯入之基金');
        return;
      }

      const updatedSnapshots = [...(currentFund?.snapshots || [])];

      // 針對每個有效日期建立或覆蓋 Snapshot
      Object.keys(parseResult.dateGroups).forEach((dateStr) => {
        const items = parseResult.dateGroups[dateStr];
        // 依比例排序 (高至低)
        const sortedItems = [...items].sort((a, b) => b.ratio - a.ratio);

        const holdings: HoldingItem[] = sortedItems.map((item, idx) => ({
          id: `${currentFund.id}-${String(dateStr).replace(/\//g, '')}-${item.stockCode || idx}`,
          stockName: item.stockName,
          stockCode: item.stockCode,
          shares: item.shares,
          sharesFormatted: item.shares > 0 ? item.shares.toLocaleString() : '-',
          ratio: item.ratio,
          date: dateStr,
          price: item.price,
          marketValue: item.price && item.shares ? item.price * item.shares : undefined,
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
      });

      // 依日期由新至舊排序
      updatedSnapshots.sort((a, b) => {
        const tA = new Date(String(a.date || a.asOfDate || '').replace(/\//g, '-')).getTime() || 0;
        const tB = new Date(String(b.date || b.asOfDate || '').replace(/\//g, '-')).getTime() || 0;
        return tB - tA;
      });

      const updatedFund: FundData = {
        ...currentFund,
        asOfDate: updatedSnapshots[0]?.date || currentFund.asOfDate,
        snapshots: updatedSnapshots,
        lastUpdated: new Date().toLocaleString('zh-TW'),
      };

      const updatedFunds = funds.map((f) => (f && f.id === currentFund.id ? updatedFund : f));

      const dateListStr = Object.keys(parseResult.dateGroups).sort().join(', ');
      const msg = `✅ 成功匯入【${currentFund.name}】共 ${parseResult.validCount} 筆持股 (${dateListStr})！` +
        (parseResult.skippedDueToInvalidDateCount > 0 ? `（已依規定自動省略 ${parseResult.skippedDueToInvalidDateCount} 筆非正確日期的資料）` : '');

      onImportSuccess(updatedFunds, msg);
      onClose();
    } catch (err: any) {
      console.error('Import processing error:', err);
      alert(`匯入處理失敗: ${err.message || '未知錯誤'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-teal-100 text-teal-700 rounded-md">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">匯入持股資料</h2>
              <p className="text-xs text-slate-500">
                貼上表格或上傳 CSV/JSON，<span className="text-rose-600 font-semibold">日期不正確的資料將自動省略</span>
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
          {/* Target fund selection (when not full JSON backup) */}
          {!isJsonBackup && (
            <div className="space-y-1">
              <label className="font-bold text-slate-700">匯入目標基金：</label>
              <select
                value={targetFundId}
                onChange={(e) => setTargetFundId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {validFunds.map((f, idx) => {
                  const fId = String(f.id || idx);
                  const fCode = String(f.code || '').replace('.TW', '');
                  const fName = String(f.name || '未命名基金');
                  const snapCount = Array.isArray(f.snapshots) ? f.snapshots.length : 0;
                  return (
                    <option key={fId} value={fId}>
                      {fName} {fCode ? `(${fCode})` : ''} - 目前有 {snapCount} 期
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* File upload button */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700">上傳 CSV / 試算表文字 / JSON 備份檔：</label>
              {uploadedFileName && (
                <span className="text-[11px] text-teal-700 font-mono font-semibold">
                  已載入: {uploadedFileName}
                </span>
              )}
            </div>
            <label className="border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-lg p-3 flex items-center justify-center space-x-2 bg-slate-50 hover:bg-teal-50/50 cursor-pointer transition-colors">
              <Upload className="w-4 h-4 text-teal-600" />
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
              <label className="font-bold text-slate-700">或直接貼上表格文字 (含日期、個股、股數、比例)：</label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleLoadCurrentFundSample}
                  className="text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors"
                  title="帶入現有持股做為範本直接編輯"
                >
                  帶入目前基金範本
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInputText(`2026/08/15\t2330\t台積電\t11,959,000\t9.3%\n2026/08/15\t2383\t台光電\t4,863,000\t8.38%\n無效日期列\t9999\t測試股票\t1,000\t1.0%`);
                    setIsJsonBackup(false);
                    setParsedJsonFunds(null);
                  }}
                  className="text-slate-600 hover:text-slate-800 underline font-semibold text-[11px] cursor-pointer"
                >
                  帶入測試範例
                </button>
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
              placeholder={`支援格式範例：\n日期\t股票代號\t股票名稱\t投資股數\t比例(%)\n2026/08/15\t2330\t台積電\t11,959,000\t9.3%\n2026/08/15\t2383\t台光電\t4,863,000\t8.38%`}
              className="w-full p-2.5 font-mono text-xs bg-slate-900 text-slate-100 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
            />
          </div>

          {/* Real-time date validation feedback card */}
          {inputText.trim() && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-600" />
                  <span>有效資料解析：</span>
                </span>
                <span className="px-2 py-0.5 bg-teal-100 text-teal-800 font-bold rounded-full">
                  {parseResult.validCount} 筆
                </span>
              </div>

              {/* Invalid date skip indicator */}
              {parseResult.skippedDueToInvalidDateCount > 0 ? (
                <div className="flex items-start space-x-2 bg-amber-50 border border-amber-200 text-amber-800 p-2.5 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">
                      已省略非正確日期的資料：{parseResult.skippedDueToInvalidDateCount} 筆
                    </div>
                    <div className="text-[11px] text-amber-700 mt-0.5">
                      規則嚴格檢驗：欄位中若未包含合法之日曆日期（例如標題字、非日期格式、無效月份或天數），系統已自動略過不予匯入。
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 flex items-center space-x-1">
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                  <span>所有解析出的列皆具備合法且正確的日期。</span>
                </div>
              )}

              {/* Detected dates summary */}
              {!isJsonBackup && Object.keys(parseResult.dateGroups).length > 0 && (
                <div className="pt-1 text-slate-700">
                  <span className="font-semibold">偵測到之合法期別：</span>
                  <span className="font-mono font-bold text-blue-700 ml-1">
                    {Object.keys(parseResult.dateGroups).map((d) => `${d} (${parseResult.dateGroups[d].length}檔)`).join(', ')}
                  </span>
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
              className="text-teal-700 hover:text-teal-900 font-semibold text-xs cursor-pointer"
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
              className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold rounded-md text-xs shadow-sm flex items-center space-x-1.5 cursor-pointer"
            >
              <span>確認匯入 ({parseResult.validCount} 筆)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
