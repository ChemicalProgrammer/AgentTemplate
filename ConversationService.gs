var CONVERSATION_INDEX_FILE = 'Conversations Index.json';

function listConversations(projectId) {
  var access = assertProjectAccess_(projectId, 'history');
  var index = readConversationIndex_(access.project);
  return index.conversations.filter(function(item) { return item.status !== 'archived'; })
    .sort(function(a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
}

function createConversation(projectId, title) {
  var access = assertProjectEdit_(projectId, 'history');
  var activeAgent = getProjectAgentRelease_(access.project);
  var now = nowIso_();
  var conversation = {
    schemaVersion: 1,
    conversationId: uuid_(),
    projectId: projectId,
    agentId: access.project.agentId || '',
    agentVersion: access.project.agentVersion || '',
    agentName: activeAgent ? activeAgent.release.agentName : '',
    title: normalizeName_(title, 'New chat'),
    createdAt: now,
    updatedAt: now,
    createdBy: access.email,
    status: 'active',
    messages: [],
    summary: '',
    summaryThrough: 0
  };
  var file = writeConversation_(access.project, conversation);
  upsertConversationIndex_(access.project, conversation, file.getId());
  touchProjectStats_(projectId, {conversationCount: readConversationIndex_(access.project).conversations.filter(function(item) { return item.status !== 'archived'; }).length});
  return conversation;
}

function loadConversation(projectId, conversationId) {
  var access = assertProjectAccess_(projectId, 'history');
  return readConversation_(access.project, conversationId);
}

function sendChatMessage(projectId, conversationId, message, selectedSourceIds, selectedFlowIds, requestId) {
  var access = assertProjectEdit_(projectId, 'history');
  var text = sanitizeText_(message, 20000).trim();
  if (!text) throw new Error('Enter a message.');
  var conversation = conversationId ? readConversation_(access.project, conversationId) : createConversation(projectId, 'New chat');
  if (conversation.projectId !== projectId) throw new Error('This chat does not belong to the selected project.');
  if (conversation.agentId && (conversation.agentId !== access.project.agentId || conversation.agentVersion !== access.project.agentVersion)) {
    throw new Error('This chat belongs to a different agent version. Start a new chat to use the currently loaded agent.');
  }
  conversation.agentId = access.project.agentId || '';
  conversation.agentVersion = access.project.agentVersion || '';
  conversation.sourceSelection = Array.isArray(selectedSourceIds) ? selectedSourceIds.map(String) : [];
  conversation.flowSelection = Array.isArray(selectedFlowIds) ? selectedFlowIds.map(String) : [];

  var projectContext = {text: '', inlineParts: [], sourcesUsed: [], warnings: [], selectedIds: []};
  var projectFileSearch = access.allowed.sources ? getFileSearchQueryConfig_(access.project, selectedSourceIds || []) : null;
  var agentFileSearch = access.allowed.sources ? getAgentFileSearchQueryConfig_(access.project, selectedSourceIds || []) : null;
  var localSourceIds = (selectedSourceIds || []).filter(function(id) {
    if (/^agent-source:/.test(String(id))) return false;
    if (!projectFileSearch) return true;
    var value = String(id).replace(/^source:/, '');
    return projectFileSearch.sourceIds.indexOf(value) === -1;
  });
  if (access.allowed.sources || access.allowed.documents) projectContext = buildSourceContext_(access.project, text, localSourceIds);
  var agentContext = access.allowed.sources ? buildAgentSourceContext_(access.project, text, selectedSourceIds || [], agentFileSearch ? agentFileSearch.sourceIds : []) : {text:'',inlineParts:[],sourcesUsed:[],warnings:[],selectedIds:[]};
  var sourceContext = {
    text:[agentContext.text,projectContext.text].filter(Boolean).join('\n\n=== PROJECT KNOWLEDGE ===\n\n'),
    inlineParts:(agentContext.inlineParts||[]).concat(projectContext.inlineParts||[]),
    sourcesUsed:(agentContext.sourcesUsed||[]).concat(projectContext.sourcesUsed||[]),
    warnings:(agentContext.warnings||[]).concat(projectContext.warnings||[]),
    selectedIds:(agentContext.selectedIds||[]).concat(projectContext.selectedIds||[])
  };
  if (sourceContext.warnings && sourceContext.warnings.length) {
    throw new Error('Selected sources could not be analyzed. Index or repair them first: ' + sourceContext.warnings.join(' | '));
  }
  if ((projectFileSearch || agentFileSearch) && (sourceContext.inlineParts || []).some(function(part) { return Boolean(part.inlineData); })) {
    throw new Error('An indexed source cannot be combined with an unindexed binary document in the same request. Deselect the binary document or query it separately.');
  }
  var authorizedSelection = (sourceContext.selectedIds || [])
    .concat(projectFileSearch ? projectFileSearch.sourceIds.map(function(id) { return 'source:' + id; }) : [])
    .concat(agentFileSearch ? agentFileSearch.sourceIds.map(function(id) { return 'agent-source:' + id; }) : []);
  authorizedSelection = authorizedSelection.filter(function(id, index, all) { return id && all.indexOf(id) === index; });
  if ((selectedSourceIds || []).length && !authorizedSelection.length) {
    throw new Error('None of the selected documents is still active and available. Refresh the Documents panel and select a current source.');
  }
  conversation.sourceSelection = authorizedSelection.slice();
  var flowContext = access.allowed.sources ? buildFlowContext_(access.project, selectedFlowIds || []) : {text: '', flowsUsed: []};
  var config = getUserGeminiConfig_();
  var prompt = buildGeminiConversation_(access.project, conversation, text, sourceContext, flowContext, authorizedSelection);
  var now = nowIso_();
  var userMessage = {
    messageId: uuid_(), role: 'user', text: text, createdAt: now, createdBy: access.email,
    sourceSelection: authorizedSelection, flowSelection: conversation.flowSelection.slice()
  };
  conversation.messages.push(userMessage);
  conversation.updatedAt = nowIso_();
  var pendingFile = writeConversation_(access.project, conversation);
  upsertConversationIndex_(access.project, conversation, pendingFile.getId());
  if (isChatRequestCancelled_(requestId)) throw new Error('Generation stopped.');

  var fileSearchConfigs = [projectFileSearch, agentFileSearch].filter(Boolean);
  var fileSearchSourceIds = [];
  var fileSearchStores = [];
  fileSearchConfigs.forEach(function(item){fileSearchSourceIds=fileSearchSourceIds.concat(item.sourceIds||[]);if(item.storeName)fileSearchStores.push(item.storeName);});
  fileSearchSourceIds = fileSearchSourceIds.filter(function(id,index,all){return all.indexOf(id)===index;});
  var result = fileSearchConfigs.length ? generateWithFileSearch_({
    config: config,
    systemInstruction: prompt.systemInstruction,
    contents: prompt.contents,
    storeNames: fileSearchStores,
    metadataFilter: buildFileSearchMetadataFilter_(fileSearchSourceIds),
    allowedSourceIds: fileSearchSourceIds,
    maxOutputTokens: 8192
  }) : generateWithGemini_({
    config: config,
    systemInstruction: prompt.systemInstruction,
    contents: prompt.contents,
    temperature: 0.35,
    maxOutputTokens: 8192
  });
  if (isChatRequestCancelled_(requestId)) throw new Error('Generation stopped.');

  var assistantMessage = {
    messageId: uuid_(), role: 'assistant', text: result.text, createdAt: nowIso_(),
    model: result.model,
    sourcesUsed: sourceContext.sourcesUsed.concat(fileSearchConfigs.length ? annotationsToScopedSourcesUsed_(result.annotations, access.project, agentFileSearch ? agentFileSearch.resolved : getProjectAgentRelease_(access.project)) : []),
    flowsUsed: flowContext.flowsUsed,
    sourceSelection: authorizedSelection,
    retrievalAudit: result.retrievalAudit || null,
    usage: result.usage
  };
  assistantMessage.agentId = access.project.agentId || '';
  assistantMessage.agentVersion = access.project.agentVersion || '';
  assistantMessage.agentName = getAgentExecutionContext_(access.project).name;
  conversation.messages.push(assistantMessage);
  if (conversation.messages.length === 2 || conversation.title === 'New chat' || conversation.title === 'Nueva conversación') {
    conversation.title = normalizeName_(text.slice(0, 70), 'Chat');
  }
  conversation.updatedAt = nowIso_();
  try {
    maybeSummarizeConversation_(conversation, config, access.project);
  } catch (summaryError) {
    console.warn('The response was preserved even though memory could not be updated: ' + summaryError.message);
  }
  if (isChatRequestCancelled_(requestId)) throw new Error('Generation stopped.');
  var file = writeConversation_(access.project, conversation);
  upsertConversationIndex_(access.project, conversation, file.getId());
  touchProjectStats_(projectId, {lastConversationAt: conversation.updatedAt});
  clearChatRequestCancellation_(requestId);
  return {
    conversationId: conversation.conversationId,
    title: conversation.title,
    userMessage: userMessage,
    assistantMessage: assistantMessage,
    messageCount: conversation.messages.length
  };
}

function cancelChatRequest(requestId) {
  requestId = normalizeChatRequestId_(requestId);
  if (!requestId) return {cancelled: false};
  CacheService.getUserCache().put('CHAT_CANCEL_' + requestId, '1', 600);
  return {cancelled: true, requestId: requestId};
}

function truncateAssistantMessage(projectId, conversationId, messageId, text) {
  var access = assertProjectEdit_(projectId, 'history');
  var conversation = readConversation_(access.project, conversationId);
  var message = conversation.messages.filter(function(item) { return item.messageId === messageId && item.role === 'assistant'; })[0];
  if (!message) throw new Error('The response could not be found.');
  message.text = sanitizeText_(text, 20000).trim() || '[Response stopped]';
  message.stopped = true;
  conversation.updatedAt = nowIso_();
  var file = writeConversation_(access.project, conversation);
  upsertConversationIndex_(access.project, conversation, file.getId());
  return {messageId: messageId, text: message.text, stopped: true};
}

function renameConversation(projectId, conversationId, title) {
  var access = assertProjectEdit_(projectId, 'history');
  var conversation = readConversation_(access.project, conversationId);
  conversation.title = normalizeName_(title, conversation.title);
  conversation.updatedAt = nowIso_();
  var file = writeConversation_(access.project, conversation);
  upsertConversationIndex_(access.project, conversation, file.getId());
  return {conversationId: conversationId, title: conversation.title};
}

function archiveConversation(projectId, conversationId) {
  var access = assertProjectEdit_(projectId, 'history');
  var conversation = readConversation_(access.project, conversationId);
  conversation.status = 'archived';
  conversation.updatedAt = nowIso_();
  var file = writeConversation_(access.project, conversation);
  upsertConversationIndex_(access.project, conversation, file.getId());
  return {archived: true, conversationId: conversationId};
}

function deleteConversation(projectId, conversationId) {
  var access = assertProjectEdit_(projectId, 'history');
  var index = readConversationIndex_(access.project);
  var record = index.conversations.filter(function(item) { return item.conversationId === conversationId; })[0];
  if (!record) throw new Error('Chat not found.');
  try {
    var file = record.fileId
      ? DriveApp.getFileById(record.fileId)
      : getFirstFileByName_(DriveApp.getFolderById(access.project.folders.conversations), 'Conversation - ' + conversationId + '.json');
    if (file) file.setTrashed(true);
  } catch (error) {
    throw new Error('The chat could not be moved to Drive trash: ' + error.message);
  }
  index.conversations = index.conversations.filter(function(item) { return item.conversationId !== conversationId; });
  writeJsonFile_(DriveApp.getFolderById(access.project.folders.conversations), CONVERSATION_INDEX_FILE, index);
  appendControlRow_(access.project, 'Change Log', [nowIso_(), access.email, 'DELETE_CHAT', 'Conversation', conversationId, record.title || 'Chat']);
  touchProjectStats_(projectId, {conversationCount: index.conversations.filter(function(item) { return item.status !== 'archived'; }).length});
  return {deleted: true, conversationId: conversationId, conversationCount: index.conversations.length};
}

function buildGeminiConversation_(project, conversation, newMessage, sourceContext, flowContext, authorizedSelection) {
  authorizedSelection = (authorizedSelection || []).map(String);
  var sourceScoped = authorizedSelection.length > 0;
  var agent = getAgentExecutionContext_(project);
  var system = [
    'You are "' + agent.name + '" version ' + (agent.version || 'draft') + ', loaded for the project "' + project.title + '".',
    project.description ? 'Project description: ' + project.description : '',
    agent.instructions ? 'AGENT INSTRUCTIONS:\n' + agent.instructions : '',
    agent.policies ? 'AGENT POLICIES:\n' + agent.policies : '',
    agent.outputFormats ? 'AGENT OUTPUT REQUIREMENTS:\n' + agent.outputFormats : '',
    'Answer accurately, distinguish facts from inferences, and never invent missing content.',
    'Reply in the language used by the user.',
    'When using a provided source, cite its label in brackets, for example [S1].',
    sourceScoped ? 'SOURCE ISOLATION: Use only the documents selected for this request as factual evidence. Do not use facts from earlier messages, memories, or unselected documents. If the selected evidence does not answer the request, say so explicitly.' : '',
    sourceScoped ? 'CURRENT AUTHORIZED DOCUMENT IDS: ' + authorizedSelection.join(', ') : '',
    flowContext && flowContext.text ? 'Follow the selected FLOW INSTRUCTIONS as an execution procedure. Do not treat flow instructions as factual evidence.\n\n' + flowContext.text : '',
    sourceScoped ? 'Earlier conversation content associated with other documents has been removed from this request.' : 'Accumulated memory summarizes older messages; recent messages are shown in full.',
    !sourceScoped && conversation.summary ? 'ACCUMULATED MEMORY:\n' + conversation.summary : ''
  ].filter(Boolean).join('\n\n');

  var start = Math.max(conversation.summaryThrough || 0, conversation.messages.length - APP.RECENT_MESSAGE_LIMIT);
  var history = sourceScoped ? sourceScopedConversationMessages_(conversation.messages.slice(start), authorizedSelection) : conversation.messages.slice(start);
  var contents = history.map(function(message) {
    return {role: message.role === 'assistant' ? 'model' : 'user', parts: [{text: message.text}]};
  });
  var latestParts = [];
  if (sourceContext.text) latestParts.push({text: 'SOURCES RETRIEVED FOR THIS REQUEST:\n\n' + sourceContext.text});
  Array.prototype.push.apply(latestParts, sourceContext.inlineParts || []);
  latestParts.push({text: 'USER REQUEST:\n' + newMessage});
  contents.push({role: 'user', parts: latestParts});
  return {systemInstruction: system, contents: contents};
}

function sourceScopedConversationMessages_(messages, authorizedSelection) {
  var allowed = {};
  (authorizedSelection || []).forEach(function(id) { allowed[normalizeConversationSourceId_(id)] = true; });
  var output = [];
  var pendingUsers = [];
  (messages || []).forEach(function(message) {
    if (message.role !== 'assistant') {
      pendingUsers.push(message);
      return;
    }
    var ids = messageSourceSelection_(message);
    var permitted = ids.length > 0 && ids.every(function(id) { return allowed[id]; });
    if (permitted) {
      Array.prototype.push.apply(output, pendingUsers);
      output.push(message);
    }
    pendingUsers = [];
  });
  return output;
}

function messageSourceSelection_(message) {
  var ids = Array.isArray(message.sourceSelection) ? message.sourceSelection.slice() : [];
  if (!ids.length) ids = (message.sourcesUsed || []).map(function(source) { return source.sourceId; });
  return ids.map(normalizeConversationSourceId_).filter(Boolean).filter(function(id, index, all) { return all.indexOf(id) === index; });
}

function normalizeConversationSourceId_(id) {
  id = String(id || '').trim();
  if (!id) return '';
  return /^(source|document|agent-source):/.test(id) ? id : 'source:' + id;
}

function maybeSummarizeConversation_(conversation, config, project) {
  var cutoff = conversation.messages.length - APP.RECENT_MESSAGE_LIMIT;
  if (cutoff - (conversation.summaryThrough || 0) < 8) return;
  var pending = conversation.messages.slice(conversation.summaryThrough || 0, cutoff);
  var transcript = pending.map(function(message) { return message.role.toUpperCase() + ': ' + message.text; }).join('\n\n');
  var response = generateWithGemini_({
    config: config,
    systemInstruction: 'Maintain compact, factual project memory. Preserve decisions, requirements, names, figures, open items, preferences, and corrections. Add no facts.',
    contents: [{role: 'user', parts: [{text: 'Project: ' + project.title + '\n\nPrevious memory:\n' + (conversation.summary || '(none)') + '\n\nNew messages:\n' + truncate_(transcript, 60000) + '\n\nReturn the consolidated memory.'}]}],
    temperature: 0.1,
    maxOutputTokens: 3000
  });
  conversation.summary = response.text;
  conversation.summaryThrough = cutoff;
}

function readConversationIndex_(project) {
  var folder = DriveApp.getFolderById(project.folders.conversations);
  var data = readJsonFile_(getFirstFileByName_(folder, CONVERSATION_INDEX_FILE), {schemaVersion: 1, conversations: []});
  data.conversations = data.conversations || [];
  return data;
}

function repairConversationMessageCounts_(project, index, allowWrite) {
  var changed = false;
  index.conversations.forEach(function(record) {
    if (typeof record.messageCount === 'number' && record.messageCount > 0) return;
    try {
      var file = record.fileId ? DriveApp.getFileById(record.fileId) : getFirstFileByName_(DriveApp.getFolderById(project.folders.conversations), 'Conversation - ' + record.conversationId + '.json');
      var conversation = readJsonFile_(file, null);
      var count = conversation && Array.isArray(conversation.messages) ? conversation.messages.length : 0;
      if (record.messageCount !== count) { record.messageCount = count; changed = true; }
    } catch (error) {
      if (typeof record.messageCount !== 'number') { record.messageCount = 0; changed = true; }
    }
  });
  if (changed && allowWrite) writeJsonFile_(DriveApp.getFolderById(project.folders.conversations), CONVERSATION_INDEX_FILE, index);
  return index;
}

function normalizeChatRequestId_(requestId) {
  return String(requestId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
}

function isChatRequestCancelled_(requestId) {
  requestId = normalizeChatRequestId_(requestId);
  return Boolean(requestId && CacheService.getUserCache().get('CHAT_CANCEL_' + requestId));
}

function clearChatRequestCancellation_(requestId) {
  requestId = normalizeChatRequestId_(requestId);
  if (requestId) CacheService.getUserCache().remove('CHAT_CANCEL_' + requestId);
}

function upsertConversationIndex_(project, conversation, fileId) {
  var index = readConversationIndex_(project);
  var existing = index.conversations.filter(function(item) { return item.conversationId === conversation.conversationId; })[0];
  var record = {
    conversationId: conversation.conversationId,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    createdBy: conversation.createdBy,
    agentId: conversation.agentId || project.agentId || '',
    agentVersion: conversation.agentVersion || project.agentVersion || '',
    agentName: conversation.agentName || '',
    status: conversation.status,
    messageCount: conversation.messages.length,
    fileId: fileId
  };
  if (existing) Object.keys(record).forEach(function(key) { existing[key] = record[key]; }); else index.conversations.push(record);
  writeJsonFile_(DriveApp.getFolderById(project.folders.conversations), CONVERSATION_INDEX_FILE, index);
  appendControlRow_(project, 'Conversations', [record.conversationId, record.title, record.createdAt, record.updatedAt, record.createdBy, record.status, record.fileId]);
}

function writeConversation_(project, conversation) {
  var folder = DriveApp.getFolderById(project.folders.conversations);
  return writeJsonFile_(folder, 'Conversation - ' + conversation.conversationId + '.json', conversation);
}

function readConversation_(project, conversationId) {
  var index = readConversationIndex_(project);
  var record = index.conversations.filter(function(item) { return item.conversationId === conversationId; })[0];
  if (!record) throw new Error('Chat not found.');
  var file = record.fileId ? DriveApp.getFileById(record.fileId) : getFirstFileByName_(DriveApp.getFolderById(project.folders.conversations), 'Conversation - ' + conversationId + '.json');
  var conversation = readJsonFile_(file, null);
  if (!conversation) throw new Error('The chat file is damaged.');
  return conversation;
}
