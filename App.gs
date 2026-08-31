/** Entry point and browser-facing façade for the Agent Console web app. */

function doGet() {
  var template = HtmlService.createTemplateFromFile('Index');
  template.localFontCss = getLocalFontCss_();
  return template.evaluate()
    .setTitle('Agent Console')
    .setFaviconUrl('https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getBootstrap() {
  if (typeof renderJsonTemplateDocument_ !== 'function' || typeof beginWorkspaceRemoval_ !== 'function' || typeof resolveRuntimeResources_ !== 'function') throw new Error('Incomplete Hotfix 10.5 installation: add JsonTemplateRenderer.gs, WorkspaceService.gs, OperationService.gs and ResourceService.gs.');
  var identity = getCurrentIdentity_();
  var config = getPublicConfig_();
  var initialized = Boolean(config.rootFolderId && config.organizationDomain);
  if (initialized) {
    assertOrganizationMember_();
    ensureConsoleStructure_(getRootFolder_(), false);
  }

  return {
    initialized: initialized,
    identity: identity,
    config: config,
    projects: initialized ? listProjects() : [],
    agents: initialized ? listAgents() : [],
    userSettings: getPublicUserGeminiSettings_()
  };
}

function getCurrentIdentity_() {
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (typeof WORKSPACE_WORKER_EMAIL_ !== 'undefined' && WORKSPACE_WORKER_EMAIL_ && WORKSPACE_WORKER_EMAIL_ === String(Session.getEffectiveUser().getEmail() || '').toLowerCase()) email = WORKSPACE_WORKER_EMAIL_;
  return {
    email: email,
    name: email ? email.split('@')[0].replace(/[._-]+/g, ' ') : 'User'
  };
}

function apiError_(error) {
  var message = error && error.message ? error.message : String(error || 'Unknown error');
  throw new Error(message);
}
