var SOURCE_INDEX_FILE = 'Sources Index.json';

function listSources(projectId) {
  var access = assertProjectAccess_(projectId, 'sources');
  return readSourceIndex_(access.project).sources.filter(function(source) { return source.status !== 'removed'; }).map(function(source) {
    return applyFileSearchStateToSource_(access.project, source);
  });
}

function addSourceFromDrive(projectId, driveUrlOrId) {
  var access = assertProjectEdit_(projectId, 'sources');
  var project = access.project;
  var driveId = extractDriveId_(driveUrlOrId);
  var imported = copyDriveItemToSources_(project, driveId);
  var index = readSourceIndex_(project);
  var now = nowIso_();
  var added = imported.files.map(function(file) {
    var record = {
      sourceId: uuid_(),
      name: file.getName(),
      driveId: file.getId(),
      mimeType: file.getMimeType(),
      size: Number(file.getSize() || 0),
      status: 'active',
      addedAt: now,
      updatedAt: file.getLastUpdated().toISOString(),
      addedBy: access.email,
      origin: 'drive-copy',
      note: ''
    };
    index.sources.push(record);
    appendControlRow_(project, 'Sources', [record.sourceId, record.name, record.mimeType, record.driveId, record.status, record.addedAt, record.addedBy, record.note]);
    saveFileSearchSourceState_(project.projectId, record.sourceId, {
      status: 'queued', stage: 'waiting_to_index', progress: 0, error: '', checkError: '', updatedAt: nowIso_()
    });
    return applyFileSearchStateToSource_(project, record);
  });
  writeSourceIndex_(project, index);
  touchProjectStats_(projectId, {sourceCount: index.sources.filter(function(item) { return item.status !== 'removed'; }).length});
  return {added: added, queued: added.length, limited: imported.files.length >= APP.MAX_SOURCE_FILES, indexingErrors: []};
}

function startSourceUpload(projectId, metadata) {
  var access = assertProjectEdit_(projectId, 'sources');
  metadata = metadata || {};
  var name = normalizeName_(metadata.name, 'Source');
  var mimeType = inferSourceMimeType_(name, metadata.mimeType);
  var size = Number(metadata.size || 0);
  if (!Number.isFinite(size) || size <= 0) throw new Error('Choose a non-empty file.');
  if (size > APP.MAX_FILE_SEARCH_BYTES) throw new Error('Sources can be uploaded up to 100 MB. Split this file or import separate volumes.');

  cleanupExpiredSourceUploadSessions_();
  var response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink', {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(size)
    },
    contentType: 'application/json',
    payload: JSON.stringify({name: name, mimeType: mimeType, parents: [access.project.folders.sources]}),
    muteHttpExceptions: true
  });
  assertHttpSuccess_(response, 'Drive upload could not be started');
  var uploadUrl = getHeaderIgnoreCase_(response.getAllHeaders(), 'location');
  if (!uploadUrl) throw new Error('Drive did not provide a resumable upload URL.');

  var uploadId = uuid_();
  var session = {
    uploadId: uploadId,
    projectId: projectId,
    email: access.email,
    name: name,
    mimeType: mimeType,
    size: size,
    offset: 0,
    uploadUrl: uploadUrl,
    createdAt: nowIso_(),
    expiresAt: Date.now() + APP.SOURCE_UPLOAD_SESSION_TTL_MS
  };
  PropertiesService.getUserProperties().setProperty(sourceUploadSessionKey_(uploadId), JSON.stringify(session));
  return {uploadId: uploadId, nextOffset: 0, chunkBytes: APP.LOCAL_SOURCE_UPLOAD_CHUNK_BYTES, totalBytes: size};
}

