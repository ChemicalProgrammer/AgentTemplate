var AGENT_MANIFEST_FILE = 'Agent Manifest.json';
var AGENT_RELEASE_MANIFEST_FILE = 'Release Manifest.json';
var AGENT_INSTRUCTIONS_FILE = 'System Instructions.md';
var GENERAL_AGENT_NAME = 'General Project Assistant';
var AGENT_LOGO_MAX_BYTES = 5 * 1024 * 1024;
var AGENT_SECTION_NAMES = Object.freeze({
  instructions: 'Instructions',
  knowledge: 'Knowledge',
  workflows: 'Workflows',
  templates: 'Templates',
  outputFormats: 'Output Formats',
  policies: 'Policies',
  examples: 'Examples',
  evaluations: 'Evaluations',
  assets: 'Assets',
  releases: 'Releases',
  runtime: '_Runtime'
});

function ensureConsoleStructure_(root, forceMigration) {
  root = root || getRootFolder_();
  var agentsFolder = ensureFolder_(root, APP.AGENTS_FOLDER);
  var projectsFolder = ensureFolder_(root, APP.PROJECTS_FOLDER);
  var systemFolder = ensureFolder_(root, APP.SYSTEM_FOLDER);
  var fontsFolder = ensureFolder_(systemFolder, APP.FONTS_FOLDER);
  var props = PropertiesService.getScriptProperties();
  var migrated = props.getProperty(APP.PROP_CONSOLE_MIGRATION) === '1';
  if (forceMigration || !migrated) {
    var folders = root.getFolders();
    while (folders.hasNext()) {
      var folder = folders.next();
      if (folder.isTrashed() || [agentsFolder.getId(), projectsFolder.getId(), systemFolder.getId()].indexOf(folder.getId()) !== -1) continue;
      var projectManifest = getFirstFileByName_(folder, PROJECT_MANIFEST_FILE);
      if (!projectManifest) continue;
      try { folder.moveTo(projectsFolder); }
      catch (moveError) { console.warn('Legacy project folder could not be moved: ' + readableErrorMessage_(moveError)); }
    }
    props.setProperty(APP.PROP_CONSOLE_MIGRATION, '1');
    invalidateProjectCaches_('');
  }
  ensureGeneralAgent_(agentsFolder);
  return {rootId: root.getId(), agentsFolderId: agentsFolder.getId(), projectsFolderId: projectsFolder.getId(), systemFolderId: systemFolder.getId(), fontsFolderId: fontsFolder.getId()};
}

function ensureGeneralAgent_(agentsFolder) {
  agentsFolder = agentsFolder || getAgentsFolder_();
  var folders = agentsFolder.getFoldersByName(GENERAL_AGENT_NAME);
  while (folders.hasNext()) {
    var existingFolder = folders.next();
    var existing = readJsonFile_(getFirstFileByName_(existingFolder, AGENT_MANIFEST_FILE), null);
    if (existing && existing.agentId) return lightweightAgentManifest_(existingFolder, existing);
  }
  var email = getCurrentIdentity_().email || PropertiesService.getScriptProperties().getProperty(APP.PROP_ADMIN) || '';
  var now = nowIso_();
  var folder = agentsFolder.createFolder(GENERAL_AGENT_NAME);
  var agent = {
    schemaVersion: 2,
    agentId: uuid_(),
    name: GENERAL_AGENT_NAME,
    description: 'General-purpose project assistant for existing and new projects.',
    icon: '✦', color: 'violet', logoPath: '', logoDriveId: '', logoMimeType: '', status: 'draft', owner: email,
    createdAt: now, updatedAt: now, publishedVersion: '', versions: [], folders: {}
  };
  agent = normalizeAgentStructure_(folder, agent, true);
  var instructionsFolder = DriveApp.getFolderById(agent.folders.instructions);
  instructionsFolder.createFile(AGENT_INSTRUCTIONS_FILE,
    '# General Project Assistant\n\nHelp users understand project information, develop ideas, and create accurate outputs. Use only the knowledge authorized for the current request. Preserve facts, units, qualifiers, and source boundaries. Never invent missing information.',
    MimeType.PLAIN_TEXT);
  writeAgentManifest_(folder, agent);
  publishAgentVersion_(agent, '1.0.0', email, true);
  invalidateAgentCaches_(agent.agentId);
  return agent;
}

