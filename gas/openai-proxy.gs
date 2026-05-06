/**
 * SST&C Marketing Hub - OpenAI proxy for Google Apps Script.
 *
 * Setup:
 * 1. Apps Script > Project Settings > Script properties
 * 2. Add OPENAI_API_KEY = your OpenAI API key
 * 3. Optional: add OPENAI_MODEL = gpt-5.2
 * 4. Deploy > New deployment > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 */

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var result = generateAdCopy_(body);
    return json_(result);
  } catch (err) {
    return json_({
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}

function doGet() {
  return json_({
    ok: true,
    service: 'sstc-openai-proxy',
    message: 'SST&C AI proxy is running. Use POST from Ad Studio.'
  });
}

function generateAdCopy_(body) {
  var key = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY is not set in Script properties.');

  var model = PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || 'gpt-5.2';
  var prompt = buildPrompt_(body);

  var payload = {
    model: model,
    input: [
      {
        role: 'developer',
        content: [
          'You are a senior Taiwan fashion e-commerce copywriter for SST&C and ARVOpm.',
          'Write polished, usable paid-ad copy in Traditional Chinese.',
          'Avoid exaggerated claims, fake urgency, and excessive punctuation.',
          'For Facebook fields, respect the approximate limits from the user payload.',
          'Return JSON only. Do not wrap it in Markdown.'
        ].join('\n')
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'sstc_ad_copy_options',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            options: {
              type: 'array',
              minItems: 5,
              maxItems: 5,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  copy: { type: 'string' },
                  headline: { type: 'string' },
                  desc: { type: 'string' }
                },
                required: ['copy', 'headline', 'desc']
              }
            }
          },
          required: ['options']
        }
      }
    }
  };

  var res = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + key
    },
    payload: JSON.stringify(payload)
  });

  var status = res.getResponseCode();
  var text = res.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error('OpenAI API error ' + status + ': ' + text);
  }

  var data = JSON.parse(text);
  var outputText = data.output_text || extractOutputText_(data);
  var parsed = JSON.parse(outputText);

  return {
    ok: true,
    options: normalizeOptions_(parsed.options || [])
  };
}

function buildPrompt_(body) {
  var brand = body.brand || 'SST&C';
  var tool = body.tool || 'fb-single';
  var c = body.campaign || {};
  var products = body.products || [];
  var url = body.url || '';

  var profile = brand === 'ARVOpm'
    ? 'ARVOpm 是 SST&C 旗下較年輕、輕正式、帶午後都會感的女裝品牌。語氣可以更輕盈，但仍要有質感。'
    : 'SST&C 代表 Style, Selection, Taste & Culture。客群重視剪裁、質感、場合感、耐穿度，常見情境是通勤、聚會、假日與正式休閒轉換。';

  var productText = products.length
    ? products.map(function (p, i) {
        return (i + 1) + '. ' + (p.name || '') + (p.price ? ' / ' + p.price : '') + (p.url ? ' / ' + p.url : '');
      }).join('\n')
    : '目前尚未指定商品，請以活動主題與品牌調性撰寫。';

  return [
    '請為以下廣告工具產生 5 組可直接使用的候選文案。',
    '',
    '工具：' + tool,
    '品牌：' + brand,
    '品牌背景：' + profile,
    '',
    '活動資料：',
    '- 活動代碼：' + (c.id || ''),
    '- 活動名稱：' + (c.name || ''),
    '- 期間：' + (c.start || '') + ' ~ ' + (c.end || ''),
    '- 折扣：' + ((c.discType || '') + ' ' + (c.discNum || '')).trim(),
    '- 摘要：' + (c.summary || ''),
    '- 行銷方向：' + ([c.mktgCopy, c.mktgAd, c.mktgEdm, c.mktgNote].filter(Boolean).join(' / ') || ''),
    '- 目標網址：' + url,
    '',
    '商品列表：',
    productText,
    '',
    '輸出規則：',
    '- 必須回傳 JSON：{"options":[{"copy":"...","headline":"...","desc":"..."}]}',
    '- options 剛好 5 組。',
    '- copy 是主要文案 Primary Text，可以分行，語氣要自然，像品牌真的會投放的廣告。',
    '- headline 是標題。FB 單圖約 20 字內；FB 目錄約 40 字內。',
    '- desc 是連結說明。FB 單圖約 15 字內；FB 目錄約 30 字內。',
    '- 不要使用驚嘆號，不要用過度廉價或誇張的促銷語。',
    '- 不要編造不存在的商品材質、價格或庫存。'
  ].join('\n');
}

function extractOutputText_(data) {
  var out = data && data.output;
  if (!out || !out.length) throw new Error('OpenAI response has no output.');
  var parts = [];
  out.forEach(function (item) {
    (item.content || []).forEach(function (content) {
      if (content.text) parts.push(content.text);
    });
  });
  if (!parts.length) throw new Error('OpenAI response has no text output.');
  return parts.join('\n');
}

function normalizeOptions_(options) {
  var clean = options.filter(Boolean).slice(0, 5).map(function (o) {
    return {
      copy: String(o.copy || '').trim(),
      headline: String(o.headline || '').trim(),
      desc: String(o.desc || '').trim()
    };
  });
  while (clean.length < 5) {
    clean.push({ copy: '', headline: '', desc: '' });
  }
  return clean;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
