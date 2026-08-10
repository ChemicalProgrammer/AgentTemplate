var TEMPLATE_INDEX_FILE = 'Templates Index.json';
var TEMPLATE_MIME_TYPES = [MimeType.GOOGLE_DOCS, MimeType.GOOGLE_SHEETS, MimeType.GOOGLE_SLIDES];

function listTemplates(projectId) {
  var access = assertProjectAccess_(projectId, 'documents');
  var selectedId = PropertiesService.getUserProperties().getProperty(APP.USER_TEMPLATE_PREFIX + projectId) || '';
  return readTemplateIndex_(access.project).templates.filter(function(template) {
    return template.status !== 'removed';
  }).map(function(template) {
    var output = JSON.parse(JSON.stringify(template));
    output.selected = output.templateId === selectedId;
    output.url = output.driveId ? 'https://drive.google.com/open?id=' + output.driveId : '';
    return output;
  });
}

function addTemplateFromDrive(projectId, driveUrlOrId) {
  var access = assertProjectEdit_(projectId, 'documents');
  var driveId = extractDriveId_(driveUrlOrId);
  var original;
  try {
    original = DriveApp.getFileById(driveId);
  } catch (error) {
    throw new Error('The template could not be opened. Check the Drive link and your access.');
  }
  if (original.isTrashed()) throw new Error('The selected template is in Drive trash.');
  var mimeType = original.getMimeType();
  if (TEMPLATE_MIME_TYPES.indexOf(mimeType) === -1) {
    throw new Error('Templates must be Google Docs, Google Sheets, or Google Slides files.');
  }
  var copy;
  try {
    copy = original.makeCopy(original.getName(), DriveApp.getFolderById(access.project.folders.templates));
  } catch (error) {
    throw new Error('The Google Workspace template could not be copied: ' + readableErrorMessage_(error));
  }
  var now = nowIso_();
  var record = {
    templateId: uuid_(),
    name: copy.getName(),
    driveId: copy.getId(),
    mimeType: copy.getMimeType(),
    status: 'active',
    addedAt: now,
    updatedAt: copy.getLastUpdated().toISOString(),
    addedBy: access.email,
    note: ''
  };
  var index = readTemplateIndex_(access.project);
  index.templates.push(record);
  writeTemplateIndex_(access.project, index);
  appendControlRow_(access.project, 'Templates', [record.templateId, record.name, record.mimeType, record.driveId, record.status, record.addedAt, record.addedBy, record.note]);
  if (index.templates.filter(function(item) { return item.status !== 'removed'; }).length === 1) {
    PropertiesService.getUserProperties().setProperty(APP.USER_TEMPLATE_PREFIX + projectId, record.templateId);
    record.selected = true;
  }
  record.url = copy.getUrl();
  return record;
}

function selectReportTemplate(projectId, templateId) {
  var access = assertProjectAccess_(projectId, 'documents');
  templateId = String(templateId || '');
  if (templateId) {
    var exists = readTemplateIndex_(access.project).templates.some(function(template) {
      return template.templateId === templateId && template.status !== 'removed';
    });
    if (!exists) throw new Error('Template not found.');
    PropertiesService.getUserProperties().setProperty(APP.USER_TEMPLATE_PREFIX + projectId, templateId);
  } else {
    PropertiesService.getUserProperties().deleteProperty(APP.USER_TEMPLATE_PREFIX + projectId);
  }
  return {projectId: projectId, templateId: templateId};
}

