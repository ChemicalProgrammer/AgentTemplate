var FILE_SEARCH_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/';
var FILE_SEARCH_UPLOAD_ROOT = 'https://generativelanguage.googleapis.com/upload/v1beta/';

function getProjectFileSearchSummary(projectId) {
  var access = assertProjectAccess_(projectId, 'sources');
  var sources = readSourceIndex_(access.project).sources.filter(function(source) { return source.status !== 'removed'; });
  var states = sources.map(function(source) { return refreshFileSearchSourceState_(access.project, source, false); });
  var configured = false;
  try { configured = Boolean(getFileSearchStoreState_(projectId, true)); } catch (ignore) {}
  return {
    configured: configured,
    ready: states.filter(function(state) { return state.status === 'ready'; }).length,
    indexing: states.filter(function(state) { return state.status === 'uploading' || state.status === 'indexing'; }).length,
    failed: states.filter(function(state) { return state.status === 'failed'; }).length,
    total: sources.length,
    scope: 'per-user-api-key'
  };
}

function indexProjectSource(projectId, sourceId) {
  var access = assertProjectEdit_(projectId, 'sources');
  var source = readSourceIndex_(access.project).sources.filter(function(item) {
    return item.sourceId === sourceId && item.status !== 'removed';
  })[0];
  if (!source) throw new Error('Source not found.');
  return indexSourceForCurrentUser_(access.project, source, true);
}

function syncProjectSourcesIndex(projectId) {
  var access = assertProjectEdit_(projectId, 'sources');
  var sources = readSourceIndex_(access.project).sources.filter(function(source) { return source.status === 'active'; });
  var results = [];
  var processed = 0;
  sources.forEach(function(source) {
    var state = refreshFileSearchSourceState_(access.project, source, false);
    if (state.status === 'ready') {
      results.push(publicFileSearchState_(source, state));
      return;
    }
    if (processed >= APP.FILE_SEARCH_BATCH_SIZE) {
      results.push(publicFileSearchState_(source, state));
      return;
    }
    processed++;
    try {
      results.push(indexSourceForCurrentUser_(access.project, source, true));
    } catch (error) {
      results.push(publicFileSearchState_(source, saveFileSearchSourceState_(access.project.projectId, source.sourceId, {
        status: 'failed', error: readableErrorMessage_(error), updatedAt: nowIso_()
      })));
    }
  });
  var remaining = results.filter(function(item) { return ['ready', 'indexing', 'uploading'].indexOf(item.indexStatus) === -1; }).length;
  return {sources: results, summary: getProjectFileSearchSummary(projectId), processed: processed, remaining: remaining};
}

function indexSourceForCurrentUser_(project, source, force) {
  var current = refreshFileSearchSourceState_(project, source, false);
  var revision = source.driveId + ':' + String(source.updatedAt || source.addedAt || '') + ':' + String(source.size || 0);
  if (!force && current.status === 'ready' && current.revision === revision) return publicFileSearchState_(source, current);
  if (force && current.documentName) {
    try { deleteFileSearchDocument_(project.projectId, current.documentName); } catch (cleanupError) { console.warn(cleanupError.message); }
  }

  var config = getUserGeminiConfig_();
  var store = ensureFileSearchStore_(project, config);
  saveFileSearchSourceState_(project.projectId, source.sourceId, {
    status: 'uploading', storeName: store.storeName, revision: revision, updatedAt: nowIso_(), error: ''
  });
  try {
    var operation = uploadDriveSourceToFileSearch_(project, source, store.storeName, config.apiKey);
    var state = {
      status: operation.done ? 'ready' : 'indexing',
      storeName: store.storeName,
      operationName: operation.name || '',
      documentName: extractFileSearchDocumentName_(operation),
      revision: revision,
      indexedAt: operation.done ? nowIso_() : '',
      updatedAt: nowIso_(),
      error: ''
    };
    if (operation.done && operation.error) throw new Error(operation.error.message || 'File Search indexing failed.');
    if (operation.done && !state.documentName) state.documentName = findFileSearchDocumentForSource_(store.storeName, source.sourceId, config.apiKey) || '';
    saveFileSearchSourceState_(project.projectId, source.sourceId, state);
    return publicFileSearchState_(source, state);
  } catch (error) {
    var failed = saveFileSearchSourceState_(project.projectId, source.sourceId, {
      status: 'failed', storeName: store.storeName, revision: revision, error: readableErrorMessage_(error), updatedAt: nowIso_()
    });
    throw new Error('The source was saved in Drive, but File Search indexing failed: ' + failed.error);
  }
}

