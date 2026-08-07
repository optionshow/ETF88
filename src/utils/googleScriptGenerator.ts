export function generateGoogleScript(fundCodes?: string[], spreadsheetId?: string): string {
  const codesList = Array.isArray(fundCodes) && fundCodes.length > 0 
    ? fundCodes 
    : ["00981A.TW", "00982A.TW", "00407A.TW", "ACPS09", "ACDD04", "ACPS10"];
  const targetSpreadsheetId = spreadsheetId || "1u4F6xNbGf2HqkwJL2kXxolEKUObzHWnMdHaGsbI5ypo";

  return `/**
 * Google Apps Script - MoneyDJ 基金/ETF 持股明細自動接收與匯出腳本 (含目前股價與持股市值欄位)
 * 
 * ✨ 本腳本特點:
 * 1. 【APP 主動推送】包含 doPost(e) Web App 接收端，由 APP 擷取個股名稱、目前股價與持股市值後直接寫入試算表！
 * 2. 【每日 08:00 自動定時】也可由腳本自行定時抓取 (setupDailyTrigger)
 * 3. 【6欄完整紀錄】包含「日期」、「個股名稱」、「目前股價」、「持股市值(萬)」、「投資股數」、「比例(%)」
 * 4. 【統一日期格式與去重】自動將所有日期統一格式化為 YYYY/MM/DD，覆蓋相同日期數據，歷史紀錄不重疊
 * 5. 【自動清理】自動刪除 60 天前的歷史資料
 * 
 * 指定目標試算表: https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit
 */

// 目標試算表 ID
var SPREADSHEET_ID = "${targetSpreadsheetId}";

/**
 * 🛠️ 日期與比例規範與去重工具
 */
function parseAndFormatDate(val) {
  if (!val) return "";
  if (Object.prototype.toString.call(val) === "[object Date]" || val instanceof Date) {
    try {
      return Utilities.formatDate(val, "Asia/Taipei", "yyyy/MM/dd");
    } catch (e) {
      var yyyy = val.getFullYear();
      var mm = ("0" + (val.getMonth() + 1)).slice(-2);
      var dd = ("0" + val.getDate()).slice(-2);
      return yyyy + "/" + mm + "/" + dd;
    }
  }
  var str = String(val).trim();
  if (!str) return "";

  var match = str.match(/(\\d{4})[\\/\\.-](\\d{1,2})[\\/\\.-](\\d{1,2})/);
  if (match) {
    var yyyy = match[1];
    var mm = ("0" + match[2]).slice(-2);
    var dd = ("0" + match[3]).slice(-2);
    return yyyy + "/" + mm + "/" + dd;
  }

  if (str.indexOf("GMT") !== -1 || str.indexOf("Taiwan") !== -1 || str.indexOf("T00:00") !== -1 || (str.length > 15 && !isNaN(Date.parse(str)))) {
    try {
      var d = new Date(str);
      if (!isNaN(d.getTime())) {
        return Utilities.formatDate(d, "Asia/Taipei", "yyyy/MM/dd");
      }
    } catch (e) {}
  }
  var clean = str.replace(/[-.]/g, "/");
  var parts = clean.split("/");
  if (parts.length === 3) {
    var p0 = parts[0].trim();
    var p1 = ("0" + parts[1].trim()).slice(-2);
    var p2 = ("0" + parts[2].trim()).slice(-2);
    if (p0.length === 4 && !isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
      return p0 + "/" + p1 + "/" + p2;
    }
  }
  try {
    var d2 = new Date(str);
    if (!isNaN(d2.getTime())) {
      return Utilities.formatDate(d2, "Asia/Taipei", "yyyy/MM/dd");
    }
  } catch (e) {}
  return str;
}

function parseAndFormatRatio(val) {
  if (val === null || val === undefined || val === '') return '0%';
  var str = String(val).trim();
  var num = parseFloat(str.replace(/%/g, '').replace(/,/g, ''));
  if (isNaN(num)) return '0%';
  return (Math.round(num * 100) / 100) + '%';
}

function formatMvDisplay(val) {
  if (val === undefined || val === null || val === "" || val === "-" || val === "NaN") return "-";
  if (typeof val === "number") {
    if (val <= 0 || isNaN(val)) return "-";
    var v = val > 100000 ? Math.round(val / 10000) : Math.round(val);
    return v + " 萬";
  }
  var str = String(val).trim();
  if (!str || str === "-" || str === "NaN") return "-";
  var clean = str.replace(/[^0-9.]/g, "");
  var num = parseFloat(clean);
  if (isNaN(num) || num <= 0) return "-";
  if (num > 100000 && str.indexOf("萬") === -1) {
    num = num / 10000;
  }
  return Math.round(num) + " 萬";
}

function extractStockKey(nameStr) {
  if (!nameStr) return '';
  var clean = String(nameStr).trim();
  var match = clean.match(/(\\d{4})/);
  if (match) return match[1];
  return clean.replace(/\\s+/g, '').replace(/\\*/g, '');
}

function deduplicateAndCleanRows(rows) {
  var map = {};
  rows.forEach(function(r) {
    var d = parseAndFormatDate(r[0]);
    var name = String(r[1] || '').trim();
    if (!d || !name) return;

    var stockKey = extractStockKey(name);
    var key = d + "||" + stockKey;

    var price = r[2] || '-';
    var mv = formatMvDisplay(r[3]);
    var shares = r[4] || '0';
    var ratio = parseAndFormatRatio(r[5] || r[3] || '0%');

    // Quality score to keep the best formatted row among duplicates
    var score = 0;
    if (price !== '-' && price !== '') score += 10;
    if (mv !== '-' && mv !== '') score += 5;
    if (String(shares).indexOf(',') !== -1) score += 2;
    if (String(r[5] || '').indexOf('%') !== -1) score += 3;

    var candidate = [d, name, price, mv, shares, ratio, score];

    if (!map[key] || candidate[6] >= map[key][6]) {
      map[key] = candidate;
    }
  });

  // Group by unique date to strictly limit each date to top 20 holdings
  var byDate = {};
  Object.keys(map).forEach(function(k) {
    var item = map[k];
    var dKey = item[0];
    if (!byDate[dKey]) byDate[dKey] = [];
    byDate[dKey].push(item);
  });

  var result = [];
  var dateKeys = Object.keys(byDate);
  dateKeys.sort(function(a, b) {
    var dA = new Date(a.split("/").join("-")).getTime() || 0;
    var dB = new Date(b.split("/").join("-")).getTime() || 0;
    return dB - dA;
  });

  dateKeys.forEach(function(dKey) {
    var list = byDate[dKey];
    // Sort items by weight ratio descending
    list.sort(function(a, b) {
      var rA = parseFloat(String(a[5]).replace('%', '')) || 0;
      var rB = parseFloat(String(b[5]).replace('%', '')) || 0;
      return rB - rA;
    });
    // STRICT CAP: Maximum 20 stock rows per unique day!
    var top20 = list.slice(0, 20);
    top20.forEach(function(c) {
      result.push([c[0], c[1], c[2], c[3], c[4], c[5]]);
    });
  });

  return result;
}

/**
 * 1️⃣ 接收與讀取處理 (doGet / doPost)
 */
function doGet(e) {
  try {
    var ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();
    var fundDataList = [];

    var uploadTimeSheet = ss.getSheetByName("最新上傳時間");
    var latestUploadTime = "";
    if (uploadTimeSheet) {
      try {
        var val = uploadTimeSheet.getRange(2, 1).getDisplayValue();
        if (val) {
          latestUploadTime = String(val).trim();
        }
      } catch (eTime) {}
    }

    sheets.forEach(function(sheet) {
      var name = sheet.getName();
      if (name.indexOf("基金明細_") === 0) {
        var fundCode = name.replace("基金明細_", "");
        var lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          var numCols = Math.max(sheet.getLastColumn(), 6);
          var values = sheet.getRange(2, 1, lastRow - 1, numCols).getDisplayValues();
          var periodMap = {};

          values.forEach(function(row) {
            var dateStr = parseAndFormatDate(row[0]);
            var stockName = String(row[1] || '').trim();
            var priceStr = '-';
            var mvStr = '-';
            var sharesStr = '0';
            var ratioStr = '0%';

            if (row.length >= 6) {
              priceStr = String(row[2] || '').trim();
              mvStr = String(row[3] || '').trim();
              sharesStr = String(row[4] || '').trim();
              ratioStr = String(row[5] || '').trim();
            } else if (row.length === 5) {
              priceStr = String(row[2] || '').trim();
              sharesStr = String(row[3] || '').trim();
              ratioStr = String(row[4] || '').trim();
            } else {
              sharesStr = String(row[2] || '').trim();
              ratioStr = String(row[3] || '').trim();
            }

            if (dateStr && stockName) {
              if (!periodMap[dateStr]) {
                periodMap[dateStr] = [];
              }
              var stockKey = extractStockKey(stockName);
              var existsIdx = periodMap[dateStr].findIndex(function(item) {
                return extractStockKey(item.stockName) === stockKey;
              });

              var sharesNum = parseFloat(sharesStr.replace(/,/g, '')) || 0;
              var formattedRatioStr = parseAndFormatRatio(ratioStr);
              var ratioNum = parseFloat(formattedRatioStr.replace('%', '')) || 0;
              var priceNum = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || undefined;
              var rawMv = parseFloat(mvStr.replace(/[^0-9.]/g, ''));
              var mvNum = rawMv ? (rawMv * 10000) : (priceNum && sharesNum ? priceNum * sharesNum : undefined);

              var holdingItem = {
                id: fundCode + '_' + stockName,
                stockName: stockName,
                price: priceNum,
                marketValue: mvNum,
                shares: sharesNum,
                sharesFormatted: sharesStr || sharesNum.toLocaleString(),
                ratio: ratioNum,
                date: dateStr
              };

              if (existsIdx >= 0) {
                periodMap[dateStr][existsIdx] = holdingItem;
              } else {
                periodMap[dateStr].push(holdingItem);
              }
            }
          });

          var snapshots = [];
          Object.keys(periodMap).forEach(function(d) {
            snapshots.push({
              date: d,
              asOfDate: d,
              holdings: periodMap[d]
            });
          });

          snapshots.sort(function(a, b) {
            var dA = new Date(a.date.split("/").join("-")).getTime() || 0;
            var dB = new Date(b.date.split("/").join("-")).getTime() || 0;
            return dB - dA;
          });

          fundDataList.push({
            code: fundCode,
            sheetName: name,
            periods: Object.keys(periodMap),
            snapshots: snapshots
          });
        }
      }
    });

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      latestUploadTime: latestUploadTime,
      count: fundDataList.length,
      data: fundDataList
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === "read") {
      return doGet(e);
    }
    var fundList = data.fundDataList || [];
    var ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    
    var now = new Date();
    var cutoffTime = now.getTime() - (60 * 24 * 60 * 60 * 1000); // 60天前

    fundList.forEach(function(item) {
      var code = item.code || "UNKNOWN";
      var asOfDate = parseAndFormatDate(item.asOfDate || Utilities.formatDate(now, "Asia/Taipei", "yyyy/MM/dd"));
      var holdings = item.holdings || [];

      var sheetName = "基金明細_" + code.replace(".TW", "");
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }

      var existingRows = [];
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      if (lastRow > 1 && lastCol > 0) {
        existingRows = sheet.getRange(2, 1, lastRow - 1, Math.max(lastCol, 6)).getDisplayValues();
      }

      // 1. 過濾並標準化舊資料：若日期與目前寫入的 asOfDate 相同則先排除，以新推送之完整持股為準
      var normalizedExisting = existingRows.filter(function(row) {
        var rowDateStr = parseAndFormatDate(row[0]);
        return rowDateStr !== asOfDate;
      }).map(function(row) {
        var d = parseAndFormatDate(row[0]);
        var name = String(row[1] || '').trim();
        var price = '-';
        var mv = '-';
        var shares = '0';
        var ratio = '0%';

        if (row.length >= 6) {
          price = row[2] || '-';
          mv = formatMvDisplay(row[3]);
          shares = row[4] || '0';
          ratio = parseAndFormatRatio(row[5] || '0%');
        } else if (row.length === 5) {
          price = row[2] || '-';
          mv = formatMvDisplay(row[3]);
          shares = row[4] || '0';
          ratio = parseAndFormatRatio(row[5] || '0%');
        } else if (row.length >= 3) {
          shares = row[2] || '0';
          ratio = parseAndFormatRatio(row[3] || '0%');
        }
        return [d, name, price, mv, shares, ratio];
      });

      // 2. 建立新資料列 (嚴格保證 6 個欄位與去重比對)
      var newRows = holdings.slice(0, 20).map(function(h) {
        var priceDisplay = h.price ? Number(h.price) : "-";
        var sharesNum = Number(h.shares) || 0;
        var mv = h.marketValue || (h.price ? (Number(h.price) * sharesNum) : 0);
        var mvDisplay = formatMvDisplay(mv);
        var ratioFormatted = parseAndFormatRatio(h.ratio);

        return [
          asOfDate,
          h.stockName || h.name || '',
          priceDisplay,
          mvDisplay,
          h.sharesFormatted || (sharesNum ? sharesNum.toLocaleString() : "0"),
          ratioFormatted
        ];
      });

      // 3. 合併與過濾 60 天前舊資料，並執行徹底去重 (deduplicateAndCleanRows)
      var combinedRows = normalizedExisting.concat(newRows);
      var cleanedRows = combinedRows.filter(function(row) {
        var dStr = parseAndFormatDate(row[0]);
        if (!dStr) return false;
        var rDate = new Date(dStr.split("/").join("-"));
        if (isNaN(rDate.getTime())) return true;
        return rDate.getTime() >= cutoffTime;
      });

      var deduplicatedRows = deduplicateAndCleanRows(cleanedRows);

      // 4. 依日期降冪排序
      deduplicatedRows.sort(function(a, b) {
        var dA = new Date(parseAndFormatDate(a[0]).split("/").join("-")).getTime() || 0;
        var dB = new Date(parseAndFormatDate(b[0]).split("/").join("-")).getTime() || 0;
        return dB - dA;
      });

      // 5. 確保每一列都是長度為 6 的陣列
      var finalRows = deduplicatedRows.map(function(r) {
        return [
          parseAndFormatDate(r[0]),
          r[1] || '',
          r[2] || '-',
          formatMvDisplay(r[3]),
          r[4] || '0',
          parseAndFormatRatio(r[5] || '0%')
        ];
      });

      // 6. 清空重寫並設定完整的 6 個欄位標題與純文字日期格式，刪除多餘舊列
      sheet.clearContents();
      sheet.getRange(1, 1, 1, 6).setValues([["日期", "個股名稱", "目前股價", "持股市值(萬)", "投資股數", "比例(%)"]]);
      sheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#EFEFEF");

      if (finalRows.length > 0) {
        sheet.getRange(2, 1, finalRows.length, 6).setValues(finalRows);
        sheet.getRange(2, 1, finalRows.length, 1).setNumberFormat("@");
        sheet.getRange(2, 4, finalRows.length, 1).setNumberFormat("@");
        sheet.autoResizeColumns(1, 6);
      }

      var maxRowNow = sheet.getLastRow();
      var expectedMaxRow = finalRows.length + 1;
      if (maxRowNow > expectedMaxRow && maxRowNow > 1) {
        try {
          sheet.deleteRows(expectedMaxRow + 1, maxRowNow - expectedMaxRow);
        } catch (e) {}
      }
    });

    if (data.uploadedAt) {
      var timeSheet = ss.getSheetByName("最新上傳時間");
      if (!timeSheet) {
        timeSheet = ss.insertSheet("最新上傳時間");
      }
      timeSheet.clearContents();
      timeSheet.getRange(1, 1, 1, 1).setValues([["最新APP推送時間"]]).setFontWeight("bold").setBackground("#EFEFEF");
      timeSheet.getRange(2, 1, 1, 1).setValues([[data.uploadedAt]]).setNumberFormat("@");
      timeSheet.autoResizeColumns(1, 1);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      latestUploadTime: data.uploadedAt || "",
      message: "成功接收 APP 推送資料並已自動完成重複紀錄徹底清理 (含 6 欄與 8.44% 格式化)"
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 2️⃣ 自動排程觸發器設定 ( setupDailyTrigger )
 */
function setupDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === "updateFundDetails") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("updateFundDetails")
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(0)
    .inTimezone("Asia/Taipei")
    .create();
  
  Logger.log("✅ 每日 08:00 自動對比更新持股明細之觸發器設定完成！");
}

/**
 * 3️⃣ 備用: 由腳本獨立抓取 MoneyDJ 持股明細 (包含目前股價與市值)
 */
function updateFundDetails() {
  var fundCodes = ${JSON.stringify(codesList)};
  var ss;
  try {
    ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  
  var now = new Date();
  var cutoffTime = now.getTime() - (60 * 24 * 60 * 60 * 1000);

  fundCodes.forEach(function(code) {
    var sheetName = "基金明細_" + code.replace(".TW", "");
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    var existingRows = [];
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow > 1 && lastCol > 0) {
      existingRows = sheet.getRange(2, 1, lastRow - 1, Math.max(lastCol, 6)).getDisplayValues();
    }
    
    try {
      var isETF = code.indexOf(".TW") !== -1 || code.indexOf("00") === 0;
      var url = isETF 
        ? "https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid=" + code
        : "https://www.moneydj.com/funddj/yp/yp013000.djhtm?a=" + code;

      var response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });
      
      var html = response.getContentText("UTF-8");
      var dateMatch = html.match(/(?:資料日期|截至日期|明細日期)[：:\\s]*(\\d{4}[\\/\\.-]\\d{1,2}[\\/\\.-]\\d{1,2})/);
      var rawDate = dateMatch ? dateMatch[1] : Utilities.formatDate(now, "Asia/Taipei", "yyyy/MM/dd");
      var asOfDate = parseAndFormatDate(rawDate);
      
      var newRows = [];
      var trRegex = /<tr[^>]*>([\\s\\S]*?)<\\/tr>/gi;
      var match;
      
      while ((match = trRegex.exec(html)) !== null) {
        var trContent = match[1];
        var tdRegex = /<td[^>]*>([\\s\\S]*?)<\\/td>/gi;
        var tds = [];
        var tdMatch;
        while ((tdMatch = tdRegex.exec(trContent)) !== null) {
          var cleanTd = tdMatch[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim();
          tds.push(cleanTd);
        }
        
        if (tds.length >= 3) {
          var name = tds[0];
          var shares = tds[1];
          var ratio = parseAndFormatRatio(tds[2]);
          
          if (name && !name.includes("股票名稱") && !name.includes("項目") && !name.includes("合計")) {
            newRows.push([asOfDate, name, "-", "-", shares, ratio]);
          }
        }
      }
      
      if (newRows.length > 20) {
        newRows = newRows.slice(0, 20);
      }

      var normalizedExisting = existingRows.filter(function(row) {
        return parseAndFormatDate(row[0]) !== asOfDate;
      }).map(function(row) {
        var d = parseAndFormatDate(row[0]);
        var name = String(row[1] || '').trim();
        var price = '-';
        var mv = '-';
        var shares = '0';
        var ratio = '0%';

        if (row.length >= 6) {
          price = row[2] || '-';
          mv = row[3] || '-';
          shares = row[4] || '0';
          ratio = parseAndFormatRatio(row[5] || '0%');
        } else if (row.length === 5) {
          price = row[2] || '-';
          shares = row[3] || '0';
          ratio = parseAndFormatRatio(row[4] || '0%');
        } else if (row.length >= 3) {
          shares = row[2] || '0';
          ratio = parseAndFormatRatio(row[3] || '0%');
        }
        return [d, name, price, mv, shares, ratio];
      });

      var combinedRows = normalizedExisting.concat(newRows);
      var cleanedRows = combinedRows.filter(function(row) {
        var dStr = parseAndFormatDate(row[0]);
        if (!dStr) return false;
        var rDate = new Date(dStr.split("/").join("-"));
        if (isNaN(rDate.getTime())) return true;
        return rDate.getTime() >= cutoffTime;
      });

      var deduplicatedRows = deduplicateAndCleanRows(cleanedRows);

      deduplicatedRows.sort(function(a, b) {
        var dA = new Date(parseAndFormatDate(a[0]).split("/").join("-")).getTime() || 0;
        var dB = new Date(parseAndFormatDate(b[0]).split("/").join("-")).getTime() || 0;
        return dB - dA;
      });

      var finalRows = deduplicatedRows.map(function(r) {
        return [
          parseAndFormatDate(r[0]),
          r[1] || '',
          r[2] || '-',
          formatMvDisplay(r[3]),
          r[4] || '0',
          parseAndFormatRatio(r[5] || '0%')
        ];
      });

      sheet.clearContents();
      sheet.getRange(1, 1, 1, 6).setValues([["日期", "個股名稱", "目前股價", "持股市值(萬)", "投資股數", "比例(%)"]]);
      sheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#EFEFEF");

      if (finalRows.length > 0) {
        sheet.getRange(2, 1, finalRows.length, 6).setValues(finalRows);
        sheet.getRange(2, 1, finalRows.length, 1).setNumberFormat("@");
        sheet.getRange(2, 4, finalRows.length, 1).setNumberFormat("@");
        sheet.autoResizeColumns(1, 6);
      }

      var maxRowNow = sheet.getLastRow();
      var expectedMaxRow = finalRows.length + 1;
      if (maxRowNow > expectedMaxRow && maxRowNow > 1) {
        try {
          sheet.deleteRows(expectedMaxRow + 1, maxRowNow - expectedMaxRow);
        } catch (e) {}
      }
    } catch(e) {
      Logger.log("❌ 擷取 " + code + " 錯誤: " + e.toString());
    }
  });
}
`;
}
