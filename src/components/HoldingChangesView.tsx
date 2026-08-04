import React, { useState } from 'react';
import { FundData } from '../types';
import { calculateHoldingChanges } from '../services/fundService';
import { ArrowUpRight, ArrowDownRight, PlusCircle, MinusCircle, Layers, Calendar, Filter, ArrowUpDown } from 'lucide-react';

interface HoldingChangesViewProps {
  funds: FundData[];
  selectedFundId: string;
  setSelectedFundId: (id: string) => void;
}

export const HoldingChangesView: React.FC<HoldingChangesViewProps> = ({
  funds,
  selectedFundId,
  setSelectedFundId,
}) => {
  const currentFund = funds.find((f) => f.id === selectedFundId) || funds[0];
  const snapshots = currentFund?.snapshots || [];

  const [latestIndex, setLatestIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState(Math.min(1, snapshots.length - 1));
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'increase' | 'decrease' | 'exit'>('all');
  const [sortField, setSortField] = useState<'stockName' | 'price' | 'marketValue' | 'latestShares' | 'diffShares' | 'latestRatio' | 'diffRatio'>('diffShares');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  if (snapshots.length < 2) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-white mb-1">歷史期別不足</h3>
        <p className="text-xs text-slate-400">
          目前 {currentFund.name} 僅有 {snapshots.length} 期持股紀錄。請點擊「每日更新」擷取最新歷史持股明細，系統將自動比對兩期之間的股數與比例增減！
        </p>
      </div>
    );
  }

  const latestSnap = snapshots[latestIndex] || snapshots[0];
  const prevSnap = snapshots[prevIndex] || snapshots[1];

  const changes = calculateHoldingChanges(
    latestSnap.holdings,
    prevSnap.holdings,
    latestSnap.date,
    prevSnap.date
  );

  const filteredChanges = changes
    .filter((item) => {
      if (statusFilter === 'all') return true;
      return item.status === statusFilter;
    })
    .sort((a, b) => {
      let valA: any;
      let valB: any;

      const mvA = (a.price || 0) * a.latestShares;
      const mvB = (b.price || 0) * b.latestShares;

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

  const handleSort = (field: 'stockName' | 'price' | 'marketValue' | 'latestShares' | 'diffShares' | 'latestRatio' | 'diffRatio') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Summary counters
  const countNew = changes.filter((c) => c.status === 'new').length;
  const countInc = changes.filter((c) => c.status === 'increase').length;
  const countDec = changes.filter((c) => c.status === 'decrease').length;
  const countExit = changes.filter((c) => c.status === 'exit').length;

  return (
    <div className="space-y-6">
      {/* Top Fund and Period Selector Bar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <span className="text-xs font-bold text-slate-800 whitespace-nowrap flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded border border-blue-200">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>切換追蹤基金:</span>
            </span>
            <select
              value={selectedFundId}
              onChange={(e) => setSelectedFundId(e.target.value)}
              className="bg-white text-blue-900 font-extrabold text-xs border border-blue-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer shadow-sm"
            >
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name} ({fund.code.replace('.TW', '')})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-3 text-xs text-slate-700">
            <div className="flex items-center space-x-1.5 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="font-semibold">本期:</span>
              <select
                value={latestIndex}
                onChange={(e) => setLatestIndex(Number(e.target.value))}
                className="bg-white text-blue-700 font-bold border border-slate-300 rounded px-2 py-0.5"
              >
                {snapshots.map((snap, idx) => (
                  <option key={snap.date} value={idx}>
                    {snap.date}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-slate-400 font-bold">VS</span>

            <div className="flex items-center space-x-1.5 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="font-semibold">前期:</span>
              <select
                value={prevIndex}
                onChange={(e) => setPrevIndex(Number(e.target.value))}
                className="bg-white text-slate-700 font-medium border border-slate-300 rounded px-2 py-0.5"
              >
                {snapshots.map((snap, idx) => (
                  <option key={snap.date} value={idx}>
                    {snap.date}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Quick Fund Choice Tags */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-500">快速選擇基金:</span>
          {funds.map((fund) => (
            <button
              key={fund.id}
              onClick={() => setSelectedFundId(fund.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                selectedFundId === fund.id
                  ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              }`}
            >
              {fund.name} ({fund.code.replace('.TW', '')})
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic Change Cards (High Density Theme) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          onClick={() => setStatusFilter(statusFilter === 'new' ? 'all' : 'new')}
          className={`p-4 rounded-lg border border-slate-200 border-l-4 border-l-emerald-600 text-left transition-all shadow-sm ${
            statusFilter === 'new'
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">新進持股 (New)</span>
            <PlusCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">{countNew} <span className="text-xs font-normal text-slate-500">檔</span></div>
          <p className="text-[11px] text-slate-500 mt-1">本期新建立倉位個股</p>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'increase' ? 'all' : 'increase')}
          className={`p-4 rounded-lg border border-slate-200 border-l-4 border-l-blue-600 text-left transition-all shadow-sm ${
            statusFilter === 'increase'
              ? 'bg-blue-50 border-blue-300'
              : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">加碼個股 (Increase)</span>
            <ArrowUpRight className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-600">{countInc} <span className="text-xs font-normal text-slate-500">檔</span></div>
          <p className="text-[11px] text-slate-500 mt-1">經理人主動加碼個股</p>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'decrease' ? 'all' : 'decrease')}
          className={`p-4 rounded-lg border border-slate-200 border-l-4 border-l-amber-500 text-left transition-all shadow-sm ${
            statusFilter === 'decrease'
              ? 'bg-amber-50 border-amber-300'
              : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">減碼個股 (Decrease)</span>
            <ArrowDownRight className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-600">{countDec} <span className="text-xs font-normal text-slate-500">檔</span></div>
          <p className="text-[11px] text-slate-500 mt-1">經理人獲利調節或減碼</p>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'exit' ? 'all' : 'exit')}
          className={`p-4 rounded-lg border border-slate-200 border-l-4 border-l-red-600 text-left transition-all shadow-sm ${
            statusFilter === 'exit'
              ? 'bg-red-50 border-red-300'
              : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">出清部位 (Exit)</span>
            <MinusCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold text-red-600">{countExit} <span className="text-xs font-normal text-slate-500">檔</span></div>
          <p className="text-[11px] text-slate-500 mt-1">前期持股已完全出清</p>
        </button>
      </div>

      {/* Changes Comparison Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              {currentFund.name} 持股變動分析對照表 ({latestSnap.date} vs {prevSnap.date})
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            顯示 {filteredChanges.length} 筆異動個股
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[11px] border-b-2 border-slate-200">
              <tr>
                <th className="py-3 px-4 font-semibold">異動狀態</th>
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
                  onClick={() => handleSort('latestShares')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>本期股數</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold text-right">前期股數</th>
                <th
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-blue-600"
                  onClick={() => handleSort('diffShares')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>股數增減</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-blue-600"
                  onClick={() => handleSort('latestRatio')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>本期比例 (%)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-blue-600"
                  onClick={() => handleSort('diffRatio')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>比例增減 (%)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredChanges.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    此篩選條件下無持股異動紀錄。
                  </td>
                </tr>
              ) : (
                filteredChanges.map((item, idx) => {
                  const mv = (item.price || 0) * item.latestShares;

                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      {/* 異動狀態 */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {item.status === 'new' && (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded text-[11px] font-bold">
                            + 新進持股
                          </span>
                        )}
                        {item.status === 'increase' && (
                          <span className="bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 rounded text-[11px] font-bold">
                            ▲ 加碼
                          </span>
                        )}
                        {item.status === 'decrease' && (
                          <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded text-[11px] font-bold">
                            ▼ 減碼
                          </span>
                        )}
                        {item.status === 'exit' && (
                          <span className="bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 rounded text-[11px] font-bold">
                            ✕ 出清部位
                          </span>
                        )}
                        {item.status === 'unchanged' && (
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200">
                            持平
                          </span>
                        )}
                      </td>

                      {/* 個股名稱 (無股價文字框) */}
                      <td className="py-2.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <span>{item.stockName}</span>
                      </td>

                      {/* 目前股價 */}
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        {item.price ? item.price.toLocaleString() : '-'}
                      </td>

                      {/* 持股市值 (萬元，整數無小數點) */}
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                        {mv > 0
                          ? `$${Math.round(mv / 10000).toLocaleString('zh-TW')} 萬`
                          : '-'}
                      </td>

                      {/* 本期股數 */}
                      <td className="py-2.5 px-4 text-right font-mono text-slate-800">
                        {item.latestShares.toLocaleString()}
                      </td>

                      {/* 前期股數 */}
                      <td className="py-2.5 px-4 text-right font-mono text-slate-500">
                        {item.previousShares.toLocaleString()}
                      </td>

                      {/* 股數增減 */}
                      <td className="py-2.5 px-4 text-right font-mono font-bold whitespace-nowrap">
                        {item.diffShares > 0 ? (
                          <span className="text-emerald-600">+{item.diffShares.toLocaleString()}</span>
                        ) : item.diffShares < 0 ? (
                          <span className="text-red-600">{item.diffShares.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      {/* 本期比例 */}
                      <td className="py-2.5 px-4 text-right font-mono text-slate-900 font-semibold">
                        {item.latestRatio.toFixed(2)}%
                      </td>

                      {/* 比例增減 */}
                      <td className="py-2.5 px-4 text-right font-mono font-bold whitespace-nowrap">
                        {item.diffRatio > 0 ? (
                          <span className="text-emerald-600">+{item.diffRatio.toFixed(2)}%</span>
                        ) : item.diffRatio < 0 ? (
                          <span className="text-red-600">{item.diffRatio.toFixed(2)}%</span>
                        ) : (
                          <span className="text-slate-400">0.00%</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