function ensureFileSearchStore_(project, config) {
  var existing = getFileSearchStoreState_(project.projectId, false);
  var fingerprint = geminiKeyFingerprint_(config.apiKey);
  if (existing && existing.keyFingerprint === fingerprint && existing.storeName) return existing;
  var response = fileSearchFetchJson_(FILE_SEARCH_API_ROOT + 'fileSearchStores', {
    method: 'post', apiKey: config.apiKey,
    body: {displayName: truncate_('GPA - ' + project.title + ' - ' + project.projectId, 480), embeddingModel: 'models/gemini-embedding-2'}
  });
  if (!response.name) throw new Error('Gemini did not return a File Search store identifier.');
  var state = {storeName: response.name, keyFingerprint: fingerprint, createdAt: nowIso_(), projectId: project.projectId};
  PropertiesService.getUserProperties().setProperty(APP.USER_FILE_SEARCH_STORE_PREFIX + project.projectId, JSON.stringify(state));
  return state;
}

function getFileSearchStoreState_(projectId, validateKey) {
  var state = safeJsonParse_(PropertiesService.getUserProperties().getProperty(APP.USER_FILE_SEARCH_STORE_PREFIX + projectId), null);
  if (!state) return null;
  if (validateKey !== false) {
    var config = getUserGeminiConfig_();
    if (state.keyFingerprint !== geminiKeyFingerprint_(config.apiKey)) return null;
  }
  return state;
}

function uploadDriveSourceToFileSearch_(project, source, storeName, apiKey) {
  var descriptor = buildIndexableSourceDescriptor_(source);
  if (descriptor.size > APP.MAX_FILE_SEARCH_BYTES) throw new Error('File Search supports up to 100 MB per document. Split this file before indexing it.');
  var metadata = {
    displayName: descriptor.name,
    mimeType: descriptor.mimeType,
    customMetadata: [
      {key: 'project_id', stringValue: project.projectId},
      {key: 'source_id', stringValue: source.sourceId},
      {key: 'drive_id', stringValue: source.driveId}
    ],
    chunkingConfig: {whiteSpaceConfig: {
      maxTokensPerChunk: APP.FILE_SEARCH_MAX_TOKENS_PER_CHUNK,
      maxOverlapTokens: APP.FILE_SEARCH_OVERLAP_TOKENS
    }}
  };
  var start = UrlFetchApp.fetch(FILE_SEARCH_UPLOAD_ROOT + storeName + ':uploadToFileSearchStore', {
    method: 'post',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(descriptor.size),
      'X-Goog-Upload-Header-Content-Type': descriptor.mimeType
    },
    contentType: 'application/json',
    payload: JSON.stringify(metadata),
    muteHttpExceptions: true
  });
  assertHttpSuccess_(start, 'File Search upload could not be started');
  var uploadUrl = getHeaderIgnoreCase_(start.getAllHeaders(), 'x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini did not provide a resumable upload URL.');

  var offset = 0;
  var lastResponse = null;
  while (offset < descriptor.size || descriptor.size === 0 && offset === 0) {
    var length = Math.min(APP.FILE_SEARCH_CHUNK_BYTES, descriptor.size - offset);
    var bytes = descriptor.getChunk(offset, length);
    var finalChunk = offset + bytes.length >= descriptor.size;
    lastResponse = UrlFetchApp.fetch(uploadUrl, {
      method: 'post',
      headers: {
        'X-Goog-Upload-Offset': String(offset),
        'X-Goog-Upload-Command': finalChunk ? 'upload, finalize' : 'upload'
      },
      contentType: descriptor.mimeType,
      payload: Utilities.newBlob(bytes, descriptor.mimeType),
      muteHttpExceptions: true
    });
    var code = lastResponse.getResponseCode();
    if (!(code >= 200 && code < 300) && code !== 308) throw new Error(extractHttpError_(lastResponse));
    offset += bytes.length;
    if (descriptor.size === 0 || finalChunk) break;
  }
  var operation = safeJsonParse_(lastResponse ? lastResponse.getContentText() : '', {});
  if (!operation.name && !operation.done) throw new Error('Gemini did not return an indexing operation.');
  for (var attempt = 0; operation.name && !operation.done && attempt < 8; attempt++) {
    Utilities.sleep(1250);
    operation = getFileSearchOperation_(operation.name, apiKey);
  }
  return operation;
}

