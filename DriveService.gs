function copyDriveItemToSources_(project, driveId) {
  var destination = DriveApp.getFolderById(project.folders.sources);
  try {
    var sourceFile = DriveApp.getFileById(driveId);
    return {type: 'file', files: [sourceFile.makeCopy(sourceFile.getName(), destination)]};
  } catch (fileError) {
    var sourceFolder = DriveApp.getFolderById(driveId);
    var importedFolder = destination.createFolder(sourceFolder.getName());
    var copied = [];
    copyFolderFiles_(sourceFolder, importedFolder, copied, APP.MAX_SOURCE_FILES);
    return {type: 'folder', files: copied, folder: importedFolder};
  }
}

function copyFolderFiles_(sourceFolder, destinationFolder, copied, limit) {
  var files = sourceFolder.getFiles();
  while (files.hasNext() && copied.length < limit) {
    var file = files.next();
    copied.push(file.makeCopy(file.getName(), destinationFolder));
  }
  var folders = sourceFolder.getFolders();
  while (folders.hasNext() && copied.length < limit) {
    var child = folders.next();
    var newChild = destinationFolder.createFolder(child.getName());
    copyFolderFiles_(child, newChild, copied, limit);
  }
}

function listFilesRecursive_(folder, output, limit) {
  output = output || [];
  limit = limit || 200;
  var files = folder.getFiles();
  while (files.hasNext() && output.length < limit) {
    var file = files.next();
    output.push({
      id: file.getId(),
      name: file.getName(),
      mimeType: file.getMimeType(),
      url: file.getUrl(),
      size: Number(file.getSize() || 0),
      updatedAt: file.getLastUpdated().toISOString()
    });
  }
  var folders = folder.getFolders();
  while (folders.hasNext() && output.length < limit) {
    listFilesRecursive_(folders.next(), output, limit);
  }
  return output;
}

function appendControlRow_(project, sheetName, row) {
  if (!project.controlFileId) return;
  try {
    var sheet = SpreadsheetApp.openById(project.controlFileId).getSheetByName(sheetName);
    if (sheet) sheet.appendRow(row);
  } catch (error) {
    console.warn('Could not write to ' + sheetName + ': ' + error.message);
  }
}

function driveRoleMethod_(item, email, role) {
  if (role === 'viewer') item.addViewer(email); else item.addEditor(email);
}

function removeDriveAccess_(item, email) {
  try { item.removeEditor(email); } catch (ignoreEditor) {}
  try { item.removeViewer(email); } catch (ignoreViewer) {}
}
