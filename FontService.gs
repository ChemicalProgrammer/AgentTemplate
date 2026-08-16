/** Local font assets embedded from Drive so the interface needs no web-font request. */

var LOCAL_FONT_FAMILY = 'Comfortaa Local';
var LOCAL_FONT_CACHE_PREFIX = 'AGENT_CONSOLE_LOCAL_FONTS_V1_';
var LOCAL_FONT_CACHE_SECONDS = 6 * 60 * 60;
var LOCAL_FONT_CACHE_CHUNK_SIZE = 70000;
var LOCAL_FONT_MAX_BYTES = 2 * 1024 * 1024;

var LOCAL_FONT_STATIC_FILES = Object.freeze([
  {weight: '400', names: ['Comfortaa-Regular.woff2', 'Comfortaa-Regular.ttf', 'Comfortaa-Regular.otf']},
  {weight: '500', names: ['Comfortaa-Medium.woff2', 'Comfortaa-Medium.ttf', 'Comfortaa-Medium.otf']},
  {weight: '600', names: ['Comfortaa-SemiBold.woff2', 'Comfortaa-SemiBold.ttf', 'Comfortaa-SemiBold.otf']},
  {weight: '700', names: ['Comfortaa-Bold.woff2', 'Comfortaa-Bold.ttf', 'Comfortaa-Bold.otf']}
]);

var LOCAL_FONT_VARIABLE_FILES = Object.freeze([
  'Comfortaa-VariableFont_wght.woff2',
  'Comfortaa-VariableFont_wght.ttf',
  'Comfortaa-Variable.woff2',
  'Comfortaa-Variable.ttf'
]);

/**
 * Returns safe CSS for the initial HTML template. Font errors must never block
 * the application boot sequence; the design token fallbacks remain available.
 */
function getLocalFontCss_() {
  try {
    var folder = getLocalFontFolder_();
    if (!folder) return '';
    var selected = selectLocalFontFiles_(folder);
    if (!selected.length) return '';

    var fingerprint = localFontFingerprint_(selected);
    var cache = CacheService.getScriptCache();
    var cacheKey = LOCAL_FONT_CACHE_PREFIX + fingerprint;
    var cached = readChunkedFontCache_(cache, cacheKey);
    if (cached !== null) return cached;

    var css = selected.map(buildLocalFontFace_).filter(Boolean).join('\n');
    if (css) writeChunkedFontCache_(cache, cacheKey, css);
    return css;
  } catch (error) {
    console.warn('Local Comfortaa fonts could not be loaded: ' + readableErrorMessage_(error));
    return '';
  }
}

/** Finds Agent Console/_System/Fonts without creating folders during doGet. */
function getLocalFontFolder_() {
  var rootId = PropertiesService.getScriptProperties().getProperty(APP.PROP_ROOT_ID);
  if (!rootId) return null;
  var root = DriveApp.getFolderById(rootId);
  if (root.isTrashed()) return null;
  var systemFolder = getFirstFolderByName_(root, APP.SYSTEM_FOLDER);
  if (!systemFolder || systemFolder.isTrashed()) return null;
  var fontsFolder = getFirstFolderByName_(systemFolder, APP.FONTS_FOLDER);
  return fontsFolder && !fontsFolder.isTrashed() ? fontsFolder : null;
}

function selectLocalFontFiles_(folder) {
  var available = {};
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (file.isTrashed() || Number(file.getSize() || 0) > LOCAL_FONT_MAX_BYTES) continue;
    available[String(file.getName() || '').toLowerCase()] = file;
  }

  for (var i = 0; i < LOCAL_FONT_VARIABLE_FILES.length; i++) {
    var variable = available[LOCAL_FONT_VARIABLE_FILES[i].toLowerCase()];
    if (variable) return [{file: variable, weight: '300 700'}];
  }

  var selected = [];
  LOCAL_FONT_STATIC_FILES.forEach(function(spec) {
    for (var nameIndex = 0; nameIndex < spec.names.length; nameIndex++) {
      var file = available[spec.names[nameIndex].toLowerCase()];
      if (file) {
        selected.push({file: file, weight: spec.weight});
        break;
      }
    }
  });
  return selected;
}

function localFontFingerprint_(selected) {
  var signature = selected.map(function(item) {
    return [item.file.getId(), item.file.getName(), item.file.getSize(), item.file.getLastUpdated().getTime(), item.weight].join('|');
  }).join('||');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signature, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 32);
}

function buildLocalFontFace_(item) {
  var file = item.file;
  var extension = String(file.getName() || '').toLowerCase().split('.').pop();
  var format = extension === 'woff2' ? 'woff2' : (extension === 'otf' ? 'opentype' : 'truetype');
  var mimeType = extension === 'woff2' ? 'font/woff2' : (extension === 'otf' ? 'font/otf' : 'font/ttf');
  var encoded = Utilities.base64Encode(file.getBlob().getBytes());
  if (!encoded) return '';
  return '@font-face{' +
    'font-family:"' + LOCAL_FONT_FAMILY + '";' +
    'src:url("data:' + mimeType + ';base64,' + encoded + '") format("' + format + '");' +
    'font-style:normal;' +
    'font-weight:' + item.weight + ';' +
    'font-display:swap;' +
  '}';
}

function readChunkedFontCache_(cache, key) {
  var countText = cache.get(key + '_count');
  if (countText === null) return null;
  var count = Number(countText);
  if (!isFinite(count) || count < 1) return null;
  var keys = [];
  for (var i = 0; i < count; i++) keys.push(key + '_' + i);
  var values = cache.getAll(keys);
  var chunks = [];
  for (var chunkIndex = 0; chunkIndex < keys.length; chunkIndex++) {
    if (values[keys[chunkIndex]] == null) return null;
    chunks.push(values[keys[chunkIndex]]);
  }
  return chunks.join('');
}

function writeChunkedFontCache_(cache, key, value) {
  try {
    var entries = {};
    var count = Math.ceil(value.length / LOCAL_FONT_CACHE_CHUNK_SIZE);
    entries[key + '_count'] = String(count);
    for (var i = 0; i < count; i++) {
      entries[key + '_' + i] = value.slice(i * LOCAL_FONT_CACHE_CHUNK_SIZE, (i + 1) * LOCAL_FONT_CACHE_CHUNK_SIZE);
    }
    cache.putAll(entries, LOCAL_FONT_CACHE_SECONDS);
  } catch (error) {
    console.warn('Local font cache was skipped: ' + readableErrorMessage_(error));
  }
}
