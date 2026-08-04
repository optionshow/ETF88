export interface HoldingItem {
  id: string;
  stockName: string;
  stockCode?: string;
  shares: number;          // 投資股數
  sharesFormatted: string; // 格式化 (e.g. 1,250,000)
  ratio: number;           // 比例 (%)
  date: string;            // 日期 (e.g. 2026/06/30)
  price?: number;          // 當前估算股價
  marketValue?: number;    // 當前估算市值 (NT$)
}

export interface FundHoldingSnapshot {
  date: string;
  asOfDate: string;
  totalAssetsMillion?: number;
  holdings: HoldingItem[];
  isManual?: boolean;     // 標記是否為手動輸入之持股資料 (手動資料自動更新不予以覆蓋)
}

export interface FundData {
  id: string;
  code: string;           // 基金代碼 (e.g. ACPS10)
  name: string;           // 基金名稱 (e.g. 統一奔騰基金)
  manager: string;        // 基金公司/經理人
  category: string;       // 基金類別 (e.g. 台灣中小型股票)
  url: string;            // 官方/公開網頁連結
  currentNav: number;     // 最新淨值
  navDate: string;        // 淨值日期
  oneYearReturn: number;  // 近一年報酬率 (%)
  threeYearReturn: number;// 近三年報酬率 (%)
  asOfDate: string;       // 持股明細截至日期
  snapshots: FundHoldingSnapshot[]; // 歷史持股明細記錄
  lastUpdated: string;
}

export interface HoldingChange {
  stockName: string;
  stockCode?: string;
  price?: number;
  latestDate: string;
  previousDate: string;
  latestShares: number;
  previousShares: number;
  diffShares: number;
  latestRatio: number;
  previousRatio: number;
  diffRatio: number;
  status: 'new' | 'increase' | 'decrease' | 'exit' | 'unchanged';
}

export interface StockOverlap {
  stockName: string;
  stockCode?: string;
  price?: number;
  funds: {
    fundId: string;
    fundCode: string;
    fundName: string;
    shares: number;
    ratio: number;
    price?: number;
  }[];
  totalRatio: number;
  totalShares: number;
  fundCount: number;
}