function buildIndexableSourceDescriptor_(source) {
  var file = DriveApp.getFileById(source.driveId);
  var mime = file.getMimeType();
  if (mime === MimeType.GOOGLE_DOCS || mime === MimeType.GOOGLE_SHEETS || mime === MimeType.GOOGLE_SLIDES) {
    var text = extractGoogleWorkspaceText_(file);
    var nativeBytes = Utilities.newBlob(text, 'text/plain', file.getName() + '.txt').getBytes();
    return {
      name: file.getName() + '.txt', mimeType: 'text/plain', size: nativeBytes.length,
      getChunk: function(offset, length) { return nativeBytes.slice(offset, offset + length); }
    };
  }
  var size = Number(file.getSize() || 0);
  return {
    name: file.getName(), mimeType: mime || 'application/octet-stream', size: size,
    getChunk: function(offset, length) { return getDriveFileRange_(file.getId(), offset, length, size); }
  };
}

function extractGoogleWorkspaceText_(file) {
  var mime = file.getMimeType();
  if (mime === MimeType.GOOGLE_DOCS) return DocumentApp.openById(file.getId()).getBody().getText();
  if (mime === MimeType.GOOGLE_SHEETS) {
    return SpreadsheetApp.openById(file.getId()).getSheets().map(function(sheet) {
      var values = sheet.getDataRange().getDisplayValues();
      return '# Sheet: ' + sheet.getName() + '\n' + values.map(function(row) { return row.join('\t'); }).join('\n');
    }).join('\n\n');
  }
  if (mime === MimeType.GOOGLE_SLIDES) {
    return SlidesApp.openById(file.getId()).getSlides().map(function(slide, index) {
      var fragments = [];
      slide.getPageElements().forEach(function(element) {
        try {
          if (element.getPageElementType() === SlidesApp.PageElementType.SHAPE) fragments.push(element.asShape().getText().asString());
          if (element.getPageElementType() === SlidesApp.PageElementType.TABLE) {
            var table = element.asTable();
            for (var row = 0; row < table.getNumRows(); row++) for (var column = 0; column < table.getNumColumns(); column++) fragments.push(table.getCell(row, column).getText().asString());
          }
        } catch (ignore) {}
      });
      return '# Slide ' + (index + 1) + '\n' + fragments.join('\n');
    }).join('\n\n');
  }
  throw new Error('Unsupported Google Workspace source type.');
}

function getDriveFileRange_(fileId, offset, length, totalSize) {
  if (!length) return [];
  var end = Math.min(totalSize - 1, offset + length - 1);
  var response = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media', {
    method: 'get',
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), Range: 'bytes=' + offset + '-' + end},
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code !== 200 && code !== 206) throw new Error('Drive could not stream the source for indexing: ' + extractHttpError_(response));
  var bytes = response.getBlob().getBytes();
  if (bytes.length > length) bytes = bytes.slice(0, length);
  return bytes;
}

function getFileSearchOperation_(operationName, apiKey) {
  return fileSearchFetchJson_(FILE_SEARCH_API_ROOT + operationName, {method: 'get', apiKey: apiKey});
}

function refreshFileSearchSourceState_(project, source, waitForCompletion) {
  var state = getFileSearchSourceState_(project.projectId, source.sourceId);
  if (state && state.storeName) {
    try {
      var currentStore = getFileSearchStoreState_(project.projectId, true);
      if (!currentStore || currentStore.storeName !== state.storeName) return {status: 'not_indexed', error: 'This source must be indexed with the currently configured Gemini API key.'};
    } catch (keyError) {
      return {status: 'not_indexed', error: 'Configure a Gemini API key to use the semantic index.'};
    }
  }
  if (!state || !state.operationName || state.status !== 'indexing') return state || {status: 'not_indexed'};
  try {
    var config = getUserGeminiConfig_();
    var operation = getFileSearchOperation_(state.operationName, config.apiKey);
    if (waitForCompletion) {
      for (var attempt = 0; !operation.done && attempt < 5; attempt++) {
        Utilities.sleep(1000);
        operation = getFileSearchOperation_(state.operationName, config.apiKey);
      }
    }
    if (operation.done && operation.error) {
      state.status = 'failed';
      state.error = operation.error.message || 'File Search indexing failed.';
    } else if (operation.done) {
      state.status = 'ready';
      state.documentName = extractFileSearchDocumentName_(operation) || findFileSearchDocumentForSource_(state.storeName, source.sourceId, config.apiKey) || '';
      state.indexedAt = nowIso_();
      state.error = '';
    }
    state.updatedAt = nowIso_();
    saveFileSearchSourceState_(project.projectId, source.sourceId, state);
  } catch (error) {
    console.warn('File Search status could not be refreshed: ' + readableErrorMessage_(error));
  }
  return state;
}