function uploadSourceChunk(projectId, uploadId, offset, base64) {
  var access = assertProjectEdit_(projectId, 'sources');
  var props = PropertiesService.getUserProperties();
  var key = sourceUploadSessionKey_(uploadId);
  var session = safeJsonParse_(props.getProperty(key), null);
  if (!session || session.projectId !== projectId || session.email !== access.email) throw new Error('This upload session is no longer available. Start the upload again.');
  if (Number(session.expiresAt || 0) < Date.now()) {
    props.deleteProperty(key);
    throw new Error('The upload session expired. Start the upload again.');
  }

  offset = Number(offset || 0);
  if (offset !== Number(session.offset || 0)) throw new Error('The upload offset is out of sync. Expected byte ' + session.offset + '.');
  var bytes = Utilities.base64Decode(String(base64 || '').replace(/^data:[^;]+;base64,/, ''));
  if (!bytes.length) throw new Error('The upload chunk is empty.');
  if (bytes.length > APP.LOCAL_SOURCE_UPLOAD_CHUNK_BYTES) throw new Error('The upload chunk is too large. Reload the app and try again.');
  if (offset + bytes.length > session.size) throw new Error('The upload contains more bytes than the selected file.');

  var end = offset + bytes.length - 1;
  var finalChunk = end + 1 === session.size;
  var response = UrlFetchApp.fetch(session.uploadUrl, {
    method: 'put',
    headers: {'Content-Range': 'bytes ' + offset + '-' + end + '/' + session.size},
    contentType: session.mimeType,
    payload: Utilities.newBlob(bytes, session.mimeType),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code !== 308 && (code < 200 || code >= 300)) {
    throw new Error('Drive upload failed: ' + extractHttpError_(response));
  }

  session.offset = end + 1;
  if (!finalChunk) {
    if (code !== 308 && !response.getContentText()) throw new Error('Drive returned an unexpected response before the upload was complete.');
    props.setProperty(key, JSON.stringify(session));
    return {complete: false, uploadId: uploadId, nextOffset: session.offset, totalBytes: session.size};
  }
  if (code === 308) {
    props.setProperty(key, JSON.stringify(session));
    throw new Error('Drive received the last block but did not finalize the file. Retry the upload.');
  }

  var payload = safeJsonParse_(response.getContentText(), {});
  if (!payload.id) throw new Error('Drive completed the upload but did not return a file ID.');
  var file = DriveApp.getFileById(payload.id);
  var record = registerUploadedSource_(access, file);
  props.deleteProperty(key);
  saveFileSearchSourceState_(projectId, record.sourceId, {
    status: 'queued', stage: 'waiting_to_index', progress: 0, error: '', checkError: '', updatedAt: nowIso_()
  });
  return {complete: true, uploadId: uploadId, nextOffset: session.size, totalBytes: session.size, source: applyFileSearchStateToSource_(access.project, record)};
}

function cancelSourceUpload(projectId, uploadId) {
  assertProjectEdit_(projectId, 'sources');
  PropertiesService.getUserProperties().deleteProperty(sourceUploadSessionKey_(uploadId));
  return {cancelled: true};
}

function registerUploadedSource_(access, file) {
  var index = readSourceIndex_(access.project);
  var record = {
    sourceId: uuid_(), name: file.getName(), driveId: file.getId(), mimeType: file.getMimeType(),
    size: Number(file.getSize() || 0), status: 'active', addedAt: nowIso_(),
    updatedAt: file.getLastUpdated().toISOString(), addedBy: access.email, origin: 'upload', note: ''
  };
  index.sources.push(record);
  writeSourceIndex_(access.project, index);
  appendControlRow_(access.project, 'Sources', [record.sourceId, record.name, record.mimeType, record.driveId, record.status, record.addedAt, record.addedBy, record.note]);
  touchProjectStats_(access.project.projectId, {sourceCount: index.sources.filter(function(item) { return item.status !== 'removed'; }).length});
  return record;
}

function sourceUploadSessionKey_(uploadId) {
  return APP.USER_SOURCE_UPLOAD_PREFIX + String(uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function cleanupExpiredSourceUploadSessions_() {
  var props = PropertiesService.getUserProperties();
  var all = props.getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(APP.USER_SOURCE_UPLOAD_PREFIX) !== 0) return;
    var session = safeJsonParse_(all[key], null);
    if (!session || Number(session.expiresAt || 0) < Date.now()) props.deleteProperty(key);
  });
}

