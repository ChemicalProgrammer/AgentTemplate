/** Declarative JSON -> static HTML/SVG. No eval, client scripts or external libraries. */
var JTR_LIMITS = {tokens: 8000, depth: 12, arrayItems: 500, iterations: 10000, operations: 100000, output: 2 * 1024 * 1024, chartItems: 200, charts: 12, warnings: 40};

function renderJsonTemplateDocument_(html, data) {
  var state = {warnings: [], warningKeys: {}, iterations: 0, operations: 0, outputSize: 0, charts: 0};
  var raw = String(html || '');
  var scripts = (raw.match(/<\s*script\b/gi) || []).length;
  // Remove executable content BEFORE interpreting tokens (including JS token literals).
  var clean = sanitizeRenderedHtmlArtifact_(raw);
  var parsed = jtrParse_(clean);
  if (scripts && !parsed.bindings) {
    throw new Error('This HTML template requires JavaScript, which the viewer blocks. Replace its script-driven fields with renderer v2 fields, #each lists and chart directives. The JSON has not been changed.');
  }
  if (scripts) jtrWarn_(state, 'scripts_removed', '', 'Template scripts were removed. Only declarative fields, lists and charts are rendered; script-driven sections may be incomplete.');
  if (!parsed.bindings) jtrWarn_(state, 'no_bindings', '', 'This template has no data bindings other than an optional ARTIFACT_JSON dump. Its displayed values may be static.');
  var chunks = [];
  jtrRenderNodes_(parsed.nodes, {value: data, root: data, path: '', index: null}, state, chunks);
  var rendered = sanitizeRenderedHtmlArtifact_(chunks.join(''));
  // Keep diagnostics with exported HTML too; never present incomplete output silently.
  if (state.warnings.length) {
    var notice = '<aside role="note" style="font:13px/1.5 Arial,sans-serif;margin:12px;padding:12px 16px;border:1px solid #e5b957;border-radius:10px;background:#fff8e6;color:#664b0a"><strong>Presentation warnings / Avisos de visualización</strong><ul style="margin:6px 0 0;padding-left:20px">' + state.warnings.map(function(w) { return '<li>' + escapeJsonTemplateHtml_(w.message) + '</li>'; }).join('') + '</ul></aside>';
    rendered = rendered.replace(/<body\b[^>]*>/i, function(tag) { return tag + notice; });
  }
  if (rendered.length > JTR_LIMITS.output) throw new Error('The rendered HTML exceeds 2 MB. Reduce the template or split the report.');
  return {html: rendered, warnings: state.warnings, renderer: 'json-html-v2', stats: {bindings: parsed.bindings, iterations: state.iterations, charts: state.charts}};
}

function jtrWarn_(state, code, path, message) {
  var key = code + ':' + path;
  if (Object.prototype.hasOwnProperty.call(state.warningKeys, key)) return;
  state.warningKeys[key] = true;
  if (state.warnings.length < JTR_LIMITS.warnings) state.warnings.push({code: code, path: path, message: message});
  else if (state.warnings.length === JTR_LIMITS.warnings) state.warnings.push({code: 'more_warnings', path: '', message: 'Additional presentation warnings were omitted. Review the template and Raw JSON.'});
}

function jtrPathValid_(path) {
  if (!/^(?:this|@root|@index|@number|[A-Za-z0-9_-]+)(?:\.[A-Za-z0-9_-]+)*$/.test(path)) return false;
  return !path.split('.').some(function(key) { return key === '__proto__' || key === 'prototype' || key === 'constructor'; });
}

function jtrRequirePath_(path) {
  if (!jtrPathValid_(path)) throw new Error('Unsupported or unsafe template path: ' + String(path).slice(0, 100));
  return path;
}

