import React, { useState, useEffect } from 'react';
import { FundData } from './types';
import { getSavedFunds, saveFunds, fetchLiveFundData, syncAndMergeSheetsDatabase, fetchAndUpdateLiveStockPrices, pushAppDataToSheets, isFundsTodayData } from './services/fundService';
import { Navbar } from './components/Navbar';
import { FundDetailView } from './components/FundDetailView';
import { HoldingChangesView } from './components/HoldingChangesView';
import { OverlapAnalysisView } from './components/OverlapAnalysisView';
import { Top5TrackingView } from './components/Top5TrackingView';
import { GoogleSheetsView } from './components/GoogleSheetsView';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [funds, setFunds] = useState<FundData[]>([]);
  const [selectedFundId, setSelectedFundId] = useState<string>('00981A.TW');
  const [activeTab, setActiveTab] = useState<'details' | 'changes' | 'overlap' | 'top5' | 'sheets'>('details');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [sheetsLastUpdated, setSheetsLastUpdated] = useState<string>('2026/08/05 18:00');

  const getDatabaseLastUpdatedTime = (fundList: FundData[]): string => {
    try {
      const savedTime = localStorage.getItem('db_last_uploaded_time');
      if (savedTime) return savedTime;
    } catch (e) {}

    let maxDate = '';
    fundList.forEach((f) => {
      (f.snapshots || []).forEach((s) => {
        const d = (s.date || s.asOfDate || '').replace(/-/g, '/');
        if (d && (!maxDate || d > maxDate)) {
          maxDate = d;
        }
      });
    });

    if (!maxDate) return '2026/08/05 18:00';
    if (maxDate.length === 10) return `${maxDate} 18:00`;
    return maxDate;
  };

  useEffect(() => {
    const loaded = getSavedFunds();
    setFunds(loaded);
    setSheetsLastUpdated(getDatabaseLastUpdatedTime(loaded));

    // 若網頁持股明細日期的日期是今天日期，表示持股內容已經是最新：停止自動更新、停止自動擷取、停止由試算表下載
    if (isFundsTodayData(loaded)) {
      console.log('[Auto-Check] 網頁持股明細日期的日期是今天日期，持股內容已經是最新。已停止自動更新，停止自動擷取，停止由試算表下載。');
      return;
    }

    // 否則，自動連線試算表並檢查
    syncAndMergeSheetsDatabase(loaded)
      .then((res) => {
        let currentFunds = loaded;
        if (res.syncedPeriodsCount > 0 || res.updatedFunds.length > 0) {
          currentFunds = res.updatedFunds;
          setFunds(currentFunds);
          saveFunds(currentFunds);
          if (res.latestUploadTime) {
            setSheetsLastUpdated(res.latestUploadTime);
          } else {
            setSheetsLastUpdated(getDatabaseLastUpdatedTime(currentFunds));
          }
          if (res.syncedPeriodsCount > 0) {
            showToast(`⚡ 已自動連線並比對 Google 試算表資料庫 (${res.source})，載入 ${res.syncedPeriodsCount} 個歷史期別！`);
          }
        } else if (res.latestUploadTime) {
          setSheetsLastUpdated(res.latestUploadTime);
        }

        // 檢查試算表同步後是否包含今天資料
        if (!isFundsTodayData(currentFunds)) {
          console.log('[Auto-Check] Today data missing, auto-fetching live fund holdings...');
          handleRefreshAll();
        } else {
          console.log('[Auto-Check] Today data already present in Google Sheets, skipped web scraping.');
        }
      })
      .catch((err) => {
        console.warn('Auto sheets sync on start error:', err);
      });
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleUploadToSheets = async () => {
    setIsRefreshing(true);
    const nowTimestamp = new Date().toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).replace(/-/g, '/');

    try {
      localStorage.setItem('db_last_uploaded_time', nowTimestamp);
      setSheetsLastUpdated(nowTimestamp);

      const res = await pushAppDataToSheets(funds, undefined, nowTimestamp);
      if (res.success) {
        showToast('✅ 成功將目前網頁資料上傳至 Google 試算表資料庫！');
      } else {
        showToast(`⚠️ 上傳訊息: ${res.message || '已備份至網頁快取 (請確認 Web App URL 設定)'}`);
      }
    } catch (e: any) {
      showToast(`上傳試算表失敗: ${e.message}`, 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDownloadFromSheets = async () => {
    setIsRefreshing(true);
    try {
      const res = await syncAndMergeSheetsDatabase(funds);
      setFunds(res.updatedFunds);
      saveFunds(res.updatedFunds);
      const updatedTime = res.latestUploadTime || getDatabaseLastUpdatedTime(res.updatedFunds);
      setSheetsLastUpdated(updatedTime);
      showToast(`✅ 成功從 Google 試算表資料庫下載最新資料！共載入 ${res.syncedPeriodsCount} 個歷史期別明細。`);
    } catch (e: any) {
      showToast(`下載試算表失敗: ${e.message}`, 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      const currentSaved = getSavedFunds();

      // 1. 先嘗試從 Google 試算表資料庫讀取並同步最新歷史期別
      let sheetsSyncedFunds = currentSaved;
      try {
        const sheetsSync = await syncAndMergeSheetsDatabase(currentSaved);
        if (sheetsSync && sheetsSync.updatedFunds && sheetsSync.updatedFunds.length > 0) {
          sheetsSyncedFunds = sheetsSync.updatedFunds;
          if (sheetsSync.latestUploadTime) {
            setSheetsLastUpdated(sheetsSync.latestUploadTime);
          } else {
            setSheetsLastUpdated(getDatabaseLastUpdatedTime(sheetsSyncedFunds));
          }
        }
      } catch (e) {
        console.warn('Syncing with Google Sheets database failed prior to refresh:', e);
      }

      // 2. 檢查 Google 試算表資料中是否已包含「今日」最新持股明細
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      const todayStr1 = `${y}/${m}/${d}`;
      const todayStr2 = `${y}/${today.getMonth() + 1}/${today.getDate()}`;

      const hasTodayInSheets = sheetsSyncedFunds.length > 0 && sheetsSyncedFunds.some((f) =>
        (f.snapshots || []).some((s) => {
          const sDate = (s.date || s.asOfDate || '').replace(/-/g, '/').trim();
          return sDate === todayStr1 || sDate === todayStr2;
        })
      );

      // 若 Google 試算表已有今天資料，直接下載套用並更新即時股價，無需跑爬蟲流程！
      if (hasTodayInSheets) {
        let finalFunds = sheetsSyncedFunds;
        try {
          finalFunds = await fetchAndUpdateLiveStockPrices(sheetsSyncedFunds);
        } catch (e) {
          console.warn('Live stock price update failed during sheets shortcut:', e);
        }
        setFunds(finalFunds);
        saveFunds(finalFunds);
        showToast('✅ Google 試算表已有今日最新資料，已直接為您下載套用，無需重新擷取！');
        return;
      }

      // 3. 若 Google 試算表中沒有今天的資料，才執行官方網站擷取流程 (Scraping Protocol)
      let updatedCount = 0;
      const newFundsList = [...sheetsSyncedFunds];

      for (let i = 0; i < newFundsList.length; i++) {
        const fund = newFundsList[i];
        const res = await fetchLiveFundData(fund.code);
        if (res) {
          newFundsList[i] = res;
          updatedCount++;
        }
      }

      // 4. 同步更新個股最新股價
      let listWithPrices = newFundsList;
      try {
        listWithPrices = await fetchAndUpdateLiveStockPrices(newFundsList);
      } catch (err) {
        console.warn('Auto stock price update failed during refreshAll:', err);
      }

      setFunds(listWithPrices);
      saveFunds(listWithPrices);

      // 5. 將爬取到的最新資料同步覆蓋推送到 Google 試算表資料庫
      try {
        const sheetsSync = await syncAndMergeSheetsDatabase(listWithPrices);
        let finalSynced = sheetsSync.updatedFunds;
        try {
          finalSynced = await fetchAndUpdateLiveStockPrices(finalSynced);
        } catch (e) {
          console.warn('Post-sheets sync stock price update failed:', e);
        }
        setFunds(finalSynced);
        saveFunds(finalSynced);

        pushAppDataToSheets(finalSynced).catch((e) => console.warn('Push app data to sheets warning:', e));

        showToast(`✅ 每日更新完成！成功自動抓取 ${updatedCount} 檔基金最新持股明細與最新個股股價，並已同步覆蓋至 Google 試算表資料庫！`);
      } catch (e: any) {
        showToast(`每日更新完成 (${updatedCount} 檔)，試算表同步提示: ${e.message}`);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFetchStockPrices = async () => {
    setIsRefreshing(true);
    try {
      const updated = await fetchAndUpdateLiveStockPrices(funds);
      setFunds(updated);
      saveFunds(updated);
      showToast('⚡ 已成功自動抓取全基金個股目前最新股價並記錄！');
    } catch (e: any) {
      showToast(`抓取股價失敗: ${e.message}`, 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRefreshSingle = async (fundCode: string) => {
    setIsRefreshing(true);
    const res = await fetchLiveFundData(fundCode);
    if (res) {
      let updated = funds.map((f) => (f.code.toUpperCase() === fundCode.toUpperCase() ? res : f));
      try {
        updated = await fetchAndUpdateLiveStockPrices(updated);
      } catch (e) {
        console.warn('Single refresh stock price update error:', e);
      }
      setFunds(updated);
      saveFunds(updated);
      pushAppDataToSheets(updated).catch((e) => console.warn('Push single fund to sheets error:', e));
      showToast(`已完成 ${res.name} 的持股明細與最新股價更新！`);
    } else {
      showToast(`擷取 ${fundCode} 失敗，請確認網路與網址。`, 'error');
    }
    setIsRefreshing(false);
  };

  const handleAddFund = async (codeOrUrl: string): Promise<boolean> => {
    setIsRefreshing(true);
    const scraped = await fetchLiveFundData(codeOrUrl);

    if (scraped) {
      const existingIdx = funds.findIndex((f) => f.code.toUpperCase() === scraped.code.toUpperCase());
      let updatedFunds: FundData[];
      if (existingIdx >= 0) {
        updatedFunds = [...funds];
        updatedFunds[existingIdx] = scraped;
      } else {
        updatedFunds = [scraped, ...funds];
      }

      try {
        updatedFunds = await fetchAndUpdateLiveStockPrices(updatedFunds);
      } catch (e) {
        console.warn('Stock price update error on add:', e);
      }

      setFunds(updatedFunds);
      saveFunds(updatedFunds);
      setSelectedFundId(scraped.id);
      setIsRefreshing(false);
      showToast(`成功新增/更新基金：${scraped.name} (${scraped.code.replace('.TW', '')})，並已同步抓取個股最新股價！`);
      return true;
    }
    setIsRefreshing(false);
    return false;
  };

  const hasTodayData = isFundsTodayData(funds);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-600 selection:text-white flex flex-col">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div
            className={`px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2 border text-xs font-semibold ${
              toastMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-emerald-500/10'
                : 'bg-red-50 text-red-800 border-red-300 shadow-red-500/10'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onRefreshAll={handleRefreshAll}
        onUploadToSheets={handleUploadToSheets}
        onDownloadFromSheets={handleDownloadFromSheets}
        sheetsLastUpdated={sheetsLastUpdated}
        isRefreshing={isRefreshing}
        hasTodayData={hasTodayData}
      />

      {/* Main Application Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {activeTab === 'details' && (
          <FundDetailView
            funds={funds}
            selectedFundId={selectedFundId}
            setSelectedFundId={setSelectedFundId}
            onRefreshSingle={handleRefreshSingle}
            onFetchStockPrices={handleFetchStockPrices}
            isRefreshing={isRefreshing}
            onUpdateFunds={(updatedFunds, msg, singleFundToPush) => {
              setFunds(updatedFunds);
              saveFunds(updatedFunds);
              if (singleFundToPush) {
                pushAppDataToSheets([singleFundToPush]).catch((e) => console.warn('Push single fund data error:', e));
              } else {
                pushAppDataToSheets(updatedFunds).catch((e) => console.warn('Push app data error:', e));
              }
              if (msg) showToast(msg);
            }}
          />
        )}

        {activeTab === 'changes' && (
          <HoldingChangesView
            funds={funds}
            selectedFundId={selectedFundId}
            setSelectedFundId={setSelectedFundId}
          />
        )}

        {activeTab === 'overlap' && <OverlapAnalysisView funds={funds} />}

        {activeTab === 'top5' && <Top5TrackingView funds={funds} />}

        {activeTab === 'sheets' && <GoogleSheetsView funds={funds} onUpdateFunds={setFunds} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-slate-500 text-xs mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>台灣基金/ETF 持股分析儀 — 專用擷取 4 大欄位（日期、個股名稱、投資股數、比例%）</span>
          <span>資料來源: 投信官方揭露數據 / 公開資訊 (每日 08:00、16:00 與 18:00 自動同步擷取持股與最新個股股價)</span>
        </div>
      </footer>
    </div>
  );
}
