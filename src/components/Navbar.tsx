import React from 'react';
import { RefreshCw, PlusCircle, FileSpreadsheet, Layers, PieChart, Info, Database, Home } from 'lucide-react';

interface NavbarProps {
  activeTab: 'details' | 'changes' | 'overlap' | 'top5' | 'sheets';
  setActiveTab: (tab: 'details' | 'changes' | 'overlap' | 'top5' | 'sheets') => void;
  onRefreshAll: () => void;
  onSyncSheetsDatabase?: () => void;
  isRefreshing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onRefreshAll,
  onSyncSheetsDatabase,
  isRefreshing,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 text-slate-900 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="bg-slate-900 text-white font-black text-sm px-2.5 py-1.5 rounded-md shadow-sm">
              ETF
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900">台灣基金持股自動化分析儀</h1>
                <span className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                  官方持股明細同步
                </span>
              </div>
              <p className="text-xs text-slate-500">
                每日自動擷取基金與 ETF 投資明細（08:00 &amp; 18:00 自動執行）
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {onSyncSheetsDatabase && (
              <button
                onClick={onSyncSheetsDatabase}
                disabled={isRefreshing}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                title="比對與讀取 Google 試算表資料庫歷史期別"
              >
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                <span>比對試算表資料庫</span>
              </button>
            )}

            <button
              onClick={onRefreshAll}
              disabled={isRefreshing}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
              <span>{isRefreshing ? '擷取中...' : '每日更新 (08:00 & 18:00)'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 border-t border-slate-200 overflow-x-auto py-1 scrollbar-none">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'details'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            <span>投資明細</span>
          </button>

          <button
            onClick={() => setActiveTab('changes')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'changes'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>持股動態變動追蹤</span>
          </button>

          <button
            onClick={() => setActiveTab('overlap')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'overlap'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>跨基金重疊個股矩陣</span>
          </button>

          <button
            onClick={() => setActiveTab('top5')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'top5'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <PieChart className="w-3.5 h-3.5" />
            <span>前五大追蹤</span>
          </button>

          <button
            onClick={() => setActiveTab('sheets')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'sheets'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Google 試算表自動化與匯出</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