function jtrParse_(html) {
  var nodes = [], stack = [{children: nodes, type: 'root'}], re = /\{\{([\s\S]*?)\}\}/g;
  var match, last = 0, tokens = 0, bindings = 0;
  while ((match = re.exec(html))) {
    if (++tokens > JTR_LIMITS.tokens) throw new Error('The template contains too many directives.');
    var current = stack[stack.length - 1];
    if (match.index > last) current.children.push({type: 'text', value: html.slice(last, match.index)});
    var token = match[1].trim();
    if (token.length > 1600 || token.indexOf('{') !== -1 || html.charAt(re.lastIndex) === '}') throw new Error('Unsupported template expression. Use double-brace fields, #each, #if or chart directives.');
    if (/^#/.test(token)) {
      var block = /^#(each|if)\s+(\S+)$/.exec(token);
      if (!block) throw new Error('Unsupported template block: ' + token.slice(0, 100));
      var node = {type: block[1], path: jtrRequirePath_(block[2]), children: [], alternate: []};
      current.children.push(node);
      if (stack.length >= JTR_LIMITS.depth) throw new Error('Template blocks may be nested at most 11 levels.');
      stack.push({type: node.type, node: node, children: node.children, hasElse: false});
      bindings++;
    } else if (token === 'else') {
      if (stack.length === 1 || current.hasElse) throw new Error('Unexpected or duplicate {{else}} in the template.');
      current.children = current.node.alternate; current.hasElse = true;
    } else if (token.charAt(0) === '/') {
      if (stack.length === 1 || token !== '/' + current.type) throw new Error('Mismatched template closing block: ' + token);
      stack.pop();
    } else {
      var expression = jtrParseExpression_(token);
      current.children.push(expression);
      if (expression.path !== 'ARTIFACT_JSON') bindings++;
    }
    last = re.lastIndex;
  }
  if (stack.length !== 1) throw new Error('Unclosed {{#' + stack[stack.length - 1].type + '}} block.');
  if (html.indexOf('{{', last) !== -1) throw new Error('Unclosed template directive.');
  if (last < html.length) nodes.push({type: 'text', value: html.slice(last)});
  return {nodes: nodes, bindings: bindings};
}

function jtrParseExpression_(token) {
  if (jtrPathValid_(token)) return {type: 'value', path: token};
  var number = /^number\s+(\S+)(?:\s+([0-6]))?$/.exec(token);
  if (number) return {type: 'number', path: jtrRequirePath_(number[1]), digits: Number(number[2] || 0)};
  var calculation = /^(difference|percent_change)\s+(\S+)\s+(\S+)(?:\s+([0-6]))?$/.exec(token);
  if (calculation) return {type: calculation[1], path: jtrRequirePath_(calculation[2]), other: jtrRequirePath_(calculation[3]), digits: Number(calculation[4] || 0)};
  var chart = /^chart\s+(\S+)([\s\S]*)$/.exec(token);
  if (chart) {
    var options = {type: 'line', label: 'machine', series: 'rated_speed,actual_speed', names: '', highlight: '', title: '', unit: ''};
    var rest = chart[2], item;
    while (rest.trim()) {
      item = /^\s+([a-z]+)="([^"<>\r\n]*)"/.exec(rest);
      if (!item || !Object.prototype.hasOwnProperty.call(options, item[1])) throw new Error('Invalid chart option. Use quoted type, label, series, names, highlight, title or unit options.');
      options[item[1]] = item[2]; rest = rest.slice(item[0].length);
    }
    if (options.type !== 'line' && options.type !== 'bar') throw new Error('Supported chart types: line and bar.');
    jtrRequirePath_(options.label);
    var series = options.series.split(',').map(function(x) { return jtrRequirePath_(x.trim()); });
    if (!series.length || series.length > 4) throw new Error('A chart requires one to four numeric series.');
    if (options.highlight) jtrRequirePath_(options.highlight);
    options.series = series;
    options.names = options.names ? options.names.split(',').map(function(x) { return x.trim(); }) : series;
    if (options.names.length !== series.length) throw new Error('Chart names must match the number of series.');
    return {type: 'chart', path: jtrRequirePath_(chart[1]), options: options};
  }
  throw new Error('Unsupported template expression: ' + token.slice(0, 120) + '. Use fields, #each, #if, number, difference, percent_change or chart.');
}