function getFileSearchSourceState_(projectId, sourceId) {
  return safeJsonParse_(PropertiesService.getUserProperties().getProperty(fileSearchSourcePropertyKey_(projectId, sourceId)), null);
}

function saveFileSearchSourceState_(projectId, sourceId, changes) {
  var key = fileSearchSourcePropertyKey_(projectId, sourceId);
  var state = safeJsonParse_(PropertiesService.getUserProperties().getProperty(key), {}) || {};
  Object.keys(changes || {}).forEach(function(name) { state[name] = changes[name]; });
  PropertiesService.getUserProperties().setProperty(key, JSON.stringify(state));
  return state;
}

function fileSearchSourcePropertyKey_(projectId, sourceId) {
  return APP.USER_FILE_SEARCH_SOURCE_PREFIX + projectId + '_' + sourceId;
}

function applyFileSearchStateToSource_(project, source) {
  var output = JSON.parse(JSON.stringify(source));
  var state = refreshFileSearchSourceState_(project, source, false);
  output.indexStatus = state.status || 'not_indexed';
  output.indexError = state.error || '';
  output.indexedAt = state.indexedAt || '';
  return output;
}

function publicFileSearchState_(source, state) {
  return {sourceId: source.sourceId, name: source.name, indexStatus: state.status || 'not_indexed', indexError: state.error || '', indexedAt: state.indexedAt || ''};
}

function getFileSearchQueryConfig_(project, selectedSourceIds) {
  var store = getFileSearchStoreState_(project.projectId, true);
  if (!store) return null;
  var requested = (selectedSourceIds || []).map(String);
  var ready = readSourceIndex_(project).sources.filter(function(source) {
    var nodeId = 'source:' + source.sourceId;
    if (source.status !== 'active' || requested.indexOf(source.sourceId) === -1 && requested.indexOf(nodeId) === -1) return false;
    return refreshFileSearchSourceState_(project, source, false).status === 'ready';
  }).map(function(source) { return source.sourceId; });
  return ready.length ? {storeName: store.storeName, sourceIds: ready} : null;
}

