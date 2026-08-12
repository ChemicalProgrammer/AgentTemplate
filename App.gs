/** Entry point and browser-facing façade for the Agent Console web app. */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Agent Console')
    .setFaviconUrl('https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getBootstrap() {
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
  return {
    email: email,
    name: email ? email.split('@')[0].replace(/[._-]+/g, ' ') : 'User'
  };
}

function apiError_(error) {
  var message = error && error.message ? error.message : String(error || 'Unknown error');
  throw new Error(message);
}