function removeTemplate(projectId, templateId) {
  var access = assertProjectEdit_(projectId, 'documents');
  var index = readTemplateIndex_(access.project);
  var template = index.templates.filter(function(item) { return item.templateId === templateId && item.status !== 'removed'; })[0];
  if (!template) throw new Error('Template not found.');
  template.status = 'removed';
  template.updatedAt = nowIso_();
  try { DriveApp.getFileById(template.driveId).setTrashed(true); } catch (error) { console.warn(error.message); }
  writeTemplateIndex_(access.project, index);
  var key = APP.USER_TEMPLATE_PREFIX + projectId;
  if (PropertiesService.getUserProperties().getProperty(key) === templateId) PropertiesService.getUserProperties().deleteProperty(key);
  appendControlRow_(access.project, 'Change Log', [nowIso_(), access.email, 'DELETE_TEMPLATE', 'Template', templateId, template.name]);
  return {removed: true, templateId: templateId};
}

function createReportFromDocument(projectId, nodeId, templateId, selectedFlowIds) {
  var access = assertProjectEdit_(projectId, 'documents');
  var records = getDocumentContextRecords_(access.project);
  var source = records.filter(function(item) {
    return item.sourceId === nodeId || item.legacySourceId === nodeId;
  })[0];
  if (!source) throw new Error('The selected document could not be found.');
  var template = null;
  if (templateId) {
    template = readTemplateIndex_(access.project).templates.filter(function(item) {
      return item.templateId === templateId && item.status !== 'removed';
    })[0] || null;
    if (!template) throw new Error('The selected report template could not be found.');
  }

  var flowContext = buildFlowContext_(access.project, selectedFlowIds || []);
  var report = generateReportContent_(access.project, source, flowContext);
  var title = normalizeName_(source.name.replace(/\.[^.]+$/, '') + ' - Report', 'Project report');
  var file = instantiateReportFile_(access.project, template, title, report.text);
  var parents = [normalizeDocumentParentId_(source.sourceId)];
  recordGeneratedDocument_(access.project, file, {
    kind: 'report', parentIds: parents, createdBy: access.email, sourceConversation: 'report',
    note: template ? 'Generated with template: ' + template.name : 'Generated with the standard Google Docs report format.'
  });
  appendControlRow_(access.project, 'Documents', [file.getId(), file.getName(), file.getMimeType(), nowIso_(), access.email, file.getId(), 'report', template ? template.name : 'Standard report']);
  incrementGeneratedDocumentCount_(projectId, access.project);
  return publicGeneratedFile_(file, 'report', parents, 'report');
}

function generateReportContent_(project, source, flowContext) {
  var request = [
    'Create a professional, self-contained report based only on the selected project document.',
    'Use clear headings, an executive summary, findings, risks or limitations, and recommended next steps when supported.',
    'Do not invent data. Cite retrieved evidence inline when citations are available.',
    flowContext.text ? 'Follow these selected procedures:\n\n' + flowContext.text : ''
  ].filter(Boolean).join('\n\n');
  var config = getUserGeminiConfig_();
  var fileSearch = getFileSearchQueryConfig_(project, [source.sourceId]);
  if (fileSearch && fileSearch.sourceIds.length) {
    return generateWithFileSearch_({
      config: config,
      systemInstruction: 'You create accurate project reports. Preserve units, figures, qualifiers, and source boundaries.',
      contents: [{role: 'user', parts: [{text: request}]}],
      storeName: fileSearch.storeName,
      metadataFilter: buildFileSearchMetadataFilter_(fileSearch.sourceIds),
      allowedSourceIds: fileSearch.sourceIds,
      maxOutputTokens: 8192
    });
  }
  var context = buildSourceContext_(project, request, [source.sourceId]);
  if (context.warnings && context.warnings.length) throw new Error('Index this document before generating the report: ' + context.warnings.join(' | '));
  if (!context.text && !context.inlineParts.length) throw new Error('This document is not indexed and cannot be analyzed with the local fallback. Index it first.');
  var parts = [{text: request + '\n\nSOURCE MATERIAL:\n' + (context.text || '')}].concat(context.inlineParts || []);
  return generateWithGemini_({config: config, systemInstruction: 'Create an accurate project report and add no unsupported facts.', contents: [{role: 'user', parts: parts}], temperature: 0.2, maxOutputTokens: 8192});
}

