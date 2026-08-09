function assertOrganizationMember_() {
  var config = getPublicConfig_();
  if (!config.organizationDomain) throw new Error('La aplicación aún no está configurada.');
  var email = getCurrentIdentity_().email;
  if (!email || email.split('@')[1] !== config.organizationDomain) {
    throw new Error('Acceso restringido a usuarios de @' + config.organizationDomain + '.');
  }
  return email;
}

function assertAdmin_() {
  var email = assertOrganizationMember_();
  if (email !== getPublicConfig_().adminEmail) throw new Error('Esta acción requiere permisos de administrador.');
  return email;
}

function assertProjectAccess_(projectId, capability) {
  var email = assertOrganizationMember_();
  var project = getRegistryProject_(projectId);
  if (!project) throw new Error('No se encontró el proyecto.');

  var member = (project.members || []).filter(function(item) {
    return String(item.email).toLowerCase() === email;
  })[0];
  if (!member) throw new Error('No tienes acceso a este proyecto.');

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
  if (capability && !allowed[capability]) throw new Error('Tu modalidad de acceso no incluye ' + capability + '.');
  return {email: email, member: member, project: project, allowed: allowed};
}

function assertProjectEdit_(projectId, capability) {
  var access = assertProjectAccess_(projectId, capability);
  if (access.member.role === 'viewer') throw new Error('Tu rol es de solo lectura.');
  return access;
}

function sanitizeText_(value, maxLength) {
  var text = String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return typeof maxLength === 'number' ? text.slice(0, maxLength) : text;
}