function jtrLookup_(context, path) {
  var parts = path.split('.'), head = parts[0], value = context.value;
  var resolvedPath = context.path;
  if (head === '@root' || head === 'ARTIFACT_JSON') { value = context.root; parts.shift(); resolvedPath = ''; }
  else if (head === 'this') { parts.shift(); }
  else if (head === '@index' || head === '@number') {
    value = context.index == null ? undefined : context.index + (head === '@number' ? 1 : 0);
    parts.shift(); resolvedPath = context.path + '.' + head;
  }
  for (var i = 0; i < parts.length; i++) {
    var key = parts[i];
    resolvedPath += (resolvedPath ? '.' : '') + key;
    value = value != null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
  }
  return {value: value, path: resolvedPath || path};
}

function jtrGet_(context, path, state, optional) {
  var result = jtrLookup_(context, path);
  if (!optional && result.value == null) jtrWarn_(state, 'missing', result.path, 'Missing or null JSON field: ' + result.path + '. No demonstration value was substituted.');
  return result;
}

function jtrEmit_(state, chunks, text) {
  text = String(text);
  state.outputSize += text.length;
  if (state.outputSize > JTR_LIMITS.output) throw new Error('The rendered HTML exceeds 2 MB. Reduce the number of rows or split the report.');
  chunks.push(text);
}

function jtrNumeric_(result, state) {
  if (typeof result.value === 'number' && isFinite(result.value)) return result.value;
  if (result.value != null) jtrWarn_(state, 'number', result.path, 'Expected a finite JSON number at ' + result.path + '; strings, booleans and empty values are not converted to zero.');
  return null;
}

function jtrRenderNodes_(nodes, context, state, chunks) {
  nodes.forEach(function(node) {
    if (++state.operations > JTR_LIMITS.operations) throw new Error('The template exceeded its rendering work limit. Reduce nested lists.');
    if (node.type === 'text') { jtrEmit_(state, chunks, node.value); return; }
    var lookup = jtrGet_(context, node.path, state, node.type === 'if');
    var value = lookup.value;
    if (node.type === 'each') {
      if (value != null && !Array.isArray(value)) jtrWarn_(state, 'array', lookup.path, 'Expected a JSON array at ' + lookup.path + '. The list was not rendered.');
      if (!Array.isArray(value) || !value.length) { jtrRenderNodes_(node.alternate, context, state, chunks); return; }
      if (value.length > JTR_LIMITS.arrayItems) throw new Error('A template list exceeds 500 items: ' + lookup.path);
      value.forEach(function(row, index) {
        if (++state.iterations > JTR_LIMITS.iterations) throw new Error('The template exceeded 10000 total list iterations.');
        jtrRenderNodes_(node.children, {value: row, root: context.root, path: lookup.path + '.' + index, index: index}, state, chunks);
      });
      return;
    }
    if (node.type === 'if') {
      var truthy = Boolean(value) && (!Array.isArray(value) || value.length > 0);
      jtrRenderNodes_(truthy ? node.children : node.alternate, context, state, chunks); return;
    }
    if (node.type === 'chart') { jtrEmit_(state, chunks, jtrChart_(lookup, node.options, state, context.root)); return; }
    if (node.type === 'number' || node.type === 'difference' || node.type === 'percent_change') {
      var first = jtrNumeric_(lookup, state), answer = first;
      if (node.type !== 'number') {
        var otherLookup = jtrGet_(context, node.other, state, false);
        var second = jtrNumeric_(otherLookup, state);
        answer = first == null || second == null ? null : first - second;
        if (node.type === 'percent_change') {
          if (second === 0) jtrWarn_(state, 'division_zero', otherLookup.path, 'Cannot calculate percent_change with a zero reference at ' + otherLookup.path + '.');
          answer = answer == null || second === 0 ? null : answer / second * 100;
        }
      }
      if (answer != null && !isFinite(answer)) { jtrWarn_(state, 'overflow', lookup.path, 'Numeric calculation is out of range at ' + lookup.path + '.'); answer = null; }
      jtrEmit_(state, chunks, answer == null ? '—' : answer.toFixed(node.digits)); return;
    }
    if (value == null) value = '';
    else if (typeof value === 'object') value = JSON.stringify(value, null, 2);
    jtrEmit_(state, chunks, escapeJsonTemplateHtml_(String(value)));
  });
}