function inferSourceMimeType_(name, mimeType) {
  var supplied = String(mimeType || '').trim();
  if (supplied && supplied !== 'application/octet-stream') return supplied;
  var extension = String(name || '').toLowerCase().split('.').pop();
  return ({
    pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values',
    json: 'application/json', xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png'
  })[extension] || 'application/octet-stream';
}

function setSourceActive(projectId, sourceId, active) {
  var access = assertProjectEdit_(projectId, 'sources');
  var index = readSourceIndex_(access.project);
  var source = index.sources.filter(function(item) { return item.sourceId === sourceId; })[0];
  if (!source) throw new Error('Source not found.');
  source.status = active ? 'active' : 'inactive';
  source.updatedAt = nowIso_();
  try { purgeFileSearchDocumentsForSource_(projectId, source); } catch (indexError) { console.warn(indexError.message); }
  writeSourceIndex_(access.project, index);
  touchProjectStats_(projectId, {sourceCount: index.sources.filter(function(item) { return item.status !== 'removed'; }).length});
  return source;
}

function removeSource(projectId, sourceId) {
  var access = assertProjectEdit_(projectId, 'sources');
  var index = readSourceIndex_(access.project);
  var source = index.sources.filter(function(item) { return item.sourceId === sourceId; })[0];
  if (!source) throw new Error('Source not found.');
  source.status = 'removed';
  source.updatedAt = nowIso_();
  writeSourceIndex_(access.project, index);
  var driveTrashed = false;
  var driveWarning = '';
  try { DriveApp.getFileById(source.driveId).setTrashed(true); driveTrashed = true; } catch (error) { driveWarning = readableErrorMessage_(error); }
  var cleanup = {deleted: 0, storesChecked: 0, warnings: []};
  try { cleanup = purgeFileSearchDocumentsForSource_(projectId, source); } catch (indexError) { cleanup.warnings.push(readableErrorMessage_(indexError)); }
  appendControlRow_(access.project, 'Change Log', [nowIso_(), access.email, 'DELETE_SOURCE', 'Source', sourceId, source.name]);
  touchProjectStats_(projectId, {sourceCount: index.sources.filter(function(item) { return item.status !== 'removed'; }).length});
  return {
    removed: true,
    sourceId: sourceId,
    driveTrashed: driveTrashed,
    driveWarning: driveWarning,
    remoteDeleted: Number(cleanup.deleted || 0),
    remoteCleanupPending: Boolean((cleanup.warnings || []).length),
    cleanupWarnings: cleanup.warnings || []
  };
}

function readSourceIndex_(project) {
  var folder = DriveApp.getFolderById(project.folders.sources);
  var data = readJsonFile_(getFirstFileByName_(folder, SOURCE_INDEX_FILE), {schemaVersion: 2, sources: []});
  data.sources = data.sources || [];
  return data;
}

function writeSourceIndex_(project, index) {
  writeJsonFile_(DriveApp.getFolderById(project.folders.sources), SOURCE_INDEX_FILE, index);
}

