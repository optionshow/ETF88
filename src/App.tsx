import React, { useState, useEffect } from 'react';
import { FundData } from './types';
import { getSavedFunds, saveFunds, fetchLiveFundData, syncAndMergeSheetsDatabase, fetchAndUpdateLiveStockPrices, pushAppDataToSheets, isFundsTodayData } from './services/fundService';
import { Navbar } from './components/Navbar';
import { FundDetailView } from './components/FundDetailView';
import { HoldingChangesView } from './components/HoldingChangesView';
import { OverlapAnalysisView } from './components/OverlapAnalysisView';
import { Top5TrackingView } from './components/Top5TrackingView';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [funds, setFunds] = useState<FundData[]>([]);
  const [selectedFundId, setSelectedFundId] = useState<string>('00981A.TW');
  const [activeTab, setActiveTab] = useState<'details' | 'changes' | 'overlap' | 'top5'>('details');
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

    const checkAndSyncOnStartup = async () => {
      // 1. 開啟時先確認目前本地資料是否全部都是最新（每檔基金皆包含今日最新期別）
      const isAlreadyLatest = isFundsTodayData(loaded);

      if (isAlreadyLatest) {
        console.log('[Startup Check] 目前本地資料皆為今日最新，無需重複擷取。');
        return;
      }

      console.log('[Startup Check] 目前資料非最新，先抓取雲端試算表歷史舊資料，再更新今日最新持股...');
      setIsRefreshing(true);

      try {
        // 第一步：先抓取舊資料（由 Google 試算表同步歷史期別，確保跨裝置歷史紀錄完整不遺漏）
        const syncRes = await syncAndMergeSheetsDatabase(loaded);
        let currentFunds = (syncRes && syncRes.updatedFunds && syncRes.updatedFunds.length > 0)
          ? syncRes.updatedFunds
          : loaded;

        setFunds(currentFunds);
        saveFunds(currentFunds);
        if (syncRes.latestUploadTime) {
          setSheetsLastUpdated(syncRes.latestUploadTime);
        } else {
          setSheetsLastUpdated(getDatabaseLastUpdatedTime(currentFunds));
        }

        // 第二步：檢查從試算表抓下來的資料中是否已包含今日最新持股明細
        const hasTodayAfterSync = isFundsTodayData(currentFunds);

        if (hasTodayAfterSync) {
          // 若其他裝置已更新並上傳今日數據至試算表，直接刷新最新個股即時股價
          try {
            const finalFunds = await fetchAndUpdateLiveStockPrices(currentFunds);
            setFunds(finalFunds);
            saveFunds(finalFunds);
          } catch (e) {
            console.warn('Startup live stock price update failed:', e);
          }
          showToast(`⚡ 已自 Google 試算表載入完整歷史期別與今日持股！`);
        } else {
          // 若試算表中也沒有今日資料，則執行官方網站擷取流程，更新今日最新持股
          let updatedCount = 0;
          const newFundsList = [...currentFunds];

          for (let i = 0; i < newFundsList.length; i++) {
            const fund = newFundsList[i];
            // 傳入已包含所有歷史期別的 fund 物件，避免單機舊快取覆蓋
            const res = await fetchLiveFundData(fund.code, fund);
            if (res) {
              newFundsList[i] = res;
              updatedCount++;
            }
          }

          // 同步更新個股最新即時股價
          let listWithPrices = newFundsList;
          try {
            listWithPrices = await fetchAndUpdateLiveStockPrices(newFundsList);
          } catch (err) {
            console.warn('Stock price update failed during startup:', err);
          }

          setFunds(listWithPrices);
          saveFunds(listWithPrices);

          // 將更新後的今日持股與完整歷史期別安全同步推送到 Google 試算表資料庫
          try {
            await pushAppDataToSheets(listWithPrices);
          } catch (e) {
            console.warn('Auto upload to sheets failed during startup:', e);
          }

          showToast(`✅ 已同步歷史期別並成功擷取 ${updatedCount} 檔基金今日最新持股！`);
        }
      } catch (err) {
        console.warn('Startup check and sync error:', err);
      } finally {
        setIsRefreshing(false);
      }
    };

    checkAndSyncOnStartup();

    // 當切換回此分頁時，自動靜默比對雲端資料庫，避免多台電腦不同步
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        const current = getSavedFunds();
        syncAndMergeSheetsDatabase(current).then((res) => {
          if (res && res.updatedFunds && res.updatedFunds.length > 0) {
            setFunds(res.updatedFunds);
            saveFunds(res.updatedFunds);
            if (res.latestUploadTime) setSheetsLastUpdated(res.latestUploadTime);
          }
        }).catch(() => {});
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
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
      // 1. 先與試算表雙向合併，確保包含其他電腦已寫入之歷史期別（如 8/13）
      let currentFunds = funds;
      try {
        const syncRes = await syncAndMergeSheetsDatabase(funds);
        if (syncRes && syncRes.updatedFunds && syncRes.updatedFunds.length > 0) {
          currentFunds = syncRes.updatedFunds;
          setFunds(currentFunds);
          saveFunds(currentFunds);
        }
      } catch (e) {
        console.warn('Pre-upload sync warning:', e);
      }

      localStorage.setItem('db_last_uploaded_time', nowTimestamp);
      setSheetsLastUpdated(nowTimestamp);

      const res = await pushAppDataToSheets(currentFunds, undefined, nowTimestamp);
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

      // 1. 先嘗試從 Google 試算表資料庫讀取並同步最新歷史期別（如 8/13）
      let sheetsSyncedFunds = currentSaved;
      try {
        const sheetsSync = await syncAndMergeSheetsDatabase(currentSaved);
        if (sheetsSync && sheetsSync.updatedFunds && sheetsSync.updatedFunds.length > 0) {
          sheetsSyncedFunds = sheetsSync.updatedFunds;
          setFunds(sheetsSyncedFunds);
          saveFunds(sheetsSyncedFunds);
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
        // 傳入已包含 8/13 等歷史期別的 fund 物件，避免被單機舊快取覆蓋
        const res = await fetchLiveFundData(fund.code, fund);
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
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-slate-500 text-xs mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>台灣基金/ETF 持股分析儀 — 專用擷取 4 大欄位（日期、個股名稱、投資股數、比例%）</span>
          <span>資料來源: 投信官方揭露數據 / 公開資訊 (開啟時自動比對最新狀態・同步試算表歷史期別並更新今日持股)</span>
        </div>
      </footer>
    </div>
  );
}
