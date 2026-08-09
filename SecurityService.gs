function assertOrganizationMember_() {
  var config = getPublicConfig_();
  if (!config.organizationDomain) throw new Error('The application has not been configured yet.');
  var email = getCurrentIdentity_().email;
  if (!email || email.split('@')[1] !== config.organizationDomain) {
    throw new Error('Access is restricted to @' + config.organizationDomain + ' users.');
  }
  return email;
}

function assertAdmin_() {
  var email = assertOrganizationMember_();
  if (email !== getPublicConfig_().adminEmail) throw new Error('This action requires administrator access.');
  return email;
}

function assertProjectAccess_(projectId, capability) {
  var email = assertOrganizationMember_();
  var project = getRegistryProject_(projectId);
  if (!project) throw new Error('Project not found.');

  var member = (project.members || []).filter(function(item) {
    return String(item.email).toLowerCase() === email;
  })[0];
  if (!member) throw new Error('You do not have access to this project.');

  var scope = member.scope || 'full';
  var role = member.role || 'viewer';
  var readOnly = role === 'viewer';
  var allowed = {
    project: scope === 'full',
    sources: scope === 'full' || scope === 'sources_documents' || scope === 'custom' && member.permissions && member.permissions.sources,
    documents: scope === 'full' || scope === 'sources_documents' || scope === 'custom' && member.permissions && member.permissions.documents,
    history: scope === 'full' || scope === 'history' || scope === 'custom' && member.permissions && member.permissions.history,
    share: member.role === 'owner',
    edit: !readOnly
  };
  if (capability && !allowed[capability]) throw new Error('Your access scope does not include ' + capability + '.');
  return {email: email, member: member, project: project, allowed: allowed};
}

function assertProjectEdit_(projectId, capability) {
  var access = assertProjectAccess_(projectId, capability);
  if (access.member.role === 'viewer') throw new Error('Your role is read-only.');
  return access;
}

function sanitizeText_(value, maxLength) {
  var text = String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return typeof maxLength === 'number' ? text.slice(0, maxLength) : text;
}