function listAgents() {
  var email = assertOrganizationMember_();
  var agents = discoverAgents_(false).map(function(agent) { return publicAgent_(agent, email); })
    .sort(function(a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
  return applyUserCatalogOrder_(agents, APP.USER_AGENT_ORDER, 'agentId');
}

function refreshAgents() {
  var email = assertOrganizationMember_();
  var agents = discoverAgents_(true).map(function(agent) { return publicAgent_(agent, email); })
    .sort(function(a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
  return applyUserCatalogOrder_(agents, APP.USER_AGENT_ORDER, 'agentId');
}

function saveAgentCatalogOrder(orderedAgentIds) {
  var agents = listAgents();
  return saveUserCatalogOrder_(orderedAgentIds, agents.map(function(agent) { return agent.agentId; }), APP.USER_AGENT_ORDER);
}

function createAgent(input) {
  var email = assertOrganizationMember_();
  input = input || {};
  var name = normalizeName_(input.name, 'New agent');
  var folder = getAgentsFolder_().createFolder(name);
  var now = nowIso_();
  var agent = {
    schemaVersion: 2, agentId: uuid_(), name: name,
    description: sanitizeText_(input.description, 1000).trim(),
    icon: normalizeAgentIcon_(input.icon), color: normalizeProjectColor_(input.color || 'violet'),
    showMandatoryKnowledgeInProjects: input.showMandatoryKnowledgeInProjects !== false,
    logoPath: '', logoDriveId: '', logoMimeType: '',
    status: 'draft', owner: email, createdAt: now, updatedAt: now,
    publishedVersion: '', versions: [], folders: {}
  };
  agent = normalizeAgentStructure_(folder, agent, true);
  DriveApp.getFolderById(agent.folders.instructions).createFile(AGENT_INSTRUCTIONS_FILE,
    '# ' + name + '\n\nDescribe the agent role, goals, required behavior, limitations, and quality criteria here.', MimeType.PLAIN_TEXT);
  writeAgentManifest_(folder, agent);
  cacheAgentLocator_(agent.agentId, folder.getId());
  invalidateAgentCaches_(agent.agentId);
  return publicAgent_(agent, email);
}

function getAgentDetails(agentId) {
  var access = assertAgentAccess_(agentId, false);
  var agent = access.agent;
  var draft = scanAgentDraftAssets_(agent);
  return {
    agent: publicAgent_(agent, access.email),
    instructions: readAgentInstructions_(agent),
    assets: draft,
    validation: validateAgentDraft_(agent, draft),
    folderUrl: 'https://drive.google.com/drive/folders/' + agent.folderId,
    versions: (agent.versions || []).slice().sort(function(a, b) { return String(b.releasedAt).localeCompare(String(a.releasedAt)); })
  };
}

function updateAgent(agentId, changes) {
  var access = assertAgentAccess_(agentId, true);
  var agent = access.agent;
  changes = changes || {};
  if (changes.name != null) agent.name = normalizeName_(changes.name, agent.name);
  if (changes.description != null) agent.description = sanitizeText_(changes.description, 1000).trim();
  if (changes.icon != null) agent.icon = normalizeAgentIcon_(changes.icon);
  if (changes.color != null) agent.color = normalizeProjectColor_(changes.color);
  if (changes.showMandatoryKnowledgeInProjects != null) agent.showMandatoryKnowledgeInProjects = Boolean(changes.showMandatoryKnowledgeInProjects);
  if (changes.instructions != null) writeAgentInstructions_(agent, sanitizeText_(changes.instructions, 120000));
  agent.updatedAt = nowIso_();
  agent.draftChangedAt = agent.updatedAt;
  var folder = DriveApp.getFolderById(agent.folderId);
  if (folder.getName() !== agent.name) folder.setName(agent.name);
  writeAgentManifest_(folder, agent);
  invalidateAgentCaches_(agentId);
  cacheAgentLocator_(agentId, folder.getId());
  return getAgentDetails(agentId);
}

function setAgentLogoFromDrive(agentId, driveUrlOrId) {
  var access = assertAgentAccess_(agentId, true);
  var driveId = extractDriveId_(driveUrlOrId);
  var source;
  try { source = DriveApp.getFileById(driveId); }
  catch (error) { throw new Error('The Drive image could not be opened. Check the link and your access.'); }
  if (!source || source.isTrashed()) throw new Error('The selected logo is unavailable in Drive.');
  var mimeType = String(source.getMimeType() || '').toLowerCase();
  if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(mimeType)) throw new Error('Agent logos must be PNG, JPG, GIF, WebP, or SVG images.');
  if (Number(source.getSize() || 0) > AGENT_LOGO_MAX_BYTES) throw new Error('Agent logos must be 5 MB or smaller.');
  var extension = ({'image/png':'.png','image/jpeg':'.jpg','image/gif':'.gif','image/webp':'.webp','image/svg+xml':'.svg'})[mimeType] || '';
  var assetsFolder = DriveApp.getFolderById(access.agent.folders.assets);
  var copy = source.makeCopy('Agent Logo' + extension, assetsFolder);
  var previousId = String(access.agent.logoDriveId || '');
  access.agent.logoPath = 'Assets/' + copy.getName();
  access.agent.logoDriveId = copy.getId();
  access.agent.logoMimeType = mimeType;
  access.agent.updatedAt = nowIso_();
  access.agent.draftChangedAt = access.agent.updatedAt;
  writeAgentManifest_(DriveApp.getFolderById(access.agent.folderId), access.agent);
  if (previousId && previousId !== copy.getId()) {
    try { DriveApp.getFileById(previousId).setTrashed(true); } catch (trashError) { console.warn(trashError.message); }
  }
  invalidateAgentCaches_(agentId);
  return getAgentDetails(agentId);
}

function removeAgentLogo(agentId) {
  var access = assertAgentAccess_(agentId, true);
  var driveId = String(access.agent.logoDriveId || '');
  clearAgentLogoFields_(access.agent);
  access.agent.updatedAt = nowIso_();
  access.agent.draftChangedAt = access.agent.updatedAt;
  writeAgentManifest_(DriveApp.getFolderById(access.agent.folderId), access.agent);
  if (driveId) {
    try { DriveApp.getFileById(driveId).setTrashed(true); } catch (trashError) { console.warn(trashError.message); }
  }
  invalidateAgentCaches_(agentId);
  return getAgentDetails(agentId);
}

function addAgentAssetFromDrive(agentId, assetType, driveUrlOrId, knowledgeMode) {
  var access = assertAgentAccess_(agentId, true);
  var target = resolveAgentAssetTarget_(access.agent, assetType, knowledgeMode);
  var driveId = extractDriveId_(driveUrlOrId);
  var copied = [];
  var file = null;
  try { file = DriveApp.getFileById(driveId); } catch (fileError) {}
  if (file && !file.isTrashed()) {
    validateAgentAssetFile_(assetType, file);
    var copy = file.makeCopy(file.getName(), target);
    copied.push({name: copy.getName(), driveId: copy.getId()});
  } else {
    var sourceFolder;
    try { sourceFolder = DriveApp.getFolderById(driveId); }
    catch (folderError) { throw new Error('The Drive file or folder could not be opened. Check the link and your access.'); }
    copyFolderFiles_(sourceFolder, target, copied, APP.MAX_SOURCE_FILES);
  }
  if (!copied.length) throw new Error('No supported files were found to import.');
  access.agent.updatedAt = nowIso_();
  access.agent.draftChangedAt = access.agent.updatedAt;
  writeAgentManifest_(DriveApp.getFolderById(access.agent.folderId), access.agent);
  invalidateAgentCaches_(agentId);
  return getAgentDetails(agentId);
}

function removeAgentAsset(agentId, driveId) {
  var access = assertAgentAccess_(agentId, true);
  driveId = extractDriveId_(driveId);
  var allowed = scanAgentDraftAssets_(access.agent).all.some(function(asset) { return asset.driveId === driveId; });
  if (!allowed) throw new Error('This file is not part of the editable agent draft.');
  DriveApp.getFileById(driveId).setTrashed(true);
  if (String(access.agent.logoDriveId || '') === driveId) clearAgentLogoFields_(access.agent);
  access.agent.updatedAt = nowIso_();
  access.agent.draftChangedAt = access.agent.updatedAt;
  writeAgentManifest_(DriveApp.getFolderById(access.agent.folderId), access.agent);
  invalidateAgentCaches_(agentId);
  return getAgentDetails(agentId);
}

function publishAgent(agentId, version) {
  var access = assertAgentAccess_(agentId, true);
  version = normalizeAgentVersion_(version);
  return publishAgentVersion_(access.agent, version, access.email, false);
}

function publishAgentVersion_(agent, version, email, systemBootstrap) {
  if ((agent.versions || []).some(function(item) { return item.version === version; })) throw new Error('Version ' + version + ' already exists and is immutable. Choose a new version.');
  var validation = validateAgentDraft_(agent);
  if (validation.errors.length) throw new Error('The agent cannot be published: ' + validation.errors.join(' | '));
  var releases = DriveApp.getFolderById(agent.folders.releases);
  if (releases.getFoldersByName(version).hasNext()) throw new Error('The release folder ' + version + ' already exists.');
  var releaseFolder = releases.createFolder(version);
  var idMap = {};
  ['instructions','knowledge','workflows','templates','outputFormats','policies','examples','evaluations','assets'].forEach(function(key) {
    var source = DriveApp.getFolderById(agent.folders[key]);
    var destination = releaseFolder.createFolder(AGENT_SECTION_NAMES[key]);
    copyProjectFolderTree_(source, destination, idMap);
  });
  var release = buildAgentReleaseManifest_(agent, releaseFolder, version, email);
  writeJsonFile_(releaseFolder, AGENT_RELEASE_MANIFEST_FILE, release);
  agent.versions = agent.versions || [];
  agent.versions.push({
    version: version, releasedAt: release.releasedAt, releasedBy: email,
    releaseFolderName: version, sourceCount: release.knowledgeSources.length,
    workflowCount: release.workflows.length, templateCount: release.templates.length
  });
  agent.publishedVersion = version;
  agent.status = 'published';
  agent.updatedAt = release.releasedAt;
  agent.lastPublishedAt = release.releasedAt;
  writeAgentManifest_(DriveApp.getFolderById(agent.folderId), agent);
  invalidateAgentCaches_(agent.agentId);
  var warnings = [];
  if (!systemBootstrap) {
    try { syncAgentKnowledgeIndex_(agent, release, false); }
    catch (indexError) { warnings.push('The release was published, but knowledge indexing must be continued: ' + readableErrorMessage_(indexError)); }
  }
  var output = publicAgent_(agent, email);
  output.release = publicAgentRelease_(release);
  output.warnings = warnings;
  return output;
}

function cloneAgent(agentId) {
  var access = assertAgentAccess_(agentId, false);
  var source = DriveApp.getFolderById(access.agent.folderId);
  var agentsFolder = getAgentsFolder_();
  var name = buildAvailableFolderName_(agentsFolder, access.agent.name + ' Copy');
  var destination = agentsFolder.createFolder(name);
  var idMap = {};
  copyProjectFolderTree_(source, destination, idMap);
  var now = nowIso_();
  var clone = readJsonFile_(getFirstFileByName_(destination, AGENT_MANIFEST_FILE), {}) || {};
  clone.agentId = uuid_(); clone.name = name; clone.owner = access.email;
  clone.createdAt = now; clone.updatedAt = now; clone.status = 'draft';
  clone.publishedVersion = ''; clone.versions = []; clone.folders = {};
  clone = normalizeAgentStructure_(destination, clone, true);
  var releases = DriveApp.getFolderById(clone.folders.releases);
  var releaseFolders = releases.getFolders();
  while (releaseFolders.hasNext()) releaseFolders.next().setTrashed(true);
  writeAgentManifest_(destination, clone);
  invalidateAgentCaches_(clone.agentId);
  return publicAgent_(clone, access.email);
}

function deleteAgent(agentId) {
  var access = assertAgentAccess_(agentId, true);
  if (access.agent.name === GENERAL_AGENT_NAME) throw new Error('The General Project Assistant cannot be deleted.');
  var inUse = discoverProjects_(false).filter(function(project) { return project.agentId === agentId; });
  if (inUse.length) throw new Error('This agent is assigned to ' + inUse.length + ' project(s). Change those projects to another agent first.');
  (access.agent.versions || []).forEach(function(item) {
    try { deleteFileSearchStoreForProject_(agentRuntimeId_(agentId, item.version)); } catch (error) { console.warn(error.message); }
  });
  DriveApp.getFolderById(access.agent.folderId).setTrashed(true);
  invalidateAgentCaches_(agentId);
  return {deleted: true, agentId: agentId};
}

function discoverAgents_(forceRefresh) {
  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    var cached = safeJsonParse_(cache.get(APP.AGENT_CATALOG_CACHE_KEY), null);
    if (cached && Array.isArray(cached.agents)) return cached.agents;
  }
  var agents = [];
  var seen = {};
  var folders = getAgentsFolder_().getFolders();
  while (folders.hasNext()) {
    var folder = folders.next();
    if (folder.isTrashed()) continue;
    try {
      var manifest = readJsonFile_(getFirstFileByName_(folder, AGENT_MANIFEST_FILE), null);
      manifest = registerAgentFolder_(folder, manifest, seen);
      agents.push(manifest);
      seen[manifest.agentId] = folder.getId();
      cacheAgentLocator_(manifest.agentId, folder.getId());
    } catch (error) { console.warn('Agent folder skipped: ' + readableErrorMessage_(error)); }
  }
  try { cache.put(APP.AGENT_CATALOG_CACHE_KEY, JSON.stringify({agents: agents}), APP.PROJECT_CACHE_SECONDS); } catch (error) { console.warn(error.message); }
  return agents;
}

function registerAgentFolder_(folder, manifest, seen) {
  var email = getCurrentIdentity_().email;
  var now = nowIso_();
  if (!manifest || !manifest.agentId) {
    manifest = {schemaVersion:2, agentId:uuid_(), name:folder.getName(), description:'Agent imported from Drive.', icon:'✦', color:'violet', logoPath:'', logoDriveId:'', logoMimeType:'', status:'draft', owner:email, createdAt:now, updatedAt:now, publishedVersion:'', versions:[], folders:{}};
  } else if (seen && seen[manifest.agentId] && seen[manifest.agentId] !== folder.getId()) {
    manifest.agentId = uuid_(); manifest.name = folder.getName(); manifest.owner = email;
    manifest.createdAt = now; manifest.updatedAt = now; manifest.status = 'draft';
    manifest.publishedVersion = ''; manifest.versions = [];
    manifest._resetCopiedReleases = true;
  }
  manifest = normalizeAgentStructure_(folder, manifest, true);
  if (manifest._resetCopiedReleases) {
    var copiedReleases = DriveApp.getFolderById(manifest.folders.releases).getFolders();
    while (copiedReleases.hasNext()) copiedReleases.next().setTrashed(true);
    delete manifest._resetCopiedReleases;
  } else {
    reconcileAgentReleaseManifests_(manifest);
  }
  writeAgentManifest_(folder, manifest);
  return manifest;
}

function reconcileAgentReleaseManifests_(agent) {
  var versions = [];
  var folders = DriveApp.getFolderById(agent.folders.releases).getFolders();
  while (folders.hasNext()) {
    var folder = folders.next();
    if (folder.isTrashed() || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(folder.getName())) continue;
    var old = readJsonFile_(getFirstFileByName_(folder, AGENT_RELEASE_MANIFEST_FILE), null);
    var release = old;
    if (!old || old.releaseFolderId !== folder.getId() || old.agentId !== agent.agentId) {
      release = buildAgentReleaseManifest_(agent, folder, folder.getName(), old && old.releasedBy || agent.owner);
      release.releasedAt = old && old.releasedAt || release.releasedAt;
      var oldKnowledge = {};
      (old && old.knowledgeSources || []).forEach(function(source){oldKnowledge[source.relativePath]=source.sourceId;});
      release.knowledgeSources.forEach(function(source){if(oldKnowledge[source.relativePath])source.sourceId=oldKnowledge[source.relativePath];});
      var oldAssets = {};
      ['workflows','templates','examples','evaluations'].forEach(function(key){(old && old[key] || []).forEach(function(asset){oldAssets[key+':'+asset.relativePath]=asset.assetId;});(release[key]||[]).forEach(function(asset){if(oldAssets[key+':'+asset.relativePath])asset.assetId=oldAssets[key+':'+asset.relativePath];});});
      writeJsonFile_(folder, AGENT_RELEASE_MANIFEST_FILE, release);
    }
    versions.push({version:release.version,releasedAt:release.releasedAt,releasedBy:release.releasedBy,releaseFolderName:folder.getName(),sourceCount:(release.knowledgeSources||[]).length,workflowCount:(release.workflows||[]).length,templateCount:(release.templates||[]).length});
  }
  if (versions.length) {
    agent.versions = versions;
    if (!agent.publishedVersion || !versions.some(function(item){return item.version===agent.publishedVersion;})) {
      versions.sort(function(a,b){return String(b.releasedAt).localeCompare(String(a.releasedAt));});
      agent.publishedVersion = versions[0].version;
    }
    agent.status = 'published';
  }
}

function normalizeAgentStructure_(folder, agent, allowCreate) {
  agent.schemaVersion = Math.max(Number(agent.schemaVersion || 1), 2);
  agent.folders = agent.folders || {};
  Object.keys(AGENT_SECTION_NAMES).forEach(function(key) {
    var child = getFirstFolderByName_(folder, AGENT_SECTION_NAMES[key]);
    if (!child && allowCreate) child = folder.createFolder(AGENT_SECTION_NAMES[key]);
    if (child) agent.folders[key] = child.getId();
  });
  if (agent.folders.knowledge) {
    var knowledge = DriveApp.getFolderById(agent.folders.knowledge);
    var mandatory = getFirstFolderByName_(knowledge, 'Mandatory Sources');
    var optional = getFirstFolderByName_(knowledge, 'Optional Sources');
    if (!mandatory && allowCreate) mandatory = knowledge.createFolder('Mandatory Sources');
    if (!optional && allowCreate) optional = knowledge.createFolder('Optional Sources');
    if (mandatory) agent.folders.mandatoryKnowledge = mandatory.getId();
    if (optional) agent.folders.optionalKnowledge = optional.getId();
  }
  agent.folderId = folder.getId();
  agent.name = agent.name || folder.getName();
  agent.icon = normalizeAgentIcon_(agent.icon);
  agent.color = normalizeProjectColor_(agent.color || 'violet');
  agent.showMandatoryKnowledgeInProjects = agent.showMandatoryKnowledgeInProjects !== false;
  resolveAgentLogoReference_(agent);
  agent.status = agent.status || 'draft';
  agent.versions = agent.versions || [];
  return agent;
}

function lightweightAgentManifest_(folder, agent) {
  agent.folderId = folder.getId();
  agent.name = agent.name || folder.getName();
  agent.icon = normalizeAgentIcon_(agent.icon);
  agent.color = normalizeProjectColor_(agent.color || 'violet');
  agent.showMandatoryKnowledgeInProjects = agent.showMandatoryKnowledgeInProjects !== false;
  agent.logoPath = String(agent.logoPath || '');
  agent.logoDriveId = String(agent.logoDriveId || '');
  agent.logoMimeType = String(agent.logoMimeType || '');
  agent.versions = agent.versions || [];
  return agent;
}

function getAgentFromRoot_(agentId) {
  agentId = String(agentId || '');
  var cache = CacheService.getScriptCache();
  var folderId = cache.get(APP.AGENT_LOCATOR_CACHE_PREFIX + agentId);
  if (folderId) {
    try {
      var folder = DriveApp.getFolderById(folderId);
      if (!folder.isTrashed()) {
        var manifest = readJsonFile_(getFirstFileByName_(folder, AGENT_MANIFEST_FILE), null);
        if (manifest && manifest.agentId === agentId) return lightweightAgentManifest_(folder, manifest);
      }
    } catch (error) {}
  }
  var agents = discoverAgents_(false);
  for (var index = 0; index < agents.length; index++) if (agents[index].agentId === agentId) return agents[index];
  return null;
}

function getDefaultAgent_() {
  var agents = discoverAgents_(false);
  var general = agents.filter(function(agent) { return agent.name === GENERAL_AGENT_NAME && agent.publishedVersion; })[0];
  if (general) return general;
  return ensureGeneralAgent_(getAgentsFolder_());
}

function assertAgentAccess_(agentId, requireEdit) {
  var email = assertOrganizationMember_();
  var agent = getAgentFromRoot_(agentId);
  if (!agent) throw new Error('Agent not found. Scan the Agents folder and try again.');
  var canEdit = email === agent.owner || email === getPublicConfig_().adminEmail;
  if (requireEdit && !canEdit) throw new Error('Only the agent owner or application administrator can edit this agent.');
  return {email: email, agent: agent, canEdit: canEdit};
}

function publicAgent_(agent, email) {
  var latest = (agent.versions || []).filter(function(item) { return item.version === agent.publishedVersion; })[0] || {};
  return {
    agentId: agent.agentId, name: agent.name, description: agent.description || '',
    icon: normalizeAgentIcon_(agent.icon), color: normalizeProjectColor_(agent.color || 'violet'),
    showMandatoryKnowledgeInProjects: agent.showMandatoryKnowledgeInProjects !== false,
    logoPath: String(agent.logoPath || ''), logoUrl: agentLogoUrl_(agent.logoDriveId),
    status: agent.status || 'draft', owner: agent.owner || '', createdAt: agent.createdAt, updatedAt: agent.updatedAt,
    publishedVersion: agent.publishedVersion || '', versionCount: (agent.versions || []).length,
    versions: (agent.versions || []).map(function(item){return {version:item.version,releasedAt:item.releasedAt};}),
    sourceCount: Number(latest.sourceCount || 0), workflowCount: Number(latest.workflowCount || 0), templateCount: Number(latest.templateCount || 0),
    canEdit: email === agent.owner || email === getPublicConfig_().adminEmail,
    folderUrl: 'https://drive.google.com/drive/folders/' + agent.folderId,
    hasDraftChanges: Boolean(agent.draftChangedAt && (!agent.lastPublishedAt || agent.draftChangedAt > agent.lastPublishedAt))
  };
}

function writeAgentManifest_(folder, agent) { writeJsonFile_(folder, AGENT_MANIFEST_FILE, agent); }

function cacheAgentLocator_(agentId, folderId) {
  if (!agentId || !folderId) return;
  try { CacheService.getScriptCache().put(APP.AGENT_LOCATOR_CACHE_PREFIX + agentId, folderId, APP.PROJECT_CACHE_SECONDS); } catch (error) {}
}

function invalidateAgentCaches_(agentId) {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove(APP.AGENT_CATALOG_CACHE_KEY);
    if (agentId) cache.remove(APP.AGENT_LOCATOR_CACHE_PREFIX + agentId);
  } catch (error) {}
}

function normalizeAgentIcon_(value) {
  value = String(value || '✦').trim();
  return value.slice(0, 8) || '✦';
}

function resolveAgentLogoReference_(agent) {
  agent.logoPath = String(agent.logoPath || '');
  agent.logoDriveId = String(agent.logoDriveId || '');
  agent.logoMimeType = String(agent.logoMimeType || '');
  if (!agent.folders || !agent.folders.assets) return agent;
  var assets = scanFolderAssets_(DriveApp.getFolderById(agent.folders.assets), 'Assets');
  var match = agent.logoPath ? assets.filter(function(asset) { return asset.relativePath === agent.logoPath; })[0] : assets.filter(function(asset) { return asset.driveId === agent.logoDriveId; })[0];
  if (!match) { clearAgentLogoFields_(agent); return agent; }
  agent.logoPath = match.relativePath;
  agent.logoDriveId = match.driveId;
  agent.logoMimeType = match.mimeType;
  return agent;
}

function clearAgentLogoFields_(agent) {
  agent.logoPath = '';
  agent.logoDriveId = '';
  agent.logoMimeType = '';
}

function agentLogoUrl_(driveId) {
  driveId = String(driveId || '').replace(/[^A-Za-z0-9_-]/g, '');
  return driveId ? 'https://drive.google.com/thumbnail?id=' + driveId + '&sz=w160' : '';
}

function normalizeAgentVersion_(value) {
  value = String(value || '').trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) throw new Error('Use a semantic version such as 1.0.0 or 1.1.0-beta.1.');
  return value;
}

