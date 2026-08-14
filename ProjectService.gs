var PROJECT_MANIFEST_FILE = 'Project Manifest.json';
var PROJECT_CONTROL_FILE = 'Project Control';
var PROJECT_EMOJIS = ['✨', '🧠', '📚', '🧪', '⚙️', '📊', '💡', '🚀', '🌱', '🎯', '🧭', '🧩', '🔬', '🏗️', '📝', '💼', '🎨', '🌎', '🤖', '🗂️', '⚗️', '🧬', '🧮', '📐', '🛠️', '🏭', '🔋', '🌡️', '💧', '🔥', '♻️', '✅', '📈', '🔎', '🛰️', '🛡️', '🎓', '📋', '🔗', '🌐'];
var PROJECT_COLORS = ['blue', 'violet', 'coral', 'amber', 'green', 'teal', 'rose', 'slate', 'indigo', 'cyan', 'lime', 'orange', 'plum', 'graphite'];

function listProjects() {
  var email = assertOrganizationMember_();
  var projects = discoverProjects_(false);
  var favorites = getFavoriteIds_();
  var output = projects
    .filter(function(project) {
      return (project.members || []).some(function(member) {
        return String(member.email).toLowerCase() === email;
      });
    })
    .map(function(project) {
      var member = project.members.filter(function(item) { return String(item.email).toLowerCase() === email; })[0];
      return publicProject_(project, member, favorites.indexOf(project.projectId) !== -1);
    })
    .sort(function(a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
  return applyUserCardOrder_(output, APP.USER_PROJECT_CARD_ORDER, 'projectId');
}

function refreshProjects() {
  assertOrganizationMember_();
  return listProjectsFromManifests_(discoverProjects_(true));
}

function listProjectsFromManifests_(projects) {
  var email = assertOrganizationMember_();
  var favorites = getFavoriteIds_();
  var output = (projects || [])
    .filter(function(project) {
      return (project.members || []).some(function(member) {
        return String(member.email).toLowerCase() === email;
      });
    })
    .map(function(project) {
      var member = project.members.filter(function(item) { return String(item.email).toLowerCase() === email; })[0];
      return publicProject_(project, member, favorites.indexOf(project.projectId) !== -1);
    })
    .sort(function(a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
  return applyUserCardOrder_(output, APP.USER_PROJECT_CARD_ORDER, 'projectId');
}

function createProject(input) {
  var email = assertOrganizationMember_();
  input = input || {};
  var title = normalizeName_(input.title, 'New project');
  var description = sanitizeText_(input.description, 800).trim();
  var root = getProjectsFolder_();
  var selectedAgent = input.agentId ? getAgentFromRoot_(String(input.agentId)) : getDefaultAgent_();
  if (!selectedAgent || !selectedAgent.publishedVersion) throw new Error('Choose a published agent before creating the project.');
  var selectedVersion = String(input.agentVersion || selectedAgent.publishedVersion);
  if (!getAgentRelease_(selectedAgent.agentId, selectedVersion)) throw new Error('The selected agent version is not available.');
  var folder = root.createFolder(title);
  var now = nowIso_();
  var project = {
    schemaVersion: 4,
    projectId: uuid_(),
    title: title,
    description: description,
    icon: normalizeProjectIcon_(input.icon),
    color: normalizeProjectColor_(input.color),
    createdAt: now,
    updatedAt: now,
    owner: email,
    folderId: folder.getId(),
    controlFileId: '',
    status: 'active',
    agentId: selectedAgent.agentId,
    agentVersion: selectedVersion,
    folders: {},
    members: [{email: email, role: 'owner', scope: 'full', addedAt: now}],
    stats: {sourceCount: 0, conversationCount: 0, documentCount: 0, lastActivityAt: now}
  };

  project = normalizeProjectStructure_(folder, project, true);
  writeProjectManifest_(folder, project);
  syncProjectControl_(project, true);
  invalidateProjectCaches_(project.projectId);
  cacheProjectLocator_(project.projectId, folder.getId());
  return publicProject_(project, project.members[0], false);
}

function getProjectShell(projectId) {
  var access = assertProjectAccess_(projectId);
  var agentRelease = getProjectAgentRelease_(access.project);
  return {
    project: publicProject_(access.project, access.member, getFavoriteIds_().indexOf(projectId) !== -1),
    permissions: access.allowed,
    agent: agentRelease ? publicAgentRelease_(agentRelease.release) : null,
    availableAgents: listAgents().filter(function(agent) { return Boolean(agent.publishedVersion); })
  };
}

function getProjectChatPanel(projectId) {
  var access = assertProjectAccess_(projectId, 'history');
  var conversations = readConversationIndex_(access.project).conversations.filter(function(item) {
    return item.status !== 'archived';
  }).sort(function(a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
  var firstConversation = null;
  if (conversations.length) {
    var firstRecord = conversations[0];
    var file = firstRecord.fileId
      ? DriveApp.getFileById(firstRecord.fileId)
      : getFirstFileByName_(DriveApp.getFolderById(access.project.folders.conversations), 'Conversation - ' + firstRecord.conversationId + '.json');
    firstConversation = readJsonFile_(file, null);
    if (!firstConversation) throw new Error('The most recent chat file is damaged.');
  }
  return {conversations: conversations, firstConversation: firstConversation};
}

function getProjectDocumentsPanel(projectId) {
  var access = assertProjectAccess_(projectId);
  var allAgentSources = listAgentKnowledgeNodesForProject_(access.project, true);
  var resolvedAgent = getProjectAgentRelease_(access.project);
  var showMandatory = !resolvedAgent || resolvedAgent.release.showMandatoryKnowledgeInProjects !== false;
  var agentSources = allAgentSources.filter(function(node) { return showMandatory || !node.mandatory; });
  var projectNodes = listProjectDocuments(projectId);
  var graph = applyUserCardOrder_(agentSources.concat(projectNodes), APP.USER_DOCUMENT_CARD_ORDER_PREFIX + projectId, 'nodeId');
  return {documentGraph:graph,indexableSources:allAgentSources.concat(projectNodes.filter(function(node){return node.kind==='source';}))};
}

function getProjectTemplatesPanel(projectId) {
  var access = assertProjectAccess_(projectId, 'documents');
  return {templates: listAgentTemplatesForProject_(access.project).concat(listTemplates(projectId))};
}

function getProjectFlowsPanel(projectId) {
  var access = assertProjectAccess_(projectId, 'sources');
  return {flows: listAgentFlowsForProject_(access.project).concat(listFlows(projectId))};
}

function getProjectMembersPanel(projectId) {
  return {members: listProjectMembers(projectId)};
}

function getProjectDetails(projectId) {
  var access = assertProjectAccess_(projectId);
  var project = access.project;
  var documentGraph = access.allowed.sources || access.allowed.documents ? listProjectDocuments(projectId) : [];
  return {
    project: publicProject_(project, access.member, getFavoriteIds_().indexOf(projectId) !== -1),
    permissions: access.allowed,
    conversations: access.allowed.history ? listConversations(projectId) : [],
    sources: access.allowed.sources ? listSources(projectId) : [],
    documents: access.allowed.documents ? documentGraph.filter(function(item) { return item.kind !== 'source' && item.kind !== 'agent-source'; }) : [],
    templates: access.allowed.documents ? listTemplates(projectId) : [],
    flows: access.allowed.sources ? listFlows(projectId) : [],
    fileSearch: access.allowed.sources ? getProjectFileSearchSummary(projectId) : {configured: false, ready: 0, total: 0},
    documentGraph: documentGraph,
    members: access.member.role === 'owner' ? listProjectMembers(projectId) : []
  };
}

function updateProject(projectId, changes) {
  var access = assertProjectEdit_(projectId, 'project');
  var project = access.project;
  changes = changes || {};
  if (changes.title != null) project.title = normalizeName_(changes.title, project.title);
  if (changes.description != null) project.description = sanitizeText_(changes.description, 800).trim();
  if (changes.icon != null) project.icon = normalizeProjectIcon_(changes.icon);
  if (changes.color != null) project.color = normalizeProjectColor_(changes.color);
  if (changes.status != null && ['active', 'planning', 'archived'].indexOf(changes.status) !== -1) {
    project.status = changes.status;
  }
  project.updatedAt = nowIso_();
  var folder = DriveApp.getFolderById(project.folderId);
  if (folder.getName() !== project.title) folder.setName(project.title);
  writeProjectManifest_(folder, project);
  syncProjectControl_(project, false);
  invalidateProjectCaches_(projectId);
  cacheProjectLocator_(projectId, folder.getId());
  return publicProject_(project, access.member, getFavoriteIds_().indexOf(projectId) !== -1);
}

function changeProjectAgent(projectId, agentId, version) {
  var access = assertProjectEdit_(projectId, 'project');
  var agent = getAgentFromRoot_(String(agentId || ''));
  if (!agent || !agent.publishedVersion) throw new Error('Choose a published agent.');
  version = String(version || agent.publishedVersion);
  if (!getAgentRelease_(agent.agentId, version)) throw new Error('The selected agent version is not available.');
  access.project.agentId = agent.agentId;
  access.project.agentVersion = version;
  access.project.updatedAt = nowIso_();
  persistProjectManifest_(access.project);
  syncProjectControl_(access.project, false);
  var conversation = createConversation(projectId, 'New chat — ' + agent.name);
  return {project:publicProject_(access.project, access.member, getFavoriteIds_().indexOf(projectId)!==-1),agent:publicAgentRelease_(getAgentRelease_(agent.agentId,version).release),conversation:conversation};
}

function syncProjectKnowledgeIndexes(projectId) {
  var access = assertProjectEdit_(projectId, 'sources');
  var projectResult = syncProjectSourcesIndex(projectId);
  var agentResult = syncAgentKnowledgeIndexForProject_(access.project);
  return {project:projectResult, agent:agentResult, remaining:Number(projectResult.remaining||0)+Number(agentResult.remaining||0)};
}

function toggleProjectFavorite(projectId) {
  assertProjectAccess_(projectId);
  var ids = getFavoriteIds_();
  var index = ids.indexOf(projectId);
  if (index === -1) ids.push(projectId); else ids.splice(index, 1);
  PropertiesService.getUserProperties().setProperty(APP.USER_FAVORITES, JSON.stringify(ids));
  return {projectId: projectId, favorite: index === -1};
}

function cloneProject(projectId) {
  var access = assertProjectAccess_(projectId);
  if (access.member.scope !== 'full') throw new Error('Full project access is required to clone this project.');
  var sourceProject = access.project;
  var root = getProjectsFolder_();
  var cloneTitle = buildCloneProjectTitle_(root, sourceProject.title);
  var destination = root.createFolder(cloneTitle);
  var idMap = {};
  try {
    copyProjectFolderTree_(DriveApp.getFolderById(sourceProject.folderId), destination, idMap);
    var now = nowIso_();
    var clone = JSON.parse(JSON.stringify(sourceProject));
    clone.schemaVersion = 4;
    clone.projectId = uuid_();
    clone.title = cloneTitle;
    clone.createdAt = now;
    clone.updatedAt = now;
    clone.owner = access.email;
    clone.folderId = destination.getId();
    clone.controlFileId = idMap[sourceProject.controlFileId] || '';
    clone.icon = normalizeProjectIcon_(sourceProject.icon);
    clone.color = normalizeProjectColor_(sourceProject.color);
    clone.status = 'active';
    clone.members = [{email: access.email, role: 'owner', scope: 'full', addedAt: now}];
    clone.folders = {};
    Object.keys(sourceProject.folders || {}).forEach(function(key) {
      if (idMap[sourceProject.folders[key]]) clone.folders[key] = idMap[sourceProject.folders[key]];
    });
    clone.stats = {sourceCount: 0, conversationCount: 0, documentCount: 0, lastActivityAt: now};
    clone = normalizeProjectStructure_(destination, clone, true);
    remapClonedProjectData_(sourceProject, clone, idMap);
    remapClonedControlSpreadsheet_(clone.controlFileId, idMap, sourceProject.projectId, clone.projectId);
    clone = reconcileProjectStats_(clone);
    writeProjectManifest_(destination, clone);
    syncProjectControl_(clone, false);
    invalidateProjectCaches_(clone.projectId);
    cacheProjectLocator_(clone.projectId, destination.getId());
    return publicProject_(clone, clone.members[0], false);
  } catch (error) {
    try { destination.setTrashed(true); } catch (cleanupError) { console.warn(cleanupError.message); }
    throw new Error('The project could not be cloned: ' + error.message);
  }
}

function deleteProject(projectId) {
  var access = assertProjectAccess_(projectId);
  if (access.member.role !== 'owner') throw new Error('Only the project owner can delete this project.');
  try { deleteFileSearchStoreForProject_(projectId); } catch (indexError) { console.warn('File Search cleanup skipped: ' + indexError.message); }
  DriveApp.getFolderById(access.project.folderId).setTrashed(true);
  var favorites = getFavoriteIds_().filter(function(id) { return id !== projectId; });
  PropertiesService.getUserProperties().setProperty(APP.USER_FAVORITES, JSON.stringify(favorites));
  PropertiesService.getUserProperties().deleteProperty(APP.USER_TEMPLATE_PREFIX + projectId);
  invalidateProjectCaches_(projectId);
  return {deleted: true, projectId: projectId};
}

function discoverProjects_(forceRefresh) {
  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    var cached = safeJsonParse_(cache.get(APP.PROJECT_CATALOG_CACHE_KEY), null);
    if (cached && Array.isArray(cached.projects)) {
      cached.projects.forEach(function(project) { if (project.projectId && project.folderId) cacheProjectLocator_(project.projectId, project.folderId); });
      return cached.projects;
    }
  }
  var projects = [];
  var seenProjectIds = {};
  var parents = [getProjectsFolder_(), getRootFolder_()];
  parents.forEach(function(parent, parentIndex) {
    var folders = parent.getFolders();
    while (folders.hasNext()) {
      var folder = folders.next();
      if (folder.isTrashed() || [APP.SYSTEM_FOLDER, APP.AGENTS_FOLDER, APP.PROJECTS_FOLDER].indexOf(folder.getName()) !== -1) continue;
      if (parentIndex > 0 && !getFirstFileByName_(folder, PROJECT_MANIFEST_FILE)) continue;
      try {
        var manifest = readJsonFile_(getFirstFileByName_(folder, PROJECT_MANIFEST_FILE), null);
        if (!manifest || !manifest.projectId || seenProjectIds[manifest.projectId]) manifest = registerFolderAsProject_(folder, seenProjectIds);
        else { manifest = lightweightProjectManifest_(folder, manifest); seenProjectIds[manifest.projectId] = folder.getId(); }
        projects.push(manifest); cacheProjectLocator_(manifest.projectId, folder.getId());
      } catch (error) { console.warn('Project folder skipped: ' + error.message); }
    }
  });
  cleanMissingFavorites_(projects.map(function(project) { return project.projectId; }));
  try { cache.put(APP.PROJECT_CATALOG_CACHE_KEY, JSON.stringify({projects: projects}), APP.PROJECT_CACHE_SECONDS); } catch (cacheError) { console.warn(cacheError.message); }
  return projects;
}

function lightweightProjectManifest_(folder, manifest) {
  var now = nowIso_();
  var email = getCurrentIdentity_().email;
  var changed = false;
  manifest.folderId = folder.getId();
  manifest.title = manifest.title || folder.getName();
  manifest.icon = normalizeProjectIcon_(manifest.icon);
  manifest.color = normalizeProjectColor_(manifest.color);
  manifest.status = manifest.status || 'active';
  if (!manifest.agentId || !manifest.agentVersion) {
    var fallback = getDefaultAgent_();
    manifest.agentId = fallback.agentId;
    manifest.agentVersion = fallback.publishedVersion;
    manifest.schemaVersion = 4;
    changed = true;
  }
  manifest.members = manifest.members || [{email: manifest.owner || email, role: 'owner', scope: 'full', addedAt: manifest.createdAt || now}];
  manifest.stats = manifest.stats || {sourceCount: 0, conversationCount: 0, documentCount: 0, lastActivityAt: manifest.updatedAt || manifest.createdAt || now};
  if (changed) writeProjectManifest_(folder, manifest);
  return manifest;
}

function clearLegacyProjectRegistry_() {
  var props = PropertiesService.getScriptProperties();
  var values = props.getProperties();
  Object.keys(values).filter(function(key) { return key.indexOf('PROJECT_') === 0; }).forEach(function(key) {
    props.deleteProperty(key);
  });
}

function cleanMissingFavorites_(activeIds) {
  var favorites = getFavoriteIds_();
  var cleaned = favorites.filter(function(id) { return activeIds.indexOf(id) !== -1; });
  if (cleaned.length !== favorites.length) PropertiesService.getUserProperties().setProperty(APP.USER_FAVORITES, JSON.stringify(cleaned));
}

function buildCloneProjectTitle_(root, title) {
  var base = normalizeName_(title + ' Copy', 'Project Copy');
  if (!root.getFoldersByName(base).hasNext()) return base;
  for (var number = 2; number < 1000; number++) {
    var candidate = normalizeName_(title + ' Copy ' + number, 'Project Copy ' + number);
    if (!root.getFoldersByName(candidate).hasNext()) return candidate;
  }
  return normalizeName_(title + ' Copy ' + new Date().getTime(), 'Project Copy');
}

function remapClonedProjectData_(sourceProject, clone, idMap) {
  var sourceIndex = readSourceIndex_(clone);
  sourceIndex.sources.forEach(function(source) {
    if (idMap[source.driveId]) source.driveId = idMap[source.driveId];
  });
  writeSourceIndex_(clone, sourceIndex);

  var templateIndex = readTemplateIndex_(clone);
  templateIndex.templates.forEach(function(template) {
    if (idMap[template.driveId]) template.driveId = idMap[template.driveId];
  });
  writeTemplateIndex_(clone, templateIndex);

  var flowIndex = readFlowIndex_(clone);
  flowIndex.flows.forEach(function(flow) {
    if (idMap[flow.driveId]) flow.driveId = idMap[flow.driveId];
  });
  writeFlowIndex_(clone, flowIndex);

  var documentIndex = readDocumentIndex_(clone);
  documentIndex.documents.forEach(function(document) {
    if (idMap[document.driveId]) document.driveId = idMap[document.driveId];
    document.parentIds = normalizeDocumentParentIds_(document.parentIds).map(function(parentId) {
      return remapClonedNodeId_(parentId, idMap);
    });
  });
  writeDocumentIndex_(clone, documentIndex);

  var conversationIndex = readConversationIndex_(clone);
  conversationIndex.conversations.forEach(function(record) {
    if (idMap[record.fileId]) record.fileId = idMap[record.fileId];
    try {
      var file = DriveApp.getFileById(record.fileId);
      var conversation = readJsonFile_(file, null);
      if (!conversation) return;
      conversation.projectId = clone.projectId;
      conversation.sourceSelection = (conversation.sourceSelection || []).map(function(id) { return remapClonedNodeId_(id, idMap); });
      (conversation.messages || []).forEach(function(message) {
        (message.sourcesUsed || []).forEach(function(source) { source.sourceId = remapClonedNodeId_(source.sourceId, idMap); });
      });
      file.setContent(JSON.stringify(conversation, null, 2));
    } catch (error) {
      console.warn('A cloned chat could not be remapped: ' + error.message);
    }
  });
  writeJsonFile_(DriveApp.getFolderById(clone.folders.conversations), CONVERSATION_INDEX_FILE, conversationIndex);
}

function remapClonedNodeId_(nodeId, idMap) {
  nodeId = String(nodeId || '');
  if (nodeId.indexOf('document:') === 0) {
    var oldFileId = nodeId.slice('document:'.length);
    return 'document:' + (idMap[oldFileId] || oldFileId);
  }
  return nodeId;
}

function remapClonedControlSpreadsheet_(controlFileId, idMap, oldProjectId, newProjectId) {
  if (!controlFileId) return;
  try {
    var spreadsheet = SpreadsheetApp.openById(controlFileId);
    spreadsheet.getSheets().forEach(function(sheet) {
      var range = sheet.getDataRange();
      var values = range.getValues();
      var changed = false;
      values.forEach(function(row) {
        row.forEach(function(value, column) {
          if (typeof value !== 'string') return;
          var replacement = value === oldProjectId ? newProjectId : idMap[value];
          if (replacement && replacement !== value) { row[column] = replacement; changed = true; }
        });
      });
      if (changed) range.setValues(values);
    });
  } catch (error) {
    console.warn('The cloned Project Control file could not be fully remapped: ' + error.message);
  }
}

function registerFolderAsProject_(folder, seenProjectIds) {
  var manifestFile = getFirstFileByName_(folder, PROJECT_MANIFEST_FILE);
  var manifest = readJsonFile_(manifestFile, null);
  var now = nowIso_();
  var email = getCurrentIdentity_().email;

  if (!manifest || !manifest.projectId) {
    manifest = {
      schemaVersion: 4,
      projectId: uuid_(),
      title: folder.getName(),
      description: 'Project imported automatically from Drive.',
      icon: '✨',
      color: 'blue',
      createdAt: now,
      updatedAt: now,
      owner: email,
      status: 'active',
      agentId: getDefaultAgent_().agentId,
      agentVersion: getDefaultAgent_().publishedVersion,
      members: [{email: email, role: 'owner', scope: 'full', addedAt: now}],
      stats: {sourceCount: 0, conversationCount: 0, documentCount: 0, lastActivityAt: now}
    };
  } else if (seenProjectIds && seenProjectIds[manifest.projectId] && seenProjectIds[manifest.projectId] !== folder.getId()) {
    manifest.projectId = uuid_();
    manifest.title = folder.getName();
    manifest.owner = email;
    manifest.createdAt = now;
    manifest.updatedAt = now;
    manifest.members = [{email: email, role: 'owner', scope: 'full', addedAt: now}];
  }

  manifest.folderId = folder.getId();
  manifest.title = manifest.title || folder.getName();
  manifest.icon = normalizeProjectIcon_(manifest.icon);
  manifest.color = normalizeProjectColor_(manifest.color);
  if (!manifest.agentId || !manifest.agentVersion) {
    var defaultAgent = getDefaultAgent_();
    manifest.agentId = defaultAgent.agentId;
    manifest.agentVersion = defaultAgent.publishedVersion;
  }
  manifest.members = manifest.members || [{email: manifest.owner || email, role: 'owner', scope: 'full', addedAt: now}];
  manifest.stats = manifest.stats || {sourceCount: 0, conversationCount: 0, documentCount: 0, lastActivityAt: now};
  manifest = normalizeProjectStructure_(folder, manifest, true);
  manifest = reconcileProjectStats_(manifest);
  writeProjectManifest_(folder, manifest);
  syncProjectControl_(manifest, false);
  if (seenProjectIds) seenProjectIds[manifest.projectId] = folder.getId();
  return manifest;
}

function normalizeProjectStructure_(folder, project, allowCreate) {
  var names = {
    sources: 'Sources',
    documents: 'Generated Documents',
    templates: 'Templates',
    flows: 'Flows',
    conversations: 'Conversation Data',
    pdfs: 'PDF Exports'
  };
  project.folders = project.folders || {};
  Object.keys(names).forEach(function(key) {
    var child = getFirstFolderByName_(folder, names[key]);
    if (!child && allowCreate) child = folder.createFolder(names[key]);
    if (child) project.folders[key] = child.getId();
  });

  var control = getFirstFileByName_(folder, PROJECT_CONTROL_FILE);
  if (!control && allowCreate) {
    var spreadsheet = SpreadsheetApp.create(PROJECT_CONTROL_FILE);
    control = DriveApp.getFileById(spreadsheet.getId());
    control.moveTo(folder);
    initializeControlSpreadsheet_(spreadsheet, project);
  }
  if (control) project.controlFileId = control.getId();
  return project;
}

function initializeControlSpreadsheet_(spreadsheet, project) {
  var definitions = {
    'Project Information': ['Field', 'Value'],
    'Project Attribute History': ['Attribute', 'Value', 'Valid From', 'Valid To', 'Status', 'Changed By'],
    'Assignments': ['Person', 'Email', 'Role', 'Valid From', 'Valid To', 'Status'],
    'Sources': ['Source ID', 'Name', 'Type', 'Drive ID', 'Status', 'Added At', 'Added By', 'Notes'],
    'Templates': ['Template ID', 'Name', 'Type', 'Drive ID', 'Status', 'Added At', 'Added By', 'Notes'],
    'Flows': ['Flow ID', 'Name', 'Drive ID', 'Status', 'Added At', 'Added By', 'Notes'],
    'Conversations': ['Conversation ID', 'Title', 'Created At', 'Updated At', 'Created By', 'Status', 'JSON File ID'],
    'Documents': ['Document ID', 'Name', 'Type', 'Created At', 'Created By', 'Drive ID', 'Source Conversation', 'Notes'],
    'Document Versions': ['Document ID', 'Version', 'Created At', 'Created By', 'Drive ID', 'Notes'],
    'Members': ['Email', 'Role', 'Scope', 'Added At', 'Added By'],
    'Share Policies': ['Email', 'Sources', 'Documents', 'History', 'Updated At'],
    'Links': ['Name', 'URL', 'Type', 'Status', 'Added At'],
    'Change Log': ['Timestamp', 'User', 'Action', 'Entity', 'Entity ID', 'Details']
  };
  var first = spreadsheet.getSheets()[0];
  first.setName('Project Information');
  Object.keys(definitions).forEach(function(name) {
    var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
    sheet.clear();
    sheet.getRange(1, 1, 1, definitions[name].length).setValues([definitions[name]])
      .setFontWeight('bold').setBackground('#e8f0fe');
    sheet.setFrozenRows(1);
  });
  syncProjectInformationSheet_(spreadsheet, project);
}

function syncProjectControl_(project, initializeIfNeeded) {
  if (!project.controlFileId) return;
  try {
    var spreadsheet = SpreadsheetApp.openById(project.controlFileId);
    if (initializeIfNeeded || !spreadsheet.getSheetByName('Project Information')) {
      initializeControlSpreadsheet_(spreadsheet, project);
    } else {
      ensureV15ControlSheets_(spreadsheet);
      syncProjectInformationSheet_(spreadsheet, project);
    }
  } catch (error) {
    console.warn('Project Control could not be updated: ' + error.message);
  }
}

function ensureV15ControlSheets_(spreadsheet) {
  var definitions = {
    'Templates': ['Template ID', 'Name', 'Type', 'Drive ID', 'Status', 'Added At', 'Added By', 'Notes'],
    'Flows': ['Flow ID', 'Name', 'Drive ID', 'Status', 'Added At', 'Added By', 'Notes']
  };
  Object.keys(definitions).forEach(function(name) {
    if (spreadsheet.getSheetByName(name)) return;
    var sheet = spreadsheet.insertSheet(name);
    sheet.getRange(1, 1, 1, definitions[name].length).setValues([definitions[name]])
      .setFontWeight('bold').setBackground('#e8f0fe');
    sheet.setFrozenRows(1);
  });
}

function syncProjectInformationSheet_(spreadsheet, project) {
  var sheet = spreadsheet.getSheetByName('Project Information');
  if (!sheet) return;
  var values = [
    ['Project ID', project.projectId],
    ['Title', project.title],
    ['Description', project.description || ''],
    ['Icon', normalizeProjectIcon_(project.icon)],
    ['Color', normalizeProjectColor_(project.color)],
    ['Owner', project.owner],
    ['Created At', project.createdAt],
    ['Updated At', project.updatedAt],
    ['Status', project.status || 'active'],
    ['Agent ID', project.agentId || ''],
    ['Agent Version', project.agentVersion || ''],
    ['Project Folder ID', project.folderId]
  ];
  sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), 2).clearContent();
  sheet.getRange(2, 1, values.length, 2).setValues(values);
  sheet.autoResizeColumns(1, 2);
}

function writeProjectManifest_(folder, project) {
  writeJsonFile_(folder, PROJECT_MANIFEST_FILE, project);
}

function persistProjectManifest_(project) {
  project.updatedAt = project.updatedAt || nowIso_();
  var folder = getActiveProjectFolderById_(project.folderId);
  if (!folder) throw new Error('The project folder is no longer inside the configured project folder.');
  writeProjectManifest_(folder, project);
  invalidateProjectCaches_(project.projectId);
  cacheProjectLocator_(project.projectId, project.folderId);
}

function getProjectFromRoot_(projectId) {
  projectId = String(projectId || '');
  var cache = CacheService.getScriptCache();
  var cachedFolderId = cache.get(APP.PROJECT_LOCATOR_CACHE_PREFIX + projectId);
  if (cachedFolderId) {
    try {
      var cachedFolder = getActiveProjectFolderById_(cachedFolderId);
      var cachedManifest = cachedFolder && readJsonFile_(getFirstFileByName_(cachedFolder, PROJECT_MANIFEST_FILE), null);
      if (cachedManifest && cachedManifest.projectId === projectId) return lightweightProjectManifest_(cachedFolder, cachedManifest);
    } catch (cacheError) {
      console.warn('Cached project location could not be used: ' + cacheError.message);
    }
    cache.remove(APP.PROJECT_LOCATOR_CACHE_PREFIX + projectId);
  }
  var parents = [getProjectsFolder_(), getRootFolder_()];
  for (var parentIndex = 0; parentIndex < parents.length; parentIndex++) {
    var folders = parents[parentIndex].getFolders();
    while (folders.hasNext()) {
      var folder = folders.next();
      if (folder.isTrashed() || [APP.SYSTEM_FOLDER, APP.AGENTS_FOLDER, APP.PROJECTS_FOLDER].indexOf(folder.getName()) !== -1) continue;
      var manifest = readJsonFile_(getFirstFileByName_(folder, PROJECT_MANIFEST_FILE), null);
      if (manifest && manifest.projectId === projectId) { cacheProjectLocator_(projectId, folder.getId()); return lightweightProjectManifest_(folder, manifest); }
    }
  }
  return null;
}

function getActiveProjectFolderById_(folderId) {
  if (!folderId) return null;
  var folder;
  try { folder = DriveApp.getFolderById(folderId); } catch (error) { return null; }
  if (!folder || folder.isTrashed()) return null;
  var rootIds = [getProjectsFolder_().getId(), getRootFolder_().getId()];
  var parents = folder.getParents();
  while (parents.hasNext()) if (rootIds.indexOf(parents.next().getId()) !== -1) return folder;
  return null;
}

function cacheProjectLocator_(projectId, folderId) {
  if (!projectId || !folderId) return;
  try { CacheService.getScriptCache().put(APP.PROJECT_LOCATOR_CACHE_PREFIX + projectId, folderId, APP.PROJECT_CACHE_SECONDS); } catch (error) { console.warn(error.message); }
}

function invalidateProjectCaches_(projectId) {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove(APP.PROJECT_CATALOG_CACHE_KEY);
    if (projectId) cache.remove(APP.PROJECT_LOCATOR_CACHE_PREFIX + projectId);
  } catch (error) {
    console.warn(error.message);
  }
}

function publicProject_(project, member, favorite) {
  var stats = project.stats || {};
  var agent = getAgentFromRoot_(project.agentId || '');
  return {
    projectId: project.projectId,
    title: project.title,
    description: project.description || '',
    icon: normalizeProjectIcon_(project.icon),
    color: normalizeProjectColor_(project.color),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    owner: project.owner,
    status: project.status || 'active',
    folderUrl: member && member.scope === 'full' ? 'https://drive.google.com/drive/folders/' + project.folderId : '',
    favorite: Boolean(favorite),
    role: member ? member.role : '',
    scope: member ? member.scope : '',
    sourceCount: stats.sourceCount || 0,
    conversationCount: stats.conversationCount || 0,
    documentCount: stats.documentCount || 0,
    lastActivityAt: stats.lastActivityAt || project.updatedAt,
    agentId: project.agentId || '',
    agentVersion: project.agentVersion || '',
    agentName: agent ? agent.name : 'Agent unavailable',
    agentIcon: agent ? agent.icon : '✦',
    agentLogoUrl: agent ? agentLogoUrl_(agent.logoDriveId) : ''
  };
}

function getFavoriteIds_() {
  return safeJsonParse_(PropertiesService.getUserProperties().getProperty(APP.USER_FAVORITES), []) || [];
}

function touchProjectStats_(projectId, changes) {
  var project = getProjectFromRoot_(projectId);
  if (!project) return;
  project.stats = project.stats || {};
  Object.keys(changes || {}).forEach(function(key) { project.stats[key] = changes[key]; });
  project.stats.lastActivityAt = nowIso_();
  project.updatedAt = project.stats.lastActivityAt;
  persistProjectManifest_(project);
}

function normalizeProjectIcon_(value) {
  value = String(value || '✨').trim();
  return PROJECT_EMOJIS.indexOf(value) !== -1 ? value : '✨';
}

function normalizeProjectColor_(value) {
  value = String(value || 'blue').trim().toLowerCase();
  return PROJECT_COLORS.indexOf(value) !== -1 ? value : 'blue';
}

function reconcileProjectStats_(project) {
  project.stats = project.stats || {};
  try {
    project.stats.sourceCount = readSourceIndex_(project).sources.filter(function(item) { return item.status !== 'removed'; }).length;
  } catch (sourceError) {
    project.stats.sourceCount = Number(project.stats.sourceCount || 0);
  }
  try {
    project.stats.conversationCount = readConversationIndex_(project).conversations.filter(function(item) { return item.status !== 'archived'; }).length;
  } catch (conversationError) {
    project.stats.conversationCount = Number(project.stats.conversationCount || 0);
  }
  try {
    var documentCount = listFilesRecursive_(DriveApp.getFolderById(project.folders.documents), [], 500)
      .filter(function(file) { return file.name !== DOCUMENT_INDEX_FILE; }).length;
    var pdfCount = project.folders.pdfs ? listFilesRecursive_(DriveApp.getFolderById(project.folders.pdfs), [], 500).length : 0;
    project.stats.documentCount = documentCount + pdfCount;
  } catch (documentError) {
    project.stats.documentCount = Number(project.stats.documentCount || 0);
  }
  project.stats.lastActivityAt = project.stats.lastActivityAt || project.updatedAt || project.createdAt;
  return project;
}