function jtrChart_(lookup, options, state, rootData) {
  if (++state.charts > JTR_LIMITS.charts) throw new Error('A template may contain at most 12 charts.');
  var rows = lookup.value;
  var empty = '<div role="note" style="padding:18px;border:1px dashed #b7c6ce;border-radius:10px;color:#536471">Sin datos numéricos para el gráfico / No numeric chart data.</div>';
  if (!Array.isArray(rows)) { if (rows != null) jtrWarn_(state, 'array', lookup.path, 'Expected a JSON array for the chart at ' + lookup.path + '.'); return empty; }
  if (!rows.length) return empty;
  if (rows.length > JTR_LIMITS.chartItems) throw new Error('A chart exceeds 200 categories: ' + lookup.path + '. Split it into smaller charts.');
  var values = [], labels = [], highlight = [], all = [];
  rows.forEach(function(row, index) {
    var ctx = {value: row, root: rootData, path: lookup.path + '.' + index, index: index};
    var label = jtrGet_(ctx, options.label, state, false).value;
    labels.push(label == null ? 'Sin etiqueta' : String(label));
    var flag = options.highlight ? jtrGet_(ctx, options.highlight, state, false) : {value: false, path: ''};
    if (flag.value != null && typeof flag.value !== 'boolean') jtrWarn_(state, 'boolean', flag.path, 'Chart highlight requires a JSON boolean at ' + flag.path + '.');
    highlight.push(flag.value === true);
    values.push(options.series.map(function(path) {
      var number = jtrNumeric_(jtrGet_(ctx, path, state, false), state);
      if (number != null) all.push(number);
      return number;
    }));
  });
  if (!all.length) return empty;
  var low = Math.min.apply(null, [0].concat(all)), high = Math.max.apply(null, [0].concat(all));
  if (low === high) high = low + 1;
  if (!isFinite(high - low) || Math.max(Math.abs(low), Math.abs(high)) > 1e12 || (high - low) < 1e-9) throw new Error('Chart values are outside the supported plotting range at ' + lookup.path + '. Rescale the units.');
  var rough = (high - low) / 4, magnitude = Math.pow(10, Math.floor(Math.log(rough) / Math.LN10));
  var factor = rough / magnitude;
  var step = (factor <= 1 ? 1 : factor <= 2 ? 2 : factor <= 5 ? 5 : 10) * magnitude;
  low = Math.floor(low / step) * step; high = Math.ceil(high / step) * step;
  var width = Math.max(760, Math.min(2400, rows.length * 94 + 100)), height = 390;
  var left = 72, right = 30, top = 28, bottom = 102, plotW = width - left - right, plotH = height - top - bottom;
  function x(index) { return options.type === 'bar' ? left + plotW * (index + 0.5) / rows.length : rows.length === 1 ? left + plotW / 2 : left + plotW * index / (rows.length - 1); }
  function y(value) { return top + plotH * (high - value) / (high - low); }
  function n(value) { return Number(value).toFixed(2); }
  function esc(value) { return escapeJsonTemplateHtml_(String(value)); }
  function labelText(value) { return Math.abs(value) >= 1000000 || (value !== 0 && Math.abs(value) < 0.001) ? value.toExponential(1) : String(Number(value.toPrecision(6))); }
  var palette = ['#64748b', '#008c95', '#8854c0', '#cb681e'];
  var parts = ['<section style="margin:12px 0;font-family:Arial,sans-serif">'];
  if (options.title) parts.push('<h3 style="font-size:16px;margin:0 0 10px;color:#243b49">' + esc(options.title) + '</h3>');
  parts.push('<div style="overflow-x:auto"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(options.title || 'JSON chart') + '" style="display:block;width:100%;min-width:760px;background:#fff"><title>' + esc(options.title || 'JSON chart') + '</title>');
  parts.push('<desc>' + esc(options.names.join(', ') + (options.unit ? ' (' + options.unit + ')' : '') + '; ' + rows.length + ' categories. Missing numeric values are left as gaps.') + '</desc>');
  for (var tick = low, ti = 0; tick <= high + step / 100 && ti < 12; tick += step, ti++) {
    parts.push('<line x1="' + left + '" x2="' + (width - right) + '" y1="' + n(y(tick)) + '" y2="' + n(y(tick)) + '" stroke="#e1e8ed"/><text x="' + (left - 10) + '" y="' + n(y(tick) + 4) + '" text-anchor="end" font-size="11" fill="#617382">' + esc(labelText(tick)) + '</text>');
  }
  if (options.unit) parts.push('<text x="' + left + '" y="16" font-size="11" fill="#617382">' + esc(options.unit) + '</text>');
  var labelInterval = Math.ceil(rows.length / 24);
  labels.forEach(function(label, index) {
    if (index % labelInterval !== 0 && index !== rows.length - 1) return;
    var shortLabel = label.length > 22 ? label.slice(0, 21) + '…' : label;
    parts.push('<text transform="translate(' + n(x(index)) + ',' + (height - bottom + 18) + ') rotate(-35)" text-anchor="end" font-size="11" fill="#435969"><title>' + esc(label) + '</title>' + esc(shortLabel) + '</text>');
  });
  options.series.forEach(function(series, si) {
    if (options.type === 'line') {
      var segments = [], segment = [];
      values.forEach(function(row, index) { if (row[si] == null) { if (segment.length) segments.push(segment); segment = []; } else segment.push(n(x(index)) + ',' + n(y(row[si]))); });
      if (segment.length) segments.push(segment);
      segments.forEach(function(points) { parts.push('<polyline points="' + points.join(' ') + '" fill="none" stroke="' + palette[si] + '" stroke-width="3"' + (si === 0 && options.series.length > 1 ? ' stroke-dasharray="7 5"' : '') + '/>'); });
    }
    values.forEach(function(row, index) {
      var value = row[si]; if (value == null) return;
      var color = highlight[index] && si === options.series.length - 1 ? '#be3144' : palette[si];
      var tooltip = '<title>' + esc(labels[index] + ' · ' + options.names[si] + ': ' + value + (options.unit ? ' ' + options.unit : '')) + '</title>';
      if (options.type === 'bar') {
        var groupW = plotW / rows.length * 0.72, barW = groupW / options.series.length;
        parts.push('<rect x="' + n(x(index) - groupW / 2 + barW * si) + '" y="' + n(Math.min(y(0), y(value))) + '" width="' + n(Math.max(0.2, barW - 1)) + '" height="' + n(Math.abs(y(value) - y(0))) + '" fill="' + color + '">' + tooltip + '</rect>');
      } else parts.push('<circle cx="' + n(x(index)) + '" cy="' + n(y(value)) + '" r="4" fill="' + color + '" stroke="#fff" stroke-width="1.5">' + tooltip + '</circle>');
    });
  });
  parts.push('</svg></div><div style="display:flex;flex-wrap:wrap;gap:16px;font-size:12px;color:#526575;margin-top:6px">');
  options.names.forEach(function(name, index) { parts.push('<span><span style="color:' + palette[index] + ';font-weight:bold">●</span> ' + esc(name) + '</span>'); });
  if (highlight.some(function(flag) { return flag; })) parts.push('<span><span style="color:#be3144;font-weight:bold">●</span> ' + esc(options.highlight) + ' = true</span>');
  parts.push('</div></section>');
  return parts.join('');
}