function readAgentInstructions_(agent) {
  var folder = DriveApp.getFolderById(agent.folders.instructions);
  var file = getFirstFileByName_(folder, AGENT_INSTRUCTIONS_FILE);
  if (!file) return '';
  return readAgentTextFile_(file);
}

function writeAgentInstructions_(agent, content) {
  var folder = DriveApp.getFolderById(agent.folders.instructions);
  var file = getFirstFileByName_(folder, AGENT_INSTRUCTIONS_FILE);
  if (file) file.setContent(content); else folder.createFile(AGENT_INSTRUCTIONS_FILE, content, MimeType.PLAIN_TEXT);
}

function scanAgentDraftAssets_(agent) {
  var groups = {
    mandatoryKnowledge: scanFolderAssets_(DriveApp.getFolderById(agent.folders.mandatoryKnowledge), 'Knowledge/Mandatory Sources'),
    optionalKnowledge: scanFolderAssets_(DriveApp.getFolderById(agent.folders.optionalKnowledge), 'Knowledge/Optional Sources'),
    workflows: scanFolderAssets_(DriveApp.getFolderById(agent.folders.workflows), 'Workflows'),
    templates: scanFolderAssets_(DriveApp.getFolderById(agent.folders.templates), 'Templates'),
    outputFormats: scanFolderAssets_(DriveApp.getFolderById(agent.folders.outputFormats), 'Output Formats'),
    policies: scanFolderAssets_(DriveApp.getFolderById(agent.folders.policies), 'Policies'),
    examples: scanFolderAssets_(DriveApp.getFolderById(agent.folders.examples), 'Examples'),
    evaluations: scanFolderAssets_(DriveApp.getFolderById(agent.folders.evaluations), 'Evaluations'),
    assets: scanFolderAssets_(DriveApp.getFolderById(agent.folders.assets), 'Assets')
  };
  groups.all = [].concat(groups.mandatoryKnowledge, groups.optionalKnowledge, groups.workflows, groups.templates, groups.outputFormats, groups.policies, groups.examples, groups.evaluations, groups.assets);
  return groups;
}

