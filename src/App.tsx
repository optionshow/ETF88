import React, { useState, useEffect } from 'react';
import { FundData } from './types';
import { getSavedFunds, saveFunds, fetchLiveFundData, fetchAndUpdateLiveStockPrices, isFundsTodayData } from './services/fundService';
import { Navbar } from './components/Navbar';
import { FundDetailView } from './components/FundDetailView';
import { HoldingChangesView } from './components/HoldingChangesView';
import { OverlapAnalysisView } from './components/OverlapAnalysisView';
import { Top5TrackingView } from './components/Top5TrackingView';
import { ExportModal } from './components/ExportModal';
import { ImportModal } from './components/ImportModal';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [funds, setFunds] = useState<FundData[]>([]);
  const [selectedFundId, setSelectedFundId] = useState<string>('00981A.TW');
  const [activeTab, setActiveTab] = useState<'details' | 'changes' | 'overlap' | 'top5'>('details');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  useEffect(() => {
    const loaded = getSavedFunds();
    setFunds(loaded);

    const checkAndSyncOnStartup = async () => {
      // 開啟時檢查目前本地資料是否為今日最新
      const isAlreadyLatest = isFundsTodayData(loaded);

      if (isAlreadyLatest) {
        console.log('[Startup Check] 目前本地資料皆為今日最新，無需重複擷取。');
        return;
      }

      console.log('[Startup Check] 執行每日自動更新，抓取今日最新持股明細...');
      setIsRefreshing(true);

      try {
        let updatedCount = 0;
        const newFundsList = [...loaded];

        for (let i = 0; i < newFundsList.length; i++) {
          const fund = newFundsList[i];
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

        if (updatedCount > 0) {
          showToast(`✅ 已自動成功更新 ${updatedCount} 檔基金今日最新持股！`);
        }
      } catch (err) {
        console.warn('Startup check error:', err);
      } finally {
        setIsRefreshing(false);
      }
    };

    checkAndSyncOnStartup();
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      const currentSaved = getSavedFunds();
      let updatedCount = 0;
      const newFundsList = [...currentSaved];

      for (let i = 0; i < newFundsList.length; i++) {
        const fund = newFundsList[i];
        const res = await fetchLiveFundData(fund.code, fund);
        if (res) {
          newFundsList[i] = res;
          updatedCount++;
        }
      }

      // 同步更新個股最新股價
      let listWithPrices = newFundsList;
      try {
        listWithPrices = await fetchAndUpdateLiveStockPrices(newFundsList);
      } catch (err) {
        console.warn('Auto stock price update failed during refreshAll:', err);
      }

      setFunds(listWithPrices);
      saveFunds(listWithPrices);

      showToast(`✅ 每日更新完成！成功自動抓取 ${updatedCount} 檔基金最新持股明細與即時股價！`);
    } catch (e: any) {
      showToast(`每日更新失敗: ${e.message}`, 'error');
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
      showToast('⚡ 已成功自動抓取全基金個股目前最新股價！');
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
      showToast(`已完成 ${res.name} 的持股明細與最新股價更新！`);
    } else {
      showToast(`擷取 ${fundCode} 失敗，請確認網路與網址。`, 'error');
    }
    setIsRefreshing(false);
  };

  const handleImportSuccess = async (updatedFunds: FundData[], message: string) => {
    setIsRefreshing(true);
    try {
      let fundsWithPrices = updatedFunds;
      try {
        fundsWithPrices = await fetchAndUpdateLiveStockPrices(updatedFunds);
      } catch (e) {
        console.warn('Post-import stock price update failed:', e);
      }

      setFunds(fundsWithPrices);
      saveFunds(fundsWithPrices);
      showToast(message);
    } finally {
      setIsRefreshing(false);
    }
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
        onOpenExport={() => setIsExportOpen(true)}
        onOpenImport={() => setIsImportOpen(true)}
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

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        funds={funds}
        selectedFundId={selectedFundId}
        onSwitchToImport={() => {
          setIsExportOpen(false);
          setIsImportOpen(true);
        }}
      />

      {/* Import Modal */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        funds={funds}
        selectedFundId={selectedFundId}
        onImportSuccess={handleImportSuccess}
        onSwitchToExport={() => {
          setIsImportOpen(false);
          setIsExportOpen(true);
        }}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-slate-500 text-xs mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>台灣基金/ETF 持股分析儀 — 專用自動擷取 4 大欄位（日期、個股名稱、投資股數、比例%）</span>
          <span>資料來源: 投信官方揭露數據 / 公開資訊</span>
        </div>
      </footer>
    </div>
  );
}
