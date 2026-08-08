import React, { useState, useMemo } from 'react';
import { FundData } from '../types';
import { calculateStockOverlap } from '../services/fundService';
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

export const Top5TrackingView: React.FC<Top5TrackingViewProps> = ({ funds }) => {
  const overlapData = calculateStockOverlap(funds);
  const top5Stocks = overlapData.slice(0, 5);

  const [highlightCode, setHighlightCode] = useState<string | null>(null);

  // Extract ONLY real historical snapshot dates from funds / Google Sheets data
  const realDates = useMemo(() => {
    const datesSet = new Set<string>();
    funds.forEach((fund) => {
      (fund.snapshots || []).forEach((snap) => {
        const dKey = (snap.date || snap.asOfDate || '').replace(/-/g, '/');
        if (dKey) datesSet.add(dKey);
      });
    });

    return Array.from(datesSet).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );
  }, [funds]);

  // Build trend data points for each real date across the top 5 stocks
  const chartData = useMemo(() => {
    return realDates.map((dKey) => {
      const dataPoint: Record<string, any> = {
        fullDate: dKey,
        date: dKey.length >= 10 ? dKey.slice(5) : dKey, // e.g. '08/05'
      };

      top5Stocks.forEach((stock, idx) => {
        const key = stock.stockCode || `stock_${idx}`;
        const stockNameClean = stock.stockName.replace(/\(\d+\)/, '').trim();

        let totalRatio = 0;
        let totalMv = 0;

        funds.forEach((fund) => {
          const snap = (fund.snapshots || []).find(
            (s) => (s.date || s.asOfDate || '').replace(/-/g, '/') === dKey
          );
          if (!snap) return;

          const holding = (snap.holdings || []).find((h: any) => {
            if (stock.stockCode && h.stockCode === stock.stockCode) return true;
            return h.stockName && h.stockName.includes(stockNameClean);
          });

          if (holding) {
            totalRatio += holding.ratio || 0;
            const price = holding.price || stock.price || 0;
            const mv = price > 0 ? (price * holding.shares) / 10000 : 0;
            totalMv += mv;
          }
        });

        dataPoint[`ratio_${key}`] = +totalRatio.toFixed(2);
        dataPoint[`mv_${key}`] = Math.round(totalMv);
      });

      return dataPoint;
    });
  }, [realDates, top5Stocks, funds]);

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 flex-shrink-0 mt-0.5">
              <PieChart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
                <span>跨基金重疊個股 — 前五大追蹤</span>
                <span className="bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5 rounded font-mono font-bold hidden sm:inline">
                  整合雙縱軸走勢圖
                </span>
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed hidden sm:block">
                自動整合跨基金持股集中度最高的前 5 大權值個股於同一張走勢圖。
              </p>
            </div>
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
                  {stock.fundCount} 檔重疊
                </span>
              </div>

              <div className="font-bold text-sm text-slate-900 truncate">
                {stock.stockName}
              </div>

              <div className="mt-2.5 flex items-baseline justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500">持股比例</span>
                  <span className="font-mono font-black text-sm text-slate-900">
                    {stock.totalRatio.toFixed(2)}%
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-slate-500">持股市值</span>
                  <span className="font-mono font-bold text-xs text-slate-700">
                    ${Math.round(totalMv).toLocaleString()}萬
                  </span>
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
              前五大個股走勢圖
            </h4>
          </div>

          <div className="flex items-center space-x-4 text-xs font-semibold">
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-blue-600 inline-block"></span>
              <span className="text-slate-700">左縱軸: 持股比例 (%) [線圖]</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500/50 inline-block"></span>
              <span className="text-slate-700">右縱軸: 持股市值 (萬) [漸層底色]</span>
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
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3.5 rounded-lg shadow-xl text-xs space-y-2.5 border border-slate-700 font-sans min-w-[260px]">
                          <div className="font-bold border-b border-slate-700 pb-1.5 text-slate-200 flex items-center justify-between">
                            <span>日期: {data.fullDate}</span>
                            <span className="text-[11px] text-blue-400 font-mono">
                              前五大明細
                            </span>
                          </div>

                          <div className="space-y-2">
                            {top5Stocks.map((stock, idx) => {
                              const key = stock.stockCode || `stock_${idx}`;
                              const color = STOCK_COLORS[idx % STOCK_COLORS.length];
                              const ratio = data[`ratio_${key}`] ?? 0;
                              const mv = data[`mv_${key}`] ?? 0;

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
                                    <span>
                                      持股比: <strong className="text-blue-300">{ratio.toFixed(2)}%</strong>
                                    </span>
                                    <span>
                                      市值: <strong className="text-emerald-300">${mv.toLocaleString()}萬</strong>
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
          * 數據由 Google 試算表及歷史期別快照調閱計算，僅列出真實有記載之歷史交易日紀錄。
        </div>
      </div>
    </div>
  );
};
