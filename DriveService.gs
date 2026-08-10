function copyDriveItemToSources_(project, driveId) {
  var destination = DriveApp.getFolderById(project.folders.sources);
  var sourceFile = null;
  try {
    sourceFile = DriveApp.getFileById(driveId);
  } catch (notAFileError) {}
  if (sourceFile) {
    if (sourceFile.isTrashed()) throw new Error('The selected Drive file is in trash.');
    try {
      var copiedFile = sourceFile.makeCopy(sourceFile.getName(), destination);
      return {type: 'file', files: [copiedFile]};
    } catch (copyError) {
      throw new Error('The Drive file could not be copied into Sources: ' + readableErrorMessage_(copyError));
    }
  }
  try {
    var sourceFolder = DriveApp.getFolderById(driveId);
    if (sourceFolder.isTrashed()) throw new Error('The selected Drive folder is in trash.');
    var importedFolder = destination.createFolder(sourceFolder.getName());
    var copied = [];
    copyFolderFiles_(sourceFolder, importedFolder, copied, APP.MAX_SOURCE_FILES);
    return {type: 'folder', files: copied, folder: importedFolder};
  } catch (folderError) {
    throw new Error('The Drive ID is not an accessible file or folder: ' + readableErrorMessage_(folderError));
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

function copyProjectFolderTree_(sourceFolder, destinationFolder, idMap) {
  idMap = idMap || {};
  idMap[sourceFolder.getId()] = destinationFolder.getId();
  var files = sourceFolder.getFiles();
  while (files.hasNext()) {
    var sourceFile = files.next();
    var copiedFile = sourceFile.makeCopy(sourceFile.getName(), destinationFolder);
    idMap[sourceFile.getId()] = copiedFile.getId();
  }
  var folders = sourceFolder.getFolders();
  while (folders.hasNext()) {
    var sourceChild = folders.next();
    var destinationChild = destinationFolder.createFolder(sourceChild.getName());
    copyProjectFolderTree_(sourceChild, destinationChild, idMap);
  }
  return idMap;
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
      createdAt: file.getDateCreated().toISOString(),
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