function buildFileSearchMetadataFilter_(sourceIds) {
  return (sourceIds || []).map(function(sourceId) {
    return 'source_id="' + String(sourceId).replace(/["\\]/g, '') + '"';
  }).join(' OR ');
}

function generateWithFileSearch_(options) {
  var config = options.config || getUserGeminiConfig_();
  var body = {
    model: normalizeModel_(options.model || config.model),
    system_instruction: String(options.systemInstruction || ''),
    input: flattenInteractionInput_(options.contents || []),
    tools: [{type: 'file_search', file_search_store_names: [options.storeName], metadata_filter: options.metadataFilter || ''}],
    generation_config: {max_output_tokens: options.maxOutputTokens || 8192},
    store: false
  };
  var payload = fileSearchFetchJson_(FILE_SEARCH_API_ROOT + 'interactions', {method: 'post', apiKey: config.apiKey, body: body});
  var text = '';
  var annotations = [];
  (payload.steps || []).forEach(function(step) {
    if (step.type !== 'model_output') return;
    (step.content || []).forEach(function(block) {
      if (block.type === 'text') text += block.text || '';
      (block.annotations || []).forEach(function(annotation) { annotations.push(annotation); });
    });
  });
  text = text.trim();
  if (!text) throw new Error('Gemini File Search returned no content.');
  return {text: text, model: body.model, usage: payload.usage || {}, annotations: annotations, raw: payload};
}

function flattenInteractionInput_(contents) {
  return (contents || []).map(function(content) {
    var role = content.role === 'model' ? 'ASSISTANT' : 'USER';
    var text = (content.parts || []).map(function(part) { return part.text || ''; }).filter(Boolean).join('\n');
    return role + ':\n' + text;
  }).join('\n\n');
}

function annotationsToSourcesUsed_(annotations, project) {
  var byId = {};
  readSourceIndex_(project).sources.forEach(function(source) { byId[source.sourceId] = source; });
  var used = [];
  (annotations || []).forEach(function(annotation) {
    var metadata = annotation.custom_metadata || annotation.customMetadata || [];
    var sourceId = '';
    metadata.forEach(function(item) {
      if (item.key === 'source_id') sourceId = item.string_value || item.stringValue || '';
    });
    var source = byId[sourceId] || {};
    var key = sourceId + ':' + String(annotation.page_number || annotation.pageNumber || '') + ':' + String(annotation.source || '');
    if (used.some(function(item) { return item._key === key; })) return;
    used.push({
      _key: key,
      sourceId: sourceId ? 'source:' + sourceId : '',
      label: 'R' + (used.length + 1),
      name: source.name || annotation.file_name || annotation.fileName || 'Indexed source',
      mimeType: source.mimeType || '',
      kind: 'source',
      pageNumber: annotation.page_number || annotation.pageNumber || null,
      citationUri: annotation.source || ''
    });
  });
  used.forEach(function(item) { delete item._key; });
  return used;
}

function deleteFileSearchDocumentForSource_(projectId, sourceId) {
  var state = getFileSearchSourceState_(projectId, sourceId);
  try {
    if (state && state.documentName) deleteFileSearchDocument_(projectId, state.documentName);
  } finally {
    PropertiesService.getUserProperties().deleteProperty(fileSearchSourcePropertyKey_(projectId, sourceId));
  }
}

function deleteFileSearchDocument_(projectId, documentName) {
  var config = getUserGeminiConfig_();
  fileSearchFetchJson_(FILE_SEARCH_API_ROOT + documentName + '?force=true', {method: 'delete', apiKey: config.apiKey});
}

function deleteFileSearchStoreForProject_(projectId) {
  var props = PropertiesService.getUserProperties();
  try {
    var state = getFileSearchStoreState_(projectId, true);
    if (state && state.storeName) {
      var config = getUserGeminiConfig_();
      fileSearchFetchJson_(FILE_SEARCH_API_ROOT + state.storeName + '?force=true', {method: 'delete', apiKey: config.apiKey});
    }
  } finally {
    var prefix = APP.USER_FILE_SEARCH_SOURCE_PREFIX + projectId + '_';
    Object.keys(props.getProperties()).forEach(function(key) { if (key.indexOf(prefix) === 0) props.deleteProperty(key); });
    props.deleteProperty(APP.USER_FILE_SEARCH_STORE_PREFIX + projectId);
  }
}

function findFileSearchDocumentForSource_(storeName, sourceId, apiKey) {
  var payload = fileSearchFetchJson_(FILE_SEARCH_API_ROOT + storeName + '/documents?pageSize=20', {method: 'get', apiKey: apiKey});
  var documents = payload.documents || payload.fileSearchStoreDocuments || [];
  var match = documents.filter(function(document) {
    return (document.customMetadata || document.custom_metadata || []).some(function(item) {
      return item.key === 'source_id' && (item.stringValue || item.string_value) === sourceId;
    });
  })[0];
  return match && match.name || '';
}

function extractFileSearchDocumentName_(operation) {
  var response = operation && operation.response || {};
  return response.name || response.document && response.document.name || response.fileSearchStoreDocument && response.fileSearchStoreDocument.name || '';
}

function geminiKeyFingerprint_(key) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(key || ''), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '').slice(0, 16);
}

function fileSearchFetchJson_(url, options) {
  options = options || {};
  var request = {
    method: options.method || 'get',
    headers: {'x-goog-api-key': options.apiKey},
    muteHttpExceptions: true
  };
  if (options.body != null) {
    request.contentType = 'application/json';
    request.payload = JSON.stringify(options.body);
  }
  var response = UrlFetchApp.fetch(url, request);
  assertHttpSuccess_(response, 'Gemini File Search request failed');
  return safeJsonParse_(response.getContentText(), {});
}

function assertHttpSuccess_(response, prefix) {
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error((prefix || 'Request failed') + ': ' + extractHttpError_(response));
}

function extractHttpError_(response) {
  var payload = safeJsonParse_(response.getContentText(), {});
  return payload.error && payload.error.message || 'HTTP ' + response.getResponseCode() + ' ' + truncate_(response.getContentText(), 500);
}

function getHeaderIgnoreCase_(headers, name) {
  var target = String(name).toLowerCase();
  var key = Object.keys(headers || {}).filter(function(item) { return String(item).toLowerCase() === target; })[0];
  var value = key ? headers[key] : '';
  return Array.isArray(value) ? value[0] : value;
}
