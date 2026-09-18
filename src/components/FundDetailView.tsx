import React, { useState } from 'react';
import { FundData, HoldingItem } from '../types';
import { ExternalLink, ArrowUpDown, Calendar, Database, Sparkles, RefreshCcw } from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

interface FundDetailViewProps {
  funds: FundData[];
  selectedFundId: string;
  setSelectedFundId: (id: string) => void;
  onRefreshSingle?: (fundCode: string) => void;
  onFetchStockPrices?: () => void;
  isRefreshing: boolean;
}

const COLORS = [
  '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6',
  '#EC4899', '#F43F5E', '#F59E0B', '#14B8A6', '#84CC16'
];

export const FundDetailView: React.FC<FundDetailViewProps> = ({
  funds,
  selectedFundId,
  setSelectedFundId,
  onRefreshSingle,
  onFetchStockPrices,
  isRefreshing,
}) => {
  const [sortField, setSortField] = useState<'ratio' | 'shares' | 'stockName' | 'price' | 'marketValue'>('ratio');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState(0);
  const [hasFetchedPrices, setHasFetchedPrices] = useState(false);

  const currentFund = funds.find((f) => f.id === selectedFundId) || funds[0];

  const activeSnapshot = currentFund?.snapshots[selectedSnapshotIndex] || currentFund?.snapshots[0];
  const activeDate = activeSnapshot?.date || currentFund?.asOfDate || '2026/08/04';

  const handleFetchStockPricesClick = async () => {
    if (onFetchStockPrices) {
      await onFetchStockPrices();
      setHasFetchedPrices(true);
    }
  };

  if (!currentFund) {
    return (
      <div className="p-8 text-center text-slate-400">
        目前無基金資料，請點擊右上方「新增基金網址」以加入基金投資明細。
      </div>
    );
  }

  const rawHoldings: HoldingItem[] = activeSnapshot?.holdings || [];
  const isDisplayingLatestStockPrices =
    hasFetchedPrices ||
    (rawHoldings.length > 0 &&
      rawHoldings.every((h) => typeof h.price === 'number' && h.price > 0));
  // Sort
  const filteredHoldings = [...rawHoldings]
    .sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortField === 'price') {
        valA = a.price || 0;
        valB = b.price || 0;
      } else if (sortField === 'marketValue') {
        valA = a.price ? a.price * a.shares : (a.marketValue || 0);
        valB = b.price ? b.price * b.shares : (b.marketValue || 0);
      } else if (sortField === 'stockName') {
        valA = a.stockName.toLowerCase();
        valB = b.stockName.toLowerCase();
      } else {
        valA = a[sortField];
        valB = b[sortField];
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const handleSort = (field: 'ratio' | 'shares' | 'stockName' | 'price' | 'marketValue') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Pie chart data
  const chartData = rawHoldings.slice(0, 10).map((item) => ({
    name: item.stockName,
    value: item.ratio,
  }));

  const totalConcentration = rawHoldings.reduce((acc, cur) => acc + cur.ratio, 0).toFixed(2);

  return (
    <div className="space-y-6">
      {/* Top Fund Selector Toolbar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">追蹤基金清單:</span>
            <div className="flex flex-wrap gap-2">
              {funds.map((fund) => (
                <button
                  key={fund.id}
                  onClick={() => {
                    setSelectedFundId(fund.id);
                    setSelectedSnapshotIndex(0);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    selectedFundId === fund.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  {fund.name} ({fund.code.replace('.TW', '')})
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {!isDisplayingLatestStockPrices && onFetchStockPrices && (
              <button
                onClick={handleFetchStockPricesClick}
                disabled={isRefreshing}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md shadow-sm transition-colors cursor-pointer"
              >
                <span>抓取最新股價</span>
              </button>
            )}

            <a
              href={currentFund.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
            >
              <span>官方原始網頁</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Fund Metadata & Summary Cards (High Density Stat Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-blue-600 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>持股明細日期</span>
            <Calendar className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {activeSnapshot?.date || currentFund.asOfDate}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center flex-wrap gap-1">
            <span>歷史期別:</span>
            <select
              value={selectedSnapshotIndex}
              onChange={(e) => setSelectedSnapshotIndex(Number(e.target.value))}
              className="bg-slate-50 text-slate-800 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-semibold"
            >
              {currentFund.snapshots.map((snap, idx) => (
                <option key={snap.date} value={idx}>
                  {snap.date} (共 {snap.holdings.length} 檔)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-emerald-600 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>揭露持股檔數</span>
            <Database className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-600">
            {rawHoldings.length} <span className="text-xs text-slate-500 font-normal">檔個股</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">前10大持股占比 {totalConcentration}%</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-blue-600 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>最新淨值 (NAV)</span>
            <Sparkles className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            NT$ {currentFund.currentNav.toFixed(2)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">淨值日期: {currentFund.navDate}</p>
        </div>
      </div>

      {/* Main Content Grid: Table + Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table Section (2 Columns) */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm flex flex-col">
          {/* Holdings Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-800">
              <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[11px] border-b-2 border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold">日期</th>
                  <th
                    className="py-3 px-4 font-semibold cursor-pointer hover:text-blue-600"
                    onClick={() => handleSort('stockName')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>個股名稱</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-blue-600"
                    onClick={() => handleSort('price')}
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>目前股價</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-blue-600"
                    onClick={() => handleSort('marketValue')}
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>持股市值 (萬)</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-blue-600"
                    onClick={() => handleSort('shares')}
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>投資股數</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-blue-600"
                    onClick={() => handleSort('ratio')}
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>持股比例 (%)</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredHoldings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      未找到匹配的持股個股明細。
                    </td>
                  </tr>
                ) : (
                  filteredHoldings.map((item, index) => {
                    const sharesNum = Number(item.shares) || 0;
                    const priceNum = Number(item.price) || 0;
                    let calculatedMv = 0;
                    if (priceNum > 0 && sharesNum > 0) {
                      calculatedMv = priceNum * sharesNum;
                    } else if (item.marketValue) {
                      calculatedMv = item.marketValue < 100000000 ? item.marketValue * 10000 : item.marketValue;
                    }

                    return (
                      <tr key={item.id || index} className="hover:bg-slate-50 transition-colors">
                        {/* 欄位 1: 日期 */}
                        <td className="py-2.5 px-4 font-medium text-slate-500 whitespace-nowrap">
                          {item.date || activeSnapshot.date}
                        </td>

                        {/* 欄位 2: 個股名稱 (無股價文字框) */}
                        <td className="py-2.5 px-4 font-semibold text-slate-900">
                          <div className="flex items-center space-x-2">
                            <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10px] font-mono text-slate-600 border border-slate-200 flex-shrink-0">
                              {index + 1}
                            </span>
                            <span className="font-bold text-slate-900">{item.stockName}</span>
                          </div>
                        </td>

                        {/* 欄位 3: 目前股價 (刪除 NT$ 文字) */}
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                          {item.price ? item.price.toLocaleString() : '-'}
                        </td>

                        {/* 欄位 4: 持股市值 (萬元，整數無小數點) */}
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                          {calculatedMv > 0
                            ? `$${Math.round(calculatedMv / 10000).toLocaleString('zh-TW')} 萬`
                            : '-'}
                        </td>

                        {/* 欄位 5: 投資股數 (無 股 字尾) */}
                        <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-700 whitespace-nowrap">
                          {item.sharesFormatted || item.shares.toLocaleString()}
                        </td>

                        {/* 欄位 6: 比例 */}
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-600 whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-2">
                            <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden hidden sm:block border border-slate-200">
                              <div
                                className="bg-blue-600 h-full rounded-full"
                                style={{ width: `${Math.min(item.ratio * 8, 100)}%` }}
                              />
                            </div>
                            <span>{item.ratio.toFixed(2)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between items-center">
            <span>* 依據投信官方公開揭露數據自動擷取與校對</span>
            <span>顯示 {filteredHoldings.length} / {rawHoldings.length} 筆資料</span>
          </div>
        </div>

        {/* Chart Side Panel & Manual Input Column */}
        <div className="space-y-6 flex flex-col">
          {/* Chart Side Panel */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">前10大持股比例分佈</h3>
              <p className="text-xs text-slate-500 mb-4">圖像化顯示各主要成分股在基金中的資金權重</p>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                      itemStyle={{ color: '#2563EB', fontSize: '12px', fontWeight: 'bold' }}
                      formatter={(val: number) => [`${val}%`, '持股比例']}
                    />
                  </RePieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-1.5 mt-3 pt-2 border-t border-slate-100">
                {chartData.map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between text-xs py-0.5 border-b border-slate-100">
                    <div className="flex items-center space-x-2 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      <span className="text-slate-700 font-medium truncate">{item.name}</span>
                    </div>
                    <span className="font-mono text-blue-600 font-bold">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
