var PROJECT_MANIFEST_FILE = 'Project Manifest.json';
var PROJECT_CONTROL_FILE = 'Project Control';
var PROJECT_ICONS = ['spark', 'science', 'insight', 'code', 'notes', 'launch', 'data', 'idea'];

function listProjects() {
  var email = assertOrganizationMember_();
  try { discoverProjects_(); } catch (ignored) {}

  var favorites = getFavoriteIds_();
  return getAllRegistryProjects_()
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
}

function refreshProjects() {
  assertOrganizationMember_();
  discoverProjects_();
  return listProjects();
}

function createProject(input) {
  var email = assertOrganizationMember_();
  input = input || {};
  var title = normalizeName_(input.title, 'New project');
  var description = sanitizeText_(input.description, 800).trim();
  var root = getRootFolder_();
  var folder = root.createFolder(title);
  var now = nowIso_();
  var project = {
    schemaVersion: 1,
    projectId: uuid_(),
    title: title,
    description: description,
    icon: normalizeProjectIcon_(input.icon),
    createdAt: now,
    updatedAt: now,
    owner: email,
    folderId: folder.getId(),
    controlFileId: '',
    status: 'active',
    folders: {},
    members: [{email: email, role: 'owner', scope: 'full', addedAt: now}],
    stats: {sourceCount: 0, conversationCount: 0, documentCount: 0, lastActivityAt: now}
  };

  project = normalizeProjectStructure_(folder, project, true);
  writeProjectManifest_(folder, project);
  syncProjectControl_(project, true);
  saveRegistryProject_(project);
  return publicProject_(project, project.members[0], false);
}

function getProjectDetails(projectId) {
  var access = assertProjectAccess_(projectId);
  var project = access.project;
  return {
    project: publicProject_(project, access.member, getFavoriteIds_().indexOf(projectId) !== -1),
    permissions: access.allowed,
    conversations: access.allowed.history ? listConversations(projectId) : [],
    sources: access.allowed.sources ? listSources(projectId) : [],
    documents: access.allowed.documents ? listGeneratedDocuments(projectId) : [],
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
  if (changes.status != null && ['active', 'planning', 'archived'].indexOf(changes.status) !== -1) {
    project.status = changes.status;
  }
  project.updatedAt = nowIso_();
  var folder = DriveApp.getFolderById(project.folderId);
  if (folder.getName() !== project.title) folder.setName(project.title);
  writeProjectManifest_(folder, project);
  syncProjectControl_(project, false);
  saveRegistryProject_(project);
  return publicProject_(project, access.member, getFavoriteIds_().indexOf(projectId) !== -1);
}

function toggleProjectFavorite(projectId) {
  assertProjectAccess_(projectId);
  var ids = getFavoriteIds_();
  var index = ids.indexOf(projectId);
  if (index === -1) ids.push(projectId); else ids.splice(index, 1);
  PropertiesService.getUserProperties().setProperty(APP.USER_FAVORITES, JSON.stringify(ids));
  return {projectId: projectId, favorite: index === -1};
}

function discoverProjects_() {
  var root = getRootFolder_();
  var folders = root.getFolders();
  while (folders.hasNext()) {
    var folder = folders.next();
    if (folder.getName() === APP.SYSTEM_FOLDER) continue;
    try { registerFolderAsProject_(folder); } catch (error) { console.warn(error.message); }
  }
}

function registerFolderAsProject_(folder) {
  var manifestFile = getFirstFileByName_(folder, PROJECT_MANIFEST_FILE);
  var manifest = readJsonFile_(manifestFile, null);
  var now = nowIso_();
  var email = getCurrentIdentity_().email;

  if (!manifest || !manifest.projectId) {
    manifest = {
      schemaVersion: 1,
      projectId: uuid_(),
      title: folder.getName(),
      description: 'Project imported automatically from Drive.',
      icon: 'spark',
      createdAt: now,
      updatedAt: now,
      owner: email,
      status: 'active',
      members: [{email: email, role: 'owner', scope: 'full', addedAt: now}],
      stats: {sourceCount: 0, conversationCount: 0, documentCount: 0, lastActivityAt: now}
    };
  } else {
    var registered = getRegistryProject_(manifest.projectId);
    if (registered && registered.folderId !== folder.getId()) {
      manifest.projectId = uuid_();
      manifest.title = folder.getName();
      manifest.owner = email;
      manifest.createdAt = now;
      manifest.updatedAt = now;
      manifest.members = [{email: email, role: 'owner', scope: 'full', addedAt: now}];
    }
  }

  manifest.folderId = folder.getId();
  manifest.title = manifest.title || folder.getName();
  manifest.icon = normalizeProjectIcon_(manifest.icon);
  manifest.members = manifest.members || [{email: manifest.owner || email, role: 'owner', scope: 'full', addedAt: now}];
  manifest.stats = manifest.stats || {sourceCount: 0, conversationCount: 0, documentCount: 0, lastActivityAt: now};
  manifest = normalizeProjectStructure_(folder, manifest, true);
  manifest = reconcileProjectStats_(manifest);
  writeProjectManifest_(folder, manifest);
  syncProjectControl_(manifest, false);
  saveRegistryProject_(manifest);
  return manifest;
}

function normalizeProjectStructure_(folder, project, allowCreate) {
  var names = {
    sources: 'Sources',
    documents: 'Generated Documents',
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
    'Sources': ['Source ID', 'Name', 'Type', 'Drive ID', 'Status', 'Added At', 'Added By'],
    'Conversations': ['Conversation ID', 'Title', 'Created At', 'Updated At', 'Created By', 'Status', 'JSON File ID'],
    'Documents': ['Document ID', 'Name', 'Type', 'Created At', 'Created By', 'Drive ID', 'Source Conversation'],
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
      syncProjectInformationSheet_(spreadsheet, project);
    }
  } catch (error) {
    console.warn('Project Control could not be updated: ' + error.message);
  }
}

