import React, { useState } from 'react';
import { X, PlusCircle, Link, Globe, AlertCircle } from 'lucide-react';

interface AddFundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFund: (codeOrUrl: string) => Promise<boolean>;
  isSubmitting: boolean;
}

export const AddFundModal: React.FC<AddFundModalProps> = ({
  isOpen,
  onClose,
  onAddFund,
  isSubmitting,
}) => {
  const [inputVal, setInputVal] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!inputVal.trim()) {
      setErrorMessage('請輸入基金代碼或基金網址');
      return;
    }

    const success = await onAddFund(inputVal.trim());
    if (success) {
      setInputVal('');
      onClose();
    } else {
      setErrorMessage('無法抓取該基金資料，請確認網址或代碼是否正確。');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 shadow-xl space-y-5 relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <PlusCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">新增基金持股明細</h3>
            <p className="text-xs text-slate-500">系統將自動擷取投資明細與歷史持股比例</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              基金/ETF 網址或代碼 (e.g. 00981A, 00403A, 00982A, 00992A, 00407A)
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="貼上網址或輸入代碼如 00992A"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                className="w-full bg-slate-50 text-slate-900 text-xs rounded-md pl-9 pr-4 py-2.5 border border-slate-300 focus:outline-none focus:border-blue-600 font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              提示: 可以直接輸入代碼 (如 <span className="text-blue-600 font-bold font-mono">00981A</span>, <span className="text-blue-600 font-bold font-mono">00992A</span>) 或貼上基金/ETF 完整網址。
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center space-x-2 text-red-600 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 rounded-md border border-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-all shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? '擷取中...' : '開始擷取並新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
