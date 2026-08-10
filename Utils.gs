function uuid_() {
  return Utilities.getUuid();
}

function nowIso_() {
  return new Date().toISOString();
}

function safeJsonParse_(value, fallback) {
  try {
    return JSON.parse(String(value || ''));
  } catch (error) {
    return fallback;
  }
}

function normalizeName_(value, fallback) {
  var name = sanitizeText_(value, 120).trim().replace(/[\\/:*?"<>|]/g, '-');
  return name || fallback || 'Untitled';
}

function extractDriveId_(value) {
  var text = String(value || '').trim();
  var match = text.match(/[-\w]{20,}/);
  if (!match) throw new Error('A valid Drive ID could not be found.');
  return match[0];
}

function getRootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(APP.PROP_ROOT_ID);
  if (!id) throw new Error('Configure the root folder first.');
  var currentEmail = getCurrentIdentity_().email;
  var adminEmail = props.getProperty(APP.PROP_ADMIN) || '';
  var mayRepair = Boolean(currentEmail && currentEmail === adminEmail);
  var root;
  try {
    root = DriveApp.getFolderById(id);
    if (root.isTrashed()) {
      if (!mayRepair) throw new Error('The configured project folder is in Drive trash. Ask the administrator to open the app and restore it.');
      root.setTrashed(false);
    }
  } catch (error) {
    if (!mayRepair) throw new Error('The configured project folder is unavailable. Ask the administrator to verify its Drive location and access.');
    root = DriveApp.createFolder(props.getProperty(APP.PROP_ROOT_NAME) || APP.ROOT_NAME);
    props.setProperties({ROOT_FOLDER_ID: root.getId(), ROOT_FOLDER_NAME: root.getName()}, false);
  }
  ensureFolder_(root, APP.SYSTEM_FOLDER);
  return root;
}

function getFirstFileByName_(folder, name) {
  var files = folder.getFilesByName(name);
  return files.hasNext() ? files.next() : null;
}

function getFirstFolderByName_(folder, name) {
  var folders = folder.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : null;
}

function ensureFolder_(parent, name) {
  return getFirstFolderByName_(parent, name) || parent.createFolder(name);
}

function readJsonFile_(file, fallback) {
  if (!file) return fallback;
  return safeJsonParse_(file.getBlob().getDataAsString('UTF-8'), fallback);
}

function writeJsonFile_(folder, filename, value) {
  var text = JSON.stringify(value, null, 2);
  var existing = getFirstFileByName_(folder, filename);
  if (existing) {
    existing.setContent(text);
    return existing;
  }
  return folder.createFile(filename, text, MimeType.PLAIN_TEXT);
}

function withScriptLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function formatDateForDoc_(value) {
  return Utilities.formatDate(new Date(value), Session.getScriptTimeZone() || 'America/Mexico_City', 'yyyy-MM-dd HH:mm');
}

function tokenize_(text) {
  var stop = {para:1, por:1, con:1, una:1, uno:1, unos:1, unas:1, que:1, del:1, las:1, los:1, este:1, esta:1, esto:1, como:1, from:1, with:1, that:1, this:1, the:1, and:1, are:1, was:1, were:1};
  var normalized = String(text || '').toLowerCase();
  try { normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (ignore) {}
  var words = normalized.match(/[a-z0-9]{3,}/g) || [];
  return words.filter(function(word) { return !stop[word]; });
}

function truncate_(text, length) {
  text = String(text || '');
  return text.length > length ? text.slice(0, length) + '\n[Contenido truncado]' : text;
}

function readableErrorMessage_(error) {
  if (!error) return 'Unknown error.';
  if (error.message) return String(error.message);
  try {
    var text = JSON.stringify(error);
    return text && text !== '{}' ? text : String(error);
  } catch (ignore) {
    return String(error);
  }
}