function syncProjectInformationSheet_(spreadsheet, project) {
  var sheet = spreadsheet.getSheetByName('Project Information');
  if (!sheet) return;
  var values = [
    ['Project ID', project.projectId],
    ['Title', project.title],
    ['Description', project.description || ''],
    ['Icon', normalizeProjectIcon_(project.icon)],
    ['Owner', project.owner],
    ['Created At', project.createdAt],
    ['Updated At', project.updatedAt],
    ['Status', project.status || 'active'],
    ['Project Folder ID', project.folderId]
  ];
  sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), 2).clearContent();
  sheet.getRange(2, 1, values.length, 2).setValues(values);
  sheet.autoResizeColumns(1, 2);
}

function writeProjectManifest_(folder, project) {
  writeJsonFile_(folder, PROJECT_MANIFEST_FILE, project);
}

function saveRegistryProject_(project) {
  project.updatedAt = project.updatedAt || nowIso_();
  withScriptLock_(function() {
    PropertiesService.getScriptProperties().setProperty(APP.REGISTRY_PREFIX + project.projectId, JSON.stringify(project));
  });
}

function getRegistryProject_(projectId) {
  var value = PropertiesService.getScriptProperties().getProperty(APP.REGISTRY_PREFIX + projectId);
  return safeJsonParse_(value, null);
}

function getAllRegistryProjects_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(props).filter(function(key) { return key.indexOf(APP.REGISTRY_PREFIX) === 0; })
    .map(function(key) { return safeJsonParse_(props[key], null); })
    .filter(Boolean);
}

function publicProject_(project, member, favorite) {
  var stats = project.stats || {};
  return {
    projectId: project.projectId,
    title: project.title,
    description: project.description || '',
    icon: normalizeProjectIcon_(project.icon),
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
    lastActivityAt: stats.lastActivityAt || project.updatedAt
  };
}

function getFavoriteIds_() {
  return safeJsonParse_(PropertiesService.getUserProperties().getProperty(APP.USER_FAVORITES), []) || [];
}

function touchProjectStats_(projectId, changes) {
  var project = getRegistryProject_(projectId);
  if (!project) return;
  project.stats = project.stats || {};
  Object.keys(changes || {}).forEach(function(key) { project.stats[key] = changes[key]; });
  project.stats.lastActivityAt = nowIso_();
  project.updatedAt = project.stats.lastActivityAt;
  saveRegistryProject_(project);
  try { writeProjectManifest_(DriveApp.getFolderById(project.folderId), project); } catch (error) { console.warn(error.message); }
}

function normalizeProjectIcon_(value) {
  value = String(value || 'spark').toLowerCase();
  return PROJECT_ICONS.indexOf(value) !== -1 ? value : 'spark';
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
    var documentCount = listFilesRecursive_(DriveApp.getFolderById(project.folders.documents), [], 500).length;
    var pdfCount = project.folders.pdfs ? listFilesRecursive_(DriveApp.getFolderById(project.folders.pdfs), [], 500).length : 0;
    project.stats.documentCount = documentCount + pdfCount;
  } catch (documentError) {
    project.stats.documentCount = Number(project.stats.documentCount || 0);
  }
  project.stats.lastActivityAt = project.stats.lastActivityAt || project.updatedAt || project.createdAt;
  return project;
}
