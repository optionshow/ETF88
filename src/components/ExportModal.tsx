import React, { useState } from 'react';
import { FundData } from '../types';
import { X, Download, Copy, CheckCircle2, FileSpreadsheet, FileText, Check } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  funds: FundData[];
  selectedFundId?: string;
  onSwitchToImport?: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  funds,
  selectedFundId,
  onSwitchToImport,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const validFunds = Array.isArray(funds)
    ? funds.filter((f): f is FundData => Boolean(f && typeof f === 'object' && (f.id || f.code || f.name)))
    : [];

  const currentFund = validFunds.find((f) => String(f.id) === String(selectedFundId)) || validFunds[0];

  const generateCsvData = (): string => {
    // Columns A~H: 基金代碼, 基金名稱, 日期, 個股名稱, 目前股價, 持股市值(元), 投資股數, 比例(%)
    const headers = ['基金代碼', '基金名稱', '日期', '個股名稱', '目前股價', '持股市值(元)', '投資股數', '比例(%)'];
    const rows: string[][] = [headers];

    // 匯出範圍：固定為全部基金（最新 30 天）
    validFunds.forEach((fund) => {
      if (!fund) return;
      const cleanCode = String(fund.code || '').replace('.TW', '');
      const fundName = String(fund.name || '');
      const snapshotsToExport = (fund.snapshots || []).slice(0, 30);

      snapshotsToExport.forEach((snapshot) => {
        const dateStr = String(snapshot.date || snapshot.asOfDate || '').replace(/-/g, '/');
        (snapshot.holdings || []).forEach((h) => {
          const priceStr = h.price ? String(h.price) : '';
          const mvVal = h.marketValue !== undefined
            ? String(h.marketValue)
            : (h.price && h.shares ? String(h.price * h.shares) : '');
          const sharesStr = String(h.shares || 0);
          const ratioStr = String(h.ratio || 0) + '%';
          const stockName = String(h.stockName || '');

          rows.push([
            cleanCode,
            `"${fundName.replace(/"/g, '""')}"`,
            dateStr,
            `"${stockName.replace(/"/g, '""')}"`,
            priceStr,
            mvVal,
            sharesStr,
            ratioStr,
          ]);
        });
      });
    });

    // Add BOM for Excel / Google Sheets UTF-8 compatibility
    return '\uFEFF' + rows.map((r) => r.join(',')).join('\r\n');
  };

  const handleDownloadCsv = () => {
    const csvContent = generateCsvData();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `台灣主動基金最新30天持股總表_${timestamp}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    // 確保 JSON 備份檔也限制在最新 30 天
    const cleanFundsForExport = validFunds.map((f) => ({
      ...f,
      snapshots: (f.snapshots || []).slice(0, 30),
    }));
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(cleanFundsForExport, null, 2));
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `台灣基金持股最新30天備份_${timestamp}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyClipboard = async () => {
    try {
      const csvContent = generateCsvData().replace('\uFEFF', '');
      // Convert commas to tabs for easy pasting into Google Sheets or Excel
      const tsvContent = csvContent
        .split('\r\n')
        .map((line) => line.split(',').map((cell) => cell.replace(/^"|"$/g, '')).join('\t'))
        .join('\n');

      await navigator.clipboard.writeText(tsvContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Clipboard copy failed:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-blue-100 text-blue-700 rounded-md">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">匯出持股資料</h2>
              <p className="text-xs text-slate-500">將基金持股數據匯出為 CSV 表格或 JSON 備份檔</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Fixed Scope Display */}
          <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-blue-600 ring-4 ring-blue-100"></span>
                <span className="text-xs font-bold text-blue-950">匯出範圍：全部基金（最新 30 天）</span>
              </div>
              <span className="text-blue-700 font-mono font-semibold bg-blue-100/80 px-2 py-0.5 rounded text-[11px]">
                共 {validFunds.length} 檔基金
              </span>
            </div>
            <p className="text-[11px] text-blue-900/80 leading-relaxed">
              系統將自動整合並匯出所有追蹤基金之<strong>最新 30 天</strong>（包括今天）持股期別，嚴格依照 <strong>A～H 欄位順序</strong>輸出。
            </p>
          </div>

          {/* Export Content Details */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1.5">
            <div className="font-semibold text-slate-800 flex items-center justify-between text-xs">
              <span>涵蓋基金清單</span>
              <span className="text-slate-500 font-mono text-[11px]">
                {validFunds.map((f) => f.code.replace('.TW', '')).join('、')}
              </span>
            </div>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              匯出欄位（A～H）：基金代碼、基金名稱、日期、個股名稱、目前股價、持股市值(元)、投資股數、比例(%)。檔案自帶 UTF-8 BOM，在 Excel 與 Google 試算表直接點擊即可正確開啓不亂碼。
            </p>
          </div>

          {/* Action buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleDownloadCsv}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center justify-center space-x-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>下載 CSV 試算表檔案</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleCopyClipboard}
                className="py-2 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-lg flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
                <span>{copied ? '已複製為表格格式！' : '複製為表格 (貼到試算表)'}</span>
              </button>

              <button
                onClick={handleDownloadJson}
                className="py-2 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-lg flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <span>下載完整 JSON 備份檔</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
          {onSwitchToImport && (
            <button
              onClick={onSwitchToImport}
              className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
            >
              ➔ 切換至匯入資料
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-md ml-auto cursor-pointer"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
