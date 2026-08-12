/**
 * Creates the Executive Decision Brief template as a native Google Doc.
 *
 * Security characteristics:
 * - Uses only the built-in DocumentApp service.
 * - Makes no external network requests.
 * - Reads no project files or user data.
 * - Creates one new document in the executing user's My Drive.
 *
 * Review this source before running it in the corporate Apps Script editor.
 * Each execution creates a new document.
 */
function createExecutiveDecisionBriefTemplate() {
  const documentName = 'Executive Decision Brief Template';
  const doc = DocumentApp.create(documentName);
  const body = doc.getBody();

  body.clear();
  body.setMarginTop(72);
  body.setMarginRight(72);
  body.setMarginBottom(72);
  body.setMarginLeft(72);

  const title = body.appendParagraph('{{REPORT_TITLE}}');
  title.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  title.setSpacingBefore(0);
  title.setSpacingAfter(3);
  title.editAsText()
    .setFontFamily('Arial')
    .setFontSize(26)
    .setBold(false)
    .setForegroundColor('#000000');

  const subtitle = body.appendParagraph('Executive Decision Brief');
  subtitle.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  subtitle.setSpacingBefore(0);
  subtitle.setSpacingAfter(14);
  subtitle.editAsText()
    .setFontFamily('Arial')
    .setFontSize(12)
    .setBold(false)
    .setForegroundColor('#555555');

  const project = body.appendParagraph('Project: {{PROJECT_TITLE}}');
  project.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  project.setSpacingAfter(3);
  project.editAsText()
    .setFontFamily('Arial')
    .setFontSize(10)
    .setForegroundColor('#555555');
  project.editAsText().setBold(0, 7, true);

  const generated = body.appendParagraph('Generated: {{GENERATED_DATE}}');
  generated.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  generated.setSpacingAfter(18);
  generated.editAsText()
    .setFontFamily('Arial')
    .setFontSize(10)
    .setForegroundColor('#555555');
  generated.editAsText().setBold(0, 9, true);

  const content = body.appendParagraph('{{CONTENT}}');
  content.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  content.setSpacingBefore(0);
  content.setSpacingAfter(8);
  content.setLineSpacing(1.15);
  content.editAsText()
    .setFontFamily('Arial')
    .setFontSize(11)
    .setBold(false)
    .setForegroundColor('#000000');

  doc.saveAndClose();

  const result = {
    documentId: doc.getId(),
    documentName: documentName,
    documentUrl: doc.getUrl()
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}
