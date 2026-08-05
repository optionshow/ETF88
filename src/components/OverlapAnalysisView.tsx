import React, { useState } from 'react';
import { FundData } from '../types';
import { calculateStockOverlap } from '../services/fundService';
import { ShieldAlert, BarChart3, ArrowUpDown } from 'lucide-react';
import { Top5TrackingView } from './Top5TrackingView';

interface OverlapAnalysisViewProps {
  funds: FundData[];
}

export const OverlapAnalysisView: React.FC<OverlapAnalysisViewProps> = ({ funds }) => {
  const overlapData = calculateStockOverlap(funds);
  const multiFundStocks = overlapData.filter((item) => item.fundCount >= 2);

  const [sortField, setSortField] = useState<'stockName' | 'price' | 'marketValue' | 'fundCount' | 'totalRatio'>('fundCount');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredData = [...overlapData]
    .sort((a, b) => {
      let valA: any;
      let valB: any;

      const mvA = a.price ? a.price * a.totalShares : a.funds.reduce((acc, f) => acc + (f.price ? f.price * f.shares : 0), 0);
      const mvB = b.price ? b.price * b.totalShares : b.funds.reduce((acc, f) => acc + (f.price ? f.price * f.shares : 0), 0);

      if (sortField === 'price') {
        valA = a.price || 0;
        valB = b.price || 0;
      } else if (sortField === 'marketValue') {
        valA = mvA;
        valB = mvB;
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

  const handleSort = (field: 'stockName' | 'price' | 'marketValue' | 'fundCount' | 'totalRatio') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-start space-x-4">
          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 flex-shrink-0 mt-0.5">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              跨基金重複持股矩陣分析 (Cross-Fund Holding Concentration)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              透過自動擷取的投資明細，即時比對您追蹤的 <span className="text-blue-600 font-bold">{funds.length} 檔基金</span>（如統一奔騰、統一黑馬、安聯台科）是否集中買進相同的權值股或熱門標的。若重複持股比例過高，定期定額投資時可能產生產業與個股權重過度集中的風險。
            </p>
          </div>
        </div>
      </div>

      {/* Overview Stats (High Density) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-blue-600 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">總追蹤個股檔數</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {overlapData.length} <span className="text-xs text-slate-500 font-normal">檔個股</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-amber-500 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">跨基金重複持有個股</span>
          <div className="text-2xl font-bold text-amber-600 mt-1">
            {multiFundStocks.length} <span className="text-xs text-slate-500 font-normal">檔高重疊標的</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 border-l-4 border-l-emerald-600 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">最高組合曝光標的</span>
          <div className="text-2xl font-bold text-emerald-600 mt-1 truncate">
            {overlapData[0]?.stockName || '無'}
          </div>
        </div>
      </div>

      {/* Overlap Matrix Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">跨基金重疊明細一覽表</h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[11px] border-b-2 border-slate-200">
              <tr>
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
                  className="py-3 px-4 font-semibold text-center cursor-pointer hover:text-blue-600"
                  onClick={() => handleSort('fundCount')}
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>持有基金數</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-blue-600"
                  onClick={() => handleSort('totalRatio')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>組合合計持股比例 (%)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold">各基金個別持股細項 (比例 / 股數)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    未找到匹配的重疊個股明細。
                  </td>
                </tr>
              ) : (
                filteredData.map((item, idx) => {
                  const totalMv = item.price ? item.price * item.totalShares : item.funds.reduce((acc, f) => acc + (f.price ? f.price * f.shares : 0), 0);

                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      {/* 1: 個股名稱 (無綠色股價標籤) */}
                      <td className="py-2.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {item.fundCount >= 2 && (
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          )}
                          <span>{item.stockName}</span>
                        </div>
                      </td>

                      {/* 2: 目前股價 (純數字，刪除 NT$) */}
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        {item.price ? item.price.toLocaleString() : '-'}
                      </td>

                      {/* 3: 持股市值 (萬元，整數無小數點) */}
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                        {totalMv > 0
                          ? `$${Math.round(totalMv / 10000).toLocaleString('zh-TW')} 萬`
                          : '-'}
                      </td>

                      {/* 4: 持有基金數 */}
                      <td className="py-2.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            item.fundCount >= 3
                              ? 'bg-red-100 text-red-800 border border-red-200'
                              : item.fundCount === 2
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {item.fundCount} 檔基金
                        </span>
                      </td>

                      {/* 5: 組合合計持股比例 */}
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-600 whitespace-nowrap text-sm">
                        {item.totalRatio.toFixed(2)}%
                      </td>

                      {/* 6: 各基金持股細項 */}
                      <td className="py-2.5 px-4">
                        <div className="flex flex-wrap gap-2">
                          {item.funds.map((f) => (
                            <div
                              key={f.fundId}
                              className="bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md text-[11px] flex items-center space-x-2 shadow-2xs"
                            >
                              <span className="font-semibold text-slate-700">{f.fundName}:</span>
                              <span className="font-mono text-blue-600 font-bold">{f.ratio}%</span>
                              <span className="font-mono text-slate-500 text-[10px]">
                                ({f.shares.toLocaleString()})
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 前五大追蹤 Section */}
      <Top5TrackingView funds={funds} />
    </div>
  );
};