function validateAgentDraft_(agent, assets) {
  assets = assets || scanAgentDraftAssets_(agent);
  var errors = []; var warnings = [];
  if (!readAgentInstructions_(agent).trim()) errors.push('System Instructions.md is empty.');
  (assets.workflows || []).forEach(function(asset){if(!/\.md$/i.test(asset.name))errors.push('Workflow must use .md: '+asset.name);});
  (assets.templates || []).forEach(function(asset){if(TEMPLATE_MIME_TYPES.indexOf(asset.mimeType)===-1&&!isHtmlPresentationTemplate_(asset))errors.push('Template must be Google Docs, Sheets, Slides, or HTML: '+asset.name);});
  (assets.mandatoryKnowledge || []).concat(assets.optionalKnowledge || []).forEach(function(asset){if(Number(asset.size||0)>APP.MAX_FILE_SEARCH_BYTES)errors.push('Knowledge source exceeds 100 MB: '+asset.name);});
  if (!(assets.mandatoryKnowledge || []).length && !(assets.optionalKnowledge || []).length) warnings.push('This agent has no knowledge sources and will rely on project context.');
  if (!(assets.evaluations || []).length) warnings.push('No evaluation cases are defined.');
  return {valid:!errors.length,errors:errors,warnings:warnings};
}

