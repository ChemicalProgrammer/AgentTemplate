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
    unknown: states.filter(function(state) { return state.status === 'unknown'; }).length,
    total: sources.length,
    scope: 'per-user-api-key'
  };
}

function indexProjectSource(projectId, sourceId, restart) {
  var access = assertProjectEdit_(projectId, 'sources');
  var source = readSourceIndex_(access.project).sources.filter(function(item) {
    return item.sourceId === sourceId && item.status !== 'removed';
  })[0];
  if (!source) throw new Error('Source not found.');
  return indexSourceForCurrentUser_(access.project, source, restart !== false);
}

function syncProjectSourcesIndex(projectId) {
  var access = assertProjectEdit_(projectId, 'sources');
  var sources = readSourceIndex_(access.project).sources.filter(function(source) { return source.status === 'active'; });
  var results = [];
  var processed = 0;
  sources.forEach(function(source) {
    var state = refreshFileSearchSourceState_(access.project, source, false);
    if (state.status === 'ready' || state.status === 'indexing') {
      results.push(publicFileSearchState_(source, state));
      return;
    }
    if (processed >= APP.FILE_SEARCH_BATCH_SIZE) {
      results.push(publicFileSearchState_(source, state));
      return;
    }
    processed++;
    try {
      results.push(indexSourceForCurrentUser_(access.project, source, state.status === 'failed' || state.status === 'unknown'));
    } catch (error) {
      results.push(publicFileSearchState_(source, saveFileSearchSourceState_(access.project.projectId, source.sourceId, {
        status: 'failed', stage: state.stage || 'indexing', error: readableErrorMessage_(error), updatedAt: nowIso_()
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
  if (!force && current.status === 'indexing' && current.revision === revision) return publicFileSearchState_(source, current);
  if (!force && current.status === 'uploading' && current.revision === revision && current.uploadUrl) {
    try {
      return advanceFileSearchUpload_(project, source, current, getUserGeminiConfig_().apiKey);
    } catch (continuationError) {
      var continuationFailed = saveFileSearchSourceState_(project.projectId, source.sourceId, {
        status: 'failed', stage: current.stage || 'uploading_to_file_search', error: readableErrorMessage_(continuationError), checkError: '', updatedAt: nowIso_()
      });
      throw new Error('File Search indexing failed: ' + continuationFailed.error);
    }
  }
  if (force) {
    var cleanupConfig = getUserGeminiConfig_();
    var cleanupStore = current.storeName ? {storeName: current.storeName} : getFileSearchStoreState_(project.projectId, true);
    if (cleanupStore && cleanupStore.storeName) {
      var deletedNames = deleteFileSearchDocumentsForSource_(cleanupStore.storeName, source, cleanupConfig.apiKey);
      if (current.documentName && deletedNames.indexOf(current.documentName) === -1) {
        deleteFileSearchDocumentByName_(current.documentName, cleanupConfig.apiKey);
      }
    }
  }

  var stage = 'validating_source';
  var storeName = '';
  try {
    var config = getUserGeminiConfig_();
    var descriptor = buildIndexableSourceDescriptor_(source);
    if (!descriptor.size) throw new Error('The document is empty after preparation.');
    if (descriptor.size > APP.MAX_FILE_SEARCH_BYTES) throw new Error('File Search supports up to 100 MB per document. Split this file before indexing it.');
    stage = 'creating_store';
    var store = ensureFileSearchStore_(project, config);
    storeName = store.storeName;
    stage = 'starting_file_search_upload';
    var uploadUrl = startFileSearchUpload_(project, source, descriptor, storeName, config.apiKey);
    var state = saveFileSearchSourceState_(project.projectId, source.sourceId, {
      status: 'uploading', stage: 'uploading_to_file_search', storeName: storeName, revision: revision,
      uploadUrl: uploadUrl, offset: 0, totalBytes: descriptor.size, progress: 0,
      operationName: '', documentName: '', indexedAt: '', error: '', checkError: '',
      attemptStartedAt: nowIso_(), operationDone: false, updatedAt: nowIso_()
    });
    return advanceFileSearchUpload_(project, source, state, config.apiKey);
  } catch (error) {
    var failed = saveFileSearchSourceState_(project.projectId, source.sourceId, {
      status: 'failed', stage: stage, storeName: storeName, revision: revision,
      error: readableErrorMessage_(error), checkError: '', updatedAt: nowIso_()
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

function startFileSearchUpload_(project, source, descriptor, storeName, apiKey) {
  var whiteSpaceConfig = getFileSearchWhiteSpaceConfig_();
  var metadata = {
    displayName: descriptor.name,
    customMetadata: [
      {key: 'project_id', stringValue: project.projectId},
      {key: 'source_id', stringValue: source.sourceId},
      {key: 'drive_id', stringValue: source.driveId}
    ],
    chunkingConfig: {whiteSpaceConfig: whiteSpaceConfig}
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
  return uploadUrl;
}

function getFileSearchWhiteSpaceConfig_() {
  var maxTokens = Number(APP.FILE_SEARCH_MAX_TOKENS_PER_CHUNK);
  var overlap = Number(APP.FILE_SEARCH_OVERLAP_TOKENS);
  if (!isFinite(maxTokens) || maxTokens < 1) maxTokens = 200;
  if (!isFinite(overlap) || overlap < 0) overlap = 20;
  maxTokens = Math.min(512, Math.floor(maxTokens));
  overlap = Math.min(maxTokens - 1, Math.floor(overlap));
  return {maxTokensPerChunk: maxTokens, maxOverlapTokens: overlap};
}

function advanceFileSearchUpload_(project, source, state, apiKey) {
  var descriptor = buildIndexableSourceDescriptor_(source);
  var offset = Number(state.offset || 0);
  if (!state.uploadUrl || offset < 0 || offset >= descriptor.size) throw new Error('The resumable File Search upload state is invalid. Restart indexing.');
  var length = Math.min(APP.FILE_SEARCH_CHUNK_BYTES, descriptor.size - offset);
  var bytes = descriptor.getChunk(offset, length);
  if (!bytes.length) throw new Error('Drive returned an empty block while indexing.');
  var finalChunk = offset + bytes.length >= descriptor.size;
  var response = UrlFetchApp.fetch(state.uploadUrl, {
    method: 'post',
    headers: {
      'X-Goog-Upload-Offset': String(offset),
      'X-Goog-Upload-Command': finalChunk ? 'upload, finalize' : 'upload'
    },
    contentType: descriptor.mimeType,
    payload: Utilities.newBlob(bytes, descriptor.mimeType),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (!(code >= 200 && code < 300) && code !== 308) throw new Error(extractHttpError_(response));

  offset += bytes.length;
  if (!finalChunk) {
    state = saveFileSearchSourceState_(project.projectId, source.sourceId, {
      status: 'uploading', stage: 'uploading_to_file_search', offset: offset,
      totalBytes: descriptor.size, progress: Math.min(99, Math.round(offset * 100 / descriptor.size)),
      error: '', checkError: '', updatedAt: nowIso_()
    });
    return publicFileSearchState_(source, state);
  }

  var operation = safeJsonParse_(response.getContentText(), {});
  if (!operation.name && !operation.done) throw new Error('Gemini did not return an indexing operation.');
  if (operation.done && operation.error) throw new Error(operation.error.message || 'File Search indexing failed.');
  state = saveFileSearchSourceState_(project.projectId, source.sourceId, {
    status: 'indexing',
    stage: 'processing_embeddings',
    operationName: operation.name || '',
    documentName: extractFileSearchDocumentName_(operation),
    uploadUrl: '', offset: descriptor.size, totalBytes: descriptor.size, progress: 100,
    indexedAt: '', error: '', checkError: '', operationDone: Boolean(operation.done), updatedAt: nowIso_()
  });
  if (operation.done) state = applyCompletedFileSearchOperation_(project, source, state, operation, apiKey);
  return publicFileSearchState_(source, state);
}

function buildIndexableSourceDescriptor_(source) {
  var file = DriveApp.getFileById(source.driveId);
  var mime = inferSourceMimeType_(file.getName(), file.getMimeType());
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
      if (!currentStore || currentStore.storeName !== state.storeName) return {status: 'not_indexed', stage: 'api_key_changed', error: 'This source must be indexed with the currently configured Gemini API key.'};
    } catch (keyError) {
      return {status: 'not_indexed', stage: 'api_key_missing', error: 'Configure a Gemini API key to use the semantic index.'};
    }
  }
  if (!state || !state.operationName || ['indexing', 'unknown'].indexOf(state.status) === -1) return state || {status: 'not_indexed', stage: 'not_started'};
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
      state.stage = 'processing_embeddings';
      state.error = operation.error.message || 'File Search indexing failed.';
    } else if (operation.done) {
      state = applyCompletedFileSearchOperation_(project, source, state, operation, config.apiKey);
    } else {
      state.status = 'indexing';
      state.stage = 'processing_embeddings';
    }
    state.operationDone = Boolean(operation.done);
    if (state.status !== 'unknown') state.checkError = '';
    state.updatedAt = nowIso_();
    saveFileSearchSourceState_(project.projectId, source.sourceId, state);
  } catch (error) {
    state.status = 'unknown';
    state.stage = 'checking_status';
    state.checkError = readableErrorMessage_(error);
    state.updatedAt = nowIso_();
    saveFileSearchSourceState_(project.projectId, source.sourceId, state);
    console.warn('File Search status could not be refreshed: ' + state.checkError);
  }
  return state;
}

function getProjectSourceIndexDiagnostic(projectId, sourceId) {
  var access = assertProjectAccess_(projectId, 'sources');
  var source = readSourceIndex_(access.project).sources.filter(function(item) {
    return item.sourceId === sourceId && item.status !== 'removed';
  })[0];
  if (!source) throw new Error('Source not found.');

  var driveAvailable = false;
  var driveError = '';
  try {
    var file = DriveApp.getFileById(source.driveId);
    driveAvailable = !file.isTrashed();
    if (!driveAvailable) driveError = 'The project copy is in Drive trash.';
  } catch (error) {
    driveError = readableErrorMessage_(error);
  }

  var state = refreshFileSearchSourceState_(access.project, source, true);
  var remoteVerified = false;
  var remoteError = '';
  var storeCounts = null;
  var sourceCounts = null;
  if (state.storeName) {
    try {
      var config = getUserGeminiConfig_();
      var store = fileSearchFetchJson_(FILE_SEARCH_API_ROOT + state.storeName, {method: 'get', apiKey: config.apiKey});
      storeCounts = {
        active: Number(store.activeDocumentsCount || 0),
        pending: Number(store.pendingDocumentsCount || 0),
        failed: Number(store.failedDocumentsCount || 0)
      };
      var sourceDocuments = listFileSearchDocumentsForSource_(state.storeName, source, config.apiKey);
      sourceCounts = summarizeFileSearchDocuments_(sourceDocuments);
      state = reconcileFileSearchDocuments_(access.project, source, state, sourceDocuments, storeCounts);
      remoteVerified = state.status === 'ready' && Boolean(state.documentName);
    } catch (remoteCheckError) {
      remoteError = readableErrorMessage_(remoteCheckError);
    }
  }

  return {
    sourceId: source.sourceId,
    name: source.name,
    mimeType: source.mimeType,
    size: Number(source.size || 0),
    driveAvailable: driveAvailable,
    driveError: driveError,
    indexStatus: state.status || 'not_indexed',
    indexStage: state.stage || 'not_started',
    progress: Number(state.progress || 0),
    indexError: state.error || '',
    checkError: state.checkError || remoteError || '',
    indexedAt: state.indexedAt || '',
    updatedAt: state.updatedAt || '',
    attemptStartedAt: state.attemptStartedAt || '',
    remoteVerified: remoteVerified,
    storeCounts: storeCounts,
    sourceCounts: sourceCounts,
    operationState: state.operationName ? state.operationDone ? 'completed' : 'running' : 'not_available',
    message: fileSearchDiagnosticMessage_(state, remoteVerified, driveAvailable, sourceCounts, storeCounts)
  };
}

function fileSearchDiagnosticMessage_(state, remoteVerified, driveAvailable, sourceCounts, storeCounts) {
  if (!driveAvailable) return 'The project copy is not available in Drive, so it cannot be indexed.';
  if (state.status === 'ready' && remoteVerified) return 'The index was verified directly in Gemini File Search and is ready for queries.';
  if (state.status === 'ready') return 'Gemini reported the operation as complete, but the indexed document could not be verified yet.';
  if (state.status === 'failed') return 'Indexing genuinely failed during ' + humanFileSearchStage_(state.stage) + '. Use the error below to correct the cause, then retry.';
  if (state.status === 'unknown' && sourceCounts && !sourceCounts.pending && storeCounts && !storeCounts.pending) return 'The saved operation still appears to be running, but Gemini has no document pending for this source or this project. It is safe to perform a clean retry.';
  if (state.status === 'unknown') return 'The app could not verify the remote operation. This does not prove that indexing failed.';
  if (state.status === 'uploading') return 'The project copy is being transferred to File Search (' + Number(state.progress || 0) + '%).';
  if (state.status === 'indexing') return 'Gemini accepted the complete file and is processing its chunks and embeddings.';
  if (state.status === 'queued') return 'The document is saved in Drive and waiting to start indexing.';
  return 'The document has not been indexed with the current Gemini API key.';
}

function humanFileSearchStage_(stage) {
  return ({
    validating_source: 'source validation', creating_store: 'store creation',
    starting_file_search_upload: 'upload initialization', uploading_to_file_search: 'file transfer',
    processing_embeddings: 'chunking or embedding', checking_status: 'status verification',
    api_key_changed: 'API-key validation', api_key_missing: 'API-key validation',
    waiting_to_index: 'the queue', verified: 'remote verification'
  })[stage] || String(stage || 'the indexing process').replace(/_/g, ' ');
}

function applyCompletedFileSearchOperation_(project, source, state, operation, apiKey) {
  if (operation.error) throw new Error(operation.error.message || 'File Search indexing failed.');
  state.documentName = extractFileSearchDocumentName_(operation) || state.documentName || findFileSearchDocumentForSource_(state.storeName, source.sourceId, apiKey) || '';
  if (!state.documentName) {
    state.status = 'unknown';
    state.stage = 'checking_status';
    state.checkError = 'Gemini completed the operation, but the indexed document could not be located in the store.';
    state.updatedAt = nowIso_();
    return saveFileSearchSourceState_(project.projectId, source.sourceId, state);
  }
  var document = fileSearchFetchJson_(FILE_SEARCH_API_ROOT + state.documentName, {method: 'get', apiKey: apiKey});
  if (document.state === 'STATE_FAILED') {
    state.status = 'failed';
    state.stage = 'processing_embeddings';
    state.error = 'Gemini reports STATE_FAILED: one or more document chunks could not be processed.';
    state.checkError = '';
  } else if (document.state === 'STATE_PENDING') {
    state.status = 'indexing';
    state.stage = 'processing_embeddings';
    state.error = '';
    state.checkError = '';
  } else if (document.state === 'STATE_ACTIVE') {
    state.status = 'ready';
    state.stage = 'verified';
    state.indexedAt = nowIso_();
    state.error = '';
    state.checkError = '';
  } else {
    state.status = 'unknown';
    state.stage = 'checking_status';
    state.checkError = 'Gemini returned document state ' + String(document.state || 'STATE_UNSPECIFIED') + '.';
  }
  state.updatedAt = nowIso_();
  state.operationDone = Boolean(operation.done);
  return saveFileSearchSourceState_(project.projectId, source.sourceId, state);
}

function reconcileFileSearchDocuments_(project, source, state, documents, storeCounts) {
  var attemptTime = Date.parse(state.attemptStartedAt || '');
  var currentDocuments = (documents || []).filter(function(document) {
    var created = Date.parse(document.createTime || document.updateTime || '');
    return !isFinite(attemptTime) || !isFinite(created) || created >= attemptTime - 5000;
  });
  var latest = currentDocuments[0] || null;
  if (latest) {
    state.documentName = latest.name || state.documentName || '';
    if (latest.state === 'STATE_ACTIVE') {
      state.status = 'ready';
      state.stage = 'verified';
      state.indexedAt = state.indexedAt || latest.updateTime || nowIso_();
      state.error = '';
      state.checkError = '';
    } else if (latest.state === 'STATE_PENDING') {
      state.status = 'indexing';
      state.stage = 'processing_embeddings';
      state.error = '';
      state.checkError = '';
    } else if (latest.state === 'STATE_FAILED') {
      state.status = 'failed';
      state.stage = 'processing_embeddings';
      state.error = state.error || 'Gemini marked the latest document attempt as STATE_FAILED. The file was received, but its chunks or embeddings could not be processed.';
      state.checkError = '';
    }
  } else if (state.status === 'indexing' && storeCounts && Number(storeCounts.pending || 0) === 0) {
    var started = Date.parse(state.attemptStartedAt || state.updatedAt || '');
    var elapsed = isFinite(started) ? Date.now() - started : APP.FILE_SEARCH_STALE_OPERATION_MS + 1;
    if (elapsed >= APP.FILE_SEARCH_STALE_OPERATION_MS) {
      state.status = 'unknown';
      state.stage = 'checking_status';
      state.checkError = 'Gemini still reports the long-running operation as incomplete, but the store contains no pending or active document for this attempt.';
    }
  }
  state.updatedAt = nowIso_();
  return saveFileSearchSourceState_(project.projectId, source.sourceId, state);
}

function summarizeFileSearchDocuments_(documents) {
  var summary = {total: 0, active: 0, pending: 0, failed: 0, other: 0, latestState: '', latestCreatedAt: ''};
  (documents || []).forEach(function(document, index) {
    summary.total++;
    if (document.state === 'STATE_ACTIVE') summary.active++;
    else if (document.state === 'STATE_PENDING') summary.pending++;
    else if (document.state === 'STATE_FAILED') summary.failed++;
    else summary.other++;
    if (index === 0) {
      summary.latestState = document.state || 'STATE_UNSPECIFIED';
      summary.latestCreatedAt = document.createTime || document.updateTime || '';
    }
  });
  return summary;
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
  output.indexCheckError = state.checkError || '';
  output.indexStage = state.stage || '';
  output.indexProgress = Number(state.progress || 0);
  output.indexUpdatedAt = state.updatedAt || '';
  output.indexedAt = state.indexedAt || '';
  return output;
}

function publicFileSearchState_(source, state) {
  return {
    sourceId: source.sourceId, name: source.name,
    indexStatus: state.status || 'not_indexed', indexStage: state.stage || '',
    indexProgress: Number(state.progress || 0), indexError: state.error || '',
    indexCheckError: state.checkError || '', indexUpdatedAt: state.updatedAt || '', indexedAt: state.indexedAt || ''
  };
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
  deleteFileSearchDocumentByName_(documentName, config.apiKey);
}

function deleteFileSearchDocumentByName_(documentName, apiKey) {
  fileSearchFetchJson_(FILE_SEARCH_API_ROOT + documentName + '?force=true', {method: 'delete', apiKey: apiKey});
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

function listFileSearchDocuments_(storeName, apiKey) {
  var output = [];
  var pageToken = '';
  for (var page = 0; page < 25; page++) {
    var url = FILE_SEARCH_API_ROOT + storeName + '/documents?pageSize=20' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    var payload = fileSearchFetchJson_(url, {method: 'get', apiKey: apiKey});
    var documents = payload.documents || payload.fileSearchStoreDocuments || [];
    output = output.concat(documents);
    pageToken = payload.nextPageToken || '';
    if (!pageToken) break;
  }
  return output.sort(function(left, right) {
    var rightTime = Date.parse(right.createTime || right.updateTime || '');
    var leftTime = Date.parse(left.createTime || left.updateTime || '');
    if (!isFinite(rightTime)) rightTime = 0;
    if (!isFinite(leftTime)) leftTime = 0;
    return rightTime - leftTime;
  });
}

function fileSearchMetadataValue_(document, key) {
  var item = (document.customMetadata || document.custom_metadata || []).filter(function(metadata) { return metadata.key === key; })[0];
  return item ? item.stringValue || item.string_value || item.numericValue || item.numeric_value || '' : '';
}

function listFileSearchDocumentsForSource_(storeName, source, apiKey) {
  return listFileSearchDocuments_(storeName, apiKey).filter(function(document) {
    return fileSearchMetadataValue_(document, 'source_id') === source.sourceId || fileSearchMetadataValue_(document, 'drive_id') === source.driveId;
  });
}

function findFileSearchDocumentForSource_(storeName, sourceId, apiKey) {
  var match = listFileSearchDocuments_(storeName, apiKey).filter(function(document) {
    return fileSearchMetadataValue_(document, 'source_id') === sourceId;
  })[0];
  return match && match.name || '';
}

function deleteFileSearchDocumentsForSource_(storeName, source, apiKey) {
  var documents = listFileSearchDocumentsForSource_(storeName, source, apiKey);
  documents.forEach(function(document) {
    if (document.name) deleteFileSearchDocumentByName_(document.name, apiKey);
  });
  return documents.map(function(document) { return document.name; }).filter(Boolean);
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
  var code = response.getResponseCode();
  var status = payload.error && payload.error.status ? ' ' + payload.error.status : '';
  var message = payload.error && payload.error.message || truncate_(response.getContentText(), 500) || 'Request failed.';
  return 'HTTP ' + code + status + ': ' + message;
}

function getHeaderIgnoreCase_(headers, name) {
  var target = String(name).toLowerCase();
  var key = Object.keys(headers || {}).filter(function(item) { return String(item).toLowerCase() === target; })[0];
  var value = key ? headers[key] : '';
  return Array.isArray(value) ? value[0] : value;
}