function instantiateReportFile_(project, template, title, content) {
  var destination = DriveApp.getFolderById(project.folders.documents);
  if (!template) {
    var doc = DocumentApp.create(title);
    doc.getBody().appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.TITLE);
    doc.getBody().appendParagraph(content);
    doc.saveAndClose();
    var standardFile = DriveApp.getFileById(doc.getId());
    standardFile.moveTo(destination);
    return standardFile;
  }

  var original = DriveApp.getFileById(template.driveId);
  var copy = original.makeCopy(title, destination);
  var values = {
    '{{PROJECT_TITLE}}': project.title,
    '{{REPORT_TITLE}}': title,
    '{{GENERATED_DATE}}': formatDateForDoc_(nowIso_()),
    '{{CONTENT}}': content
  };
  if (template.mimeType === MimeType.GOOGLE_DOCS) {
    var reportDoc = DocumentApp.openById(copy.getId());
    var body = reportDoc.getBody();
    var hadContent = body.getText().indexOf('{{CONTENT}}') !== -1;
    Object.keys(values).forEach(function(token) { body.replaceText(escapeRegex_(token), escapeReplacement_(values[token])); });
    if (!hadContent) {
      body.appendPageBreak();
      body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      body.appendParagraph(content);
    }
    reportDoc.saveAndClose();
  } else if (template.mimeType === MimeType.GOOGLE_SHEETS) {
    var workbook = SpreadsheetApp.openById(copy.getId());
    var hadSheetContent = false;
    workbook.getSheets().forEach(function(sheet) {
      Object.keys(values).forEach(function(token) {
        if (token === '{{CONTENT}}' && sheet.createTextFinder(token).findNext()) hadSheetContent = true;
        sheet.createTextFinder(token).matchCase(true).replaceAllWith(values[token]);
      });
    });
    if (!hadSheetContent) {
      var reportSheet = workbook.getSheetByName('Generated Report') || workbook.insertSheet('Generated Report');
      reportSheet.clear();
      reportSheet.getRange('A1').setValue(title).setFontWeight('bold').setFontSize(16);
      reportSheet.getRange('A3').setValue(content).setWrap(true);
      reportSheet.setColumnWidth(1, 720);
    }
  } else if (template.mimeType === MimeType.GOOGLE_SLIDES) {
    var deck = SlidesApp.openById(copy.getId());
    var hadSlideContent = false;
    deck.getSlides().forEach(function(slide) {
      slide.getShapes().forEach(function(shape) {
        var text = shape.getText().asString();
        Object.keys(values).forEach(function(token) {
          if (token === '{{CONTENT}}' && text.indexOf(token) !== -1) hadSlideContent = true;
          shape.getText().replaceAllText(token, values[token]);
        });
      });
    });
    if (!hadSlideContent) {
      var slide = deck.appendSlide(SlidesApp.PredefinedLayout.TITLE_AND_BODY);
      var titlePlaceholder = slide.getPlaceholder(SlidesApp.PlaceholderType.TITLE);
      var bodyPlaceholder = slide.getPlaceholder(SlidesApp.PlaceholderType.BODY);
      if (titlePlaceholder) titlePlaceholder.asShape().getText().setText(title);
      if (bodyPlaceholder) bodyPlaceholder.asShape().getText().setText(truncate_(content, 12000));
    }
    deck.saveAndClose();
  }
  return copy;
}

function readTemplateIndex_(project) {
  var folder = DriveApp.getFolderById(project.folders.templates);
  var data = readJsonFile_(getFirstFileByName_(folder, TEMPLATE_INDEX_FILE), {schemaVersion: 1, templates: []});
  data.templates = data.templates || [];
  return data;
}

function writeTemplateIndex_(project, index) {
  writeJsonFile_(DriveApp.getFolderById(project.folders.templates), TEMPLATE_INDEX_FILE, index);
}

function escapeRegex_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeReplacement_(value) {
  return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/\$/g, '\\$');
}
