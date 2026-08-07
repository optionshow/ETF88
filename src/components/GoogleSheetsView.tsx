import React, { useState, useEffect } from 'react';
import { FundData } from '../types';
import { FileSpreadsheet, Copy, Check, Download, ExternalLink, Code, Clock, RefreshCw, Trash2, Zap, Database, Calendar, Eye, Layers } from 'lucide-react';
import { syncAndMergeSheetsDatabase, normalizeDateString } from '../services/fundService';
import { generateGoogleScript } from '../utils/googleScriptGenerator';

interface GoogleSheetsViewProps {
  funds: FundData[];
  onUpdateFunds?: (funds: FundData[]) => void;
}

const DEFAULT_SPREADSHEET_ID = '1u4F6xNbGf2HqkwJL2kXxolEKUObzHWnMdHaGsbI5ypo';
const DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyAPZfZYLT1Igoo1BRAc6GDdvUcWYTV9HubJVQOGjK1NHqNsjSCpnR0kH4VCgM_6xMm/exec';

export const GoogleSheetsView: React.FC<GoogleSheetsViewProps> = ({ funds, onUpdateFunds }) => {
  const [copied, setCopied] = useState(false);
  const [spreadsheetId] = useState<string>(DEFAULT_SPREADSHEET_ID);
  const [webAppUrl] = useState<string>(DEFAULT_WEB_APP_URL);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testStatusMsg, setTestStatusMsg] = useState<string>('');
  const [isReadingDb, setIsReadingDb] = useState<boolean>(false);
  const [dbReadStatus, setDbReadStatus] = useState<string>('');
  const [selectedFundCodeForPeriod, setSelectedFundCodeForPeriod] = useState<string>('00981A.TW');
  const [selectedPeriodDate, setSelectedPeriodDate] = useState<string>('');
  const [selectedFundCodes, setSelectedFundCodes] = useState<string[]>(() => {
    return funds.length > 0 ? funds.map((f) => f.code) : ["00981A.TW", "00982A.TW", "00407A.TW", "ACPS09", "ACDD04", "ACPS10"];
  });

  const [scriptCode, setScriptCode] = useState<string>(() => {
    const codes = selectedFundCodes.length > 0 ? selectedFundCodes : funds.map((f) => f.code);
    return generateGoogleScript(codes, DEFAULT_SPREADSHEET_ID);
  });

  // Sync selected fund codes when funds list changes
  useEffect(() => {
    if (funds.length > 0 && selectedFundCodes.length === 0) {
      setSelectedFundCodes(funds.map((f) => f.code));
    }
  }, [funds]);

  useEffect(() => {
    const targetCodes = selectedFundCodes.length > 0 ? selectedFundCodes : funds.map((f) => f.code);
    // Immediately set client-generated script so it is never blank/missing
    const clientScript = generateGoogleScript(targetCodes, spreadsheetId);
    setScriptCode(clientScript);

    // Also attempt server fetch if API is available
    fetch('/api/generate-google-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fundCodes: targetCodes, spreadsheetId }),
    })
      .then(async (res) => {
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          return { success: false };
        }
      })
      .then((data) => {
        if (data && data.success && data.script) {
          setScriptCode(data.script);
        }
      })
      .catch((err) => console.error('Error generating script from API:', err));
  }, [selectedFundCodes, spreadsheetId, funds]);

  const handleTestConnection = async () => {
    if (!webAppUrl.trim()) {
      setTestStatusMsg('❌ 請先輸入 Google Apps Script Web App URL');
      return;
    }
    setIsTesting(true);
    setTestStatusMsg('🔍 正在測試連線至 Google Apps Script Web App...');

    try {
      const res = await fetch('/api/push-app-data-to-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webAppUrl: webAppUrl.trim(),
          fundDataList: [],
        }),
      });
      const resText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(resText);
      } catch (jsonErr) {
        setTestStatusMsg(`⚠️ 連線測試提醒: 收到非 JSON 回傳格式 (${resText.slice(0, 100)}...)。請確認 Web App URL 正確且權限為「所有人 (Anyone)」。`);
        return;
      }

      if (data.success) {
        setTestStatusMsg('🎉 Web App 連線測試成功！權限設為「所有人 (Anyone)」，可正常接收推送！');
      } else {
        setTestStatusMsg(`⚠️ 連線測試提醒: ${data.error || '請確認 Web App URL 已選「所有人 (Anyone)」權限並重新部署'}`);
      }
    } catch (err: any) {
      setTestStatusMsg(`❌ 連線測試失敗: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(scriptCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadAllCSV = () => {
    funds.forEach((fund) => {
      const activeSnapshot = fund.snapshots[0];
      if (!activeSnapshot) return;
      fetch('/api/export-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundName: fund.name,
          holdings: activeSnapshot.holdings,
        }),
      })
        .then((res) => res.blob())
        .then((blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${fund.code}_${activeSnapshot.date}_投資明細.csv`;
          a.click();
        });
    });
  };

  const handleReadDatabase = async () => {
    setIsReadingDb(true);
    setDbReadStatus('正在連線並雙向比對 Google 試算表資料庫與網頁記憶體...');
    try {
      const res = await syncAndMergeSheetsDatabase(webAppUrl, spreadsheetId);
      if (onUpdateFunds) {
        onUpdateFunds(res.updatedFunds);
      }
      setDbReadStatus(`✅ 雙向比對完成！(${res.source}) 共同步 ${res.totalFundsSynced} 檔基金、雙向補齊 ${res.syncedPeriodsCount} 個歷史期別紀錄，已自動儲存至本機網頁記憶體方便下次開啟！`);
    } catch (e: any) {
      setDbReadStatus(`❌ 讀取資料庫失敗: ${e.message}`);
    } finally {
      setIsReadingDb(false);
    }
  };

  const toggleFundCode = (code: string) => {
    if (selectedFundCodes.includes(code)) {
      if (selectedFundCodes.length > 1) {
        setSelectedFundCodes(selectedFundCodes.filter((c) => c !== code));
      }
    } else {
      setSelectedFundCodes([...selectedFundCodes, code]);
    }
  };

  const currentSheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=1595556956#gid=1595556956`;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0 mt-0.5">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  Google 試算表同步與 Apps Script 自動更新設定
                </h3>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full">
                  支援雙向比對 &amp; 歷史期別
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed max-w-2xl mt-1">
                本系統提供 Google Apps Script 貼上即用的專屬語法與連線設定。您可以直接複製程式碼並在 Apps Script 部署為 Web App（權限設為所有人），系統將自動進行雙向資料備份與歷史期別比對。
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <a
              href={currentSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-md transition-colors shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>開啟目標 Google 試算表</span>
            </a>
          </div>
        </div>
      </div>



      {/* Feature Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3.5 flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-blue-900">APP 主動抓取與推送</div>
            <div className="text-[11px] text-blue-700">APP 解析完畢後直連 Google 試算表</div>
          </div>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3.5 flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-900">資料絕不重疊 (Smart De-dupe)</div>
            <div className="text-[11px] text-emerald-700">自動覆蓋同日舊數據，歷史逐日留存</div>
          </div>
        </div>

        <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3.5 flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-amber-900">自動刪除 60 天前舊資料</div>
            <div className="text-[11px] text-amber-700">防止試算表過大，自動維持 60 天滾動紀錄</div>
          </div>
        </div>
      </div>

      {/* URL & Spreadsheet ID Settings Panel */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 text-white shadow-md space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Code className="w-5 h-5 text-emerald-400" />
            <h4 className="text-sm font-bold tracking-wide text-emerald-300">
              ⚙️ Google 試算表連線參數 (已系統內建固定，免修改 / 免存檔)
            </h4>
          </div>
          <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded font-mono font-bold">
            ✅ 已預設內建完成
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>Google 試算表 ID (Spreadsheet ID):</span>
              <a
                href={currentSheetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline text-[11px] font-normal inline-flex items-center space-x-1"
              >
                <span>開啟目標試算表</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </label>
            <div className="w-full text-xs font-mono px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-emerald-300 select-all overflow-x-auto break-all">
              {spreadsheetId}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">
              Apps Script Web App URL:
            </label>
            <div className="w-full text-xs font-mono px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-emerald-300 select-all overflow-x-auto break-all">
              {webAppUrl}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 flex-wrap gap-2 pt-1">
          <button
            onClick={handleTestConnection}
            disabled={isTesting}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-md shadow transition-colors cursor-pointer"
          >
            {isTesting ? <RefreshCw className="w-4 h-4 animate-spin text-slate-950" /> : <Zap className="w-4 h-4 text-slate-950" />}
            <span>{isTesting ? '測試中...' : '🧪 測試 Web App 連線與權限'}</span>
          </button>
        </div>

        {testStatusMsg && (
          <div className={`p-3 rounded-md text-xs font-medium border ${
            testStatusMsg.includes('成功')
              ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
              : 'bg-amber-950/80 border-amber-700 text-amber-200'
          }`}>
            {testStatusMsg}
          </div>
        )}
      </div>

      {/* Google Sheets Historical Period Database Viewer */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Google 試算表歷史期別資料庫 (自動讀取與歷次比對)</span>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">
                  即時自動連線
                </span>
              </h4>
              <p className="text-xs text-slate-500">
                開啟 APP 時已自動連線讀取 Google 試算表中保存的所有歷史期別與持股明細數據
              </p>
            </div>
          </div>

          <button
            onClick={handleReadDatabase}
            disabled={isReadingDb}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-bold rounded-md transition-colors shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReadingDb ? 'animate-spin text-emerald-400' : 'text-slate-300'}`} />
            <span>{isReadingDb ? '正在讀取試算表...' : '🔄 立即讀取/比對試算表資料庫'}</span>
          </button>
        </div>

        {dbReadStatus && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-md font-medium flex items-center space-x-2">
            <Database className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{dbReadStatus}</span>
          </div>
        )}

        {/* Funds & Historical Periods Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Fund Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center space-x-1">
              <span>選擇基金/ETF:</span>
            </label>
            <select
              value={selectedFundCodeForPeriod}
              onChange={(e) => {
                setSelectedFundCodeForPeriod(e.target.value);
                setSelectedPeriodDate('');
              }}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              {funds.map((f) => (
                <option key={f.id} value={f.code}>
                  {f.name} ({f.code.replace('.TW', '')}) - 共 {f.snapshots?.length || 1} 期紀錄
                </option>
              ))}
            </select>
          </div>

          {/* Historical Period Selector */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-bold text-slate-700 flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>試算表資料庫歷史期別 (Snapshot Dates):</span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {(() => {
                const targetFund = funds.find((f) => f.code === selectedFundCodeForPeriod || f.id === selectedFundCodeForPeriod) || funds[0];
                const snapshots = targetFund?.snapshots || [];

                if (snapshots.length === 0) {
                  return <span className="text-xs text-slate-400">目前尚無歷史期別</span>;
                }

                return snapshots.map((snap, idx) => {
                  const isActive = selectedPeriodDate === snap.asOfDate || (!selectedPeriodDate && idx === 0);
                  return (
                    <button
                      key={snap.asOfDate + idx}
                      onClick={() => setSelectedPeriodDate(snap.asOfDate)}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center space-x-1.5 transition-all border cursor-pointer ${
                        isActive
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      <span>{snap.asOfDate}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {snap.holdings.length} 檔
                      </span>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* Selected Period Holdings Table */}
        <div className="pt-2">
          {(() => {
            const targetFund = funds.find((f) => f.code === selectedFundCodeForPeriod || f.id === selectedFundCodeForPeriod) || funds[0];
            const snapshots = targetFund?.snapshots || [];
            const activeSnap = snapshots.find((s) => s.asOfDate === selectedPeriodDate) || snapshots[0];

            if (!activeSnap) return null;

            return (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
                <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs text-slate-800">
                      【{targetFund?.name}】歷史期別明細：<span className="text-emerald-700 font-extrabold">{activeSnap.asOfDate}</span>
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      (前 {activeSnap.holdings.length} 大個股持股)
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    試算表分頁: 基金明細_{targetFund?.code.replace('.TW', '')}
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-200/80 text-slate-700 font-bold border-b border-slate-300 sticky top-0">
                        <th className="py-2 px-3 w-12 text-center">#</th>
                        <th className="py-2 px-3">日期</th>
                        <th className="py-2 px-3">個股名稱</th>
                        <th className="py-2 px-3 text-right">目前股價</th>
                        <th className="py-2 px-3 text-right">持股市值 (萬)</th>
                        <th className="py-2 px-3 text-right">投資股數</th>
                        <th className="py-2 px-3 text-right">比例 (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {activeSnap.holdings.map((item, idx) => {
                        const mv = item.marketValue || (item.price && item.shares ? item.price * item.shares : 0);

                        return (
                          <tr key={item.id || idx} className="hover:bg-slate-50">
                            <td className="py-1.5 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                            <td className="py-1.5 px-3 font-mono text-slate-600">{activeSnap.asOfDate}</td>
                            <td className="py-1.5 px-3 font-bold text-slate-900">{item.stockName}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-emerald-700">
                              {item.price ? item.price.toLocaleString() : '-'}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-800">
                              {mv > 0
                                ? `$${Math.round(mv / 10000).toLocaleString('zh-TW')} 萬`
                                : '-'}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono text-slate-700">
                              {item.sharesFormatted || item.shares.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-emerald-700">
                              {item.ratio.toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Target Config Box */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="text-xs font-bold text-slate-800 flex items-center space-x-2">
            <span>目標 Google 試算表 ID:</span>
          </label>
          <span className="text-[11px] font-mono text-slate-500">
            URL: {currentSheetUrl.substring(0, 65)}...
          </span>
        </div>
        <div className="text-xs font-mono px-3 py-2 bg-slate-100 border border-slate-200 rounded-md font-bold text-slate-800 select-all overflow-x-auto">
          {spreadsheetId}
        </div>

        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <span className="text-xs font-bold text-slate-700 font-mono">APP 將匯出的基金與 ETF (共 {selectedFundCodes.length} 檔):</span>
            <span className="text-xs text-slate-500 font-medium font-mono">{selectedFundCodes.join(', ')}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {funds.map((f) => {
              const isChecked = selectedFundCodes.includes(f.code);
              return (
                <button
                  key={f.code}
                  onClick={() => toggleFundCode(f.code)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                    isChecked
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {isChecked ? '✓ ' : '+ '}
                  {f.name} ({f.code})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3 Step Guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-blue-600 shadow-sm">
          <div className="flex items-center space-x-2 text-blue-600 font-bold text-xs mb-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-mono">1</span>
            <span>貼上腳本到 Apps Script</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            開啟您的 <a href={currentSheetUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">Google 試算表</a>，點選選單 <span className="font-semibold text-slate-900">擴充功能 &gt; Apps Script</span>，複製下方腳本貼上並儲存。
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-purple-600 shadow-sm">
          <div className="flex items-center space-x-2 text-purple-600 font-bold text-xs mb-2">
            <span className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-mono">2</span>
            <span>部署為 Web App (權限設為「所有人」)</span>
          </div>
          <div className="text-xs text-slate-600 leading-relaxed space-y-1">
            <p className="font-semibold text-slate-900">點選 Apps Script 右上角【部署】➔【新增部署作業】：</p>
            <ol className="list-decimal list-inside space-y-0.5 text-slate-700">
              <li>選取類型：點選齒輪圖案選擇<b>「網頁應用程式 (Web App)」</b></li>
              <li>執行身份：選擇<b>「我 (Me)」</b></li>
              <li><b>關鍵步驟【誰可以存取】：選擇「所有人 (Anyone)」</b></li>
              <li>點選<b>【部署】</b>，授權 Google 帳號存取</li>
              <li>複製產生的 Web App 網址 (https://script.google.com/macros/s/...) 貼回本系統頂端輸入框即可！</li>
            </ol>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-emerald-600 shadow-sm">
          <div className="flex items-center space-x-2 text-emerald-600 font-bold text-xs mb-2">
            <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-mono">3</span>
            <span>完成！自動不重疊 + 60天清理</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            無論是 APP 推送或排程觸發，皆確保相同日期數據不重複寫入，並自動滾動刪除 60 天前的舊資料。
          </p>
        </div>
      </div>

      {/* Script Code Block */}
      <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden shadow-sm">
        <div className="p-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-mono text-slate-200">
            <Code className="w-4 h-4 text-emerald-400" />
            <span>Fund_Tracker.gs (Google Apps Script - 支援 APP 推送 &amp; 自動執行)</span>
          </div>
          <button
            onClick={handleCopyScript}
            className="inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold text-emerald-300 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-400/40 rounded-md transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '已複製到剪貼簿！' : '複製腳本程式碼'}</span>
          </button>
        </div>

        <div className="p-4 overflow-x-auto">
          <pre className="text-xs font-mono text-emerald-300 leading-relaxed whitespace-pre-wrap select-all">
            {scriptCode}
          </pre>
        </div>
      </div>
    </div>
  );
};


