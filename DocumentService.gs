var DOCUMENT_INDEX_FILE = 'Documents Index.json';

function listGeneratedDocuments(projectId) {
  var access = assertProjectAccess_(projectId, 'documents');
  return listGeneratedDocumentsForProject_(access.project, Boolean(access.allowed.history), Boolean(access.allowed.edit));
}

function listProjectDocuments(projectId) {
  var access = assertProjectAccess_(projectId);
  var nodes = [];

  if (access.allowed.sources) {
    readSourceIndex_(access.project).sources
      .filter(function(source) { return source.status !== 'removed'; })
      .forEach(function(source) {
        source = applyFileSearchStateToSource_(access.project, source);
        nodes.push({
          nodeId: 'source:' + source.sourceId,
          sourceId: source.sourceId,
          driveId: source.driveId,
          name: source.name,
          mimeType: source.mimeType,
          size: Number(source.size || 0),
          createdAt: source.addedAt || source.updatedAt,
          updatedAt: source.updatedAt || source.addedAt,
          kind: 'source',
          status: source.status,
          level: 0,
          parentIds: [],
          note: source.note || '',
          indexStatus: source.indexStatus || 'not_indexed',
          indexError: source.indexError || '',
          indexCheckError: source.indexCheckError || '',
          indexStage: source.indexStage || '',
          indexProgress: Number(source.indexProgress || 0),
          indexUpdatedAt: source.indexUpdatedAt || '',
          indexedAt: source.indexedAt || '',
          selectedByDefault: source.status === 'active',
          url: source.driveId ? 'https://drive.google.com/open?id=' + source.driveId : ''
        });
      });
  }

  if (access.allowed.documents) {
    listGeneratedDocumentsForProject_(access.project, Boolean(access.allowed.history), false).forEach(function(document) {
      nodes.push({
        nodeId: 'document:' + document.id,
        driveId: document.id,
        name: document.name,
        mimeType: document.mimeType,
        size: Number(document.size || 0),
        createdAt: document.createdAt || document.updatedAt,
        updatedAt: document.updatedAt,
        kind: document.kind || 'generated',
        status: 'active',
        level: 1,
        parentIds: normalizeDocumentParentIds_(document.parentIds),
        note: document.note || '',
        selectedByDefault: false,
          sourceConversation: document.sourceConversation || '',
          artifactType: document.artifactType || '',
          artifactFormat: document.artifactFormat || '',
          artifactStatus: document.artifactStatus || '',
          artifactVersion: Number(document.artifactVersion || 0),
          presentationTemplateId: document.presentationTemplateId || '',
          presentationTemplateName: document.presentationTemplateName || '',
          presentationTemplateOrigin: document.presentationTemplateOrigin || '',
          workflowId: document.workflowId || '',
          url: document.url
      });
    });
  }

  assignDocumentLevels_(nodes);
  return nodes.sort(function(a, b) {
    if (a.level !== b.level) return a.level - b.level;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

function listGeneratedDocumentsForProject_(project, includePdfs, allowRepair) {
  var documents = listFilesRecursive_(DriveApp.getFolderById(project.folders.documents), [], 300)
    .filter(function(file) { return file.name !== DOCUMENT_INDEX_FILE; });
  var pdfs = [];
  if (includePdfs && project.folders.pdfs) {
    try { pdfs = listFilesRecursive_(DriveApp.getFolderById(project.folders.pdfs), [], 300); } catch (error) { console.warn(error.message); }
  }
  var files = documents.concat(pdfs);
  var index = allowRepair ? reconcileDocumentIndex_(project, files) : readDocumentIndex_(project);
  var byId = {};
  index.documents.forEach(function(record) { byId[record.driveId] = record; });
  return files.map(function(file) {
    var record = byId[file.id] || {};
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      url: file.url,
      size: Number(file.size || 0),
      createdAt: file.createdAt || record.createdAt || file.updatedAt,
      updatedAt: file.updatedAt,
      kind: record.kind || (file.mimeType === MimeType.PDF ? 'pdf' : 'generated'),
      parentIds: normalizeDocumentParentIds_(record.parentIds),
      note: record.note || '',
      createdBy: record.createdBy || '',
      sourceConversation: record.sourceConversation || '',
      artifactType: record.artifactType || '',
      artifactFormat: record.artifactFormat || '',
      artifactStatus: record.artifactStatus || '',
      artifactVersion: Number(record.artifactVersion || 0),
      presentationTemplateId: record.presentationTemplateId || '',
      presentationTemplateName: record.presentationTemplateName || '',
      presentationTemplateOrigin: record.presentationTemplateOrigin || '',
      workflowId: record.workflowId || ''
    };
  }).sort(function(a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
}

function saveAssistantMessageAsDocument(projectId, conversationId, messageId, title) {
  var access = assertProjectEdit_(projectId, 'documents');
  assertProjectAccess_(projectId, 'history');
  var conversation = readConversation_(access.project, conversationId);
  var message = conversation.messages.filter(function(item) { return item.messageId === messageId && item.role === 'assistant'; })[0];
  if (!message) throw new Error('The response could not be found.');

  var docName = normalizeName_(title, conversation.title + ' - response');
  var doc = DocumentApp.create(docName);
  var body = doc.getBody();
  body.appendParagraph(access.project.title).setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph(docName).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(message.text);
  if (message.sourcesUsed && message.sourcesUsed.length) {
    body.appendParagraph('Sources used').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    message.sourcesUsed.forEach(function(source) { body.appendListItem('[' + source.label + '] ' + source.name); });
  }
  body.appendParagraph('Generated: ' + formatDateForDoc_(message.createdAt));
  doc.saveAndClose();
  var file = DriveApp.getFileById(doc.getId());
  file.moveTo(DriveApp.getFolderById(access.project.folders.documents));

  var parentIds = (message.sourcesUsed || []).map(function(source) { return normalizeDocumentParentId_(source.sourceId); }).filter(Boolean);
  recordGeneratedDocument_(access.project, file, {
    kind: 'generated', parentIds: parentIds, createdBy: access.email, sourceConversation: conversationId
  });
  appendControlRow_(access.project, 'Documents', [file.getId(), file.getName(), file.getMimeType(), nowIso_(), access.email, file.getId(), conversationId, '']);
  incrementGeneratedDocumentCount_(projectId, access.project);
  return publicGeneratedFile_(file, 'generated', parentIds, conversationId);
}

function createDocumentFromText(projectId, title, content, parentIds) {
  var access = assertProjectEdit_(projectId, 'documents');
  var docName = normalizeName_(title, 'Generated document');
  var doc = DocumentApp.create(docName);
  doc.getBody().appendParagraph(docName).setHeading(DocumentApp.ParagraphHeading.TITLE);
  doc.getBody().appendParagraph(sanitizeText_(content, 150000));
  doc.saveAndClose();
  var file = DriveApp.getFileById(doc.getId());
  file.moveTo(DriveApp.getFolderById(access.project.folders.documents));
  var normalizedParents = normalizeDocumentParentIds_(parentIds);
  recordGeneratedDocument_(access.project, file, {kind: 'generated', parentIds: normalizedParents, createdBy: access.email, sourceConversation: 'manual'});
  appendControlRow_(access.project, 'Documents', [file.getId(), file.getName(), file.getMimeType(), nowIso_(), access.email, file.getId(), 'manual', '']);
  incrementGeneratedDocumentCount_(projectId, access.project);
  return publicGeneratedFile_(file, 'generated', normalizedParents, 'manual');
}

function createAgentArtifact_(project, accessEmail, conversation, artifact, model) {
  artifact = artifact || {};
  var format = String(artifact.format || 'markdown').trim().toLowerCase();
  return format === 'json'
    ? createJsonArtifact_(project, accessEmail, conversation, artifact, model)
    : createMarkdownArtifact_(project, accessEmail, conversation, artifact, model);
}

function createMarkdownArtifact_(project, accessEmail, conversation, artifact, model) {
  artifact = artifact || {};
  var content = sanitizeText_(artifact.content, 300000).trim();
  if (!content) throw new Error('The artifact did not contain Markdown content.');
  var artifactType = normalizeArtifactType_(artifact.artifactType || artifact.artifact_type);
  var title = normalizeName_(artifact.title, artifactTitleForType_(artifactType));
  var index = readDocumentIndex_(project);
  var previous = index.documents.filter(function(record) {
    return record.sourceConversation === conversation.conversationId && record.artifactType === artifactType;
  }).sort(function(a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
  var version = previous.length ? Number(previous[0].artifactVersion || previous.length) + 1 : 1;
  var fileName = title.replace(/\.md$/i, '') + (version > 1 ? ' - v' + version : '') + '.md';
  var parentIds = resolveArtifactParentIds_(
    project,
    conversation,
    artifact.parentIds || artifact.parent_ids || [],
    artifact.parentArtifactType || artifact.parent_artifact_type || ''
  );
  var folder = DriveApp.getFolderById(project.folders.documents);
  var file = folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
  var workflowId = sanitizeText_(artifact.workflowId || artifact.workflow_id || conversation.workflowId || conversation.conversationId, 120).trim();
  var metadata = {
    kind: 'artifact',
    parentIds: parentIds,
    createdBy: accessEmail,
    sourceConversation: conversation.conversationId,
    note: sanitizeText_(artifact.note || '', 1200).trim(),
    artifactType: artifactType,
    artifactFormat: 'markdown',
    artifactStatus: sanitizeText_(artifact.status || 'complete', 40).trim(),
    artifactVersion: version,
    workflowId: workflowId,
    model: normalizeModel_(model || conversation.model || APP.DEFAULT_MODEL)
  };
  var record = recordGeneratedDocument_(project, file, metadata);
  appendControlRow_(project, 'Documents', [file.getId(), file.getName(), file.getMimeType(), nowIso_(), accessEmail, file.getId(), conversation.conversationId, metadata.note]);
  incrementGeneratedDocumentCount_(project.projectId || conversation.projectId, project);
  var result = publicGeneratedFile_(file, 'artifact', parentIds, conversation.conversationId, record);
  result.nodeId = 'document:' + file.getId();
  return result;
}

function createJsonArtifact_(project, accessEmail, conversation, artifact, model) {
  artifact = artifact || {};
  var data = artifact.content;
  if (typeof data === 'string') data = safeJsonParse_(data, null);
  if (data == null || typeof data !== 'object') throw new Error('The JSON artifact did not contain a valid object or array.');
  var artifactType = normalizeArtifactType_(artifact.artifactType || artifact.artifact_type || 'json_artifact');
  var title = normalizeName_(artifact.title, artifactTitleForType_(artifactType));
  var index = readDocumentIndex_(project);
  var previous = index.documents.filter(function(record) {
    return record.sourceConversation === conversation.conversationId && record.artifactType === artifactType;
  }).sort(function(a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
  var version = previous.length ? Number(previous[0].artifactVersion || previous.length) + 1 : 1;
  var fileName = title.replace(/\.json$/i, '') + (version > 1 ? ' - v' + version : '') + '.json';
  var parentIds = resolveArtifactParentIds_(
    project,
    conversation,
    artifact.parentIds || artifact.parent_ids || [],
    artifact.parentArtifactType || artifact.parent_artifact_type || ''
  );
  var presentation = artifact.presentation || {};
  var template = resolveJsonPresentationTemplate_(project, presentation);
  var jsonText = JSON.stringify(data, null, 2);
  var folder = DriveApp.getFolderById(project.folders.documents);
  var file = folder.createFile(Utilities.newBlob(jsonText, 'application/json', fileName));
  var workflowId = sanitizeText_(artifact.workflowId || artifact.workflow_id || conversation.workflowId || conversation.conversationId, 120).trim();
  var metadata = {
    kind: 'artifact',
    parentIds: parentIds,
    createdBy: accessEmail,
    sourceConversation: conversation.conversationId,
    note: sanitizeText_(artifact.note || '', 1200).trim(),
    artifactType: artifactType,
    artifactFormat: 'json',
    artifactStatus: sanitizeText_(artifact.status || 'complete', 40).trim(),
    artifactVersion: version,
    workflowId: workflowId,
    model: normalizeModel_(model || conversation.model || APP.DEFAULT_MODEL),
    presentationTemplateId: template ? template.templateId : '',
    presentationTemplateName: template ? template.name : '',
    presentationTemplateOrigin: template ? template.origin : ''
  };
  var record = recordGeneratedDocument_(project, file, metadata);
  appendControlRow_(project, 'Documents', [file.getId(), file.getName(), file.getMimeType(), nowIso_(), accessEmail, file.getId(), conversation.conversationId, metadata.note]);
  incrementGeneratedDocumentCount_(project.projectId || conversation.projectId, project);
  var result = publicGeneratedFile_(file, 'artifact', parentIds, conversation.conversationId, record);
  result.nodeId = 'document:' + file.getId();
  return result;
}

function getDocumentPreview(projectId, nodeId) {
  var resolved = resolveProjectDocumentFile_(projectId, nodeId);
  var file = resolved.file;

  var mimeType = file.getMimeType();
  var name = file.getName();
  var lowerName = name.toLowerCase();
  var textMode = /^text\//.test(mimeType) || /\.(md|markdown|txt|json|csv|tsv|xml|html?|css|js|ts|py|java|sql|yaml|yml)$/i.test(lowerName);
  if (textMode) {
    if (Number(file.getSize() || 0) > 2 * 1024 * 1024) throw new Error('The text preview is limited to 2 MB. Open this file in Drive instead.');
    var text = file.getBlob().getDataAsString('UTF-8');
    if (/\.json$/i.test(lowerName) || mimeType === 'application/json') {
      var data = safeJsonParse_(text, null);
      var hasPresentation = Boolean(resolved.record && (resolved.record.presentationTemplateId || resolved.record.presentationTemplateName));
      if (data != null && hasPresentation) {
        try {
          var rendered = buildTemplatedJsonArtifactView_(resolved, text, data);
          if (rendered) return rendered;
        } catch (templateError) {
          return {nodeId:resolved.nodeId, name:name, mimeType:mimeType, mode:'json', text:text, presentationError:readableErrorMessage_(templateError), url:file.getUrl()};
        }
      }
      return {nodeId: resolved.nodeId, name: name, mimeType: mimeType, mode: 'json', text: text, url: file.getUrl()};
    }
    var mode = /\.(md|markdown)$/i.test(lowerName) ? 'markdown' : /\.html?$/i.test(lowerName) || mimeType === 'text/html' ? 'html' : 'text';
    return {nodeId: resolved.nodeId, name: name, mimeType: mimeType, mode: mode, text: text, url: file.getUrl()};
  }
  return {nodeId: resolved.nodeId, name: name, mimeType: mimeType, mode: 'drive', previewUrl: buildDrivePreviewUrl_(file), url: file.getUrl()};
}

function buildTemplatedJsonArtifactView_(resolved, text, data) {
  var record = resolved.record || {};
  var template = resolveJsonPresentationTemplate_(resolved.project, {
    templateId: record.presentationTemplateId || '',
    templateName: record.presentationTemplateName || ''
  });
  if (!template) return null;
  return {
    nodeId: resolved.nodeId,
    name: resolved.file.getName(),
    mimeType: resolved.file.getMimeType(),
    mode: 'templated_json',
    text: text,
    renderedHtml: renderJsonArtifactWithTemplate_(template, data),
    presentation: {templateId:template.templateId, templateName:template.name, origin:template.origin},
    url: resolved.file.getUrl()
  };
}

function exportTemplatedJsonArtifactToHtml(projectId, nodeId, options) {
  options = options || {};
  var resolved = resolveProjectDocumentFile_(projectId, nodeId);
  var mimeType = resolved.file.getMimeType();
  var sourceName = resolved.file.getName();
  if (!(mimeType === 'application/json' || /\.json$/i.test(sourceName))) {
    throw new Error('Only a JSON artifact with an HTML presentation template can be exported this way.');
  }
  if (Number(resolved.file.getSize() || 0) > 2 * 1024 * 1024) {
    throw new Error('The JSON artifact is too large to export from the viewer.');
  }
  var text = resolved.file.getBlob().getDataAsString('UTF-8');
  var data = safeJsonParse_(text, null);
  if (data == null) throw new Error('The JSON artifact is not valid.');
  if (!(resolved.record && (resolved.record.presentationTemplateId || resolved.record.presentationTemplateName))) {
    throw new Error('This JSON artifact does not have an HTML presentation template.');
  }
  var rendered = buildTemplatedJsonArtifactView_(resolved, text, data);
  if (!rendered || !rendered.renderedHtml) throw new Error('The filled HTML presentation could not be created.');

  var destination = String(options.destination || 'project').toLowerCase();
  var baseName = normalizeName_(options.fileName || sourceName.replace(/\.[^.]+$/, ''), 'HTML export').replace(/\.html?$/i, '');
  var htmlName = baseName + '.html';
  var blob = Utilities.newBlob(rendered.renderedHtml, 'text/html', htmlName);
  var outputFolder;
  var projectAccess = null;

  if (destination === 'project') {
    projectAccess = assertProjectEdit_(projectId, 'documents');
    outputFolder = DriveApp.getFolderById(projectAccess.project.folders.documents);
  } else if (destination === 'external') {
    var folderId = extractDriveId_(options.folderId || '');
    if (!folderId) throw new Error('Enter the Drive folder URL or ID where the HTML file should be saved.');
    try { outputFolder = DriveApp.getFolderById(folderId); }
    catch (error) { throw new Error('The selected Drive folder could not be opened. Check the URL and your permissions.'); }
  } else {
    throw new Error('Choose where the HTML file should be saved.');
  }

  var htmlFile = outputFolder.createFile(blob);
  if (destination === 'project') {
    var parentIds = [resolved.nodeId];
    var record = recordGeneratedDocument_(projectAccess.project, htmlFile, {
      kind: 'html-export',
      parentIds: parentIds,
      createdBy: projectAccess.email,
      sourceConversation: resolved.record && resolved.record.sourceConversation || 'viewer-export',
      artifactType: resolved.record && resolved.record.artifactType || '',
      artifactFormat: 'html',
      artifactStatus: resolved.record && resolved.record.artifactStatus || 'complete',
      artifactVersion: resolved.record && resolved.record.artifactVersion || 0,
      presentationTemplateId: rendered.presentation.templateId,
      presentationTemplateName: rendered.presentation.templateName,
      presentationTemplateOrigin: rendered.presentation.origin,
      workflowId: resolved.record && resolved.record.workflowId || '',
      model: resolved.record && resolved.record.model || '',
      note: 'Filled HTML exported from ' + sourceName
    });
    appendControlRow_(projectAccess.project, 'Documents', [htmlFile.getId(), htmlFile.getName(), htmlFile.getMimeType(), nowIso_(), projectAccess.email, htmlFile.getId(), 'viewer-export', record.note]);
    incrementGeneratedDocumentCount_(projectId, projectAccess.project);
    var projectResult = publicGeneratedFile_(htmlFile, 'html-export', parentIds, record.sourceConversation, record);
    projectResult.nodeId = 'document:' + htmlFile.getId();
    projectResult.savedInProject = true;
    return projectResult;
  }

  var externalResult = publicGeneratedFile_(htmlFile, 'html-export', [], 'external-export', {
    artifactFormat: 'html',
    presentationTemplateId: rendered.presentation.templateId,
    presentationTemplateName: rendered.presentation.templateName,
    presentationTemplateOrigin: rendered.presentation.origin
  });
  externalResult.savedInProject = false;
  externalResult.outsideProject = true;
  return externalResult;
}

function resolveProjectDocumentFile_(projectId, nodeId) {
  nodeId = String(nodeId || '').trim();
  if (nodeId.indexOf('source:') === 0) {
    var sourceAccess = assertProjectAccess_(projectId, 'sources');
    var sourceId = nodeId.slice('source:'.length);
    var source = readSourceIndex_(sourceAccess.project).sources.filter(function(item) {
      return item.sourceId === sourceId && item.status !== 'removed';
    })[0];
    if (!source || !source.driveId) throw new Error('Source document not found.');
    return {access: sourceAccess, project: sourceAccess.project, nodeId: nodeId, kind: 'source', record: source, file: DriveApp.getFileById(source.driveId)};
  }
  if (nodeId.indexOf('document:') === 0) {
    var documentAccess = assertProjectAccess_(projectId, 'documents');
    var fileId = nodeId.slice('document:'.length);
    var record = readDocumentIndex_(documentAccess.project).documents.filter(function(item) { return item.driveId === fileId; })[0];
    if (!record) throw new Error('Generated document not found.');
    return {access: documentAccess, project: documentAccess.project, nodeId: nodeId, kind: record.kind || 'generated', record: record, file: DriveApp.getFileById(fileId)};
  }
  throw new Error('Document not found.');
}

function removeGeneratedDocument(projectId, nodeId) {
  var access = assertProjectEdit_(projectId, 'documents');
  var fileId = String(nodeId || '').replace(/^document:/, '');
  if (!fileId) throw new Error('Document not found.');
  var file;
  try { file = DriveApp.getFileById(fileId); } catch (error) { throw new Error('Document not found.'); }
  var name = file.getName();
  file.setTrashed(true);
  var index = readDocumentIndex_(access.project);
  index.documents = index.documents.filter(function(record) { return record.driveId !== fileId; });
  writeDocumentIndex_(access.project, index);
  appendControlRow_(access.project, 'Change Log', [nowIso_(), access.email, 'DELETE_DOCUMENT', 'Document', fileId, name]);
  var count = countGeneratedDocuments_(access.project);
  touchProjectStats_(projectId, {documentCount: count});
  return {removed: true, nodeId: 'document:' + fileId, documentCount: count};
}

function updateDocumentNote(projectId, nodeId, note) {
  nodeId = String(nodeId || '');
  note = sanitizeText_(note, 1200).trim();
  if (nodeId.indexOf('source:') === 0) {
    var sourceAccess = assertProjectEdit_(projectId, 'sources');
    var sourceId = nodeId.slice('source:'.length);
    var sourceIndex = readSourceIndex_(sourceAccess.project);
    var source = sourceIndex.sources.filter(function(item) { return item.sourceId === sourceId && item.status !== 'removed'; })[0];
    if (!source) throw new Error('Source document not found.');
    source.note = note;
    source.updatedAt = nowIso_();
    writeSourceIndex_(sourceAccess.project, sourceIndex);
    updateControlEntityNote_(sourceAccess.project, 'Sources', sourceId, note);
    appendControlRow_(sourceAccess.project, 'Change Log', [nowIso_(), sourceAccess.email, 'UPDATE_DOCUMENT_NOTE', 'Source', sourceId, note]);
    return {nodeId: nodeId, note: note};
  }

  var documentAccess = assertProjectEdit_(projectId, 'documents');
  var fileId = nodeId.replace(/^document:/, '');
  var documentIndex = readDocumentIndex_(documentAccess.project);
  var document = documentIndex.documents.filter(function(item) { return item.driveId === fileId; })[0];
  if (!document) throw new Error('Generated document not found.');
  document.note = note;
  document.updatedAt = nowIso_();
  writeDocumentIndex_(documentAccess.project, documentIndex);
  updateControlEntityNote_(documentAccess.project, 'Documents', fileId, note);
  appendControlRow_(documentAccess.project, 'Change Log', [nowIso_(), documentAccess.email, 'UPDATE_DOCUMENT_NOTE', 'Document', fileId, note]);
  return {nodeId: 'document:' + fileId, note: note};
}

function getDocumentContextRecords_(project) {
  var records = readSourceIndex_(project).sources
    .filter(function(source) { return source.status !== 'removed'; })
    .map(function(source) {
      return {
        sourceId: 'source:' + source.sourceId,
        legacySourceId: source.sourceId,
        name: source.name,
        driveId: source.driveId,
        mimeType: source.mimeType,
        status: source.status || 'active',
        kind: 'source',
        note: source.note || ''
      };
    });
  listGeneratedDocumentsForProject_(project, true, false).forEach(function(document) {
    records.push({
      sourceId: 'document:' + document.id,
      name: document.name,
      driveId: document.id,
      mimeType: document.mimeType,
      status: 'active',
      kind: document.kind || 'generated',
      note: document.note || ''
    });
  });
  return records;
}

function recordGeneratedDocument_(project, file, metadata) {
  metadata = metadata || {};
  var index = readDocumentIndex_(project);
  var record = index.documents.filter(function(item) { return item.driveId === file.getId(); })[0];
  var value = {
    documentId: record ? record.documentId : uuid_(),
    driveId: file.getId(),
    name: file.getName(),
    mimeType: file.getMimeType(),
    kind: metadata.kind || (file.getMimeType() === MimeType.PDF ? 'pdf' : 'generated'),
    parentIds: normalizeDocumentParentIds_(metadata.parentIds),
    createdAt: record && record.createdAt ? record.createdAt : file.getDateCreated().toISOString(),
    createdBy: metadata.createdBy || record && record.createdBy || '',
    sourceConversation: metadata.sourceConversation || record && record.sourceConversation || '',
    artifactType: normalizeArtifactType_(metadata.artifactType || record && record.artifactType || ''),
    artifactFormat: metadata.artifactFormat || record && record.artifactFormat || '',
    artifactStatus: metadata.artifactStatus || record && record.artifactStatus || '',
    artifactVersion: Number(metadata.artifactVersion || record && record.artifactVersion || 0),
    presentationTemplateId: metadata.presentationTemplateId || record && record.presentationTemplateId || '',
    presentationTemplateName: metadata.presentationTemplateName || record && record.presentationTemplateName || '',
    presentationTemplateOrigin: metadata.presentationTemplateOrigin || record && record.presentationTemplateOrigin || '',
    workflowId: metadata.workflowId || record && record.workflowId || '',
    model: metadata.model || record && record.model || '',
    note: metadata.note != null ? sanitizeText_(metadata.note, 1200).trim() : record && record.note || '',
    updatedAt: file.getLastUpdated().toISOString()
  };
  if (record) Object.keys(value).forEach(function(key) { record[key] = value[key]; }); else index.documents.push(value);
  writeDocumentIndex_(project, index);
  return value;
}

function reconcileDocumentIndex_(project, files) {
  var index = readDocumentIndex_(project);
  var changed = false;
  files.forEach(function(file) {
    var record = index.documents.filter(function(item) { return item.driveId === file.id; })[0];
    if (!record) {
      index.documents.push({
        documentId: uuid_(), driveId: file.id, name: file.name, mimeType: file.mimeType,
        kind: file.mimeType === MimeType.PDF ? 'pdf' : 'generated', parentIds: [],
        createdAt: file.createdAt || file.updatedAt, createdBy: '', sourceConversation: '', note: '', updatedAt: file.updatedAt
      });
      changed = true;
    } else if (record.name !== file.name || record.mimeType !== file.mimeType || record.updatedAt !== file.updatedAt) {
      record.name = file.name; record.mimeType = file.mimeType; record.updatedAt = file.updatedAt; changed = true;
    }
  });
  if (changed) writeDocumentIndex_(project, index);
  return index;
}

function readDocumentIndex_(project) {
  var folder = DriveApp.getFolderById(project.folders.documents);
  var data = readJsonFile_(getFirstFileByName_(folder, DOCUMENT_INDEX_FILE), {schemaVersion: 3, documents: []});
  data.schemaVersion = 3;
  data.documents = data.documents || [];
  return data;
}

function writeDocumentIndex_(project, index) {
  writeJsonFile_(DriveApp.getFolderById(project.folders.documents), DOCUMENT_INDEX_FILE, index);
}

function assignDocumentLevels_(nodes) {
  var byId = {};
  nodes.forEach(function(node) { byId[node.nodeId] = node; });
  function resolve(node, trail) {
    if (!node || node.kind === 'source') return 0;
    if (node._resolvedLevel != null) return node._resolvedLevel;
    trail = trail || {};
    if (trail[node.nodeId]) return 1;
    trail[node.nodeId] = true;
    // Project Sources are roots (internal level 0). Every generated format uses
    // the same rule: max(parent level) + 1, or Level 1 when it has no parents.
    var parents = (node.parentIds || []).map(function(id) { return byId[id]; }).filter(Boolean);
    var parentLevel = parents.length ? Math.max.apply(null, parents.map(function(parent) { return resolve(parent, Object.assign({}, trail)); })) : 0;
    node._resolvedLevel = parentLevel + 1;
    return node._resolvedLevel;
  }
  nodes.forEach(function(node) { node.level = resolve(node, {}); delete node._resolvedLevel; });
}

function normalizeDocumentParentIds_(ids) {
  return Array.isArray(ids) ? ids.map(normalizeDocumentParentId_).filter(Boolean).filter(function(id, index, all) { return all.indexOf(id) === index; }) : [];
}

function normalizeDocumentParentId_(id) {
  id = String(id || '').trim();
  if (!id) return '';
  if (/^(source|document|agent-source):/.test(id)) return id;
  return 'source:' + id;
}

function inferConversationParentIds_(conversation) {
  var ids = [];
  (conversation.messages || []).forEach(function(message) {
    (message.sourcesUsed || []).forEach(function(source) {
      var id = normalizeDocumentParentId_(source.sourceId);
      if (id && ids.indexOf(id) === -1) ids.push(id);
    });
  });
  return ids;
}

function publicGeneratedFile_(file, kind, parentIds, sourceConversation, metadata) {
  metadata = metadata || {};
  return {
    id: file.getId(), name: file.getName(), mimeType: file.getMimeType(), url: file.getUrl(),
    size: Number(file.getSize() || 0), createdAt: file.getDateCreated().toISOString(),
    updatedAt: file.getLastUpdated().toISOString(), kind: kind || 'generated',
    parentIds: normalizeDocumentParentIds_(parentIds), sourceConversation: sourceConversation || '', note: metadata.note || '',
    artifactType: metadata.artifactType || '', artifactStatus: metadata.artifactStatus || '',
    artifactFormat: metadata.artifactFormat || '', artifactVersion: Number(metadata.artifactVersion || 0), workflowId: metadata.workflowId || '', model: metadata.model || '',
    presentationTemplateId: metadata.presentationTemplateId || '', presentationTemplateName: metadata.presentationTemplateName || '',
    presentationTemplateOrigin: metadata.presentationTemplateOrigin || ''
  };
}

function normalizeArtifactType_(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'markdown_artifact';
}

function artifactTitleForType_(artifactType) {
  var titles = {
    project_approval_canvas: 'Project Approval Canvas',
    executive_decision_brief: 'Executive Decision Brief',
    stakeholder_pitch_kit: 'Stakeholder Pitch Kit'
  };
  return titles[artifactType] || String(artifactType || 'Markdown Artifact').split('_').map(function(word) {
    return word ? word.charAt(0).toUpperCase() + word.slice(1) : '';
  }).join(' ');
}

function resolveArtifactParentIds_(project, conversation, explicitParentIds, requestedParentType) {
  var explicit = validProjectParentIds_(project, explicitParentIds);
  if (explicit.length) return explicit;

  var parentType = requestedParentType ? normalizeArtifactType_(requestedParentType) : '';
  if (parentType) {
    var parent = readDocumentIndex_(project).documents.filter(function(record) {
      return record.sourceConversation === conversation.conversationId && record.artifactType === parentType;
    }).sort(function(a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); })[0];
    if (parent) return ['document:' + parent.driveId];
  }
  return validProjectParentIds_(project, conversation.sourceSelection || inferConversationParentIds_(conversation));
}

function validProjectParentIds_(project, ids) {
  var requested = normalizeDocumentParentIds_(ids);
  if (!requested.length) return [];
  var allowed = {};
  try {
    readSourceIndex_(project).sources.filter(function(source) { return source.status !== 'removed'; }).forEach(function(source) {
      allowed['source:' + source.sourceId] = true;
    });
  } catch (_) {}
  readDocumentIndex_(project).documents.forEach(function(record) { allowed['document:' + record.driveId] = true; });
  requested.forEach(function(id) { if (id.indexOf('agent-source:') === 0) allowed[id] = true; });
  return requested.filter(function(id) { return Boolean(allowed[id]); });
}

function buildDrivePreviewUrl_(file) {
  var id = file.getId();
  var mimeType = file.getMimeType();
  if (mimeType === MimeType.GOOGLE_DOCS) return 'https://docs.google.com/document/d/' + id + '/preview';
  if (mimeType === MimeType.GOOGLE_SHEETS) return 'https://docs.google.com/spreadsheets/d/' + id + '/preview';
  if (mimeType === MimeType.GOOGLE_SLIDES) return 'https://docs.google.com/presentation/d/' + id + '/embed?start=false&loop=false';
  return 'https://drive.google.com/file/d/' + id + '/preview';
}

function updateControlEntityNote_(project, sheetName, entityId, note) {
  if (!project.controlFileId) return;
  try {
    var sheet = SpreadsheetApp.openById(project.controlFileId).getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return;
    var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
    for (var row = 0; row < ids.length; row++) {
      if (String(ids[row][0]) === String(entityId)) {
        sheet.getRange(row + 2, sheet.getLastColumn()).setValue(note);
        return;
      }
    }
  } catch (error) {
    console.warn('The document note could not be synchronized to Project Control: ' + error.message);
  }
}

function countGeneratedDocuments_(project) {
  var documents = listFilesRecursive_(DriveApp.getFolderById(project.folders.documents), [], 500)
    .filter(function(file) { return file.name !== DOCUMENT_INDEX_FILE; }).length;
  var pdfs = project.folders.pdfs ? listFilesRecursive_(DriveApp.getFolderById(project.folders.pdfs), [], 500).length : 0;
  return documents + pdfs;
}

function incrementGeneratedDocumentCount_(projectId, project) {
  touchProjectStats_(projectId, {documentCount: countGeneratedDocuments_(project)});
}