function scanFolderAssets_(folder, prefix) {
  var output = [];
  function visit(current, path) {
    var files = current.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      if (file.isTrashed()) continue;
      output.push({assetId:file.getId(), driveId:file.getId(), name:file.getName(), mimeType:file.getMimeType(), size:Number(file.getSize() || 0), updatedAt:file.getLastUpdated().toISOString(), relativePath:path + '/' + file.getName(), url:file.getUrl()});
    }
    var folders = current.getFolders();
    while (folders.hasNext()) { var child = folders.next(); if (!child.isTrashed()) visit(child, path + '/' + child.getName()); }
  }
  visit(folder, prefix);
  return output;
}

function resolveAgentAssetTarget_(agent, assetType, knowledgeMode) {
  assetType = String(assetType || '').trim();
  if (assetType === 'knowledge') return DriveApp.getFolderById(knowledgeMode === 'optional' ? agent.folders.optionalKnowledge : agent.folders.mandatoryKnowledge);
  var mapping = {workflow:'workflows',template:'templates',output:'outputFormats',policy:'policies',example:'examples',evaluation:'evaluations',asset:'assets',instruction:'instructions'};
  var key = mapping[assetType];
  if (!key) throw new Error('Unsupported agent asset type.');
  return DriveApp.getFolderById(agent.folders[key]);
}

