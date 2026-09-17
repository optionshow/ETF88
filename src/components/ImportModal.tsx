import React, { useState, useRef } from 'react';
import { FundData } from '../types';
import {
  parseImportData,
  applyImportedDataToFunds,
  ParsedImportResult,
} from '../utils/exportImportHelper';
import {
  X,
  Upload,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  AlertCircle,
  FileText,
  CloudUpload,
  Trash2,
} from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  funds: FundData[];
  selectedFundId: string;
  onImportSuccess: (updatedFunds: FundData[], message: string, syncToSheets?: boolean) => void;
  onSwitchToExport?: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  funds,
  selectedFundId,
  onImportSuccess,
  onSwitchToExport,
}) => {
  const [importTab, setImportTab] = useState<'file' | 'paste'>('file');
  const [targetFundCode, setTargetFundCode] = useState<string>(
    selectedFundId.replace('.TW', '') || '00981A'
  );
  const [pastedText, setPastedText] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parsedResult, setParsedResult] = useState<ParsedImportResult | null>(null);
  const [syncToSheetsAfterImport, setSyncToSheetsAfterImport] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const currentContent = importTab === 'file' ? fileContent : pastedText;

  // 觸發解析
  const handleParse = (content: string, code: string) => {
    if (!content.trim()) {
      setParsedResult(null);
      return;
    }
    const res = parseImportData(content, code, funds);
    setParsedResult(res);
  };

  const handleFileChange = (file: File) => {
    setFileName(file.name);
    // 自動從檔名推估基金代號
    const match = file.name.match(/\b(00981A|00982A|00407A|00403A|00992A|49YTW|63YTW|399|500|J024)\b/i);
    let codeToUse = targetFundCode;
    if (match) {
      codeToUse = match[1].toUpperCase();
      setTargetFundCode(codeToUse);
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      setFileContent(text);
      handleParse(text, codeToUse);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleApply = () => {
    if (!parsedResult || !parsedResult.success) return;

    const { updatedFunds, summaryMessage } = applyImportedDataToFunds(funds, parsedResult);
    onImportSuccess(updatedFunds, summaryMessage, syncToSheetsAfterImport);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">匯入資料更新網頁與試算表</h2>
              <p className="text-xs text-slate-500">支援 Google 試算表 CSV/TSV 表格或完整 JSON 備份檔匯入</p>
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
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Method Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => {
                setImportTab('file');
                if (fileContent) handleParse(fileContent, targetFundCode);
                else setParsedResult(null);
              }}
              className={`py-2 px-3 rounded-md font-semibold text-xs flex items-center justify-center space-x-1.5 transition-all ${
                importTab === 'file'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>上傳檔案 (CSV / JSON)</span>
            </button>

            <button
              onClick={() => {
                setImportTab('paste');
                if (pastedText) handleParse(pastedText, targetFundCode);
                else setParsedResult(null);
              }}
              className={`py-2 px-3 rounded-md font-semibold text-xs flex items-center justify-center space-x-1.5 transition-all ${
                importTab === 'paste'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>剪貼簿直接貼上表格文字</span>
            </button>
          </div>

          {/* Target Fund Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <label className="font-bold text-slate-700">預設指定匯入基金:</label>
              <select
                value={targetFundCode}
                onChange={(e) => {
                  setTargetFundCode(e.target.value);
                  if (currentContent) handleParse(currentContent, e.target.value);
                }}
                className="bg-white border border-slate-300 rounded-md px-2.5 py-1 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {funds.map((f) => (
                  <option key={f.id} value={f.code.replace('.TW', '')}>
                    {f.name} ({f.code.replace('.TW', '')})
                  </option>
                ))}
              </select>
            </div>

            <div className="text-[11px] text-slate-500">
              * 若檔案或內容中包含「基金代碼」欄位，系統將優先自動辨識對應基金
            </div>
          </div>

          {/* Tab 1: File Upload */}
          {importTab === 'file' && (
            <div>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-slate-300 hover:border-emerald-400 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.json"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileChange(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 bg-emerald-100 text-emerald-700 rounded-full">
                    <CloudUpload className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 text-sm">點擊選擇檔案</span>
                    <span className="text-slate-500"> 或拖曳檔案至此</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    支援從 Google 試算表下載的 .csv、Excel 匯出檔、或網頁備份 .json
                  </p>
                  {fileName && (
                    <div className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-full font-mono text-xs">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>{fileName}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Textarea Paste */}
          {importTab === 'paste' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700">貼上試算表儲存格表格內容 (Ctrl+V):</label>
                <button
                  type="button"
                  onClick={() => {
                    const sample = `日期\t個股名稱\t目前股價\t持股市值(萬)\t投資股數\t比例(%)\n2026/08/31\t台積電 (2330)\t2,395\t429,663 萬\t1,794,000\t8.44%\n2026/08/31\t聯發科 (2454)\t4,210\t367,112 萬\t872,000\t7.21%`;
                    setPastedText(sample);
                    handleParse(sample, targetFundCode);
                  }}
                  className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold underline"
                >
                  帶入測試範例
                </button>
              </div>
              <textarea
                rows={6}
                value={pastedText}
                onChange={(e) => {
                  setPastedText(e.target.value);
                  handleParse(e.target.value, targetFundCode);
                }}
                placeholder="在此直接按 Ctrl+V 貼上從 Google 試算表或 Excel 複製的持股表格行列..."
                className="w-full p-3 bg-slate-900 text-slate-100 font-mono text-xs rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y leading-relaxed"
              />
            </div>
          )}

          {/* Parse Result Indicator */}
          {parsedResult && (
            <div
              className={`p-3.5 rounded-lg border flex items-start space-x-2.5 ${
                parsedResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {parsedResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="font-bold">{parsedResult.message}</p>
                {parsedResult.success && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-emerald-800 font-mono pt-1">
                    <span>持股總數: <strong>{parsedResult.totalHoldingsCount}</strong> 筆</span>
                    <span>涵蓋期別: <strong>{parsedResult.distinctDatesCount}</strong> 個</span>
                    <span>影響基金: <strong>{parsedResult.affectedFunds.join(', ')}</strong></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sync to sheets checkbox */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncToSheetsAfterImport}
                onChange={(e) => setSyncToSheetsAfterImport(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
              />
              <span className="font-semibold text-slate-700">匯入完成後自動同步更新至 Google 雲端試算表</span>
            </label>
            <span className="text-[10px] text-slate-400 font-mono">推薦勾選</span>
          </div>

          {/* System Clean Log Information */}
          <div className="p-2.5 bg-slate-100 rounded-lg border border-slate-200 text-[11px] text-slate-600 flex items-center space-x-2">
            <Trash2 className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              已依指示停用並刪除舊有<strong>「系統紀錄Log」</strong>分頁，數據庫歷史明細全自動整潔維護。
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          {onSwitchToExport && (
            <button
              onClick={onSwitchToExport}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold underline"
            >
              切換至「匯出資料」➔
            </button>
          )}

          <div className="flex items-center space-x-2 ml-auto">
            <button
              onClick={onClose}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              取消
            </button>

            <button
              onClick={handleApply}
              disabled={!parsedResult || !parsedResult.success}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:pointer-events-none text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>確認匯入並更新網頁資料</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
