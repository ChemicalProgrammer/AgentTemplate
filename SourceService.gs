var SOURCE_INDEX_FILE = 'Sources Index.json';

function listSources(projectId) {
  var access = assertProjectAccess_(projectId, 'sources');
  return readSourceIndex_(access.project).sources.filter(function(source) { return source.status !== 'removed'; });
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
      origin: 'drive-copy'
    };
    index.sources.push(record);
    appendControlRow_(project, 'Sources', [record.sourceId, record.name, record.mimeType, record.driveId, record.status, record.addedAt, record.addedBy]);
    return record;
  });
  writeSourceIndex_(project, index);
  touchProjectStats_(projectId, {sourceCount: index.sources.filter(function(item) { return item.status !== 'removed'; }).length});
  return {added: added, limited: imported.files.length >= APP.MAX_SOURCE_FILES};
}

function uploadSource(projectId, upload) {
  var access = assertProjectEdit_(projectId, 'sources');
  upload = upload || {};
  var name = normalizeName_(upload.name, 'Source');
  var mimeType = String(upload.mimeType || MimeType.PLAIN_TEXT);
  var base64 = String(upload.base64 || '').replace(/^data:[^;]+;base64,/, '');
  var bytes = Utilities.base64Decode(base64);
  if (bytes.length > APP.MAX_UPLOAD_BYTES) throw new Error('The file exceeds the 6 MB in-app upload limit. Use a Drive link for larger files.');
  var folder = DriveApp.getFolderById(access.project.folders.sources);
  var file = folder.createFile(Utilities.newBlob(bytes, mimeType, name));
  var index = readSourceIndex_(access.project);
  var record = {
    sourceId: uuid_(), name: file.getName(), driveId: file.getId(), mimeType: file.getMimeType(),
    size: Number(file.getSize() || 0), status: 'active', addedAt: nowIso_(),
    updatedAt: file.getLastUpdated().toISOString(), addedBy: access.email, origin: 'upload'
  };
  index.sources.push(record);
  writeSourceIndex_(access.project, index);
  appendControlRow_(access.project, 'Sources', [record.sourceId, record.name, record.mimeType, record.driveId, record.status, record.addedAt, record.addedBy]);
  touchProjectStats_(projectId, {sourceCount: index.sources.filter(function(item) { return item.status !== 'removed'; }).length});
  return record;
}

function setSourceActive(projectId, sourceId, active) {
  var access = assertProjectEdit_(projectId, 'sources');
  var index = readSourceIndex_(access.project);
  var source = index.sources.filter(function(item) { return item.sourceId === sourceId; })[0];
  if (!source) throw new Error('Source not found.');
  source.status = active ? 'active' : 'inactive';
  source.updatedAt = nowIso_();
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
  try { DriveApp.getFileById(source.driveId).setTrashed(true); } catch (error) { console.warn(error.message); }
  writeSourceIndex_(access.project, index);
  touchProjectStats_(projectId, {sourceCount: index.sources.filter(function(item) { return item.status !== 'removed'; }).length});
  return {removed: true, sourceId: sourceId};
}

function readSourceIndex_(project) {
  var folder = DriveApp.getFolderById(project.folders.sources);
  var data = readJsonFile_(getFirstFileByName_(folder, SOURCE_INDEX_FILE), {schemaVersion: 1, sources: []});
  data.sources = data.sources || [];
  return data;
}

function writeSourceIndex_(project, index) {
  writeJsonFile_(DriveApp.getFolderById(project.folders.sources), SOURCE_INDEX_FILE, index);
}

function buildSourceContext_(project, query, selectedSourceIds) {
  var requested = selectedSourceIds == null ? null : selectedSourceIds.map(String);
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

  selected.forEach(function(source, position) {
    try {
      var file = DriveApp.getFileById(source.driveId);
      var extracted = extractSource_(file);
      var label = 'S' + (position + 1);
      if (extracted.text) {
        chunkText_(extracted.text, 6000, 500).forEach(function(chunk, chunkIndex) {
          candidates.push({source: source, label: label, chunk: chunk, chunkIndex: chunkIndex, score: scoreChunk_(chunk, queryTerms)});
        });
      } else if (extracted.inlineData && inlineBytes + extracted.byteLength <= APP.MAX_INLINE_BYTES) {
        inlineParts.push({text: '[' + label + '] Binary file: ' + source.name});
        inlineParts.push({inlineData: extracted.inlineData});
        inlineBytes += extracted.byteLength;
        used.push({sourceId: source.sourceId, label: label, name: source.name, mimeType: source.mimeType, kind: source.kind});
      }
    } catch (error) {
      console.warn('Source skipped ' + source.name + ': ' + error.message);
    }
  });

  candidates.sort(function(a, b) { return b.score - a.score; });
  var chosen = candidates.slice(0, 12);
  var chars = 0;
  var textSections = [];
  chosen.forEach(function(item) {
    if (chars >= APP.MAX_TEXT_CONTEXT_CHARS) return;
    var section = '[' + item.label + '] ' + item.source.name + ' — excerpt ' + (item.chunkIndex + 1) + '\n' + item.chunk;
    section = truncate_(section, APP.MAX_TEXT_CONTEXT_CHARS - chars);
    chars += section.length;
    textSections.push(section);
    if (!used.some(function(source) { return source.sourceId === item.source.sourceId; })) {
      used.push({sourceId: item.source.sourceId, label: item.label, name: item.source.name, mimeType: item.source.mimeType, kind: item.source.kind});
    }
  });
  return {text: textSections.join('\n\n---\n\n'), inlineParts: inlineParts, sourcesUsed: used};
}

function extractSource_(file) {
  var mime = file.getMimeType();
  var text = '';
  if (mime === MimeType.GOOGLE_DOCS) {
    text = DocumentApp.openById(file.getId()).getBody().getText();
  } else if (mime === MimeType.GOOGLE_SHEETS) {
    var ss = SpreadsheetApp.openById(file.getId());
    text = ss.getSheets().map(function(sheet) {
      var values = sheet.getDataRange().getDisplayValues();
      return '# Sheet: ' + sheet.getName() + '\n' + values.map(function(row) { return row.join('\t'); }).join('\n');
    }).join('\n\n');
  } else if (mime === MimeType.GOOGLE_SLIDES) {
    var deck = SlidesApp.openById(file.getId());
    text = deck.getSlides().map(function(slide, index) {
      var fragments = [];
      slide.getPageElements().forEach(function(element) {
        try {
          if (element.getPageElementType() === SlidesApp.PageElementType.SHAPE) fragments.push(element.asShape().getText().asString());
          if (element.getPageElementType() === SlidesApp.PageElementType.TABLE) {
            var table = element.asTable();
            for (var r = 0; r < table.getNumRows(); r++) for (var c = 0; c < table.getNumColumns(); c++) fragments.push(table.getCell(r, c).getText().asString());
          }
        } catch (ignore) {}
      });
      return '# Slide ' + (index + 1) + '\n' + fragments.join('\n');
    }).join('\n\n');
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