function validateAgentAssetFile_(assetType, file) {
  if (assetType === 'workflow' && !/\.md$/i.test(file.getName())) throw new Error('Agent workflows must be Markdown .md files.');
  if (assetType === 'template' && TEMPLATE_MIME_TYPES.indexOf(file.getMimeType()) === -1 && !isHtmlPresentationTemplate_({mimeType:file.getMimeType(),name:file.getName()})) throw new Error('Agent templates must be Google Docs, Sheets, Slides, or HTML files.');
}

function buildAvailableFolderName_(parent, preferred) {
  var base = normalizeName_(preferred, 'Copy');
  if (!parent.getFoldersByName(base).hasNext()) return base;
  for (var index = 2; index < 1000; index++) if (!parent.getFoldersByName(base + ' ' + index).hasNext()) return base + ' ' + index;
  return base + ' ' + new Date().getTime();
}

function buildAgentReleaseManifest_(agent, releaseFolder, version, email) {
  var mandatoryFolder = getFirstFolderByName_(getFirstFolderByName_(releaseFolder, AGENT_SECTION_NAMES.knowledge), 'Mandatory Sources');
  var optionalFolder = getFirstFolderByName_(getFirstFolderByName_(releaseFolder, AGENT_SECTION_NAMES.knowledge), 'Optional Sources');
  var mandatory = mandatoryFolder ? scanFolderAssets_(mandatoryFolder, 'Knowledge/Mandatory Sources') : [];
  var optional = optionalFolder ? scanFolderAssets_(optionalFolder, 'Knowledge/Optional Sources') : [];
  var knowledge = mandatory.map(function(asset) { return releaseKnowledgeRecord_(asset, true, agent, version); })
    .concat(optional.map(function(asset) { return releaseKnowledgeRecord_(asset, false, agent, version); }));
  var releaseLogo = resolveReleaseLogoAsset_(releaseFolder, agent.logoPath);
  return {
    schemaVersion: 2, agentId: agent.agentId, agentName: agent.name, version: version,
    description: agent.description || '', icon: agent.icon, color: agent.color,
    showMandatoryKnowledgeInProjects: agent.showMandatoryKnowledgeInProjects !== false,
    logoPath: releaseLogo ? releaseLogo.relativePath : '', logoDriveId: releaseLogo ? releaseLogo.driveId : '', logoMimeType: releaseLogo ? releaseLogo.mimeType : '',
    releasedAt: nowIso_(), releasedBy: email, releaseFolderId: releaseFolder.getId(),
    instructions: readReleaseTextSection_(releaseFolder, AGENT_SECTION_NAMES.instructions, 120000),
    policiesText: readReleaseTextSection_(releaseFolder, AGENT_SECTION_NAMES.policies, 60000),
    outputFormatsText: readReleaseTextSection_(releaseFolder, AGENT_SECTION_NAMES.outputFormats, 60000),
    knowledgeSources: knowledge,
    workflows: releaseAssetRecords_(releaseFolder, AGENT_SECTION_NAMES.workflows, 'agent-flow'),
    templates: releaseAssetRecords_(releaseFolder, AGENT_SECTION_NAMES.templates, 'agent-template'),
    examples: releaseAssetRecords_(releaseFolder, AGENT_SECTION_NAMES.examples, 'agent-example'),
    evaluations: releaseAssetRecords_(releaseFolder, AGENT_SECTION_NAMES.evaluations, 'agent-evaluation')
  };
}

function resolveReleaseLogoAsset_(releaseFolder, logoPath) {
  logoPath = String(logoPath || '');
  if (!logoPath) return null;
  var assetsFolder = getFirstFolderByName_(releaseFolder, AGENT_SECTION_NAMES.assets);
  if (!assetsFolder) return null;
  return scanFolderAssets_(assetsFolder, 'Assets').filter(function(asset) { return asset.relativePath === logoPath; })[0] || null;
}

function releaseKnowledgeRecord_(asset, mandatory, agent, version) {
  return {
    sourceId: uuid_(), name: asset.name, driveId: asset.driveId, mimeType: asset.mimeType,
    size: asset.size, status: 'active', updatedAt: asset.updatedAt, relativePath: asset.relativePath,
    mandatory: Boolean(mandatory), agentId: agent.agentId, agentVersion: version
  };
}

function releaseAssetRecords_(releaseFolder, sectionName, prefix) {
  var folder = getFirstFolderByName_(releaseFolder, sectionName);
  if (!folder) return [];
  return scanFolderAssets_(folder, sectionName).map(function(asset) {
    return {assetId:prefix + ':' + uuid_(), name:asset.name, driveId:asset.driveId, mimeType:asset.mimeType, size:asset.size, updatedAt:asset.updatedAt, relativePath:asset.relativePath, url:asset.url};
  });
}

function readReleaseTextSection_(releaseFolder, name, limit) {
  var folder = getFirstFolderByName_(releaseFolder, name);
  if (!folder) return '';
  var assets = scanFolderAssets_(folder, name);
  var output = [];
  var total = 0;
  assets.forEach(function(asset) {
    if (total >= limit) return;
    try {
      var text = readAgentTextFile_(DriveApp.getFileById(asset.driveId));
      if (!text) return;
      var section = asset.relativePath + '\n' + text;
      section = truncate_(section, limit - total); total += section.length; output.push(section);
    } catch (error) { console.warn(error.message); }
  });
  return output.join('\n\n---\n\n');
}

function readAgentTextFile_(file) {
  var mime = file.getMimeType();
  if ([MimeType.GOOGLE_DOCS, MimeType.GOOGLE_SHEETS, MimeType.GOOGLE_SLIDES].indexOf(mime) !== -1) return extractGoogleWorkspaceText_(file);
  if (/^(text\/|application\/(json|csv|xml))/.test(mime) || /\.(txt|md|csv|tsv|json|xml|yaml|yml)$/i.test(file.getName())) return file.getBlob().getDataAsString('UTF-8');
  return '';
}

function getAgentRelease_(agentId, version) {
  var agent = getAgentFromRoot_(agentId);
  if (!agent) return null;
  version = String(version || agent.publishedVersion || '');
  if (!version) return null;
  var releases = DriveApp.getFolderById(agent.folders.releases);
  var folders = releases.getFoldersByName(version);
  if (!folders.hasNext()) return null;
  var folder = folders.next();
  var release = readJsonFile_(getFirstFileByName_(folder, AGENT_RELEASE_MANIFEST_FILE), null);
  if (!release || release.agentId !== agentId || release.version !== version) return null;
  release.releaseFolderId = folder.getId();
  return {agent: agent, release: release};
}