function buildSourceContext_(project, query, selectedSourceIds) {
  var requested = selectedSourceIds == null ? null : selectedSourceIds.map(String);
  if (requested && !requested.length) return {text: '', inlineParts: [], sourcesUsed: [], warnings: [], selectedIds: []};
  var selected = getDocumentContextRecords_(project).filter(function(source) {
    if (source.status !== 'active') return false;
    if (requested == null) return true;
    return requested.indexOf(source.sourceId) !== -1 || source.legacySourceId && requested.indexOf(source.legacySourceId) !== -1;
  });
  var queryTerms = tokenize_(query);
  var candidates = [];
  var inlineParts = [];
  var inlineBytes = 0;
  var used = [];
  var warnings = [];

  selected.forEach(function(source, position) {
    try {
      var file = DriveApp.getFileById(source.driveId);
      var extracted = extractSource_(file);
      var label = 'S' + (position + 1);
      if (extracted.text) {
        chunkText_(extracted.text, 6000, 500).forEach(function(chunk, chunkIndex) {
          candidates.push({source: source, label: label, chunk: chunk, chunkIndex: chunkIndex, score: scoreChunk_((source.note || '') + '\n' + chunk, queryTerms)});
        });
      } else if (extracted.inlineData && inlineBytes + extracted.byteLength <= APP.MAX_INLINE_BYTES) {
        inlineParts.push({text: '[' + label + '] Binary file: ' + source.name + (source.note ? '\nDocument note: ' + source.note : '')});
        inlineParts.push({inlineData: extracted.inlineData});
        inlineBytes += extracted.byteLength;
        used.push({sourceId: source.sourceId, label: label, name: source.name, mimeType: source.mimeType, kind: source.kind});
      } else if (extracted.inlineData) {
        warnings.push(source.name + ': the selected binary files exceed the 12 MB local fallback limit.');
      }
    } catch (error) {
      console.warn('Source skipped ' + source.name + ': ' + error.message);
      warnings.push(source.name + ': ' + readableErrorMessage_(error));
    }
  });

  candidates.sort(function(a, b) { return b.score - a.score; });
  var chosen = candidates.slice(0, 12);
  var chars = 0;
  var textSections = [];
  chosen.forEach(function(item) {
    if (chars >= APP.MAX_TEXT_CONTEXT_CHARS) return;
    var section = '[' + item.label + '] ' + item.source.name + ' — excerpt ' + (item.chunkIndex + 1) +
      (item.source.note ? '\nDocument note: ' + item.source.note : '') + '\n' + item.chunk;
    section = truncate_(section, APP.MAX_TEXT_CONTEXT_CHARS - chars);
    chars += section.length;
    textSections.push(section);
    if (!used.some(function(source) { return source.sourceId === item.source.sourceId; })) {
      used.push({sourceId: item.source.sourceId, label: item.label, name: item.source.name, mimeType: item.source.mimeType, kind: item.source.kind});
    }
  });
  return {
    text: textSections.join('\n\n---\n\n'),
    inlineParts: inlineParts,
    sourcesUsed: used,
    warnings: warnings,
    selectedIds: selected.map(function(source) { return source.sourceId; })
  };
}

function extractSource_(file) {
  var mime = file.getMimeType();
  var text = '';
  if (mime === MimeType.GOOGLE_DOCS || mime === MimeType.GOOGLE_SHEETS || mime === MimeType.GOOGLE_SLIDES) {
    text = extractGoogleWorkspaceText_(file);
  } else if (/^(text\/|application\/(json|csv|xml))/.test(mime) || /\.(txt|md|csv|tsv|json|xml)$/i.test(file.getName())) {
    text = file.getBlob().getDataAsString('UTF-8');
  }

  if (text) return {text: truncate_(text, 300000)};
  var blob = file.getBlob();
  var bytes = blob.getBytes();
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Binary files over 8 MB are not supported inline.');
  return {
    inlineData: {mimeType: mime, data: Utilities.base64Encode(bytes)},
    byteLength: bytes.length
  };
}

function chunkText_(text, size, overlap) {
  text = String(text || '');
  var chunks = [];
  for (var start = 0; start < text.length; start += size - overlap) chunks.push(text.slice(start, start + size));
  return chunks;
}

function scoreChunk_(chunk, queryTerms) {
  var lower = String(chunk || '').toLowerCase();
  return queryTerms.reduce(function(score, term) {
    var matches = lower.split(term).length - 1;
    return score + Math.min(matches, 5);
  }, 0) + Math.min(chunk.length / 100000, 0.1);
}
