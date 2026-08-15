var APP = Object.freeze({
  NAME: 'Agent Console',
  VERSION: '2.0.0-review.4-hotfix.2',
  ROOT_NAME: 'Agent Console',
  AGENTS_FOLDER: 'Agents',
  PROJECTS_FOLDER: 'Projects',
  SYSTEM_FOLDER: '_System',
  PROP_CONSOLE_MIGRATION: 'CONSOLE_STRUCTURE_V170',
  PROP_ROOT_ID: 'ROOT_FOLDER_ID',
  PROP_ROOT_NAME: 'ROOT_FOLDER_NAME',
  PROP_DOMAIN: 'ORGANIZATION_DOMAIN',
  PROP_ADMIN: 'ADMIN_EMAIL',
  USER_API_KEY: 'GEMINI_API_KEY',
  USER_MODEL: 'GEMINI_MODEL',
  USER_FAVORITES: 'FAVORITE_PROJECTS',
  USER_TEMPLATE_PREFIX: 'REPORT_TEMPLATE_',
  USER_FILE_SEARCH_STORE_PREFIX: 'FILE_SEARCH_STORE_',
  USER_FILE_SEARCH_SOURCE_PREFIX: 'FILE_SEARCH_SOURCE_',
  USER_SOURCE_UPLOAD_PREFIX: 'SOURCE_UPLOAD_SESSION_',
  PROJECT_CATALOG_CACHE_KEY: 'GPA_PROJECT_CATALOG_V180',
  PROJECT_LOCATOR_CACHE_PREFIX: 'GPA_PROJECT_LOCATOR_V180_',
  AGENT_CATALOG_CACHE_KEY: 'GPA_AGENT_CATALOG_V180',
  AGENT_LOCATOR_CACHE_PREFIX: 'GPA_AGENT_LOCATOR_V180_',
  PROJECT_CACHE_SECONDS: 180,
  DEFAULT_MODEL: 'gemini-3.6-flash',
  MAX_FLOW_UPLOAD_BYTES: 6 * 1024 * 1024,
  LOCAL_SOURCE_UPLOAD_CHUNK_BYTES: 8 * 1024 * 1024,
  SOURCE_UPLOAD_SESSION_TTL_MS: 6 * 60 * 60 * 1000,
  MAX_SOURCE_FILES: 50,
  MAX_TEXT_CONTEXT_CHARS: 90000,
  MAX_INLINE_BYTES: 12 * 1024 * 1024,
  MAX_FILE_SEARCH_BYTES: 100 * 1024 * 1024,
  FILE_SEARCH_CHUNK_BYTES: 8 * 1024 * 1024,
  FILE_SEARCH_CHUNKS_PER_CALL: 3,
  FILE_SEARCH_CALL_BUDGET_MS: 24000,
  FILE_SEARCH_EMBEDDING_MODEL: 'models/gemini-embedding-001',
  FILE_SEARCH_MAX_TOKENS_PER_CHUNK: 200,
  FILE_SEARCH_OVERLAP_TOKENS: 20,
  FILE_SEARCH_BATCH_SIZE: 2,
  FILE_SEARCH_STORE_RECHECK_MS: 10 * 60 * 1000,
  FILE_SEARCH_STALE_OPERATION_MS: 10 * 60 * 1000,
  MAX_FLOW_CONTEXT_CHARS: 120000,
  RECENT_MESSAGE_LIMIT: 24
});

function setupApplication(settings) {
  settings = settings || {};
  var identity = getCurrentIdentity_();
  if (!identity.email) {
    throw new Error('Your account could not be identified. Deploy the app for users in your organization.');
  }

  var scriptProps = PropertiesService.getScriptProperties();
  var existingAdmin = scriptProps.getProperty(APP.PROP_ADMIN);
  if (existingAdmin && existingAdmin !== identity.email) {
    throw new Error('Only the administrator can change the main configuration.');
  }

  var domain = normalizeDomain_(settings.organizationDomain || identity.email.split('@')[1]);
  if (!domain || identity.email.split('@')[1] !== domain) {
    throw new Error('The domain must match the account configuring the application.');
  }

  var root = resolveConfiguredRootFolder_(settings.rootFolderId, settings.rootFolderName);
  ensureConsoleStructure_(root, true);

  scriptProps.setProperties({
    ROOT_FOLDER_ID: root.getId(),
    ROOT_FOLDER_NAME: root.getName(),
    ORGANIZATION_DOMAIN: domain,
    ADMIN_EMAIL: identity.email
  }, false);
  invalidateProjectCaches_('');
  invalidateAgentCaches_('');

  return getBootstrap();
}

