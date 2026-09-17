import React, { useState, useMemo } from 'react';
import { FundData } from '../types';
import {
  exportFundToCsv,
  exportAllFundsToCsv,
  exportAllFundsToJson,
  triggerFileDownload,
  copyTextToClipboard,
} from '../utils/exportImportHelper';
import { normalizeDateString } from '../services/fundService';
import {
  X,
  Download,
  Copy,
  Check,
  FileSpreadsheet,
  FileCode,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  funds: FundData[];
  selectedFundId: string;
  onSwitchToImport?: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  funds,
  selectedFundId,
  onSwitchToImport,
}) => {
  const [exportType, setExportType] = useState<'single_csv' | 'all_csv' | 'json'>('single_csv');
  const [currentFundId, setCurrentFundId] = useState<string>(selectedFundId || (funds[0]?.id || '00981A.TW'));
  const [selectedSnapshotDate, setSelectedSnapshotDate] = useState<string>('all');
  const [copied, setCopied] = useState(false);

  const selectedFund = useMemo(() => {
    return funds.find((f) => f.id === currentFundId) || funds[0];
  }, [funds, currentFundId]);

  const snapshotDates = useMemo(() => {
    if (!selectedFund) return [];
    const set = new Set<string>();
    (selectedFund.snapshots || []).forEach((s) => {
      const d = normalizeDateString(s.date || s.asOfDate);
      if (d) set.add(d);
    });
    return Array.from(set).sort((a, b) => new Date(b.replace(/\//g, '-')).getTime() - new Date(a.replace(/\//g, '-')).getTime());
  }, [selectedFund]);

  // 生成目前預覽內容
  const previewContent = useMemo(() => {
    if (!selectedFund) return '';
    if (exportType === 'single_csv') {
      const targetDate = selectedSnapshotDate === 'all' ? undefined : selectedSnapshotDate;
      return exportFundToCsv(selectedFund, targetDate);
    } else if (exportType === 'all_csv') {
      return exportAllFundsToCsv(funds);
    } else {
      return exportAllFundsToJson(funds);
    }
  }, [exportType, selectedFund, selectedSnapshotDate, funds]);

  // 取得預覽前幾行文字
  const previewLines = useMemo(() => {
    const lines = previewContent.replace(/^\uFEFF/, '').split('\n').filter((l) => l.trim().length > 0);
    return lines.slice(0, 8);
  }, [previewContent]);

  if (!isOpen) return null;

  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const handleDownload = () => {
    if (exportType === 'single_csv' && selectedFund) {
      const code = selectedFund.code.replace('.TW', '');
      const datePart = selectedSnapshotDate === 'all' ? '歷史總表' : selectedSnapshotDate.replace(/\//g, '');
      const filename = `基金明細_${code}_${datePart}_${todayStr}.csv`;
      triggerFileDownload(previewContent, filename, 'text/csv;charset=utf-8;');
    } else if (exportType === 'all_csv') {
      const filename = `全基金持股明細總表_${todayStr}.csv`;
      triggerFileDownload(previewContent, filename, 'text/csv;charset=utf-8;');
    } else {
      const filename = `ETF基金持股資料庫備份_${todayStr}.json`;
      triggerFileDownload(previewContent, filename, 'application/json;charset=utf-8;');
    }
  };

  const handleCopy = async () => {
    // 複製時移除 BOM 前綴，方便直接貼入 Excel / Google 試算表
    const clean = previewContent.replace(/^\uFEFF/, '');
    const success = await copyTextToClipboard(clean);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">匯出持股資料</h2>
              <p className="text-xs text-slate-500">方便之後在 Google 試算表直接匯入更新，或備份還原至網頁</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Format Tabs */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setExportType('single_csv')}
              className={`py-2 px-3 rounded-md font-semibold text-xs flex items-center justify-center space-x-1.5 transition-all ${
                exportType === 'single_csv'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>單一基金 CSV (試算表相容)</span>
            </button>

            <button
              onClick={() => setExportType('all_csv')}
              className={`py-2 px-3 rounded-md font-semibold text-xs flex items-center justify-center space-x-1.5 transition-all ${
                exportType === 'all_csv'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>全部基金 CSV 總表</span>
            </button>

            <button
              onClick={() => setExportType('json')}
              className={`py-2 px-3 rounded-md font-semibold text-xs flex items-center justify-center space-x-1.5 transition-all ${
                exportType === 'json'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCode className="w-4 h-4" />
              <span>完整 JSON 網頁備份</span>
            </button>
          </div>

          {/* Sub options for single_csv */}
          {exportType === 'single_csv' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-blue-50/60 rounded-lg border border-blue-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">選擇匯出基金:</label>
                <select
                  value={currentFundId}
                  onChange={(e) => setCurrentFundId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md px-2.5 py-1.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.code.replace('.TW', '')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">選擇歷史期別:</label>
                <select
                  value={selectedSnapshotDate}
                  onChange={(e) => setSelectedSnapshotDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md px-2.5 py-1.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">完整全部歷史期別 ({snapshotDates.length} 個期別)</option>
                  {snapshotDates.map((d) => (
                    <option key={d} value={d}>
                      {d} 期別
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Helper Instruction Box for Google Sheets */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2.5 text-amber-900">
            <HelpCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-1 leading-relaxed">
              <p className="font-bold">💡 如何在 Google 試算表中匯入此資料？</p>
              <ol className="list-decimal list-inside text-amber-800 space-y-0.5 text-[11px]">
                <li>點擊下方<strong>「下載 CSV 檔案」</strong>取得檔案（已含 UTF-8 BOM，中文保證不亂碼）。</li>
                <li>打開 Google 試算表，點擊上方選單<strong>「檔案」➔「匯入」➔「上傳」</strong>。</li>
                <li>匯入位置選擇<strong>「取代目前工作表」</strong>或<strong>「插入新工作表」</strong>，即可秒速更新試算表資料！</li>
                <li>或直接點<strong>「複製到剪貼簿」</strong>，在試算表點選儲存格直接按 <kbd className="px-1 py-0.5 bg-white border border-amber-300 rounded font-mono">Ctrl+V</kbd> 貼上。</li>
              </ol>
            </div>
          </div>

          {/* Preview Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">資料預覽 (前 8 行):</span>
              <span className="text-[11px] text-slate-500 font-mono">
                {exportType === 'json' ? 'JSON 結構' : '6 欄標準格式 (日期, 個股名稱, 目前股價, 持股市值, 投資股數, 比例)'}
              </span>
            </div>
            <div className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-[11px] overflow-x-auto max-h-40 border border-slate-700 leading-relaxed scrollbar-thin">
              {previewLines.map((line, idx) => (
                <div key={idx} className="whitespace-pre">
                  {line}
                </div>
              ))}
              {previewContent.split('\n').length > 8 && (
                <div className="text-slate-500 italic pt-1">... 尚有更多記錄 ...</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          {onSwitchToImport && (
            <button
              onClick={onSwitchToImport}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold underline"
            >
              切換至「匯入資料」➔
            </button>
          )}

          <div className="flex items-center space-x-2 ml-auto">
            <button
              onClick={handleCopy}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
              <span>{copied ? '已複製到剪貼簿！' : '複製到剪貼簿'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>下載 {exportType === 'json' ? 'JSON 備份檔' : 'CSV 試算表檔'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
