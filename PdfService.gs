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