function getPublicConfig_() {
  var props = PropertiesService.getScriptProperties();
  var rootId = props.getProperty(APP.PROP_ROOT_ID) || '';
  var rootName = props.getProperty(APP.PROP_ROOT_NAME) || APP.ROOT_NAME;
  if (rootId) {
    var root = getRootFolder_();
    rootId = root.getId();
    rootName = root.getName();
  }
  var adminEmail = props.getProperty(APP.PROP_ADMIN) || '';
  var currentEmail = getCurrentIdentity_().email;
  return {
    appName: APP.NAME,
    version: APP.VERSION,
    rootFolderId: rootId,
    rootFolderName: rootName,
    rootFolderUrl: rootId ? 'https://drive.google.com/drive/folders/' + rootId : '',
    organizationDomain: props.getProperty(APP.PROP_DOMAIN) || '',
    adminEmail: adminEmail,
    isAdmin: Boolean(currentEmail && currentEmail === adminEmail)
  };
}

function updateRootFolderSettings(settings) {
  assertAdmin_();
  settings = settings || {};
  var root = resolveConfiguredRootFolder_(settings.rootFolderId, settings.rootFolderName);
  ensureConsoleStructure_(root, true);
  PropertiesService.getScriptProperties().setProperties({
    ROOT_FOLDER_ID: root.getId(),
    ROOT_FOLDER_NAME: root.getName()
  }, false);
  clearLegacyProjectRegistry_();
  invalidateProjectCaches_('');
  invalidateAgentCaches_('');
  return getBootstrap();
}

function resolveConfiguredRootFolder_(rootFolderId, rootFolderName) {
  var root;
  if (String(rootFolderId || '').trim()) {
    root = DriveApp.getFolderById(extractDriveId_(rootFolderId));
    if (root.isTrashed()) root.setTrashed(false);
  } else {
    root = DriveApp.createFolder(normalizeName_(rootFolderName, APP.ROOT_NAME));
  }
  return root;
}

function saveUserGeminiSettings(settings) {
  assertOrganizationMember_();
  settings = settings || {};
  var userProps = PropertiesService.getUserProperties();
  var apiKey = String(settings.apiKey || userProps.getProperty(APP.USER_API_KEY) || '').trim();
  var model = normalizeModel_(settings.model || APP.DEFAULT_MODEL);
  if (!apiKey) throw new Error('Enter a Gemini API key.');

  var validation = testGeminiKey_(apiKey, model);
  PropertiesService.getUserProperties().setProperties({
    GEMINI_API_KEY: apiKey,
    GEMINI_MODEL: validation.model || model
  }, false);
  return getPublicUserGeminiSettings_();
}

function clearUserGeminiKey() {
  PropertiesService.getUserProperties().deleteProperty(APP.USER_API_KEY);
  return getPublicUserGeminiSettings_();
}

function getPublicUserGeminiSettings_() {
  var props = PropertiesService.getUserProperties();
  var key = props.getProperty(APP.USER_API_KEY) || '';
  return {
    configured: Boolean(key),
    apiKey: key,
    keySuffix: key ? key.slice(-4) : '',
    model: props.getProperty(APP.USER_MODEL) || APP.DEFAULT_MODEL
  };
}

function getUserGeminiConfig_() {
  var props = PropertiesService.getUserProperties();
  var key = props.getProperty(APP.USER_API_KEY);
  if (!key) throw new Error('Add your personal Gemini API key before using chat.');
  return {
    apiKey: key,
    model: normalizeModel_(props.getProperty(APP.USER_MODEL) || APP.DEFAULT_MODEL)
  };
}

function getAvailableGeminiModels() {
  assertOrganizationMember_();
  var key = PropertiesService.getUserProperties().getProperty(APP.USER_API_KEY);
  if (!key) throw new Error('Save your Gemini API key first.');
  return listGeminiModels_(key);
}

function normalizeDomain_(value) {
  return String(value || '').trim().toLowerCase().replace(/^@/, '');
}

function normalizeModel_(value) {
  return String(value || APP.DEFAULT_MODEL).trim().replace(/^models\//, '');
}
