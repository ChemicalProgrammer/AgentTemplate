function listProjectMembers(projectId) {
  var access = assertProjectAccess_(projectId);
  if (access.member.role !== 'owner') return [];
  return (access.project.members || []).map(function(member) {
    return {
      email: member.email,
      role: member.role,
      scope: member.scope,
      permissions: member.permissions || null,
      addedAt: member.addedAt,
      addedBy: member.addedBy || ''
    };
  });
}

function shareProject(input) {
  input = input || {};
  var projectId = String(input.projectId || '');
  var access = assertProjectAccess_(projectId, 'share');
  var email = String(input.email || '').trim().toLowerCase();
  var domain = getPublicConfig_().organizationDomain;
  if (!email || email.split('@')[1] !== domain) throw new Error('You can only share with @' + domain + ' users.');
  if (email === access.project.owner) throw new Error('The owner already has full access.');

  var role = ['editor', 'collaborator', 'viewer'].indexOf(input.role) !== -1 ? input.role : 'viewer';
  var scope = ['full', 'sources_documents', 'history', 'custom'].indexOf(input.scope) !== -1 ? input.scope : 'full';
  var permissions = scope === 'custom' ? {
    sources: Boolean(input.permissions && input.permissions.sources),
    documents: Boolean(input.permissions && input.permissions.documents),
    history: Boolean(input.permissions && input.permissions.history)
  } : null;
  if (scope === 'custom' && !permissions.sources && !permissions.documents && !permissions.history) {
    throw new Error('Select at least one item for custom access.');
  }

  applyProjectDriveSharing_(access.project, email, role, scope, permissions);
  var now = nowIso_();
  var members = access.project.members || [];
  var member = members.filter(function(item) { return String(item.email).toLowerCase() === email; })[0];
  var record = {email: email, role: role, scope: scope, permissions: permissions, addedAt: member ? member.addedAt : now, addedBy: access.email, updatedAt: now};
  if (member) Object.keys(record).forEach(function(key) { member[key] = record[key]; }); else members.push(record);
  access.project.members = members;
  access.project.updatedAt = now;
  persistProjectManifest_(access.project);
  writeProjectManifest_(DriveApp.getFolderById(access.project.folderId), access.project);
  appendControlRow_(access.project, 'Members', [email, role, scope, record.addedAt, access.email]);
  appendControlRow_(access.project, 'Share Policies', [email, scope === 'full' || scope === 'sources_documents' || permissions && permissions.sources, scope === 'full' || scope === 'sources_documents' || permissions && permissions.documents, scope === 'full' || scope === 'history' || permissions && permissions.history, now]);
  return listProjectMembers(projectId);
}

function removeProjectMember(projectId, email) {
  var access = assertProjectAccess_(projectId, 'share');
  email = String(email || '').trim().toLowerCase();
  if (!email || email === access.project.owner) throw new Error('The project owner cannot be removed.');
  removeAllProjectDriveAccess_(access.project, email);
  access.project.members = (access.project.members || []).filter(function(member) { return String(member.email).toLowerCase() !== email; });
  access.project.updatedAt = nowIso_();
  persistProjectManifest_(access.project);
  writeProjectManifest_(DriveApp.getFolderById(access.project.folderId), access.project);
  appendControlRow_(access.project, 'Change Log', [nowIso_(), access.email, 'REMOVE_MEMBER', 'Member', email, 'Acceso retirado']);
  return listProjectMembers(projectId);
}

function applyProjectDriveSharing_(project, email, role, scope, permissions) {
  removeAllProjectDriveAccess_(project, email);
  var driveRole = role === 'viewer' ? 'viewer' : 'editor';
  if (scope === 'full') {
    driveRoleMethod_(DriveApp.getFolderById(project.folderId), email, driveRole);
    return;
  }
  var shareSources = scope === 'sources_documents' || scope === 'custom' && permissions.sources;
  var shareDocuments = scope === 'sources_documents' || scope === 'custom' && permissions.documents;
  var shareHistory = scope === 'history' || scope === 'custom' && permissions.history;
  if (shareSources) driveRoleMethod_(DriveApp.getFolderById(project.folders.sources), email, driveRole);
  if (shareDocuments) driveRoleMethod_(DriveApp.getFolderById(project.folders.documents), email, driveRole);
  if (shareHistory) {
    driveRoleMethod_(DriveApp.getFolderById(project.folders.conversations), email, driveRole);
    driveRoleMethod_(DriveApp.getFolderById(project.folders.pdfs), email, driveRole);
  }
}

function removeAllProjectDriveAccess_(project, email) {
  [project.folderId, project.folders.sources, project.folders.documents, project.folders.conversations, project.folders.pdfs]
    .filter(Boolean)
    .forEach(function(id) {
      try { removeDriveAccess_(DriveApp.getFolderById(id), email); } catch (error) { console.warn(error.message); }
    });
}
