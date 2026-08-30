var TEMPLATE_INDEX_FILE = 'Templates Index.json';
var TEMPLATE_MIME_TYPES = [MimeType.GOOGLE_DOCS, MimeType.GOOGLE_SHEETS, MimeType.GOOGLE_SLIDES, 'text/html'];

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
  if (TEMPLATE_MIME_TYPES.indexOf(mimeType) === -1 && !isHtmlPresentationTemplate_({mimeType:mimeType, name:original.getName()})) {
    throw new Error('Templates must be Google Docs, Google Sheets, Google Slides, or HTML files.');
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
    }) || Boolean(findAgentTemplateForProject_(access.project, templateId));
    if (!exists) throw new Error('Template not found.');
    PropertiesService.getUserProperties().setProperty(APP.USER_TEMPLATE_PREFIX + projectId, templateId);
  } else {
    PropertiesService.getUserProperties().deleteProperty(APP.USER_TEMPLATE_PREFIX + projectId);
  }
  return {projectId: projectId, templateId: templateId};
}

function listJsonPresentationTemplatesForProject_(project) {
  var projectTemplates = readTemplateIndex_(project).templates.filter(function(template) {
    return template.status !== 'removed';
  });
  return projectTemplates.concat(listAgentTemplatesForProject_(project)).filter(isHtmlPresentationTemplate_).map(function(template) {
    return {
      templateId: String(template.templateId || template.assetId || ''),
      name: template.name || 'HTML presentation',
      driveId: template.driveId || '',
      mimeType: template.mimeType || 'text/html',
      origin: template.origin || (template.readOnly ? 'agent' : 'project')
    };
  });
}

function resolveJsonPresentationTemplate_(project, presentation) {
  presentation = presentation || {};
  var requestedId = String(presentation.templateId || presentation.template_id || '').trim();
  var requestedName = String(presentation.templateName || presentation.template_name || '').trim().toLowerCase();
  var templates = listJsonPresentationTemplatesForProject_(project);
  var selectedId = PropertiesService.getUserProperties().getProperty(APP.USER_TEMPLATE_PREFIX + project.projectId) || '';
  var match = templates.filter(function(template) {
    return requestedId && template.templateId === requestedId;
  })[0] || templates.filter(function(template) {
    return requestedName && String(template.name || '').toLowerCase() === requestedName;
  })[0] || templates.filter(function(template) {
    return !requestedId && !requestedName && selectedId && template.templateId === selectedId;
  })[0] || null;
  if ((requestedId || requestedName) && !match) {
    throw new Error('The JSON artifact requested an HTML presentation template that is not available in this project.');
  }
  return match;
}

function renderJsonArtifactWithTemplate_(template, data) {
  return renderJsonArtifactWithTemplateDetails_(template, data).html;
}

function renderJsonArtifactWithTemplateDetails_(template, data) {
  if (!template || !template.driveId) throw new Error('The HTML presentation template is unavailable.');
  var file = DriveApp.getFileById(template.driveId);
  if (!isHtmlPresentationTemplate_({mimeType:file.getMimeType(), name:file.getName()})) {
    throw new Error('The selected JSON presentation template is not an HTML file.');
  }
  if (Number(file.getSize() || 0) > 1024 * 1024) throw new Error('HTML presentation templates are limited to 1 MB.');
  var html = file.getBlob().getDataAsString('UTF-8');
  return renderJsonTemplateDocument_(html, data);
}

function sanitizeRenderedHtmlArtifact_(html) {
  var safe = String(html || '');
  safe = safe.replace(/<\s*(script|iframe|object|embed|foreignObject)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  safe = safe.replace(/<\s*(script|iframe|object|embed|link|meta|base|foreignObject|animate|animateMotion|animateTransform|set)\b[^>]*\/?\s*>/gi, '');
  safe = safe.replace(/\s+on[a-z][a-z0-9_-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  safe = safe.replace(/\s+(href|src|action|formaction|xlink:href)\s*=\s*(["'])\s*(?:javascript|vbscript|data\s*:\s*text\/html)\s*:[\s\S]*?\2/gi, '');
  safe = safe.replace(/\s+(href|src|action|formaction|xlink:href)\s*=\s*(?:javascript|vbscript|data\s*:\s*text\/html)\s*:[^\s>]*/gi, '');
  safe = safe.replace(/^\s*<!doctype[^>]*>\s*/i, '');

  var headSafety = '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src data:; font-src data:; base-uri &#39;none&#39;; form-action &#39;none&#39;">';
  if (!/<html\b/i.test(safe)) {
    safe = '<html><head>' + headSafety + '</head><body>' + safe + '</body></html>';
  } else if (/<head\b[^>]*>/i.test(safe)) {
    safe = safe.replace(/<head\b([^>]*)>/i, '<head$1>' + headSafety);
  } else {
    safe = safe.replace(/<html\b([^>]*)>/i, '<html$1><head>' + headSafety + '</head>');
  }
  return '<!doctype html>\n' + safe;
}

function isHtmlPresentationTemplate_(template) {
  return String(template && template.mimeType || '').toLowerCase() === 'text/html' || /\.html?$/i.test(String(template && template.name || ''));
}

function jsonTemplateValueAtPath_(data, path) {
  return String(path || '').split('.').reduce(function(value, key) {
    if (value == null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    return value[key];
  }, data);
}

function escapeJsonTemplateHtml_(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
    })[0] || findAgentTemplateForProject_(access.project, templateId);
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
