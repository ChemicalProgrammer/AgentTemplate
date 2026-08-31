/** Durable per-user deletion jobs; no credentials are stored in jobs. */
var WORKSPACE_JOB_PREFIX_='WS105_JOB_';
var WORKSPACE_WORKER_EMAIL_='';
function workspaceJobKey_(projectId,nodeId) { return WORKSPACE_JOB_PREFIX_+projectId+'_'+nodeId.replace(':','_'); }
function beginWorkspaceRemoval_(projectId,nodeId) {
  var capability=nodeId.indexOf('source:')===0?'sources':'documents';
  var access=assertProjectEdit_(projectId,capability);
  return withWorkspaceLock_(function(){
    var props=PropertiesService.getUserProperties();var key=workspaceJobKey_(projectId,nodeId);
    var previous=safeJsonParse_(props.getProperty(key),null);
    var source=capability==='sources'; var index=source?readSourceIndex_(access.project):readDocumentIndex_(access.project);
    var id=nodeId.slice(nodeId.indexOf(':')+1);
    var record=(source?index.sources:index.documents).filter(function(r){return (source?r.sourceId:r.driveId)===id;})[0];
    if(!record)throw new Error('This document does not belong to the project.');
    if(record.status==='removed')return {removed:true,nodeId:nodeId,pending:!!previous && previous.status!=='done',operationId:previous?previous.operationId:''};
    var keys=Object.keys(props.getProperties()).filter(function(k){return k.indexOf(WORKSPACE_JOB_PREFIX_)===0;});
    if(keys.length>=100 && !previous)throw new Error('There are too many pending operations. Open Resources and retry cleanup first.');
    var job={operationId:uuid_(),projectId:projectId,nodeId:nodeId,owner:access.email,capability:capability,driveId:record.driveId,name:record.name,source:source?{sourceId:record.sourceId,driveId:record.driveId,name:record.name}:null,status:'prepared',createdAt:nowIso_(),attempts:0,nextAttempt:0,driveDone:false,remoteDone:!source};
    // Persist intent first: a worker can safely complete an interrupted commit.
    props.setProperty(key,JSON.stringify(job));
    record.status='removed';record.removedAt=nowIso_();record.updatedAt=record.removedAt;record.removedBy=access.email;record.removalOperationId=job.operationId;
    if(source)writeSourceIndex_(access.project,index);else writeDocumentIndex_(access.project,index);
    job.status='pending';props.setProperty(key,JSON.stringify(job));
    var background=ensureWorkspaceWorker_();
    return {removed:true,nodeId:nodeId,sourceId:source?id:'',pending:true,operationId:job.operationId,background:background};
  });
}
function ensureWorkspaceWorker_() {
  var props=PropertiesService.getUserProperties();
  try {
    var found=ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='runWorkspaceMaintenance';});
    if(!found)ScriptApp.newTrigger('runWorkspaceMaintenance').timeBased().everyMinutes(5).create();
    props.setProperty('WS105_WORKER','1');return true;
  } catch(error){return false;} // Client/next visit still resumes durable jobs.
}
function listWorkspaceOperations(projectId) {
  var access=assertProjectAccess_(projectId);var props=PropertiesService.getUserProperties().getProperties();
  return Object.keys(props).filter(function(k){return k.indexOf(WORKSPACE_JOB_PREFIX_)===0;}).map(function(k){return safeJsonParse_(props[k],null);}).filter(function(j){return j && j.projectId===projectId && j.owner===access.email;}).map(function(j){return {nodeId:j.nodeId,name:j.name,status:j.status,error:j.error||'',operationId:j.operationId};});
}
function processWorkspaceOperations(projectId, retry) {
  var access=assertProjectAccess_(projectId);
  if(!access.allowed.edit)return [];
  return processWorkspaceJobs_(projectId,Boolean(retry),1);
}
function runWorkspaceMaintenance() {
  // Installable triggers run as their creator, never as another queued user.
  var effective=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
  if(!effective)return;
  WORKSPACE_WORKER_EMAIL_=effective;
  try { processWorkspaceJobs_('',false,3); } finally { WORKSPACE_WORKER_EMAIL_=''; }
}
function processWorkspaceJobs_(projectId,retry,limit) {
  var email=assertOrganizationMember_();
  {
    var props=PropertiesService.getUserProperties();var all=props.getProperties();var results=[],started=Date.now();
    var keys=Object.keys(all).filter(function(k){return k.indexOf(WORKSPACE_JOB_PREFIX_)===0;});
    for(var i=0;i<keys.length && results.length<limit && Date.now()-started<90000;i++){
      var key=keys[i];var job=safeJsonParse_(all[key],null);
      if(!job || job.owner!==email || projectId && job.projectId!==projectId)continue;
      if(job.status==='done'){props.deleteProperty(key);continue;}
      if(!retry && (job.status==='failed'||Date.now()<Number(job.nextAttempt||0)))continue;
      job=withWorkspaceLock_(function(){
        var fresh=safeJsonParse_(props.getProperty(key),null);
        if(!fresh || fresh.owner!==email || Number(fresh.leaseUntil||0)>Date.now())return null;
        fresh.leaseUntil=Date.now()+7*60*1000;props.setProperty(key,JSON.stringify(fresh));return fresh;
      });
      if(!job)continue;
      try {
        var access=assertProjectEdit_(job.projectId,job.capability);
        withWorkspaceLock_(function(){
          var source=job.capability==='sources';var index=source?readSourceIndex_(access.project):readDocumentIndex_(access.project);
          var record=(source?index.sources:index.documents).filter(function(r){return (source?'source:'+r.sourceId:'document:'+r.driveId)===job.nodeId && r.driveId===job.driveId;})[0];
          if(!record)throw new Error('Resource ownership could not be verified.');
          if(record.status!=='removed'){
            if(job.status!=='prepared')throw new Error('The resource changed after deletion was requested.');
            record.status='removed';record.removedAt=nowIso_();
            if(source)writeSourceIndex_(access.project,index);else writeDocumentIndex_(access.project,index);
          }
        });
        job.status='pending';
        if(!job.driveDone){DriveApp.getFileById(job.driveId).setTrashed(true);job.driveDone=true;props.setProperty(key,JSON.stringify(job));}
        if(!job.statsDone)withWorkspaceLock_(function(){
          var changes=job.capability==='sources'?{sourceCount:readSourceIndex_(access.project).sources.filter(function(s){return s.status!=='removed';}).length}:{documentCount:countGeneratedDocuments_(access.project)};
          touchProjectStats_(job.projectId,changes);job.statsDone=true;props.setProperty(key,JSON.stringify(job));
        });
        if(!job.remoteDone){var result=purgeFileSearchDocumentsForSource_(job.projectId,job.source);if(result.warnings.length)throw new Error(result.warnings.join(' ').slice(0,1000));job.remoteDone=true;props.setProperty(key,JSON.stringify(job));}
        job.status='done';job.error='';props.deleteProperty(key);
      } catch(error){
        delete job.leaseUntil;
        job.attempts=retry?1:Number(job.attempts||0)+1;job.status=job.attempts>=10?'failed':'pending';job.error=readableErrorMessage_(error).slice(0,1000);job.nextAttempt=Date.now()+Math.min(3600000,30000*Math.pow(2,job.attempts));props.setProperty(key,JSON.stringify(job));
      }
      results.push({nodeId:job.nodeId,status:job.status,error:job.error||''});
    }
    // No idle trigger left running indefinitely. A later delete installs it again.
    withWorkspaceLock_(function(){if(!Object.keys(props.getProperties()).some(function(k){return k.indexOf(WORKSPACE_JOB_PREFIX_)===0;})){
      try{ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='runWorkspaceMaintenance';}).forEach(function(t){ScriptApp.deleteTrigger(t);});props.deleteProperty('WS105_WORKER');}catch(_){}
    }});
    return results;
  }
}
function preserveRemovedRecords_(incoming,current,idKey) {
  var result=incoming.slice();
  current.forEach(function(old){
    var position=result.findIndex(function(r){return r[idKey]===old[idKey];});
    if(position===-1)result.push(old);else if(old.status==='removed')result[position]=old;
  });
  return result;
}
