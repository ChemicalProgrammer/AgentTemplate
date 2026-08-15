function listGeminiModels_(apiKey) {
  var models = [];
  var pageToken = '';
  var pageCount = 0;
  do {
    var query = '?pageSize=100' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    var response = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models' + query, {
      method: 'get',
      headers: {'x-goog-api-key': apiKey},
      muteHttpExceptions: true
    });
    var payload = safeJsonParse_(response.getContentText(), {});
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      throw new Error(extractGeminiError_(payload, response.getResponseCode()));
    }
    models = models.concat(payload.models || []);
    pageToken = String(payload.nextPageToken || '');
    pageCount++;
  } while (pageToken && pageCount < 10);

  var seen = {};
  return models.filter(function(model) {
    return (model.supportedGenerationMethods || []).indexOf('generateContent') !== -1;
  }).map(function(model) {
    var name = normalizeModel_(model.name);
    return {
      name: name,
      displayName: model.displayName || name,
      description: model.description || '',
      inputTokenLimit: Number(model.inputTokenLimit || 0),
      outputTokenLimit: Number(model.outputTokenLimit || 0),
      available: true
    };
  }).filter(function(model) {
    if (!model.name || seen[model.name]) return false;
    seen[model.name] = true;
    return true;
  }).sort(function(a, b) {
    var af = /flash/i.test(a.name) ? 0 : 1;
    var bf = /flash/i.test(b.name) ? 0 : 1;
    return af - bf || a.name.localeCompare(b.name);
  });
}

function testGeminiKey_(apiKey, preferredModel) {
  var models = listGeminiModels_(apiKey);
  if (!models.length) throw new Error('The key is valid, but it has no models compatible with generateContent.');
  var requested = normalizeModel_(preferredModel);
  var exact = models.filter(function(item) { return item.name === requested; })[0];
  var fallback = models.filter(function(item) { return /flash/i.test(item.name); })[0] || models[0];
  return {valid: true, model: (exact || fallback).name, models: models};
}

function generateWithGemini_(options) {
  options = options || {};
  var config = options.config || getUserGeminiConfig_();
  var model = normalizeModel_(options.model || config.model);
  var body = {
    systemInstruction: {parts: [{text: String(options.systemInstruction || '')}]},
    contents: options.contents || [],
    generationConfig: {
      temperature: options.temperature == null ? 0.35 : Number(options.temperature),
      maxOutputTokens: options.maxOutputTokens || 8192
    }
  };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {'x-goog-api-key': config.apiKey},
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var payload = safeJsonParse_(response.getContentText(), {});
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error(extractGeminiError_(payload, code));

  var candidate = payload.candidates && payload.candidates[0];
  var parts = candidate && candidate.content && candidate.content.parts || [];
  var text = parts.map(function(part) { return part.text || ''; }).join('').trim();
  if (!text) {
    var reason = candidate && candidate.finishReason ? ' Motivo: ' + candidate.finishReason : '';
    throw new Error('Gemini returned no content.' + reason);
  }
  return {text: text, model: model, usage: payload.usageMetadata || {}, raw: payload};
}

function extractGeminiError_(payload, code) {
  var message = payload && payload.error && payload.error.message;
  if (code === 401 || code === 403) return 'Gemini rejected the key or its permissions. ' + (message || '');
  if (code === 429) return 'The Gemini rate or quota limit was reached. Try again later.';
  return 'Gemini error (' + code + '): ' + (message || 'unrecognized response');
}
