var APP = Object.freeze({
  NAME: 'Gemini Project Agent',
  VERSION: '1.3.0',
  ROOT_NAME: 'Agent Projects',
  SYSTEM_FOLDER: '_System',
  REGISTRY_PREFIX: 'PROJECT_',
  PROP_ROOT_ID: 'ROOT_FOLDER_ID',
  PROP_DOMAIN: 'ORGANIZATION_DOMAIN',
  PROP_ADMIN: 'ADMIN_EMAIL',
  USER_API_KEY: 'GEMINI_API_KEY',
  USER_MODEL: 'GEMINI_MODEL',
  USER_FAVORITES: 'FAVORITE_PROJECTS',
  DEFAULT_MODEL: 'gemini-3.6-flash',
  MAX_UPLOAD_BYTES: 6 * 1024 * 1024,
  MAX_SOURCE_FILES: 50,
  MAX_TEXT_CONTEXT_CHARS: 90000,
  MAX_INLINE_BYTES: 12 * 1024 * 1024,
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

  var root;
  if (settings.rootFolderId) {
    root = DriveApp.getFolderById(extractDriveId_(settings.rootFolderId));
  } else {
    root = DriveApp.createFolder(settings.rootFolderName || APP.ROOT_NAME);
  }
  ensureFolder_(root, APP.SYSTEM_FOLDER);

  scriptProps.setProperties({
    ROOT_FOLDER_ID: root.getId(),
    ORGANIZATION_DOMAIN: domain,
    ADMIN_EMAIL: identity.email
  }, false);

  return getBootstrap();
}

function getPublicConfig_() {
  var props = PropertiesService.getScriptProperties();
  var rootId = props.getProperty(APP.PROP_ROOT_ID) || '';
  var adminEmail = props.getProperty(APP.PROP_ADMIN) || '';
  var currentEmail = getCurrentIdentity_().email;
  return {
    appName: APP.NAME,
    version: APP.VERSION,
    rootFolderId: rootId,
    rootFolderUrl: rootId ? 'https://drive.google.com/drive/folders/' + rootId : '',
    organizationDomain: props.getProperty(APP.PROP_DOMAIN) || '',
    adminEmail: adminEmail,
    isAdmin: Boolean(currentEmail && currentEmail === adminEmail)
  };
}

function saveUserGeminiSettings(settings) {
  assertOrganizationMember_();
  settings = settings || {};
  var apiKey = String(settings.apiKey || '').trim();
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