function getProjectAgentRelease_(project) {
  if (!project.agentId) {
    var fallback = getDefaultAgent_();
    project.agentId = fallback.agentId; project.agentVersion = fallback.publishedVersion;
  }
  var resolved = getAgentRelease_(project.agentId, project.agentVersion || '');
  if (!resolved) throw new Error('The agent version assigned to this project is unavailable. Restore the agent folder or explicitly load another published agent.');
  return resolved;
}

function publicAgentRelease_(release) {
  return {agentId:release.agentId, name:release.agentName, version:release.version, icon:release.icon || '✦', color:release.color || 'violet', logoPath:release.logoPath || '', logoUrl:agentLogoUrl_(release.logoDriveId), showMandatoryKnowledgeInProjects:release.showMandatoryKnowledgeInProjects !== false, sourceCount:(release.knowledgeSources || []).length, workflowCount:(release.workflows || []).length, templateCount:(release.templates || []).length, releasedAt:release.releasedAt};
}

/**
 * A project keeps the selected release for instructions and knowledge, while
 * the agent's visible identity remains live. This prevents an older release
 * color or icon from overwriting the current agent branding after bootstrap.
 */
function publicProjectAgent_(resolved) {
  if (!resolved || !resolved.release) return null;
  var output = publicAgentRelease_(resolved.release);
  var agent = resolved.agent || {};
  output.name = String(agent.name || output.name || 'Agent');
  output.icon = normalizeAgentIcon_(agent.icon || output.icon || '✦');
  output.color = normalizeProjectColor_(agent.color || output.color || 'violet');
  output.logoPath = String(agent.logoPath || '');
  output.logoUrl = agentLogoUrl_(String(agent.logoDriveId || ''));
  return output;
}

function agentRuntimeId_(agentId, version) { return 'agent_' + String(agentId).replace(/[^A-Za-z0-9_-]/g, '') + '_' + String(version).replace(/[^A-Za-z0-9_-]/g, '_'); }

function agentRuntimeProject_(agent, release) {
  return {projectId:agentRuntimeId_(agent.agentId, release.version), title:'Agent ' + agent.name + ' ' + release.version, folderId:release.releaseFolderId, folders:{sources:release.releaseFolderId}, scopeType:'agent', agentId:agent.agentId, agentVersion:release.version};
}

function listAgentKnowledgeNodesForProject_(project) {
  var resolved = getProjectAgentRelease_(project);
  if (!resolved) return [];
  var runtime = agentRuntimeProject_(resolved.agent, resolved.release);
  var showMandatory = resolved.release.showMandatoryKnowledgeInProjects !== false;
  return (resolved.release.knowledgeSources || []).filter(function(source) { return source.status !== 'removed'; }).map(function(source) {
    var indexed = applyFileSearchStateToSource_(runtime, source);
    return {
      nodeId:'agent-source:' + source.sourceId, sourceId:source.sourceId, driveId:source.driveId,
      name:source.name, mimeType:source.mimeType, size:Number(source.size || 0),
      createdAt:resolved.release.releasedAt, updatedAt:source.updatedAt || resolved.release.releasedAt,
      kind:'agent-source', origin:'agent', status:'active', level:-1, parentIds:[], note:source.relativePath || '',
      mandatory:Boolean(source.mandatory), locked:Boolean(source.mandatory), selectedByDefault:Boolean(source.mandatory),
      hiddenInProject:Boolean(source.mandatory && !showMandatory),
      indexStatus:indexed.indexStatus || 'not_indexed', indexError:indexed.indexError || '', indexCheckError:indexed.indexCheckError || '', indexProgress:Number(indexed.indexProgress || 0),
      indexStage:indexed.indexStage || '', indexUpdatedAt:indexed.indexUpdatedAt || '', indexedAt:indexed.indexedAt || '',
      agentId:resolved.agent.agentId, agentVersion:resolved.release.version,
      url:source.driveId ? 'https://drive.google.com/open?id=' + source.driveId : ''
    };
  });
}

function getAgentKnowledgeSelection_(project, selectedSourceIds) {
  var resolved = getProjectAgentRelease_(project);
  if (!resolved) return {resolved:null, sources:[]};
  var requested = (selectedSourceIds || []).map(String);
  var sources = (resolved.release.knowledgeSources || []).filter(function(source) {
    return source.status === 'active' && (source.mandatory || requested.indexOf(source.sourceId) !== -1 || requested.indexOf('agent-source:' + source.sourceId) !== -1);
  });
  return {resolved:resolved, sources:sources};
}

function getAgentFileSearchQueryConfig_(project, selectedSourceIds) {
  var selection = getAgentKnowledgeSelection_(project, selectedSourceIds);
  if (!selection.resolved || !selection.sources.length) return null;
  var runtime = agentRuntimeProject_(selection.resolved.agent, selection.resolved.release);
  var store = getFileSearchStoreState_(runtime.projectId, true);
  if (!store) return null;
  var ready = selection.sources.filter(function(source) { return refreshFileSearchSourceState_(runtime, source, false).status === 'ready'; });
  return ready.length ? {storeName:store.storeName, sourceIds:ready.map(function(source) { return source.sourceId; }), resolved:selection.resolved} : null;
}

function buildAgentSourceContext_(project, query, selectedSourceIds, excludedSourceIds, options) {
  var selection = getAgentKnowledgeSelection_(project, selectedSourceIds);
  excludedSourceIds = (excludedSourceIds || []).map(String);
  var sources = selection.sources.filter(function(source) { return excludedSourceIds.indexOf(source.sourceId) === -1; });
  return buildStandaloneSourceContext_(sources, query, 'A', options);
}

