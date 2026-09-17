/**
 * 日期驗證與標準化工具
 * 規則：若匯入的日期不是正確日期，就省略那些資料。
 */

/**
 * 檢查是否為真實合法的日曆日期 (考慮各月份天數與閏年 2 月)
 */
function isValidCalendarDay(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2050) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;

  // 各月最大天數 (非閏年)
  const daysInMonth = [31, (isLeapYear(year) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * 驗證並標準化日期為 YYYY/MM/DD
 * 若不是正確日期 (如標題文字「日期」、無效月份如 13月、無效天數如 2月30日、非日期字串等)，一律回傳 null (予以省略)。
 */
export function validateAndNormalizeDate(input: any): string | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().replace(/^["']|["']$/g, '');
  if (!raw || raw.length < 5) return null;

  // 排除純非日期中英文字或常見表頭
  if (/^(日期|date|股票|代號|名稱|比例|股數|nav|淨值|權重|市值)/i.test(raw)) {
    return null;
  }

  // 處理 ISO 8601 或含時間戳記 (例如 2026-08-05T00:00:00 or 2026/08/05 18:00)
  const cleanDateStr = raw.split(/[T\s]/)[0].trim();

  // 1. 民國年格式：例如 113/08/05 或 113-8-5 或 113.8.5 或 113年8月5日
  const rocMatch = cleanDateStr.match(/^(\d{2,3})[/\-.\u5e74](\d{1,2})[/\-.\u6708](\d{1,2})\u65e5?$/);
  if (rocMatch) {
    const rocYear = parseInt(rocMatch[1], 10);
    if (rocYear >= 90 && rocYear <= 150) {
      const ceYear = rocYear + 1911;
      const month = parseInt(rocMatch[2], 10);
      const day = parseInt(rocMatch[3], 10);
      if (isValidCalendarDay(ceYear, month, day)) {
        return `${ceYear}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
      }
      return null;
    }
  }

  // 2. 西元年格式：例如 2026/08/05, 2026-8-5, 2026.08.05, 2026年8月5日
  const ceMatch = cleanDateStr.match(/^(\d{4})[/\-.\u5e74](\d{1,2})[/\-.\u6708](\d{1,2})\u65e5?$/);
  if (ceMatch) {
    const year = parseInt(ceMatch[1], 10);
    const month = parseInt(ceMatch[2], 10);
    const day = parseInt(ceMatch[3], 10);
    if (isValidCalendarDay(year, month, day)) {
      return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    }
    return null;
  }

  // 3. 嘗試以 Date 物件解析 (針對其他標準瀏覽器格式)
  const parsed = new Date(cleanDateStr);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = parsed.getMonth() + 1;
    const d = parsed.getDate();
    if (isValidCalendarDay(y, m, d)) {
      return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
    }
  }

  return null;
}
