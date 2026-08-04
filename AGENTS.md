# 基金持股自動抓取與更新說明 (00981A / 00403A / 00982A / 00992A / 00407A)

本文件紀錄 **統一台股增長 (00981A.TW / 投信代碼 49YTW)**、**統一升級50 (00403A.TW / 投信代碼 63YTW)**、**群益台灣強棒 (00982A.TW / 投信代碼 399)**、**群益科技創新 (00992A.TW / 投信代碼 500)** 與 **凱基台灣精選強棒 (00407A.TW / 投信代碼 J024)** 每天自動抓取與更新持股明細之標準流程與解析邏輯。

---

## 1. 數據來源與更新頻率
* **統一台股增長 (00981A.TW)**: [https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=49YTW](https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=49YTW)
* **統一升級50 (00403A.TW)**: [https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=63YTW](https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=63YTW)
* **群益台灣強棒 (00982A.TW)**: [https://www.capitalfund.com.tw/etf/product/detail/399/portfolio](https://www.capitalfund.com.tw/etf/product/detail/399/portfolio)
  * 後端 API Endpoint: `POST https://www.capitalfund.com.tw/CFWeb/api/etf/buyback` (Payload: `{"fundId": 399}`)
* **群益科技創新 (00992A.TW)**: [https://www.capitalfund.com.tw/etf/product/detail/500/portfolio](https://www.capitalfund.com.tw/etf/product/detail/500/portfolio)
  * 後端 API Endpoint: `POST https://www.capitalfund.com.tw/CFWeb/api/etf/buyback` (Payload: `{"fundId": 500}`)
* **凱基台灣精選強棒 (00407A.TW)**: [https://www.kgifund.com.tw/Fund/Detail?fundID=J024](https://www.kgifund.com.tw/Fund/Detail?fundID=J024)
* **數據更新時間**: 每個交易日傍晚（基金公司公佈當日最新申購組合與持股明細後）。

---

## 2. 自動抓取與解析步驟 (Scraping Protocol)

### 2.1 統一台股增長 (00981A) & 統一升級50 (00403A)
1. **請求官方頁面**: `GET https://www.ezmoney.com.tw/ETF/Fund/Info?fundCode=49YTW` (或 `63YTW`)。
2. **解析嵌入 JSON**: 提取 `#DataAsset` 的 `data-content` 屬性並做 `JSON.parse`。
3. **提取持股與淨值**:
   * **總淨值**: `AssetCode === "NAV"` 物件之 `Value`。
   * **持股清單**: `AssetCode === "ST"` 之 `Details` 陣列。

### 2.2 群益台灣強棒 (00982A) & 群益科技創新 (00992A)
1. **請求官方 API**: `POST https://www.capitalfund.com.tw/CFWeb/api/etf/buyback`，Header 帶 `Content-Type: application/json`，Body 為 `{"fundId": 399}` (00982A) 或 `{"fundId": 500}` (00992A)。
2. **解析 JSON 回傳資料**:
   * **資料日期 (`asOfDate`)**: `data.pcf.date2` (如 `2026-08-03` 轉換為 `2026/08/03`)。
   * **總淨值 (`NAV`)**: `data.pcf.nav` (新台幣元)。
   * **持股清單**: `data.stocks` 陣列（取前 1~20 權重股票）。
3. **單筆持股精算**:
   * **股票名稱 (`stockName`)**: `item.stocName` (去除字尾符號 `*`) + `(` + `item.stocNo` + `)`。
   * **股票代碼 (`stockCode`)**: `item.stocNo`。
   * **持有股數 (`shares`)**: `item.share` (千位號格式化 `item.shareFormat`)。
   * **持股權重 (%) (`ratio`)**: `item.weightRound` 或 `item.weight` (四捨五入兩位小數)。
   * **預估單價 (`price`)**: `Math.round((NAV * (weight / 100)) / share)`。

### 2.3 凱基台灣精選強棒 (00407A)
1. **請求官方頁面**: `GET https://www.kgifund.com.tw/Fund/Detail?fundID=J024`，帶 `User-Agent` 標頭。
2. **提取資料日期 (`asOfDate`)**: HTML 中的隱藏 DOM 元素 `#LatestNAVDate` 之 `value` (例如 `2026/08/03`)。
3. **解析持股 HTML 表格**:
   * 尋找包含「股票代號」、「股票名稱」、「股數」、「權重(%)」的 `<table>` 元素。
   * 遍歷 `<tbody> tr` 提取：
     * **股票代碼 (`stockCode`)**: 第一欄 (`td[0]`)。
     * **股票名稱 (`stockName`)**: 第二欄 (`td[1]`)，去除字尾符號 `*` 並組合成 `名稱 (代碼)` 格式。
     * **持有股數 (`shares`)**: 第三欄 (`td[2]`)，去除逗點並轉數字。
     * **持股權重 (%) (`ratio`)**: 第四欄 (`td[3]`)，轉為浮點數。
   * 截取前 **1~20 筆** 權重股票傳回系統。

---

## 3. 系統內建整合機制

1. **後端 API Endpoint (`/api/scrape-fund`)**:
   * 當用戶查詢 `00981A.TW` 或 `00403A.TW` 時，調用 `fetchEzMoneyFund('49YTW' / '63YTW')`。
   * 當用戶查詢 `00982A.TW` 或 `00992A.TW` 時，調用 `fetchCapitalFund('399' / '500')`。
   * 當用戶查詢 `00407A.TW` 或輸入 `https://www.kgifund.com.tw/...` 時，調用 `fetchKgiFund('J024')`。
3. **期別資料更新與替換原則 (Snapshot Merge Rule)**:
   * 建立或寫入新資料時，系統會自動比較資料日期 (`asOfDate` / `date`)。
   * 若新資料的日期與現有歷史期別相同，**新資料將自動覆蓋替換舊資料**。
   * 所有歷史期別皆依照日期由新至舊（降冪，Latest First）排序，確保最新資料永遠置頂。