function buildStandaloneSourceContext_(sources, query, labelPrefix, options) {
  options = options || {};
  var allowInlineBinary = options.allowInlineBinary !== false;
  var queryTerms = tokenize_(query); var candidates = []; var inlineParts = []; var inlineBytes = 0; var used = []; var warnings = [];
  (sources || []).forEach(function(source, position) {
    try {
      var extracted = extractSource_(DriveApp.getFileById(source.driveId));
      var label = labelPrefix + (position + 1);
      if (extracted.text) {
        chunkText_(extracted.text, 6000, 500).forEach(function(chunk, chunkIndex) { candidates.push({source:source,label:label,chunk:chunk,chunkIndex:chunkIndex,score:scoreChunk_((source.relativePath || '') + '\n' + chunk, queryTerms)}); });
      } else if (extracted.inlineData && !allowInlineBinary) {
        warnings.push(source.name + ': semantic indexing is still in progress, so this inherited binary source was not used in this response.');
      } else if (extracted.inlineData && inlineBytes + extracted.byteLength <= APP.MAX_INLINE_BYTES) {
        inlineParts.push({text:'[' + label + '] Agent knowledge: ' + source.name}); inlineParts.push({inlineData:extracted.inlineData}); inlineBytes += extracted.byteLength;
        used.push({sourceId:'agent-source:' + source.sourceId,label:label,name:source.name,mimeType:source.mimeType,kind:'agent-source'});
      } else warnings.push(source.name + ': the selected binary files exceed the local fallback limit.');
    } catch (error) { warnings.push(source.name + ': ' + readableErrorMessage_(error)); }
  });
  candidates.sort(function(a,b){return b.score-a.score;});
  var chars=0; var sections=[];
  candidates.slice(0,12).forEach(function(item){ if(chars>=APP.MAX_TEXT_CONTEXT_CHARS)return; var section='['+item.label+'] Agent knowledge · '+item.source.name+'\n'+item.chunk; section=truncate_(section,APP.MAX_TEXT_CONTEXT_CHARS-chars); chars+=section.length; sections.push(section); if(!used.some(function(x){return x.sourceId==='agent-source:'+item.source.sourceId;})) used.push({sourceId:'agent-source:'+item.source.sourceId,label:item.label,name:item.source.name,mimeType:item.source.mimeType,kind:'agent-source'}); });
  return {text:sections.join('\n\n---\n\n'),inlineParts:inlineParts,sourcesUsed:used,warnings:warnings,selectedIds:(sources||[]).map(function(source){return 'agent-source:'+source.sourceId;})};
}

function syncAgentKnowledgeIndex(agentId, version) {
  var access = assertAgentAccess_(agentId, false);
  var resolved = getAgentRelease_(agentId, version || access.agent.publishedVersion);
  if (!resolved) throw new Error('Published agent version not found.');
  return syncAgentKnowledgeIndex_(resolved.agent, resolved.release, true);
}

function syncAgentKnowledgeIndexForProject_(project) {
  var resolved = getProjectAgentRelease_(project);
  if (!resolved) return {sources:[],processed:0,remaining:0};
  return syncAgentKnowledgeIndex_(resolved.agent, resolved.release, true);
}

function indexProjectAgentSource(projectId, sourceId, restart) {
  var access = assertProjectEdit_(projectId, 'sources');
  var resolved = getProjectAgentRelease_(access.project);
  if (!resolved) throw new Error('The project agent is unavailable.');
  var source = (resolved.release.knowledgeSources || []).filter(function(item) {
    return item.sourceId === sourceId && item.status === 'active';
  })[0];
  if (!source) throw new Error('Inherited agent source not found.');
  return indexSourceForCurrentUser_(agentRuntimeProject_(resolved.agent, resolved.release), source, restart !== false);
}

function syncAgentKnowledgeIndex_(agent, release, forceFailed) {
  var runtime = agentRuntimeProject_(agent, release); var results=[]; var processed=0;
  (release.knowledgeSources || []).filter(function(source){return source.status==='active';}).forEach(function(source){
    var state=refreshFileSearchSourceState_(runtime,source,false);
    if(state.status==='ready'||state.status==='indexing'||state.status==='uploading'){results.push(publicFileSearchState_(source,state));return;}
    if(processed>=APP.FILE_SEARCH_BATCH_SIZE){results.push(publicFileSearchState_(source,state));return;}
    processed++;
    try{results.push(indexSourceForCurrentUser_(runtime,source,Boolean(forceFailed&&(state.status==='failed'||state.status==='unknown'))));}
    catch(error){results.push(publicFileSearchState_(source,saveFileSearchSourceState_(runtime.projectId,source.sourceId,{status:'failed',stage:state.stage||'indexing',error:readableErrorMessage_(error),updatedAt:nowIso_()})));}
  });
  return {sources:results,processed:processed,remaining:results.filter(function(item){return ['ready','indexing','uploading'].indexOf(item.indexStatus)===-1;}).length,agentId:agent.agentId,version:release.version};
}

function getAgentExecutionContext_(project) {
  var resolved = getProjectAgentRelease_(project);
  if (!resolved) return {name:GENERAL_AGENT_NAME,version:'',instructions:'',policies:'',outputFormats:''};
  return {name:resolved.release.agentName,version:resolved.release.version,instructions:resolved.release.instructions||'',policies:resolved.release.policiesText||'',outputFormats:resolved.release.outputFormatsText||''};
}

function listAgentFlowsForProject_(project) {
  var resolved=getProjectAgentRelease_(project); if(!resolved)return[];
  return (resolved.release.workflows||[]).map(function(flow){var output=JSON.parse(JSON.stringify(flow));output.flowId=flow.assetId;output.origin='agent';output.readOnly=true;output.url=flow.driveId?'https://drive.google.com/open?id='+flow.driveId:'';return output;});
}

function listAgentTemplatesForProject_(project) {
  var resolved=getProjectAgentRelease_(project); if(!resolved)return[];
  var selectedId=PropertiesService.getUserProperties().getProperty(APP.USER_TEMPLATE_PREFIX+project.projectId)||'';
  return (resolved.release.templates||[]).map(function(template){var output=JSON.parse(JSON.stringify(template));output.templateId=template.assetId;output.origin='agent';output.readOnly=true;output.selected=output.templateId===selectedId;output.url=template.driveId?'https://drive.google.com/open?id='+template.driveId:'';return output;});
}

function buildAgentFlowContextForProject_(project, selectedFlowIds) {
  var requested=(selectedFlowIds||[]).map(String); if(!requested.length)return{text:'',flowsUsed:[]};
  var flows=listAgentFlowsForProject_(project).filter(function(flow){return requested.indexOf(flow.flowId)!==-1;});
  var sections=[];var used=[];var total=0;
  flows.forEach(function(flow,index){if(total>=APP.MAX_FLOW_CONTEXT_CHARS)return;var text=readAgentTextFile_(DriveApp.getFileById(flow.driveId));var section='[AF'+(index+1)+'] '+flow.name+'\n'+text;section=truncate_(section,APP.MAX_FLOW_CONTEXT_CHARS-total);total+=section.length;sections.push(section);used.push({flowId:flow.flowId,label:'AF'+(index+1),name:flow.name,origin:'agent'});});
  return{text:sections.join('\n\n---\n\n'),flowsUsed:used};
}

function findAgentTemplateForProject_(project, templateId) {
  return listAgentTemplatesForProject_(project).filter(function(template){return template.templateId===templateId;})[0]||null;
}
