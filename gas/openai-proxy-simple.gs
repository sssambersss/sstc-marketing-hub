function doGet() {
  var params = arguments[0] && arguments[0].parameter ? arguments[0].parameter : {};
  if (params.payload) {
    var callback = params.callback || 'callback';
    try {
      var body = JSON.parse(params.payload || '{}');
      var result = generateCopy(body);
      return jsOutput(callback + '(' + JSON.stringify(result) + ');');
    } catch (err) {
      return jsOutput(callback + '(' + JSON.stringify({
        ok: false,
        error: err.message || String(err)
      }) + ');');
    }
  }

  return jsonOutput({
    ok: true,
    service: 'sstc-openai-proxy',
    message: 'AI proxy is running'
  });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    return jsonOutput(generateCopy(body));
  } catch (err) {
    return jsonOutput({
      ok: false,
      error: err.message || String(err)
    });
  }
}

function generateCopy(body) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  var model = PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || 'gpt-5.2';

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  var prompt = buildPrompt(body);
  var payload = {
    model: model,
    input: [
      {
        role: 'developer',
        content: 'You are a senior Taiwan fashion e-commerce ad copywriter for SST&C and ARVOpm. Write polished paid-ad copy in Traditional Chinese. Return JSON only.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  var response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var text = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error('OpenAI API error ' + status + ': ' + text);
  }

  var data = JSON.parse(text);
  var outputText = getOutputText(data);
  var parsed = JSON.parse(cleanJson(outputText));

  return {
    ok: true,
    options: normalizeOptions(parsed.options || [])
  };
}

function buildPrompt(body) {
  var brand = body.brand || 'SST&C';
  var tool = body.tool || 'fb-single';
  var campaign = body.campaign || {};
  var products = body.products || [];

  var brandProfile = brand === 'ARVOpm'
    ? 'ARVOpm is a younger, lighter smart-casual womenswear line under SST&C, with an urban afternoon mood.'
    : 'SST&C means Style, Selection, Taste and Culture. The audience values tailoring, fabric feel, occasion styling, durability, commuting, weekends, gatherings, and smart-casual transitions.';

  var productLines = products.length
    ? products.map(function (p, i) {
        return (i + 1) + '. ' + (p.name || '') + ' ' + (p.price || '') + ' ' + (p.url || '');
      }).join('\n')
    : 'No specific products selected.';

  return [
    'Generate 5 ad copy options in Traditional Chinese for Taiwan fashion e-commerce.',
    'Brand: ' + brand,
    'Brand profile: ' + brandProfile,
    'Ad tool: ' + tool,
    '',
    'Campaign data:',
    'Campaign ID: ' + (campaign.id || ''),
    'Campaign name: ' + (campaign.name || ''),
    'Campaign period: ' + (campaign.start || '') + ' ~ ' + (campaign.end || ''),
    'Discount: ' + ((campaign.discType || '') + ' ' + (campaign.discNum || '')).trim(),
    'Summary: ' + (campaign.summary || ''),
    'Marketing direction: ' + ([campaign.mktgCopy, campaign.mktgAd, campaign.mktgEdm, campaign.mktgNote].filter(Boolean).join(' / ') || ''),
    'Landing URL: ' + (body.url || ''),
    '',
    'Products:',
    productLines,
    '',
    'Return JSON only. Do not use Markdown. Format:',
    '{"options":[{"copy":"primary text","headline":"headline","desc":"link description"}]}',
    '',
    'Rules:',
    '1. options must contain exactly 5 items.',
    '2. copy should be natural Traditional Chinese and ready to use in an ad.',
    '3. headline should be short. For fb-single, around 20 Chinese characters. For fb-catalog, around 40 Chinese characters.',
    '4. desc should be short. For fb-single, around 15 Chinese characters. For fb-catalog, around 30 Chinese characters.',
    '5. Do not use exclamation marks.',
    '6. Do not invent product materials, prices, inventory, or benefits that are not provided.'
  ].join('\n');
}

function getOutputText(data) {
  if (data.output_text) {
    return data.output_text;
  }

  var parts = [];
  var output = data.output || [];
  output.forEach(function (item) {
    var content = item.content || [];
    content.forEach(function (part) {
      if (part.text) {
        parts.push(part.text);
      }
    });
  });

  if (!parts.length) {
    throw new Error('OpenAI response has no text');
  }

  return parts.join('\n');
}

function cleanJson(text) {
  var match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

function normalizeOptions(options) {
  var result = options.slice(0, 5).map(function (item) {
    return {
      copy: String(item.copy || '').trim(),
      headline: String(item.headline || '').trim(),
      desc: String(item.desc || '').trim()
    };
  });

  while (result.length < 5) {
    result.push({
      copy: '',
      headline: '',
      desc: ''
    });
  }

  return result;
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsOutput(text) {
  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
