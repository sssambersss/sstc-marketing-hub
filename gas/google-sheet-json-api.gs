/*
 * SSTC Google Sheet JSON API
 *
 * Paste this file into each Google Sheet Apps Script project.
 *
 * Deploy:
 * - Type: Web app
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Test:
 * WEB_APP_URL?callback=test
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
  var rawSheets = {};

  ss.getSheets().forEach(function (sheet) {
    var values = sheet.getDataRange().getValues();
    var name = sheet.getName();
    rawSheets[name] = normalizeMatrix_(values);

    if (!values || !values.length) {
      sheets[name] = [];
      return;
    }

    var headerRowIndex = findHeaderRow_(values);
    var headers = buildHeaders_(values[headerRowIndex] || []);
    var rows = [];

    for (var r = headerRowIndex + 1; r < values.length; r++) {
      var row = values[r];
      if (isBlankRow_(row)) continue;

      var obj = {};
      for (var c = 0; c < headers.length; c++) {
        var key = headers[c];
        if (!key) continue;
        obj[key] = normalizeCell_(row[c]);
      }
      rows.push(obj);
    }

    sheets[name] = rows;
  });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceFile: ss.getName(),
    spreadsheetId: ss.getId(),
    sheets: sheets,
    rawSheets: rawSheets
  };
}

function normalizeMatrix_(values) {
  return (values || []).map(function (row) {
    return row.map(function (cell) {
      return normalizeCell_(cell);
    });
  });
}

function buildHeaders_(row) {
  var used = {};
  return row.map(function (cell, index) {
    var key = String(cell || '').trim();
    if (!key) key = 'col_' + (index + 1);
    key = key.replace(/\s+/g, ' ');

    if (!used[key]) {
      used[key] = 1;
      return key;
    }

    used[key] += 1;
    return key + '_' + used[key];
  });
}

function findHeaderRow_(values) {
  var bestIndex = 0;
  var bestScore = -1;

  for (var i = 0; i < Math.min(values.length, 30); i++) {
    var row = values[i] || [];
    var nonBlank = 0;
    var textScore = 0;

    row.forEach(function (cell) {
      var text = String(cell || '').trim();
      if (!text) return;
      nonBlank += 1;
      if (/[A-Za-z]/.test(text)) textScore += 1;
      if (/[\u4e00-\u9fff]/.test(text)) textScore += 1;
      if (/ROAS|CTR|CPC|Campaign|Content|name|sent|click|date|source|medium/i.test(text)) textScore += 3;
    });

    var score = nonBlank + textScore;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function isBlankRow_(row) {
  return (row || []).every(function (cell) {
    return cell === '' || cell === null || typeof cell === 'undefined';
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
