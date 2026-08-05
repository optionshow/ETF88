import React, { useState } from 'react';
import { FundData, HoldingChange } from '../types';
import { calculateHoldingChanges } from '../services/fundService';
import {
  ArrowUpRight,
  ArrowDownRight,
  PlusCircle,
  MinusCircle,
  Layers,
  Calendar,
  Filter,
  ArrowUpDown,
  Globe
} from 'lucide-react';

interface HoldingChangesViewProps {
  funds: FundData[];
  selectedFundId: string;
  setSelectedFundId: (id: string) => void;
}

interface EnrichedChange extends HoldingChange {
  fundId: string;
  fundName: string;
  fundCode: string;
}

interface AggregatedChange {
  stockName: string;
  stockCode: string;
  price: number;
  latestShares: number;
  previousShares: number;
  diffShares: number;
  latestRatio: number;
  diffRatio: number;
  marketValue: number;
  fundCount: number;
  incCount: number;
  decCount: number;
  newCount: number;
  exitCount: number;
  overallStatus: 'new' | 'increase' | 'decrease' | 'exit' | 'unchanged';
  fundList: Array<{ name: string; code: string; status: string; diffShares: number }>;
}

export const HoldingChangesView: React.FC<HoldingChangesViewProps> = ({
  funds,
  selectedFundId,
  setSelectedFundId,
}) => {
  const isAll = selectedFundId === 'ALL';

  const [latestIndex, setLatestIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'increase' | 'decrease' | 'exit'>('all');
  const [sortField, setSortField] = useState<'stockName' | 'price' | 'marketValue' | 'latestShares' | 'diffShares' | 'latestRatio' | 'diffRatio'>('diffShares');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Gather unique available dates across funds or for active fund
  const allDates = Array.from(
    new Set(funds.flatMap((f) => (f.snapshots || []).map((s) => s.date || s.asOfDate)))
  ).sort((a, b) => new Date(b.replace(/\//g, '-')).getTime() - new Date(a.replace(/\//g, '-')).getTime());

  const currentFund = funds.find((f) => f.id === selectedFundId);
  const currentFundSnapshots = currentFund?.snapshots || [];

  const dateOptions = isAll
    ? allDates
    : currentFundSnapshots.map((s) => s.date || s.asOfDate);

  const targetLatestDate = dateOptions[latestIndex] || dateOptions[0] || '2026/08/04';
  const targetPrevDate = dateOptions[prevIndex] || dateOptions[Math.min(1, dateOptions.length - 1)] || '2026/08/03';

  // Compute changes for a single fund
  const computeChangesForFund = (fund: FundData): EnrichedChange[] => {
    const snaps = fund.snapshots || [];
    if (snaps.length === 0) return [];

    let lSnap = snaps.find((s) => (s.date || s.asOfDate) === targetLatestDate);
    if (!lSnap) lSnap = snaps[latestIndex] || snaps[0];

    let pSnap = snaps.find((s) => (s.date || s.asOfDate) === targetPrevDate);
    if (!pSnap) pSnap = snaps[prevIndex] || snaps[Math.min(1, snaps.length - 1)];

    if (!lSnap || !pSnap || lSnap === pSnap) {
      if (snaps.length >= 2) {
        lSnap = snaps[0];
        pSnap = snaps[1];
      } else {
        return [];
      }
    }

    const rawChanges = calculateHoldingChanges(
      lSnap.holdings || [],
      pSnap.holdings || [],
      lSnap.date || lSnap.asOfDate,
      pSnap.date || pSnap.asOfDate
    );

    return rawChanges.map((c) => ({
      ...c,
      fundId: fund.id,
      fundName: fund.name,
      fundCode: fund.code,
    }));
  };

  // Collect all raw changes across selected funds
  let rawAllChanges: EnrichedChange[] = [];
  if (isAll) {
    funds.forEach((f) => {
      const fChanges = computeChangesForFund(f);
      rawAllChanges.push(...fChanges);
    });
  } else if (currentFund) {
    rawAllChanges = computeChangesForFund(currentFund);
  }

  // Aggregate by stock for ALL mode or Single Fund mode
  const aggregateByStock = (items: EnrichedChange[]): AggregatedChange[] => {
    const map = new Map<string, AggregatedChange>();

    items.forEach((item) => {
      const key = item.stockName.trim();
      if (!map.has(key)) {
        map.set(key, {
          stockName: item.stockName,
          stockCode: item.stockCode || '',
          price: item.price || 0,
          latestShares: 0,
          previousShares: 0,
          diffShares: 0,
          latestRatio: 0,
          diffRatio: 0,
          marketValue: 0,
          fundCount: 0,
          incCount: 0,
          decCount: 0,
          newCount: 0,
          exitCount: 0,
          overallStatus: 'unchanged',
          fundList: [],
        });
      }

      const agg = map.get(key)!;
      if (!agg.stockCode && item.stockCode) agg.stockCode = item.stockCode;
      if (!agg.price && item.price) agg.price = item.price;

      agg.latestShares += item.latestShares;
      agg.previousShares += item.previousShares;
      agg.diffShares += item.diffShares;
      agg.latestRatio += item.latestRatio;
      agg.diffRatio += item.diffRatio;
      agg.marketValue += (item.price || 0) * item.latestShares;
      agg.fundCount += 1;

      if (item.status === 'increase') agg.incCount += 1;
      if (item.status === 'decrease') agg.decCount += 1;
      if (item.status === 'new') agg.newCount += 1;
      if (item.status === 'exit') agg.exitCount += 1;

      agg.fundList.push({
        name: item.fundName,
        code: item.fundCode,
        status: item.status,
        diffShares: item.diffShares,
      });
    });

    // Determine overall status for each aggregated stock
    map.forEach((agg) => {
      if (agg.previousShares === 0 && agg.latestShares > 0) {
        agg.overallStatus = 'new';
      } else if (agg.latestShares === 0 && agg.previousShares > 0) {
        agg.overallStatus = 'exit';
      } else if (agg.diffShares > 0) {
        agg.overallStatus = 'increase';
      } else if (agg.diffShares < 0) {
        agg.overallStatus = 'decrease';
      } else {
        agg.overallStatus = 'unchanged';
      }
    });

    return Array.from(map.values());
  };

  const aggregatedList = aggregateByStock(rawAllChanges);

  // Filter aggregated list by status only
  const filteredAggregated = aggregatedList
    .filter((item) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'new' && item.overallStatus !== 'new' && item.newCount === 0) return false;
        if (statusFilter === 'increase' && item.overallStatus !== 'increase' && item.incCount === 0) return false;
        if (statusFilter === 'decrease' && item.overallStatus !== 'decrease' && item.decCount === 0) return false;
        if (statusFilter === 'exit' && item.overallStatus !== 'exit' && item.exitCount === 0) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortField === 'stockName') {
        valA = a.stockName.toLowerCase();
        valB = b.stockName.toLowerCase();
      } else if (sortField === 'price') {
        valA = a.price;
        valB = b.price;
      } else if (sortField === 'marketValue') {
        valA = a.marketValue;
        valB = b.marketValue;
      } else if (sortField === 'latestShares') {
        valA = a.latestShares;
        valB = b.latestShares;
      } else if (sortField === 'diffShares') {
        valA = a.diffShares;
        valB = b.diffShares;
      } else if (sortField === 'latestRatio') {
        valA = a.latestRatio;
        valB = b.latestRatio;
      } else if (sortField === 'diffRatio') {
        valA = a.diffRatio;
        valB = b.diffRatio;
      } else {
        valA = a.diffShares;
        valB = b.diffShares;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const handleSort = (
    field: 'stockName' | 'price' | 'marketValue' | 'latestShares' | 'diffShares' | 'latestRatio' | 'diffRatio'
  ) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Summary Counts (aggregated stocks count or total actions)
  const countNew = aggregatedList.filter((c) => c.overallStatus === 'new' || c.newCount > 0).length;
  const countInc = aggregatedList.filter((c) => c.overallStatus === 'increase' || c.incCount > 0).length;
  const countDec = aggregatedList.filter((c) => c.overallStatus === 'decrease' || c.decCount > 0).length;
  const countExit = aggregatedList.filter((c) => c.overallStatus === 'exit' || c.exitCount > 0).length;

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
              <option value="ALL">🌐 全部基金 (個股累計整合比較)</option>
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name} ({fund.code.replace('.TW', '')})
                </option>
              ))}
            </select>
          </div>

          {/* Period Selector */}
          <div className="flex items-center space-x-3 text-xs text-slate-700">
            <div className="flex items-center space-x-1.5 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="font-semibold">本期:</span>
              <select
                value={latestIndex}
                onChange={(e) => setLatestIndex(Number(e.target.value))}
                className="bg-white text-blue-700 font-bold border border-slate-300 rounded px-2 py-0.5 cursor-pointer"
              >
                {dateOptions.map((dateStr, idx) => (
                  <option key={dateStr} value={idx}>
                    {dateStr}
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
                className="bg-white text-slate-700 font-medium border border-slate-300 rounded px-2 py-0.5 cursor-pointer"
              >
                {dateOptions.map((dateStr, idx) => (
                  <option key={dateStr} value={idx}>
                    {dateStr}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Quick Fund Choice Tags */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-500">快速選擇:</span>
          <button
            onClick={() => setSelectedFundId('ALL')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              selectedFundId === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>全部基金 (個股累計)</span>
          </button>
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

      {/* Dynamic Change Cards (Summary Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          onClick={() => setStatusFilter(statusFilter === 'new' ? 'all' : 'new')}
          className={`p-4 rounded-lg border border-slate-200 border-l-4 border-l-emerald-600 text-left transition-all shadow-sm cursor-pointer ${
            statusFilter === 'new'
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">{isAll ? '累計新進個股' : '新進持股'} (New)</span>
            <PlusCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">
            {countNew} <span className="text-xs font-normal text-slate-500">檔</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">本期新建立倉位個股</p>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'increase' ? 'all' : 'increase')}
          className={`p-4 rounded-lg border border-slate-200 border-l-4 border-l-blue-600 text-left transition-all shadow-sm cursor-pointer ${
            statusFilter === 'increase'
              ? 'bg-blue-50 border-blue-300'
              : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">{isAll ? '累計加碼個股' : '加碼個股'} (Increase)</span>
            <ArrowUpRight className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {countInc} <span className="text-xs font-normal text-slate-500">檔</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">跨基金整體淨增持個股</p>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'decrease' ? 'all' : 'decrease')}
          className={`p-4 rounded-lg border border-slate-200 border-l-4 border-l-amber-500 text-left transition-all shadow-sm cursor-pointer ${
            statusFilter === 'decrease'
              ? 'bg-amber-50 border-amber-300'
              : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">{isAll ? '累計減碼個股' : '減碼個股'} (Decrease)</span>
            <ArrowDownRight className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-600">
            {countDec} <span className="text-xs font-normal text-slate-500">檔</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">跨基金整體獲利調節個股</p>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'exit' ? 'all' : 'exit')}
          className={`p-4 rounded-lg border border-slate-200 border-l-4 border-l-red-600 text-left transition-all shadow-sm cursor-pointer ${
            statusFilter === 'exit'
              ? 'bg-red-50 border-red-300'
              : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">{isAll ? '累計出清個股' : '出清部位'} (Exit)</span>
            <MinusCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold text-red-600">
            {countExit} <span className="text-xs font-normal text-slate-500">檔</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">跨基金已完全清空個股</p>
        </button>
      </div>

      {/* CONSOLIDATED TABLE VIEW (One row per stock) */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              {isAll
                ? `全部基金持股異動累計對照表 (${targetLatestDate} vs ${targetPrevDate})`
                : `${currentFund?.name} 持股變動對照表 (${targetLatestDate} vs ${targetPrevDate})`}
            </h3>
          </div>
          <div className="flex items-center space-x-3 text-xs">
            <span className="text-slate-500 font-medium">
              共整合 <span className="font-bold text-blue-700">{filteredAggregated.length}</span> 檔個股
            </span>
            {statusFilter !== 'all' && (
              <button
                onClick={() => setStatusFilter('all')}
                className="text-blue-600 hover:underline font-bold cursor-pointer"
              >
                重設狀態過濾
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[11px] border-b-2 border-slate-200">
              <tr>
                <th className="py-3 px-4 font-semibold">動態狀況</th>
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
                    <span>{isAll ? '合計持股市值 (萬)' : '持股市值 (萬)'}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-blue-600"
                  onClick={() => handleSort('latestShares')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>{isAll ? '本期合計股數' : '本期股數'}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold text-right">
                  {isAll ? '前期合計股數' : '前期股數'}
                </th>
                <th
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-blue-600"
                  onClick={() => handleSort('diffShares')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>{isAll ? '合計股數增減' : '股數增減'}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-blue-600"
                  onClick={() => handleSort('latestRatio')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>{isAll ? '合計持股比例 (%)' : '本期比例 (%)'}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-blue-600"
                  onClick={() => handleSort('diffRatio')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>{isAll ? '合計比例增減 (%)' : '比例增減 (%)'}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAggregated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    此條件下無持股異動紀錄。
                  </td>
                </tr>
              ) : (
                filteredAggregated.map((item, idx) => {
                  const mvTenThousand = Math.round(item.marketValue / 10000);

                  // Build fund action summary tag for ALL mode
                  let fundActionText = '';
                  if (isAll) {
                    const parts: string[] = [];
                    if (item.incCount > 0) parts.push(`${item.incCount}檔加碼`);
                    if (item.newCount > 0) parts.push(`${item.newCount}檔新進`);
                    if (item.decCount > 0) parts.push(`${item.decCount}檔減碼`);
                    if (item.exitCount > 0) parts.push(`${item.exitCount}檔出清`);
                    if (parts.length > 0) {
                      fundActionText = `(${parts.join(', ')})`;
                    } else {
                      fundActionText = `(${item.fundCount}檔持平)`;
                    }
                  }

                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      {/* 異動狀況 */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {item.overallStatus === 'new' && (
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded text-[11px] font-bold">
                              + 新進持股
                            </span>
                            {isAll && fundActionText && (
                              <span className="text-[10px] text-emerald-700 font-semibold">{fundActionText}</span>
                            )}
                          </div>
                        )}
                        {item.overallStatus === 'increase' && (
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 rounded text-[11px] font-bold">
                              ▲ 整體加碼
                            </span>
                            {isAll && fundActionText && (
                              <span className="text-[10px] text-blue-700 font-semibold">{fundActionText}</span>
                            )}
                          </div>
                        )}
                        {item.overallStatus === 'decrease' && (
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded text-[11px] font-bold">
                              ▼ 整體減碼
                            </span>
                            {isAll && fundActionText && (
                              <span className="text-[10px] text-amber-700 font-semibold">{fundActionText}</span>
                            )}
                          </div>
                        )}
                        {item.overallStatus === 'exit' && (
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 rounded text-[11px] font-bold">
                              ✕ 整體出清
                            </span>
                            {isAll && fundActionText && (
                              <span className="text-[10px] text-red-700 font-semibold">{fundActionText}</span>
                            )}
                          </div>
                        )}
                        {item.overallStatus === 'unchanged' && (
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200">
                              持平
                            </span>
                            {isAll && fundActionText && (
                              <span className="text-[10px] text-slate-500 font-semibold">{fundActionText}</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 個股名稱 */}
                      <td className="py-2.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <span>{item.stockName}</span>
                          {item.stockCode && (
                            <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                              {item.stockCode}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 目前股價 */}
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        {item.price ? `$${item.price.toLocaleString()}` : '-'}
                      </td>

                      {/* 持股市值 (萬元，整數) */}
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                        {mvTenThousand > 0
                          ? `$${mvTenThousand.toLocaleString('zh-TW')} 萬`
                          : '-'}
                      </td>

                      {/* 本期股數 */}
                      <td className="py-2.5 px-4 text-right font-mono text-slate-800 font-semibold">
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
