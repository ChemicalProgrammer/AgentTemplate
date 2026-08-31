/** Hotfix 10.5: bounded caches, direct downloads and a Drive folder browser. */
var WORKSPACE_REQUEST_CACHE_ = {};
var WORKSPACE_LOCK_DEPTH_ = 0;
function withWorkspaceLock_(work) {
  if (WORKSPACE_LOCK_DEPTH_) return work();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000); WORKSPACE_LOCK_DEPTH_++;
  try { return work(); } finally { WORKSPACE_LOCK_DEPTH_--; lock.releaseLock(); }
}
function workspaceCached_(key, seconds, loader, refresh) {
  var cache = CacheService.getUserCache();
  if (!refresh) {
    var saved = cache.get(key);
    if (saved) try { return JSON.parse(saved); } catch (_) {}
  }
  var result = loader(); var json = JSON.stringify(result);
  // Cache limits are bytes, not JS string length. Cache is never authoritative.
  if (Utilities.newBlob(json).getBytes().length < 90000) try { cache.put(key, json, seconds); } catch (_) {}
  return result;
}
function loadConversationIfChanged(projectId, conversationId, knownVersion) {
  var access = assertProjectAccess_(projectId, 'history');
  var record = readConversationIndex_(access.project).conversations.filter(function(item) { return item.conversationId === conversationId && item.status !== 'archived'; })[0];
  if (!record) throw new Error('Chat not found.');
  var file = record.fileId ? DriveApp.getFileById(record.fileId) : getFirstFileByName_(DriveApp.getFolderById(access.project.folders.conversations), 'Conversation - ' + conversationId + '.json');
  if (!file || file.isTrashed()) throw new Error('Chat not found.');
  var version = file.getLastUpdated().toISOString();
  if (knownVersion && knownVersion === version) return {unchanged:true, version:version};
  var conversation = readJsonFile_(file, null);
  if (!conversation || conversation.projectId !== projectId) throw new Error('The chat file is damaged.');
  return {conversation:conversation, version:version};
}
function listExportFolders(projectId, folderId, cursor) {
  assertProjectAccess_(projectId);
  var folder = folderId ? DriveApp.getFolderById(extractDriveId_(folderId)) : DriveApp.getRootFolder();
  if (folder.isTrashed()) throw new Error('This folder is in the trash.');
  var iterator = cursor ? DriveApp.continueFolderIterator(String(cursor)) : folder.getFolders();
  var folders = []; var examined = 0;
  while (iterator.hasNext() && examined++ < 60) {
    var child = iterator.next();
    if (child.isTrashed()) continue;
    // Continuation tokens must not silently navigate outside the requested parent.
    var parents = child.getParents(); var matches = false;
    while (parents.hasNext()) if (parents.next().getId() === folder.getId()) matches = true;
    if (matches) folders.push({id:child.getId(),name:child.getName()});
  }
  folders.sort(function(a,b){ return a.name.localeCompare(b.name); });
  return {id:folder.getId(),name:folder.getName(),folders:folders,cursor:iterator.hasNext()?iterator.getContinuationToken():''};
}
function downloadWorkspaceBlob_(blob) {
  var bytes = blob.getBytes();
  if (bytes.length > 12 * 1024 * 1024) throw new Error('This download exceeds 12 MB. Save it in Drive instead.');
  return {download:true,name:blob.getName(),mimeType:blob.getContentType(),base64:Utilities.base64Encode(bytes),savedInProject:false};
}
function downloadProjectDocument(projectId, nodeId) {
  var resolved = resolveProjectDocumentFile_(projectId,nodeId);
  var mime = resolved.file.getMimeType();
  if (/^application\/vnd\.google-apps\./.test(mime)) throw new Error('Use Export PDF for Google documents.');
  if (resolved.file.getSize() > 12*1024*1024) throw new Error('This file exceeds 12 MB. Download it from Drive.');
  return downloadWorkspaceBlob_(resolved.file.getBlob().setName(resolved.file.getName()));
}
function syncProjectDocumentCatalog(projectId) {
  var access = assertProjectAccess_(projectId);
  var beforeScan={};
  if(access.allowed.documents)readDocumentIndex_(access.project).documents.forEach(function(d){beforeScan[d.driveId]=String(d.updatedAt||'');});
  // Read-only users may refresh their view, but must never repair shared indexes.
  var docs = access.allowed.documents ? scanGeneratedDocumentCatalog_(access.project, Boolean(access.allowed.history), Boolean(access.allowed.edit)) : [];
  if (access.allowed.edit && access.allowed.documents) {
    withWorkspaceLock_(function(){
      var index = readDocumentIndex_(access.project); var present = {};
      docs.forEach(function(d){present[d.id]=true;});
      index.documents.forEach(function(d){
        if (d.status !== 'removed' && Object.prototype.hasOwnProperty.call(beforeScan,d.driveId) && beforeScan[d.driveId]===String(d.updatedAt||'') && (access.allowed.history || d.storageArea !== 'pdfs')) d.missing = !present[d.driveId];
      });
      index.catalogReady = true; if(access.allowed.history)index.catalogPdfsReady=true; index.catalogSyncedAt = nowIso_(); writeDocumentIndex_(access.project,index);
    });
  }
  if (access.allowed.documents && !access.allowed.edit) {
    var graph = (access.allowed.sources ? listAgentKnowledgeNodesForProject_(access.project) : []).concat(listProjectDocumentNodes_(projectId, docs));
    return {documentGraph:applyProjectDocumentOrder_(projectId, graph)};
  }
  return getProjectDocumentsPanel(projectId);
}

function activeWorkspaceFile_(id) {var file=DriveApp.getFileById(id);if(file.isTrashed())throw new Error('This file is in Drive trash. Reload the page to refresh Documents.');return file;}
