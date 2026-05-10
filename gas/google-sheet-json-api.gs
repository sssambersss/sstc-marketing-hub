/**
 * Google Sheet JSON API for SST&C Performance Dashboard.
 *
 * Put this script inside each Google Sheet:
 * - Normalized performance sheet
 * - Hodo vendor raw report sheet
 *
 * Deploy as Web app:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * The dashboard can read:
 *   WEB_APP_URL?callback=myCallback
 */

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var callback = params.callback || '';
  var payload = exportWorkbook_();
  var text = JSON.stringify(payload);

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + text + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}

function exportWorkbook_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = {};

  ss.getSheets().forEach(function (sheet) {
    var values = sheet.getDataRange().getValues();
    if (!values || !values.length) {
      sheets[sheet.getName()] = [];
      return;
    }

    var headerRowIndex = findHeaderRow_(values);
    var headers = values[headerRowIndex].map(function (h, i) {
      var key = String(h || '').trim();
      return key || ('__col_' + (i + 1));
    });

    var rows = [];
    for (var r = headerRowIndex + 1; r < values.length; r++) {
      var row = values[r];
      if (isBlankRow_(row)) continue;

      var obj = {};
      for (var c = 0; c < headers.length; c++) {
        var key = headers[c];
        if (!key || key.indexOf('__col_') === 0) continue;
        obj[key] = normalizeCell_(row[c]);
      }
      rows.push(obj);
    }

    sheets[sheet.getName()] = rows;
  });

  return {
    generatedAt: new Date().toISOString(),
    sourceFile: ss.getName(),
    spreadsheetId: ss.getId(),
    sheets: sheets
  };
}

function findHeaderRow_(values) {
  var bestIndex = 0;
  var bestScore = -1;
  var keywords = [
    '日期', '日期範圍', '品牌', '平台', '廣告名稱', '受眾名稱', '素材名稱',
    '曝光次數', '點擊次數', '花費', '購買金額', 'ROAS',
    '來源/媒介', 'Campaign', 'Content', '工作階段數',
    'name', 'sent_date', 'sent', 'clicks'
  ];

  for (var i = 0; i < Math.min(values.length, 20); i++) {
    var row = values[i].map(function (v) { return String(v || '').trim(); });
    var nonBlank = row.filter(Boolean).length;
    var score = nonBlank;
    keywords.forEach(function (k) {
      if (row.indexOf(k) >= 0) score += 5;
    });
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function isBlankRow_(row) {
  return row.every(function (v) {
    return v === '' || v === null || typeof v === 'undefined';
  });
}

function normalizeCell_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (typeof value === 'number') {
    return value;
  }
  if (value === null || typeof value === 'undefined') {
    return '';
  }
  return String(value).trim();
}
