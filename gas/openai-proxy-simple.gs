function doGet() {
  var params = arguments[0] && arguments[0].parameter ? arguments[0].parameter : {};
  if (params.payload) {
    var callback = params.callback || 'callback';
    try {
      var body = JSON.parse(params.payload || '{}');
      var result = handleRequest(body);
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
    return jsonOutput(handleRequest(body));
  } catch (err) {
    return jsonOutput({
      ok: false,
      error: err.message || String(err)
    });
  }
}

function handleRequest(body) {
  if (body && body.mode === 'analytics') {
    return generateAnalytics(body);
  }
  return generateCopy(body);
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

function generateAnalytics(body) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  var model = PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || 'gpt-5-mini';

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  var metrics = body.metrics || {};
  var topAds = JSON.stringify((body.topAds || []).slice(0, 10));
  var topSources = JSON.stringify((body.topSources || []).slice(0, 10));
  var section = body.section || 'overall';
  var instruction = body.instruction || '';
  var prompt = [
    'Analyze this Taiwan fashion e-commerce marketing performance data.',
    'Write in Traditional Chinese.',
    'Be practical and specific. Do not overclaim.',
    'Focus on: performance summary, risks, opportunities, audience segmentation, budget actions, next experiments.',
    'If section-level data is provided, first understand the global context, then analyze the selected section.',
    '',
    'Section:',
    section,
    '',
    'Extra instruction:',
    instruction,
    '',
    'Metrics:',
    JSON.stringify(metrics),
    '',
    'Top ads:',
    topAds,
    '',
    'Top sources:',
    topSources,
    '',
    'Return a concise report with these sections:',
    '1. Overall finding',
    '2. What is working',
    '3. What needs attention',
    '4. Audience suggestions',
    '5. Budget and creative next steps'
  ].join('\n');

  var payload = {
    model: model,
    input: [
      {
        role: 'developer',
        content: 'You are a senior performance marketing analyst for SST&C and ARVOpm. Write clear Traditional Chinese recommendations.'
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
  return {
    ok: true,
    analysis: getOutputText(data)
  };
}

function buildPrompt(body) {
  var brand = body.brand || 'SST&C';
  var tool = body.tool || 'fb-single';
  var campaign = body.campaign || {};
  var products = body.products || [];
  var discountText = formatDiscount(campaign.discType, campaign.discNum);

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
    'Discount: ' + discountText,
    'Summary: ' + (campaign.summary || ''),
    'Marketing direction: ' + ([campaign.mktgCopy, campaign.mktgAd, campaign.mktgEdm, campaign.mktgNote].filter(Boolean).join(' / ') || ''),
    'Landing URL: ' + (body.url || ''),
    '',
    'Products:',
    productLines,
    '',
    toolRules(tool),
    '',
    'Return JSON only. Do not use Markdown. Format:',
    '{"options":[{"copy":"primary text","headline":"headline","desc":"link description"}]}',
    '',
    'Rules:',
    '1. options must contain exactly 5 items.',
    '2. copy should be natural Traditional Chinese and ready to use in an ad.',
    '3. headline should be a complete usable ad headline, not a data fragment.',
    '4. desc should be a complete usable description, not a data fragment.',
    '5. Do not use exclamation marks.',
    '6. Do not invent product materials, prices, inventory, or benefits that are not provided.'
  ].join('\n');
}

function formatDiscount(type, num) {
  var label = type || '';
  var n = Number(num);
  if (!isNaN(n) && n > 0) {
    if (n > 0 && n <= 1) {
      label += ' ' + Math.round(n * 100) + ' percent-off-style discount';
    } else {
      label += ' ' + n;
    }
  }
  return label.trim() || 'No discount details provided';
}

function toolRules(tool) {
  if (tool === 'google-pmax-long-headline') {
    return [
      'This request is for Google PMAX Long Headline.',
      'For every option:',
      '- Put the long headline in headline.',
      '- headline must be 18 to 45 Traditional Chinese characters when possible.',
      '- copy can briefly explain the angle behind the headline.',
      '- desc can be a short supporting line.',
      '- Avoid numeric fragments such as "0.71" or "male 5980 female 5580". Convert campaign data into polished language.',
      '- Write a complete polished headline about curated seasonal styling, wardrobe refresh, commuting, gatherings, or smart-casual outfits.'
    ].join('\n');
  }
  if (tool === 'google-pmax-description') {
    return [
      'This request is for Google PMAX Descriptions.',
      'For every option:',
      '- Put the description in desc.',
      '- desc must be 25 to 45 Traditional Chinese characters when possible.',
      '- headline can be a short reference headline.',
      '- copy can briefly explain the angle behind the description.',
      '- Avoid numeric fragments. Write complete ad-ready sentences.',
      '- Write a complete polished description about curated seasonal styling, wardrobe refresh, commuting, gatherings, or smart-casual outfits.'
    ].join('\n');
  }
  if (tool === 'fb-catalog') {
    return [
      'This request is for Facebook Catalog Ads.',
      'Use selected products when available, but do not merely list product names.',
      'headline should be around 20 to 40 Traditional Chinese characters.',
      'desc should be around 12 to 30 Traditional Chinese characters.'
    ].join('\n');
  }
  return [
    'This request is for Facebook Single Image Ads.',
    'headline should be around 12 to 20 Traditional Chinese characters.',
    'desc should be around 8 to 15 Traditional Chinese characters.',
    'copy can use line breaks and should feel like a real paid social ad.'
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
