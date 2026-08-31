var FLOW_INDEX_FILE = 'Flows Index.json';

function listFlows(projectId) {
  var access = assertProjectAccess_(projectId, 'sources');
  return readFlowIndex_(access.project).flows.filter(function(flow) {
    return flow.status !== 'removed';
  }).map(function(flow) {
    var output = JSON.parse(JSON.stringify(flow));
    output.url = output.driveId ? 'https://drive.google.com/open?id=' + output.driveId : '';
    return output;
  });
}

function addFlowFromDrive(projectId, driveUrlOrId) {
  var access = assertProjectEdit_(projectId, 'sources');
  var driveId = extractDriveId_(driveUrlOrId);
  var original;
  try {
    original = DriveApp.getFileById(driveId);
  } catch (error) {
    throw new Error('The flow file could not be opened. Check the Drive link and your access.');
  }
  if (original.isTrashed()) throw new Error('The selected flow is in Drive trash.');
  assertMarkdownFlow_(original.getName(), original.getMimeType());
  var copy;
  try {
    copy = original.makeCopy(original.getName(), DriveApp.getFolderById(access.project.folders.flows));
  } catch (error) {
    throw new Error('The Markdown flow could not be copied: ' + readableErrorMessage_(error));
  }
  return recordFlow_(access, copy, 'drive-copy');
}

function uploadFlow(projectId, upload) {
  var access = assertProjectEdit_(projectId, 'sources');
  upload = upload || {};
  var name = normalizeName_(upload.name, 'Flow.md');
  var mimeType = String(upload.mimeType || 'text/markdown');
  assertMarkdownFlow_(name, mimeType);
  var bytes = Utilities.base64Decode(String(upload.base64 || '').replace(/^data:[^;]+;base64,/, ''));
  if (bytes.length > APP.MAX_FLOW_UPLOAD_BYTES) throw new Error('The flow exceeds the 6 MB upload limit. Import it from Drive instead.');
  var file = DriveApp.getFolderById(access.project.folders.flows).createFile(Utilities.newBlob(bytes, 'text/markdown', name));
  return recordFlow_(access, file, 'upload');
}

function recordFlow_(access, file, origin) {
  var now = nowIso_();
  var record = {
    flowId: uuid_(),
    name: file.getName(),
    driveId: file.getId(),
    mimeType: 'text/markdown',
    size: Number(file.getSize() || 0),
    status: 'active',
    addedAt: now,
    updatedAt: file.getLastUpdated().toISOString(),
    addedBy: access.email,
    origin: origin,
    note: ''
  };
  var index = readFlowIndex_(access.project);
  index.flows.push(record);
  writeFlowIndex_(access.project, index);
  appendControlRow_(access.project, 'Flows', [record.flowId, record.name, record.driveId, record.status, record.addedAt, record.addedBy, record.note]);
  record.url = file.getUrl();
  return record;
}

function removeFlow(projectId, flowId) {
  var access = assertProjectEdit_(projectId, 'sources');
  var index = readFlowIndex_(access.project);
  var flow = index.flows.filter(function(item) { return item.flowId === flowId && item.status !== 'removed'; })[0];
  if (!flow) throw new Error('Flow not found.');
  flow.status = 'removed';
  flow.updatedAt = nowIso_();
  try { DriveApp.getFileById(flow.driveId).setTrashed(true); } catch (error) { console.warn(error.message); }
  writeFlowIndex_(access.project, index);
  appendControlRow_(access.project, 'Change Log', [nowIso_(), access.email, 'DELETE_FLOW', 'Flow', flowId, flow.name]);
  return {removed: true, flowId: flowId};
}

function buildFlowContext_(project,selectedFlowIds) { return buildSelectedWorkflowContext_(project,selectedFlowIds||[]); }

function readFlowIndex_(project) {
  var folder = DriveApp.getFolderById(project.folders.flows);
  var data = readJsonFile_(getFirstFileByName_(folder, FLOW_INDEX_FILE), {schemaVersion: 1, flows: []});
  data.flows = data.flows || [];
  return data;
}

function writeFlowIndex_(project, index) {
  writeJsonFile_(DriveApp.getFolderById(project.folders.flows), FLOW_INDEX_FILE, index);
}

function assertMarkdownFlow_(name, mimeType) {
  if (!/\.md$/i.test(String(name || '')) || !/^(text\/(markdown|plain)|application\/octet-stream)$/i.test(String(mimeType || 'application/octet-stream'))) {
    throw new Error('Flows must be Markdown files with the .md extension.');
  }
}
