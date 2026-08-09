function listGeneratedDocuments(projectId) {
  var access = assertProjectAccess_(projectId, 'documents');
  var documents = listFilesRecursive_(DriveApp.getFolderById(access.project.folders.documents), [], 200);
  var pdfs = access.allowed.history && access.project.folders.pdfs ? listFilesRecursive_(DriveApp.getFolderById(access.project.folders.pdfs), [], 200) : [];
  return documents.concat(pdfs)
    .sort(function(a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
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

  appendControlRow_(access.project, 'Documents', [file.getId(), file.getName(), file.getMimeType(), nowIso_(), access.email, file.getId(), conversationId]);
  incrementGeneratedDocumentCount_(projectId, access.project);
  return {id: file.getId(), name: file.getName(), mimeType: file.getMimeType(), url: file.getUrl(), updatedAt: file.getLastUpdated().toISOString()};
}

function createDocumentFromText(projectId, title, content) {
  var access = assertProjectEdit_(projectId, 'documents');
  var docName = normalizeName_(title, 'Generated document');
  var doc = DocumentApp.create(docName);
  doc.getBody().appendParagraph(docName).setHeading(DocumentApp.ParagraphHeading.TITLE);
  doc.getBody().appendParagraph(sanitizeText_(content, 150000));
  doc.saveAndClose();
  var file = DriveApp.getFileById(doc.getId());
  file.moveTo(DriveApp.getFolderById(access.project.folders.documents));
  appendControlRow_(access.project, 'Documents', [file.getId(), file.getName(), file.getMimeType(), nowIso_(), access.email, file.getId(), 'manual']);
  incrementGeneratedDocumentCount_(projectId, access.project);
  return {id: file.getId(), name: file.getName(), mimeType: file.getMimeType(), url: file.getUrl(), updatedAt: file.getLastUpdated().toISOString()};
}

function incrementGeneratedDocumentCount_(projectId, project) {
  var current = project && project.stats ? Number(project.stats.documentCount || 0) : 0;
  touchProjectStats_(projectId, {documentCount: current + 1});
}
