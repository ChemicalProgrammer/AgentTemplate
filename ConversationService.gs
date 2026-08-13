var CONVERSATION_INDEX_FILE = 'Conversations Index.json';

function listConversations(projectId) {
  var access = assertProjectAccess_(projectId, 'history');
  var index = readConversationIndex_(access.project);
  return index.conversations.filter(function(item) { return item.status !== 'archived'; })
    .sort(function(a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
}

function createConversation(projectId, title, model) {
  var access = assertProjectEdit_(projectId, 'history');
  var activeAgent = getProjectAgentRelease_(access.project);
  var now = nowIso_();
  var conversation = {
    schemaVersion: 2,
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
    model: normalizeModel_(model || getPublicUserGeminiSettings_().model || APP.DEFAULT_MODEL),
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

function sendChatMessage(projectId, conversationId, message, selectedSourceIds, selectedFlowIds, requestId, modelOverride) {
  var access = assertProjectEdit_(projectId, 'history');
  var text = sanitizeText_(message, 20000).trim();
  if (!text) throw new Error('Enter a message.');
  var conversation = conversationId ? readConversation_(access.project, conversationId) : createConversation(projectId, 'New chat', modelOverride);
  if (conversation.projectId !== projectId) throw new Error('This chat does not belong to the selected project.');
  if (conversation.agentId && (conversation.agentId !== access.project.agentId || conversation.agentVersion !== access.project.agentVersion)) {
    throw new Error('This chat belongs to a different agent version. Start a new chat to use the currently loaded agent.');
  }
  conversation.agentId = access.project.agentId || '';
  conversation.agentVersion = access.project.agentVersion || '';
  conversation.sourceSelection = Array.isArray(selectedSourceIds) ? selectedSourceIds.map(String) : [];
  conversation.flowSelection = Array.isArray(selectedFlowIds) ? selectedFlowIds.map(String) : [];
  conversation.model = normalizeModel_(modelOverride || conversation.model || getPublicUserGeminiSettings_().model || APP.DEFAULT_MODEL);

  if (isStandaloneAcceptCanvasCommand_(text)) {
    return acceptLatestCanvas_(access, conversation, text, requestId);
  }

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
  delete conversation.pendingBranchMessage;
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
    model: conversation.model,
    systemInstruction: prompt.systemInstruction,
    contents: prompt.contents,
    storeNames: fileSearchStores,
    metadataFilter: buildFileSearchMetadataFilter_(fileSearchSourceIds),
    allowedSourceIds: fileSearchSourceIds,
    maxOutputTokens: 8192
  }) : generateWithGemini_({
    config: config,
    model: conversation.model,
    systemInstruction: prompt.systemInstruction,
    contents: prompt.contents,
    temperature: 0.35,
    maxOutputTokens: 8192
  });
  if (isChatRequestCancelled_(requestId)) throw new Error('Generation stopped.');

  var artifactResponse = parseAgentConsoleArtifactResponse_(result.text) || inferArtifactResponseFromRequest_(text, result.text);
  var createdArtifact = null;
  if (artifactResponse) {
    assertProjectEdit_(projectId, 'documents');
    createdArtifact = createMarkdownArtifact_(access.project, access.email, conversation, artifactResponse.artifact, result.model);
  }
  var assistantMessage = {
    messageId: uuid_(), role: 'assistant', text: createdArtifact ? '' : result.text, createdAt: nowIso_(),
    model: result.model,
    sourcesUsed: sourceContext.sourcesUsed.concat(fileSearchConfigs.length ? annotationsToScopedSourcesUsed_(result.annotations, access.project, agentFileSearch ? agentFileSearch.resolved : getProjectAgentRelease_(access.project)) : []),
    flowsUsed: flowContext.flowsUsed,
    sourceSelection: authorizedSelection,
    retrievalAudit: result.retrievalAudit || null,
    usage: result.usage
  };
  if (createdArtifact) {
    assistantMessage.kind = 'artifact_event';
    assistantMessage.eventLabel = artifactResponse.eventLabel || 'Artifact saved';
    assistantMessage.artifact = createdArtifact;
    assistantMessage.actions = normalizeArtifactActions_(artifactResponse.actions, createdArtifact.artifactType);
  }
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

function acceptLatestCanvas_(access, conversation, text, requestId) {
  assertProjectEdit_(conversation.projectId, 'documents');
  var candidate = null;
  var shortCandidate = null;
  for (var index = conversation.messages.length - 1; index >= 0; index--) {
    var message = conversation.messages[index];
    if (message.role === 'assistant' && message.text && /(project approval canvas|canvas de aprobaci[oó]n)/i.test(message.text)) {
      if (!shortCandidate) shortCandidate = message;
      if (message.text.length >= 300) { candidate = message; break; }
    }
  }
  candidate = candidate || shortCandidate;
  if (!candidate) throw new Error('No Project Approval Canvas was found in this conversation. Generate or refine the Canvas before accepting it.');
  var now = nowIso_();
  var userMessage = {
    messageId: uuid_(), role: 'user', text: text, createdAt: now, createdBy: access.email,
    sourceSelection: conversation.sourceSelection.slice(), flowSelection: conversation.flowSelection.slice()
  };
  conversation.messages.push(userMessage);
  var artifact = createMarkdownArtifact_(access.project, access.email, conversation, {
    title: 'Project Approval Canvas',
    artifactType: 'project_approval_canvas',
    status: 'accepted',
    content: extractAcceptedCanvasContent_(candidate.text)
  }, conversation.model);
  var assistantMessage = {
    messageId: uuid_(), role: 'assistant', text: '', kind: 'artifact_event', eventLabel: 'Canvas accepted and saved',
    createdAt: nowIso_(), model: conversation.model, artifact: artifact,
    actions: normalizeArtifactActions_([], 'project_approval_canvas'),
    sourceSelection: conversation.sourceSelection.slice(), sourcesUsed: candidate.sourcesUsed || [], flowsUsed: candidate.flowsUsed || []
  };
  assistantMessage.agentId = access.project.agentId || '';
  assistantMessage.agentVersion = access.project.agentVersion || '';
  assistantMessage.agentName = getAgentExecutionContext_(access.project).name;
  conversation.messages.push(assistantMessage);
  conversation.updatedAt = nowIso_();
  var file = writeConversation_(access.project, conversation);
  upsertConversationIndex_(access.project, conversation, file.getId());
  touchProjectStats_(conversation.projectId, {lastConversationAt: conversation.updatedAt});
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

function branchConversation(projectId, conversationId, messageId, replacementText, model) {
  var access = assertProjectEdit_(projectId, 'history');
  var original = readConversation_(access.project, conversationId);
  var branchIndex = original.messages.map(function(message) { return message.messageId; }).indexOf(String(messageId || ''));
  if (branchIndex < 0 || original.messages[branchIndex].role !== 'user') throw new Error('Select a user message to create a branch.');
  var replacement = sanitizeText_(replacementText, 20000).trim();
  if (!replacement) throw new Error('Enter the revised message for the branch.');
  var now = nowIso_();
  var activeAgent = getProjectAgentRelease_(access.project);
  var branch = {
    schemaVersion: 2,
    conversationId: uuid_(), projectId: projectId,
    agentId: access.project.agentId || '', agentVersion: access.project.agentVersion || '',
    agentName: activeAgent ? activeAgent.release.agentName : '',
    title: normalizeName_(original.title + ' · branch', 'Branched chat'),
    createdAt: now, updatedAt: now, createdBy: access.email, status: 'active',
    model: normalizeModel_(model || original.model || getPublicUserGeminiSettings_().model || APP.DEFAULT_MODEL),
    parentConversationId: original.conversationId,
    branchFromMessageId: messageId,
    sourceSelection: (original.messages[branchIndex].sourceSelection || original.sourceSelection || []).slice(),
    flowSelection: (original.messages[branchIndex].flowSelection || original.flowSelection || []).slice(),
    messages: original.messages.slice(0, branchIndex),
    summary: '', summaryThrough: 0,
    pendingBranchMessage: replacement
  };
  var file = writeConversation_(access.project, branch);
  upsertConversationIndex_(access.project, branch, file.getId());
  touchProjectStats_(projectId, {conversationCount: readConversationIndex_(access.project).conversations.filter(function(item) { return item.status !== 'archived'; }).length});
  return branch;
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
    'AGENT CONSOLE ARTIFACT PROTOCOL:\nWhen the user explicitly accepts, saves, finalizes, or asks you to create a structured project artifact, return only one valid JSON object and no Markdown fences or commentary. Use this schema: {"response_type":"artifact","event_label":"Artifact ready","artifact":{"title":"Name","artifact_type":"project_approval_canvas|executive_decision_brief|stakeholder_pitch_kit|markdown_artifact","format":"markdown","status":"draft|accepted|complete","parent_artifact_type":"project_approval_canvas or empty","content":"complete Markdown"},"next_actions":[{"id":"short_id","label":"Button label","message":"Message to send"}]}. Accept Canvas creates only the Project Approval Canvas; then offer Executive Decision Brief and Stakeholder Pitch Kit as the two next actions. A selected path creates a Level 2 artifact whose parent_artifact_type is project_approval_canvas. Do not place artifact content in a normal chat reply.',
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
    return {role: message.role === 'assistant' ? 'model' : 'user', parts: [{text: conversationMessageTextForModel_(message)}]};
  });
  var latestParts = [];
  if (sourceContext.text) latestParts.push({text: 'SOURCES RETRIEVED FOR THIS REQUEST:\n\n' + sourceContext.text});
  Array.prototype.push.apply(latestParts, sourceContext.inlineParts || []);
  latestParts.push({text: 'USER REQUEST:\n' + newMessage});
  contents.push({role: 'user', parts: latestParts});
  return {systemInstruction: system, contents: contents};
}

function conversationMessageTextForModel_(message) {
  if (message && message.kind === 'artifact_event' && message.artifact) {
    return '[Artifact saved: ' + message.artifact.name + '; type=' + (message.artifact.artifactType || 'markdown_artifact') + '; node=' + (message.artifact.nodeId || '') + ']';
  }
  return String(message && message.text || '');
}

function isStandaloneAcceptCanvasCommand_(text) {
  var value = String(text || '').trim().toLowerCase().replace(/[.!]+$/g, '').replace(/\s+/g, ' ');
  return /^(accept canvas|accept the canvas|aceptar canvas|aceptar el canvas|acepto el canvas|aceptar canvas de aprobaci[oó]n)$/.test(value);
}

function extractAcceptedCanvasContent_(text) {
  var value = String(text || '').trim();
  var markers = [
    /\n#{1,4}\s+(?:Revisi[oó]n del Canvas|Canvas Review)\b/i,
    /\n(?:¿?C[oó]mo deseas proceder\??|How would you like to proceed\??)\s*$/i
  ];
  markers.forEach(function(marker) {
    var position = value.search(marker);
    if (position > 0) value = value.slice(0, position).trim();
  });
  return value;
}

function parseAgentConsoleArtifactResponse_(text) {
  var value = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  if (!/^\{/.test(value)) return null;
  var parsed = safeJsonParse_(value, null);
  if (!parsed || parsed.response_type !== 'artifact' || !parsed.artifact || !parsed.artifact.content) return null;
  return {
    eventLabel: sanitizeText_(parsed.event_label || 'Artifact saved', 120),
    artifact: parsed.artifact,
    actions: parsed.next_actions || []
  };
}

function inferArtifactResponseFromRequest_(request, responseText) {
  request = String(request || '');
  var type = '';
  if (/(executive decision brief|documento de nivel 2|brief ejecutivo)/i.test(request)) type = 'executive_decision_brief';
  if (/(stakeholder pitch kit|pitch kit|kit para stakeholders|kit de presentaci[oó]n)/i.test(request)) type = 'stakeholder_pitch_kit';
  if (!type || !String(responseText || '').trim()) return null;
  return {
    eventLabel: 'Level 2 artifact saved',
    artifact: {
      title: artifactTitleForType_(type), artifactType: type, parentArtifactType: 'project_approval_canvas',
      status: 'complete', content: responseText
    },
    actions: []
  };
}

function normalizeArtifactActions_(actions, artifactType) {
  var normalized = (Array.isArray(actions) ? actions : []).map(function(action, index) {
    return {
      id: sanitizeText_(action.id || 'action_' + (index + 1), 60).replace(/[^a-zA-Z0-9_-]/g, '_'),
      label: sanitizeText_(action.label || 'Continue', 80),
      message: sanitizeText_(action.message || '', 1000)
    };
  }).filter(function(action) { return action.label && action.message; });
  if (!normalized.length && artifactType === 'project_approval_canvas') {
    normalized = [
      {id: 'executive_decision_brief', label: 'Executive Decision Brief', message: 'Create the Level 2 Executive Decision Brief from the accepted Project Approval Canvas.'},
      {id: 'stakeholder_pitch_kit', label: 'Stakeholder Pitch Kit', message: 'Create the Level 2 Stakeholder Pitch Kit from the accepted Project Approval Canvas.'}
    ];
  }
  return normalized.slice(0, 4);
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
  var transcript = pending.map(function(message) { return message.role.toUpperCase() + ': ' + conversationMessageTextForModel_(message); }).join('\n\n');
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
    model: conversation.model || '',
    parentConversationId: conversation.parentConversationId || '',
    branchFromMessageId: conversation.branchFromMessageId || '',
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
