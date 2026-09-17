import React, { useState, useMemo } from 'react';
import { FundData } from '../types';
import { calculateStockOverlap, normalizeDateString } from '../services/fundService';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { PieChart, Activity } from 'lucide-react';

interface Top5TrackingViewProps {
  funds: FundData[];
}

const STOCK_COLORS = [
  '#2563EB', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
];

// Helper format function for market value (萬元 or 億元)
function formatMarketValue(mvInWan: number): string {
  if (Math.abs(mvInWan) >= 10000) {
    return `${(mvInWan / 10000).toFixed(2)}億`;
  }
  return `${Math.round(mvInWan).toLocaleString()}萬`;
}

// Helper component for rendering trend triangle arrows (Taiwan convention: Up = Red, Down = Green)
const TrendArrow: React.FC<{
  diff: number;
  type?: 'ratio' | 'mv';
  showVal?: boolean;
}> = ({ diff, type = 'ratio', showVal = true }) => {
  if (diff === 0) return null;

  const isUp = diff > 0;
  const colorClass = isUp ? 'text-red-600' : 'text-emerald-600';
  const arrowSymbol = isUp ? '▲' : '▼';
  const signStr = isUp ? '+' : '';

  let valStr = '';
  if (showVal) {
    if (type === 'ratio') {
      valStr = `${signStr}${diff.toFixed(2)}%`;
    } else {
      if (Math.abs(diff) >= 10000) {
        valStr = `${signStr}${(diff / 10000).toFixed(2)}億`;
      } else {
        valStr = `${signStr}${Math.round(diff).toLocaleString()}萬`;
      }
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-bold text-[11px] ${colorClass} shrink-0`}
      title={`較前一日${isUp ? '增加' : '減少'} ${valStr}`}
    >
      <span>{arrowSymbol}</span>
      {showVal && <span>{valStr}</span>}
    </span>
  );
};

// Helper to retrieve the active snapshot for a fund on or most recently before targetDate
function getFundSnapshotForDate(fund: FundData, targetDate: string) {
  const snaps = fund.snapshots || [];
  if (snaps.length === 0) return null;

  const targetNorm = normalizeDateString(targetDate);

  // 1. Exact match by date
  const exact = snaps.find(
    (s) => normalizeDateString(s.date || s.asOfDate) === targetNorm
  );
  if (exact) return exact;

  // 2. Sort snapshots descending
  const sorted = [...snaps].sort((a, b) => {
    const da = new Date((a.date || a.asOfDate || '').replace(/\//g, '-')).getTime() || 0;
    const db = new Date((b.date || b.asOfDate || '').replace(/\//g, '-')).getTime() || 0;
    return db - da;
  });

  // 3. Find latest snapshot on or before targetDate
  const targetTime = new Date(targetNorm.replace(/\//g, '-')).getTime();
  const prior = sorted.find((s) => {
    const sTime = new Date((s.date || s.asOfDate || '').replace(/\//g, '-')).getTime() || 0;
    return sTime <= targetTime;
  });
  if (prior) return prior;

  // 4. Fallback to earliest snapshot or latest
  return sorted[sorted.length - 1] || sorted[0];
}

export const Top5TrackingView: React.FC<Top5TrackingViewProps> = ({ funds }) => {
  const [selectedScope, setSelectedScope] = useState<string>('all');
  const [highlightCode, setHighlightCode] = useState<string | null>(null);

  const validFunds = useMemo(() => {
    return Array.isArray(funds)
      ? funds.filter((f) => Boolean(f && typeof f === 'object' && (f.id || f.code || f.name)))
      : [];
  }, [funds]);

  // Determine Top 5 individual stocks according to selected scope (All funds combined vs Single fund)
  const top5Stocks = useMemo(() => {
    if (selectedScope === 'all') {
      const overlapData = calculateStockOverlap(validFunds);
      return overlapData.slice(0, 5);
    }

    const targetFund = validFunds.find((f) => String(f.id) === String(selectedScope) || String(f.code) === String(selectedScope));
    if (!targetFund) {
      const overlapData = calculateStockOverlap(validFunds);
      return overlapData.slice(0, 5);
    }

    const sortedSnaps = [...(targetFund.snapshots || [])].sort((a, b) => {
      const da = new Date((a.date || a.asOfDate || '').replace(/\//g, '-')).getTime() || 0;
      const db = new Date((b.date || b.asOfDate || '').replace(/\//g, '-')).getTime() || 0;
      return db - da;
    });

    const latestSnap = sortedSnaps[0];
    if (!latestSnap || !Array.isArray(latestSnap.holdings)) return [];

    // Filter to ensure only individual stocks (排除 ETF 代號如 00 開頭、債券、期貨等非上市櫃個股資產)
    const stockHoldings = latestSnap.holdings.filter((h) => {
      const code = (h.stockCode || '').replace(/[^0-9A-Za-z]/g, '').trim();
      const rawName = (h.stockName || '').replace(/\*/g, '').trim();
      if (code.startsWith('00') || /ETF|債|期貨|權證|受益憑證|受益證券|現金|存款/i.test(rawName)) {
        return false;
      }
      return true;
    });

    // Sort by ratio descending
    stockHoldings.sort((a, b) => (b.ratio || 0) - (a.ratio || 0));

    return stockHoldings.slice(0, 5).map((h) => {
      const code = (h.stockCode || '').replace(/[^0-9A-Za-z]/g, '').trim();
      const rawName = (h.stockName || '').replace(/\*/g, '').trim();
      const pureChineseName = rawName
        .replace(/\(\s*\d+\s*\)/g, '')
        .replace(/\d{4,6}/g, '')
        .trim();
      const standardDisplayName = code ? `${pureChineseName} (${code})` : pureChineseName;

      return {
        stockName: standardDisplayName,
        stockCode: code,
        price: h.price,
        funds: [
          {
            fundId: targetFund.id,
            fundCode: targetFund.code,
            fundName: targetFund.name,
            shares: h.shares || 0,
            ratio: h.ratio || 0,
            price: h.price,
          },
        ],
        totalRatio: h.ratio || 0,
        totalShares: h.shares || 0,
        fundCount: 1,
      };
    });
  }, [validFunds, selectedScope]);

  const currentScopeName = useMemo(() => {
    if (selectedScope === 'all') return '全基金跨檔合計';
    const fund = validFunds.find((f) => String(f.id) === String(selectedScope) || String(f.code) === String(selectedScope));
    return fund ? `${fund.name} (${String(fund.code || '').replace('.TW', '')})` : '選取基金';
  }, [selectedScope, validFunds]);

  // Extract ONLY real historical snapshot dates from funds / Google Sheets data
  const realDates = useMemo(() => {
    const datesSet = new Set<string>();
    const fundsToScan = selectedScope === 'all'
      ? validFunds
      : validFunds.filter((f) => String(f.id) === String(selectedScope) || String(f.code) === String(selectedScope));

    fundsToScan.forEach((fund) => {
      (fund.snapshots || []).forEach((snap) => {
        const dKey = normalizeDateString(snap.date || snap.asOfDate);
        if (dKey) datesSet.add(dKey);
      });
    });

    const sortedDates = Array.from(datesSet).sort(
      (a, b) => new Date(a.replace(/\//g, '-')).getTime() - new Date(b.replace(/\//g, '-')).getTime()
    );
    // 系統最多容納最新 30 天
    return sortedDates.slice(-30);
  }, [validFunds, selectedScope]);

  // Build trend data points for each real date across the top 5 stocks
  const chartData = useMemo(() => {
    const fundsToScan = selectedScope === 'all'
      ? validFunds
      : validFunds.filter((f) => String(f.id) === String(selectedScope) || String(f.code) === String(selectedScope));

    return realDates.map((dKey) => {
      const dataPoint: Record<string, any> = {
        fullDate: dKey,
        date: dKey.length >= 10 ? dKey.slice(5) : dKey, // e.g. '08/05'
      };

      top5Stocks.forEach((stock, idx) => {
        const key = stock.stockCode || `stock_${idx}`;
        const stockCodeNorm = (stock.stockCode || '').replace(/[^0-9A-Za-z]/g, '').trim();
        const stockNameClean = stock.stockName
          .replace(/\*/g, '')
          .replace(/\(\s*\d+\s*\)/g, '')
          .replace(/\d{4,6}/g, '')
          .trim();

        let totalRatio = 0;
        let totalMv = 0;

        fundsToScan.forEach((fund) => {
          // Use the snapshot on or most recently before dKey to avoid missing funds on staggered date updates
          const snap = getFundSnapshotForDate(fund, dKey);
          if (!snap) return;

          const matchHoldings = (snap.holdings || []).filter((h: any) => {
            const hCode = (h.stockCode || (h.stockName && h.stockName.match(/(\d{4,6})/)?.[1]) || '')
              .replace(/[^0-9A-Za-z]/g, '')
              .trim();
            if (stockCodeNorm && hCode && stockCodeNorm.toUpperCase() === hCode.toUpperCase()) return true;
            const hNameClean = (h.stockName || '')
              .replace(/\*/g, '')
              .replace(/\(\s*\d+\s*\)/g, '')
              .replace(/\d{4,6}/g, '')
              .trim();
            return !!(
              hNameClean &&
              stockNameClean &&
              (hNameClean === stockNameClean ||
                hNameClean.includes(stockNameClean) ||
                stockNameClean.includes(hNameClean))
            );
          });

          matchHoldings.forEach((holding: any) => {
            totalRatio += holding.ratio || 0;
            const price = holding.price || stock.price || 0;
            const mv = price > 0 ? (price * (holding.shares || 0)) / 10000 : 0;
            totalMv += mv;
          });
        });

        dataPoint[`ratio_${key}`] = +totalRatio.toFixed(2);
        dataPoint[`mv_${key}`] = Math.round(totalMv);
      });

      return dataPoint;
    });
  }, [realDates, top5Stocks, validFunds, selectedScope]);

  // Compute trend differences for top 5 stocks between latest date and previous date
  const stockTrends = useMemo(() => {
    const trends: Record<string, { ratioDiff: number; mvDiff: number }> = {};

    if (chartData.length >= 2) {
      const latest = chartData[chartData.length - 1];
      const prev = chartData[chartData.length - 2];

      top5Stocks.forEach((stock, idx) => {
        const key = stock.stockCode || `stock_${idx}`;
        const latestRatio = latest[`ratio_${key}`] ?? 0;
        const prevRatio = prev[`ratio_${key}`] ?? 0;
        const latestMv = latest[`mv_${key}`] ?? 0;
        const prevMv = prev[`mv_${key}`] ?? 0;

        trends[key] = {
          ratioDiff: +(latestRatio - prevRatio).toFixed(2),
          mvDiff: Math.round(latestMv - prevMv),
        };
      });
    } else {
      top5Stocks.forEach((stock, idx) => {
        const key = stock.stockCode || `stock_${idx}`;
        trends[key] = { ratioDiff: 0, mvDiff: 0 };
      });
    }

    return trends;
  }, [chartData, top5Stocks]);

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
              <PieChart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-base font-bold text-slate-900">
                  {selectedScope === 'all'
                    ? '持股前五大個股追蹤'
                    : `【${currentScopeName}】前五大持股個股追蹤`}
                </h3>
                <span className="bg-emerald-100 text-emerald-800 text-[11px] px-2.5 py-0.5 rounded-full font-bold">
                  ✓ 標的為成分個股 (非 ETF)
                </span>
                <span className="bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5 rounded font-mono font-bold hidden sm:inline">
                  整合雙縱軸走勢圖
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {selectedScope === 'all'
                  ? '追蹤全基金/ETF持股中合計佔比最高的前 5 大台股成分「個股」（如台積電、聯發科等上市櫃公司），非追蹤 ETF 本身。'
                  : `追蹤【${currentScopeName}】投資組合中持股權重最高的前 5 大台股成分個股之歷史比例與市值變化。`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Scope Selector: All Funds vs Individual Fund */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700">
            <span>追蹤範圍（個股）：</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelectedScope('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                selectedScope === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              ⭐ 全基金跨檔合計前五大個股
            </button>
            {validFunds.map((fund) => {
              const cleanCode = String(fund.code || '').replace('.TW', '');
              const isSelected = selectedScope === fund.id || selectedScope === fund.code;
              return (
                <button
                  key={fund.id}
                  onClick={() => setSelectedScope(fund.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {fund.name} ({cleanCode})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top 5 Stock Badges & Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {top5Stocks.map((stock, idx) => {
          const color = STOCK_COLORS[idx % STOCK_COLORS.length];
          const isHighlighted = highlightCode === stock.stockCode;
          const totalMv = stock.price
            ? (stock.price * stock.totalShares) / 10000
            : stock.funds.reduce((acc, f) => acc + (f.price ? (f.price * f.shares) / 10000 : 0), 0);
          const key = stock.stockCode || `stock_${idx}`;
          const trend = stockTrends[key] || { ratioDiff: 0, mvDiff: 0 };

          return (
            <div
              key={stock.stockCode || idx}
              onMouseEnter={() => setHighlightCode(stock.stockCode)}
              onMouseLeave={() => setHighlightCode(null)}
              className={`p-3.5 rounded-lg border text-left transition-all relative overflow-hidden bg-white shadow-2xs border-slate-200 hover:border-slate-300 cursor-pointer ${
                isHighlighted ? 'ring-2 ring-offset-1 shadow-md' : ''
              }`}
              style={{
                borderTop: `4px solid ${color}`,
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="text-[10px] font-extrabold px-1.5 py-0.5 rounded text-white"
                  style={{ backgroundColor: color }}
                >
                  TOP {idx + 1}
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {selectedScope === 'all'
                    ? `${stock.fundCount} 檔重疊`
                    : stock.totalShares > 0
                    ? `${stock.totalShares.toLocaleString()} 股`
                    : '上市櫃個股'}
                </span>
              </div>

              <div className="font-bold text-sm text-slate-900 truncate" title={stock.stockName}>
                {stock.stockName}
              </div>

              <div className="mt-2.5 space-y-1.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">持股比例</span>
                  <div className="flex items-center gap-1 font-mono">
                    <span className="font-black text-xs text-slate-900">
                      {stock.totalRatio.toFixed(2)}%
                    </span>
                    <TrendArrow diff={trend.ratioDiff} type="ratio" showVal={true} />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">持股市值</span>
                  <div className="flex items-center gap-1 font-mono">
                    <span className="font-bold text-xs text-slate-700">
                      ${formatMarketValue(totalMv)}
                    </span>
                    <TrendArrow diff={trend.mvDiff} type="mv" showVal={true} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Integrated Single Dual-Axis Trend Chart Container */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-3">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <h4 className="text-sm font-bold text-slate-900">
              {selectedScope === 'all'
                ? '跨基金合計持股前五大個股走勢圖'
                : `【${currentScopeName}】前五大持股個股走勢圖`}
            </h4>
          </div>

          <div className="flex items-center space-x-4 text-xs font-semibold">
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-blue-600 inline-block"></span>
              <span className="text-slate-700">左縱軸: 持股比例 (%) [折線]</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500/50 inline-block"></span>
              <span className="text-slate-700">右縱軸: 持股市值 (萬) [面積]</span>
            </div>
          </div>
        </div>

        {/* Legend Indicator for Top 5 Stocks */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold pt-1">
          {top5Stocks.map((stock, idx) => {
            const color = STOCK_COLORS[idx % STOCK_COLORS.length];
            const isDimmed = highlightCode && highlightCode !== stock.stockCode;
            return (
              <div
                key={stock.stockCode || idx}
                onMouseEnter={() => setHighlightCode(stock.stockCode)}
                onMouseLeave={() => setHighlightCode(null)}
                className={`flex items-center space-x-1.5 cursor-pointer transition-opacity ${
                  isDimmed ? 'opacity-30' : 'opacity-100'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full inline-block shadow-2xs"
                  style={{ backgroundColor: color }}
                ></span>
                <span className="text-slate-800 font-bold">
                  {stock.stockName}
                </span>
              </div>
            );
          })}
        </div>

        {/* Recharts ComposedChart Canvas with Top 5 Stocks together */}
        <div className="w-full h-96 pt-2">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 15, right: 25, bottom: 20, left: 10 }}
              >
                <defs>
                  {/* Generate linear gradient for each top 5 stock (Solid top opacity ~0.65, transparent bottom ~0.03) */}
                  {top5Stocks.map((stock, idx) => {
                    const key = stock.stockCode || `stock_${idx}`;
                    const color = STOCK_COLORS[idx % STOCK_COLORS.length];
                    return (
                      <linearGradient
                        id={`grad_${key}`}
                        key={key}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={color} stopOpacity={0.6} />
                        <stop offset="95%" stopColor={color} stopOpacity={0.03} />
                      </linearGradient>
                    );
                  })}
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />

                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  dy={8}
                />

                {/* Left YAxis for Holding Ratio (%) */}
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  stroke="#2563EB"
                  tick={{ fontSize: 11, fill: '#2563EB', fontWeight: 700 }}
                  tickLine={false}
                  axisLine={{ stroke: '#BFDBFE' }}
                  unit="%"
                  domain={['auto', 'auto']}
                />

                {/* Right YAxis for Market Value (萬元) */}
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#059669"
                  tick={{ fontSize: 11, fill: '#059669', fontWeight: 700 }}
                  tickLine={false}
                  axisLine={{ stroke: '#A7F3D0' }}
                  unit="萬"
                  domain={['auto', 'auto']}
                />

                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const cIndex = chartData.findIndex((item) => item.fullDate === data.fullDate);
                      const prevData = cIndex > 0 ? chartData[cIndex - 1] : null;

                      return (
                        <div className="bg-slate-900 text-white p-3.5 rounded-lg shadow-xl text-xs space-y-2.5 border border-slate-700 font-sans min-w-[280px]">
                          <div className="font-bold border-b border-slate-700 pb-1.5 text-slate-200 flex items-center justify-between">
                            <span>日期: {data.fullDate}</span>
                            <span className="text-[11px] text-blue-400 font-mono">
                              前五大個股明細
                            </span>
                          </div>

                          <div className="space-y-2">
                            {top5Stocks.map((stock, idx) => {
                              const key = stock.stockCode || `stock_${idx}`;
                              const color = STOCK_COLORS[idx % STOCK_COLORS.length];
                              const ratio = data[`ratio_${key}`] ?? 0;
                              const mv = data[`mv_${key}`] ?? 0;

                              const prevRatio = prevData ? (prevData[`ratio_${key}`] ?? 0) : undefined;
                              const prevMv = prevData ? (prevData[`mv_${key}`] ?? 0) : undefined;

                              const ratioDiff = prevRatio !== undefined ? +(ratio - prevRatio).toFixed(2) : 0;
                              const mvDiff = prevMv !== undefined ? Math.round(mv - prevMv) : 0;

                              return (
                                <div
                                  key={key}
                                  className="border-b border-slate-800/80 pb-1.5 last:border-0 last:pb-0"
                                >
                                  <div className="flex items-center space-x-1.5 mb-0.5">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full inline-block"
                                      style={{ backgroundColor: color }}
                                    ></span>
                                    <span className="text-slate-200 font-bold">
                                      {stock.stockName}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between text-[11px] text-slate-300 pl-4 font-mono">
                                    <span className="inline-flex items-center gap-1">
                                      持股比: <strong className="text-blue-300">{ratio.toFixed(2)}%</strong>
                                      {prevData && <TrendArrow diff={ratioDiff} type="ratio" showVal={true} />}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                      市值: <strong className="text-emerald-300">${formatMarketValue(mv)}</strong>
                                      {prevData && <TrendArrow diff={mvDiff} type="mv" showVal={true} />}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* Market Value Areas on Right YAxis (Gradient Fill, Solid Top, Transparent Bottom) */}
                {top5Stocks.map((stock, idx) => {
                  const key = stock.stockCode || `stock_${idx}`;
                  const color = STOCK_COLORS[idx % STOCK_COLORS.length];
                  const isHighlighted = highlightCode === stock.stockCode;
                  const isDimmed = highlightCode && !isHighlighted;

                  return (
                    <Area
                      key={`mv_${key}`}
                      yAxisId="right"
                      type="monotone"
                      dataKey={`mv_${key}`}
                      name={`${stock.stockName} 市值`}
                      fill={`url(#grad_${key})`}
                      stroke={color}
                      strokeWidth={1}
                      fillOpacity={isDimmed ? 0.1 : 1}
                      strokeOpacity={isDimmed ? 0.1 : 0.5}
                    />
                  );
                })}

                {/* Holding Ratio Lines on Left YAxis */}
                {top5Stocks.map((stock, idx) => {
                  const key = stock.stockCode || `stock_${idx}`;
                  const color = STOCK_COLORS[idx % STOCK_COLORS.length];
                  const isHighlighted = highlightCode === stock.stockCode;
                  const isDimmed = highlightCode && !isHighlighted;

                  return (
                    <Line
                      key={`ratio_${key}`}
                      yAxisId="left"
                      type="monotone"
                      dataKey={`ratio_${key}`}
                      name={`${stock.stockName} 持股比`}
                      stroke={color}
                      strokeWidth={isHighlighted ? 4 : 2.5}
                      strokeOpacity={isDimmed ? 0.2 : 1}
                      dot={{
                        r: isHighlighted ? 6 : 3.5,
                        fill: color,
                        strokeWidth: 2,
                        stroke: '#FFFFFF',
                      }}
                      activeDot={{
                        r: 7,
                        fill: color,
                        stroke: '#FFFFFF',
                        strokeWidth: 2,
                      }}
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm font-semibold">
              尚無調閱歷史資料
            </div>
          )}
        </div>

        <div className="text-right text-[11px] text-slate-400 italic">
          * 數據由 Google 試算表及歷史期別快照調閱計算，標的為基金持股中之成分上市櫃個股，僅列出真實有記載之歷史交易日紀錄。
        </div>
      </div>
    </div>
  );
};
