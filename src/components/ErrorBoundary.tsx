import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">應用程式載入時發生狀況</h2>
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-left">
              <div className="text-xs font-mono text-rose-800 break-all font-semibold">
                {this.state.error?.name ? `${this.state.error.name}: ` : ''}
                {this.state.error?.message || '畫面渲染異常'}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>重新整理頁面</span>
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.clear();
                  } catch (e) {
                    console.error(e);
                  }
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <span>重設暫存並重新整理</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
