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
          selectedByDefault: source.status === 'active',
          url: source.driveId ? 'https://drive.google.com/open?id=' + source.driveId : ''
        });
      });
  }

  if (access.allowed.documents) {
    listGeneratedDocumentsForProject_(access.project, Boolean(access.allowed.history), Boolean(access.allowed.edit)).forEach(function(document) {
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
        selectedByDefault: false,
        sourceConversation: document.sourceConversation || '',
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
      createdBy: record.createdBy || '',
      sourceConversation: record.sourceConversation || ''
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
  appendControlRow_(access.project, 'Documents', [file.getId(), file.getName(), file.getMimeType(), nowIso_(), access.email, file.getId(), conversationId]);
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
  appendControlRow_(access.project, 'Documents', [file.getId(), file.getName(), file.getMimeType(), nowIso_(), access.email, file.getId(), 'manual']);
  incrementGeneratedDocumentCount_(projectId, access.project);
  return publicGeneratedFile_(file, 'generated', normalizedParents, 'manual');
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
        status: 'active',
        kind: 'source'
      };
    });
  listGeneratedDocumentsForProject_(project, true, true).forEach(function(document) {
    records.push({
      sourceId: 'document:' + document.id,
      name: document.name,
      driveId: document.id,
      mimeType: document.mimeType,
      status: 'active',
      kind: document.kind || 'generated'
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
        createdAt: file.createdAt || file.updatedAt, createdBy: '', sourceConversation: '', updatedAt: file.updatedAt
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
  var data = readJsonFile_(getFirstFileByName_(folder, DOCUMENT_INDEX_FILE), {schemaVersion: 1, documents: []});
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
  if (/^(source|document):/.test(id)) return id;
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

function publicGeneratedFile_(file, kind, parentIds, sourceConversation) {
  return {
    id: file.getId(), name: file.getName(), mimeType: file.getMimeType(), url: file.getUrl(),
    size: Number(file.getSize() || 0), createdAt: file.getDateCreated().toISOString(),
    updatedAt: file.getLastUpdated().toISOString(), kind: kind || 'generated',
    parentIds: normalizeDocumentParentIds_(parentIds), sourceConversation: sourceConversation || ''
  };
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
