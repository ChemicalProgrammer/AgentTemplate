function exportConversationToPdf(projectId, conversationId) {
  var access = assertProjectEdit_(projectId, 'history');
  var conversation = readConversation_(access.project, conversationId);
  var title = normalizeName_(conversation.title, 'Chat');
  var doc = DocumentApp.create('TEMP - ' + title);
  var body = doc.getBody();
  body.appendParagraph(access.project.title).setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Exported: ' + formatDateForDoc_(nowIso_()));
  body.appendHorizontalRule();

  conversation.messages.forEach(function(message) {
    var label = message.role === 'assistant' ? 'Agent' : 'User';
    body.appendParagraph(label + ' · ' + formatDateForDoc_(message.createdAt)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(message.text);
    if (message.sourcesUsed && message.sourcesUsed.length) {
      body.appendParagraph('Sources: ' + message.sourcesUsed.map(function(source) { return '[' + source.label + '] ' + source.name + (source.pageNumber ? ' (p. ' + source.pageNumber + ')' : ''); }).join(', '));
    }
    if (message.flowsUsed && message.flowsUsed.length) body.appendParagraph('Procedures: ' + message.flowsUsed.map(function(flow) { return '[' + flow.label + '] ' + flow.name; }).join(', '));
  });
  doc.saveAndClose();

  var tempFile = DriveApp.getFileById(doc.getId());
  var pdfName = title + ' - ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm') + '.pdf';
  var pdfBlob = tempFile.getAs(MimeType.PDF).setName(pdfName);
  var pdfFile = DriveApp.getFolderById(access.project.folders.pdfs).createFile(pdfBlob);
  tempFile.setTrashed(true);
  var parentIds = inferConversationParentIds_(conversation);
  recordGeneratedDocument_(access.project, pdfFile, {
    kind: 'pdf', parentIds: parentIds, createdBy: access.email, sourceConversation: conversationId
  });
  incrementGeneratedDocumentCount_(projectId, access.project);
  return publicGeneratedFile_(pdfFile, 'pdf', parentIds, conversationId);
}

function exportProjectDocumentToPdf(projectId, nodeId, options) {
  options = options || {};
  var resolved = resolveProjectDocumentFile_(projectId, nodeId);
  var destination = String(options.destination || 'project').toLowerCase();
  var baseName = normalizeName_(options.fileName || resolved.file.getName().replace(/\.[^.]+$/, ''), 'Document export').replace(/\.pdf$/i, '');
  var pdfName = baseName + '.pdf';
  var pdfBlob = createProjectDocumentPdfBlob_(resolved.file, pdfName);
  var outputFolder;
  var projectAccess = null;

  if (destination === 'project') {
    projectAccess = assertProjectEdit_(projectId, 'documents');
    outputFolder = DriveApp.getFolderById(projectAccess.project.folders.documents);
  } else if (destination === 'external') {
    var folderId = extractDriveId_(options.folderId || '');
    if (!folderId) throw new Error('Enter the Drive folder URL or ID where the PDF should be saved.');
    try { outputFolder = DriveApp.getFolderById(folderId); }
    catch (error) { throw new Error('The selected Drive folder could not be opened. Check the URL and your permissions.'); }
  } else {
    throw new Error('Choose where the PDF should be saved.');
  }

  var pdfFile = outputFolder.createFile(pdfBlob);
  if (destination === 'project') {
    var parentIds = [resolved.nodeId];
    var record = recordGeneratedDocument_(projectAccess.project, pdfFile, {
      kind: 'pdf', parentIds: parentIds, createdBy: projectAccess.email,
      sourceConversation: resolved.record && resolved.record.sourceConversation || 'viewer-export',
      note: 'PDF exported from ' + resolved.file.getName()
    });
    appendControlRow_(projectAccess.project, 'Documents', [pdfFile.getId(), pdfFile.getName(), pdfFile.getMimeType(), nowIso_(), projectAccess.email, pdfFile.getId(), 'viewer-export', record.note]);
    incrementGeneratedDocumentCount_(projectId, projectAccess.project);
    var projectResult = publicGeneratedFile_(pdfFile, 'pdf', parentIds, record.sourceConversation, record);
    projectResult.nodeId = 'document:' + pdfFile.getId();
    projectResult.savedInProject = true;
    return projectResult;
  }

  var externalResult = publicGeneratedFile_(pdfFile, 'pdf-export', [], 'external-export');
  externalResult.savedInProject = false;
  externalResult.outsideProject = true;
  return externalResult;
}

function createProjectDocumentPdfBlob_(file, pdfName) {
  var mimeType = file.getMimeType();
  if (mimeType === MimeType.PDF) return file.getBlob().copyBlob().setName(pdfName);
  if (mimeType === MimeType.GOOGLE_DOCS || mimeType === MimeType.GOOGLE_SHEETS || mimeType === MimeType.GOOGLE_SLIDES) {
    return file.getAs(MimeType.PDF).setName(pdfName);
  }

  var tempFile = null;
  try {
    var tempDoc = DocumentApp.create('TEMP PDF - ' + pdfName.replace(/\.pdf$/i, ''));
    tempFile = DriveApp.getFileById(tempDoc.getId());
    var body = tempDoc.getBody();
    body.clear();
    body.appendParagraph(file.getName()).setHeading(DocumentApp.ParagraphHeading.TITLE);
    if (/^image\//.test(mimeType)) {
      var image = body.appendImage(file.getBlob());
      var imageWidth = image.getWidth();
      var imageHeight = image.getHeight();
      if (imageWidth > 560) {
        var ratio = 560 / imageWidth;
        image.setWidth(560).setHeight(Math.round(imageHeight * ratio));
      }
    } else {
      var text = file.getBlob().getDataAsString('UTF-8');
      if (/html/i.test(mimeType) || /\.html?$/i.test(file.getName())) text = htmlToPlainTextForPdf_(text);
      appendMarkdownToPdfBody_(body, text);
    }
    tempDoc.saveAndClose();
    return tempFile.getAs(MimeType.PDF).setName(pdfName);
  } catch (error) {
    throw new Error('This file format could not be converted to PDF: ' + error.message);
  } finally {
    if (tempFile) try { tempFile.setTrashed(true); } catch (_) {}
  }
}

function appendMarkdownToPdfBody_(body, markdown) {
  var inCode = false;
  String(markdown || '').split(/\r?\n/).forEach(function(line) {
    if (/^```/.test(line)) { inCode = !inCode; return; }
    var match;
    if (!inCode && (match = line.match(/^###\s+(.+)/))) return body.appendParagraph(match[1]).setHeading(DocumentApp.ParagraphHeading.HEADING3);
    if (!inCode && (match = line.match(/^##\s+(.+)/))) return body.appendParagraph(match[1]).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    if (!inCode && (match = line.match(/^#\s+(.+)/))) return body.appendParagraph(match[1]).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (!inCode && (match = line.match(/^[-*]\s+(.+)/))) return body.appendListItem(match[1]);
    if (!inCode && /^---+$/.test(line.trim())) return body.appendHorizontalRule();
    var paragraph = body.appendParagraph(line || ' ');
    if (inCode) paragraph.editAsText().setFontFamily('Courier New').setBackgroundColor('#f1f3f4');
  });
}

function htmlToPlainTextForPdf_(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n').trim();
}
