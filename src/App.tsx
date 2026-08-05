import React, { useState, useEffect } from 'react';
import { FundData } from './types';
import { getSavedFunds, saveFunds, fetchLiveFundData, syncAndMergeSheetsDatabase, fetchAndUpdateLiveStockPrices, pushAppDataToSheets } from './services/fundService';
import { Navbar } from './components/Navbar';
import { FundDetailView } from './components/FundDetailView';
import { HoldingChangesView } from './components/HoldingChangesView';
import { OverlapAnalysisView } from './components/OverlapAnalysisView';
import { GoogleSheetsView } from './components/GoogleSheetsView';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [funds, setFunds] = useState<FundData[]>([]);
  const [selectedFundId, setSelectedFundId] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'details' | 'changes' | 'overlap' | 'sheets'>('details');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const loaded = getSavedFunds();
    setFunds(loaded);

    // Auto-read and compare Google Sheets Database on App startup using loaded local funds as primary baseline
    syncAndMergeSheetsDatabase(loaded)
      .then((res) => {
        if (res.syncedPeriodsCount > 0 || res.updatedFunds.length > 0) {
          setFunds(res.updatedFunds);
          saveFunds(res.updatedFunds);
          if (res.syncedPeriodsCount > 0) {
            showToast(`⚡ 已自動連線並比對 Google 試算表資料庫 (${res.source})，載入 ${res.syncedPeriodsCount} 個新歷史期別！`);
          }
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

  const handleSyncSheetsDatabase = async () => {
    setIsRefreshing(true);
    try {
      const res = await syncAndMergeSheetsDatabase(funds);
      setFunds(res.updatedFunds);
      saveFunds(res.updatedFunds);
      showToast(`✅ 已完成 Google 試算表資料庫雙向比對與補齊！來自 ${res.source}，共同步 ${res.totalFundsSynced} 檔基金，資料已自動儲存至本機！`);
    } catch (e: any) {
      showToast(`比對試算表失敗: ${e.message}`, 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    let updatedCount = 0;
    const newFundsList = [...funds];

    // 1. Execute COMPLETE live auto-scraping for ALL funds according to AGENTS.md protocol
    for (let i = 0; i < newFundsList.length; i++) {
      const fund = newFundsList[i];
      const res = await fetchLiveFundData(fund.code);
      if (res) {
        newFundsList[i] = res;
        updatedCount++;
      }
    }

    // 2. Immediately persist freshly scraped funds to state & localStorage
    setFunds(newFundsList);
    saveFunds(newFundsList);

    // 3. Bidirectionally merge with Google Sheets passing newFundsList (App data takes priority)
    try {
      const sheetsSync = await syncAndMergeSheetsDatabase(newFundsList);
      setFunds(sheetsSync.updatedFunds);
      saveFunds(sheetsSync.updatedFunds);

      // 4. Actively push APP's exact scraped data to overwrite Google Sheets database
      pushAppDataToSheets(sheetsSync.updatedFunds).catch((e) => console.warn('Push app data to sheets warning:', e));

      showToast(`✅ 每日更新完成！成功自動抓取 ${updatedCount} 檔基金最新持股明細（投資股數與比例%），並已同步覆蓋至 Google 試算表資料庫！`);
    } catch (e: any) {
      showToast(`每日更新完成 (${updatedCount} 檔)，試算表同步提示: ${e.message}`);
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
      const updated = funds.map((f) => (f.code.toUpperCase() === fundCode.toUpperCase() ? res : f));
      setFunds(updated);
      saveFunds(updated);
      pushAppDataToSheets(updated).catch((e) => console.warn('Push single fund to sheets error:', e));
      showToast(`已完成 ${res.name} 的資料擷取與同步！`);
    } else {
      showToast(`擷取 ${fundCode} 失敗，請確認網路與網址。`, 'error');
    }
    setIsRefreshing(false);
  };

  const handleAddFund = async (codeOrUrl: string): Promise<boolean> => {
    setIsRefreshing(true);
    const scraped = await fetchLiveFundData(codeOrUrl);
    setIsRefreshing(false);

    if (scraped) {
      const existingIdx = funds.findIndex((f) => f.code.toUpperCase() === scraped.code.toUpperCase());
      let updatedFunds: FundData[];
      if (existingIdx >= 0) {
        updatedFunds = [...funds];
        updatedFunds[existingIdx] = scraped;
      } else {
        updatedFunds = [scraped, ...funds];
      }

      setFunds(updatedFunds);
      saveFunds(updatedFunds);
      setSelectedFundId(scraped.id);
      showToast(`成功新增/更新基金：${scraped.name} (${scraped.code.replace('.TW', '')})`);
      return true;
    }
    return false;
  };

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
        onSyncSheetsDatabase={handleSyncSheetsDatabase}
        isRefreshing={isRefreshing}
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

        {activeTab === 'sheets' && <GoogleSheetsView funds={funds} onUpdateFunds={setFunds} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-slate-500 text-xs mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>台灣基金/ETF 持股分析儀 — 專用擷取 4 大欄位（日期、個股名稱、投資股數、比例%）</span>
          <span>資料來源: 投信官方揭露數據 / 公開資訊 (每日 08:00 與 18:00 自動執行)</span>
        </div>
      </footer>
    </div>
  );
}
