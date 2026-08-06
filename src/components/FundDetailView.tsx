import React, { useState, useEffect } from 'react';
import { FundData, HoldingItem } from '../types';
import { ExternalLink, ArrowUpDown, Calendar, Database, Sparkles, RefreshCcw, Edit3, CheckCircle2 } from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { getBusinessDayOptions, parseManualHoldingText } from '../services/fundService';

interface FundDetailViewProps {
  funds: FundData[];
  selectedFundId: string;
  setSelectedFundId: (id: string) => void;
  onRefreshSingle?: (fundCode: string) => void;
  onFetchStockPrices?: () => void;
  isRefreshing: boolean;
  onUpdateFunds?: (funds: FundData[], message?: string, singleFundToPush?: FundData) => void;
}

const SAMPLE_TEXT = `股票代號\t股票名稱\t股數\t持股權重
2330\t台積電\t11,959,000\t9.3%
2383\t台光電\t4,863,000\t8.38%
2454\t聯發科\t5,448,000\t7.06%
3037\t欣興\t20,210,000\t6.26%
6669\t緯穎\t2,708,000\t5.63%
3017\t奇鋐\t5,801,000\t5.06%
2345\t智邦\t6,419,000\t4.99%
6223\t旺矽\t2,443,000\t4.83%
2327\t國巨*\t25,437,000\t4.83%
3665\t貿聯-KY\t5,130,848\t3.96%
2303\t聯電\t87,718,000\t3.48%
8046\t南電\t9,519,000\t3.33%
3653\t健策\t2,375,000\t3.3%
2308\t台達電\t5,932,000\t3.22%
3711\t日月光投控\t16,327,000\t3.2%
6274\t台燿\t5,499,000\t2.47%
5274\t信驊\t454,900\t2.36%
2368\t金像電\t7,579,000\t2.28%
6805\t富世達\t1,957,000\t1.04%
2449\t京元電子\t11,295,450\t0.93%
8210\t勤誠\t2,297,000\t0.89%
6187\t萬潤\t1,334,000\t0.49%
2360\t致茂\t472,000\t0.3%
4979\t華星光\t1,874,000\t0.28%
1590\t亞德客-KY\t528,000\t0.25%
4958\t臻鼎-KY\t1,682,000\t0.25%
6510\t精測\t261,000\t0.24%
6515\t穎崴\t93,000\t0.2%
6278\t台表科\t3,250,000\t0.17%
8996\t高力\t412,000\t0.14%
2408\t南亞科\t940,000\t0.14%
6271\t同欣電\t2,224,000\t0.13%`;

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
  onUpdateFunds,
}) => {
  const [sortField, setSortField] = useState<'ratio' | 'shares' | 'stockName' | 'price' | 'marketValue'>('ratio');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState(0);

  const currentFund = funds.find((f) => f.id === selectedFundId) || funds[0];

  const activeSnapshot = currentFund?.snapshots[selectedSnapshotIndex] || currentFund?.snapshots[0];
  const activeDate = activeSnapshot?.date || currentFund?.asOfDate || '2026/08/04';

  const [selectedTargetDate, setSelectedTargetDate] = useState(activeDate);
  const [manualText, setManualText] = useState('');

  // Update target date when selected snapshot changes
  useEffect(() => {
    if (activeDate) {
      setSelectedTargetDate(activeDate);
    }
  }, [activeDate, selectedFundId, selectedSnapshotIndex]);

  if (!currentFund) {
    return (
      <div className="p-8 text-center text-slate-400">
        目前無基金資料，請點擊右上方「新增基金網址」以加入基金投資明細。
      </div>
    );
  }

  const rawHoldings: HoldingItem[] = activeSnapshot?.holdings || [];
  const todayObj = new Date();
  const todayStr = `${todayObj.getFullYear()}/${String(todayObj.getMonth() + 1).padStart(2, '0')}/${String(todayObj.getDate()).padStart(2, '0')}`;
  const businessDayOptions = getBusinessDayOptions(activeDate).filter((d) => d <= todayStr);

  // Parse preview
  const parsedPreview = parseManualHoldingText(manualText, selectedTargetDate);

  const handleApplyManualInput = () => {
    if (!manualText.trim()) {
      alert('請先輸入或貼上持股明細文字！');
      return;
    }

    const parsed = parseManualHoldingText(manualText, selectedTargetDate);

    if (parsed.length === 0) {
      alert('未能解析出有效的持股個股資料，請確認格式包含: 股票代號 股票名稱 股數 持股權重');
      return;
    }

    // Attach prices from existing snapshots if available
    const priceMap = new Map<string, number>();
    currentFund.snapshots.forEach((s) => {
      s.holdings.forEach((h) => {
        if (h.price && h.price > 0) {
          priceMap.set(h.stockCode, h.price);
        }
      });
    });

    const top20 = parsed.map((item) => {
      const knownPrice = priceMap.get(item.stockCode);
      if (knownPrice) {
        return {
          ...item,
          price: knownPrice,
          marketValue: knownPrice * item.shares,
        };
      }
      return item;
    });

    // Overwrite snapshot for selectedTargetDate
    const updatedSnapshots = [...currentFund.snapshots];
    const existingIdx = updatedSnapshots.findIndex(
      (s) => s.date === selectedTargetDate || s.asOfDate === selectedTargetDate
    );

    if (existingIdx >= 0) {
      updatedSnapshots[existingIdx] = {
        ...updatedSnapshots[existingIdx],
        date: selectedTargetDate,
        asOfDate: selectedTargetDate,
        holdings: top20,
        isManual: true,
      };
    } else {
      updatedSnapshots.push({
        date: selectedTargetDate,
        asOfDate: selectedTargetDate,
        holdings: top20,
        isManual: true,
      });
    }

    // Sort snapshots descending
    updatedSnapshots.sort(
      (a, b) => new Date(b.date.replace(/\//g, '-')).getTime() - new Date(a.date.replace(/\//g, '-')).getTime()
    );

    const updatedFund: FundData = {
      ...currentFund,
      asOfDate: updatedSnapshots[0]?.asOfDate || currentFund.asOfDate,
      snapshots: updatedSnapshots,
      lastUpdated: new Date().toLocaleString('zh-TW'),
    };

    const updatedFunds = funds.map((f) => (f.id === currentFund.id ? updatedFund : f));

    if (onUpdateFunds) {
      onUpdateFunds(
        updatedFunds,
        `✅ 已成功手動覆蓋【${currentFund.name} (${currentFund.code.replace('.TW', '')})】(${selectedTargetDate}) 前 20 大持股，其他基金不受影響，並已自動同步至 Google 試算表！`,
        updatedFund
      );
    }
  };


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
            {onFetchStockPrices && (
              <button
                onClick={onFetchStockPrices}
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
          <div className="text-[11px] text-slate-500 mt-1">
            歷史期別:{' '}
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
                      contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '6px', shadow: '0 2px 4px rgba(0,0,0,0.05)' }}
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

          {/* Manual Data Input Panel (Under Top 10 Ratios) */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 border-t-4 border-t-indigo-600 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">手動輸入與覆蓋持股資料</h3>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-300">
                手動為最準確
              </span>
            </div>

            <p className="text-xs text-slate-500">
              輸入或貼上個股表格資料，系統將自動判別前 20 大個股（<span className="text-rose-600 font-bold">自動剔除 1% 以下個股，不予紀錄</span>），<span className="font-bold text-indigo-700">僅覆蓋目前所點選的【{currentFund.name} ({currentFund.code.replace('.TW', '')})】</span>，不影響其他基金與歷史期別。
            </p>

            {/* Target Date Selector (+/- 3 business days) */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">
                選擇覆蓋期別日期 (基準日前後 3 個工作天):
              </label>
              <select
                value={selectedTargetDate}
                onChange={(e) => setSelectedTargetDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {businessDayOptions.map((dateOpt) => {
                  const isCurrentActive = dateOpt === activeDate;
                  return (
                    <option key={dateOpt} value={dateOpt}>
                      {dateOpt} {isCurrentActive ? '(目前選取期別)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Textarea Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">
                  貼上表格資料 (代號 / 名稱 / 股數 / 權重):
                </label>
                <button
                  type="button"
                  onClick={() => setManualText(SAMPLE_TEXT)}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold underline cursor-pointer"
                >
                  帶入測試範例
                </button>
              </div>

              <textarea
                rows={8}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={`股票代號\t股票名稱\t股數\t持股權重\n2330\t台積電\t11,959,000\t9.3%\n2383\t台光電\t4,863,000\t8.38%`}
                className="w-full p-2.5 bg-slate-900 text-slate-100 font-mono text-xs rounded-md border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              />
            </div>

            {/* Real-time parse status indicator */}
            {manualText.trim() && (
              <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-md text-xs text-indigo-900 space-y-1">
                <div className="flex items-center justify-between font-bold">
                  <span>已自動判別結果:</span>
                  <span className="text-indigo-700 font-mono">
                    {parsedPreview.length} / 20 檔 (前 20 大個股)
                  </span>
                </div>
                {parsedPreview.length > 0 && (
                  <div className="text-[11px] text-indigo-800 truncate font-mono">
                    前 3 大: {parsedPreview.slice(0, 3).map((p) => `${p.stockName} ${p.ratio}%`).join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={handleApplyManualInput}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-md shadow-sm transition-colors flex items-center justify-center space-x-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>⚡ 解析前 20 大並覆蓋舊資料與試算表</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
