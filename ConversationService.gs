var CONVERSATION_INDEX_FILE = 'Conversations Index.json';

function listConversations(projectId) {
  var access = assertProjectAccess_(projectId, 'history');
  return readConversationIndex_(access.project).conversations.filter(function(item) { return item.status !== 'archived'; })
    .sort(function(a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
}

function createConversation(projectId, title) {
  var access = assertProjectEdit_(projectId, 'history');
  var now = nowIso_();
  var conversation = {
    schemaVersion: 1,
    conversationId: uuid_(),
    projectId: projectId,
    title: normalizeName_(title, 'Nueva conversación'),
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

function sendChatMessage(projectId, conversationId, message, selectedSourceIds) {
  var access = assertProjectEdit_(projectId, 'history');
  var text = sanitizeText_(message, 20000).trim();
  if (!text) throw new Error('Escribe un mensaje.');
  var conversation = conversationId ? readConversation_(access.project, conversationId) : createConversation(projectId, 'Nueva conversación');
  if (conversation.projectId !== projectId) throw new Error('La conversación no pertenece a este proyecto.');

  var sourceContext = {text: '', inlineParts: [], sourcesUsed: []};
  if (access.allowed.sources) sourceContext = buildSourceContext_(access.project, text, selectedSourceIds || []);
  var config = getUserGeminiConfig_();
  var prompt = buildGeminiConversation_(access.project, conversation, text, sourceContext);
  var result = generateWithGemini_({
    config: config,
    systemInstruction: prompt.systemInstruction,
    contents: prompt.contents,
    temperature: 0.35,
    maxOutputTokens: 8192
  });

  var now = nowIso_();
  conversation.messages.push({messageId: uuid_(), role: 'user', text: text, createdAt: now, createdBy: access.email});
  conversation.messages.push({
    messageId: uuid_(), role: 'assistant', text: result.text, createdAt: nowIso_(),
    model: result.model, sourcesUsed: sourceContext.sourcesUsed, usage: result.usage
  });
  if (conversation.messages.length === 2 || conversation.title === 'Nueva conversación') {
    conversation.title = normalizeName_(text.slice(0, 70), 'Conversación');
  }
  conversation.updatedAt = nowIso_();
  try {
    maybeSummarizeConversation_(conversation, config, access.project);
  } catch (summaryError) {
    console.warn('La respuesta se conservará aunque no se pudo actualizar la memoria: ' + summaryError.message);
  }
  var file = writeConversation_(access.project, conversation);
  upsertConversationIndex_(access.project, conversation, file.getId());
  touchProjectStats_(projectId, {lastConversationAt: conversation.updatedAt});
  return {
    conversationId: conversation.conversationId,
    title: conversation.title,
    userMessage: conversation.messages[conversation.messages.length - 2],
    assistantMessage: conversation.messages[conversation.messages.length - 1]
  };
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

function buildGeminiConversation_(project, conversation, newMessage, sourceContext) {
  var system = [
    'Eres el agente del proyecto "' + project.title + '".',
    project.description ? 'Descripción del proyecto: ' + project.description : '',
    'Responde con precisión, distingue hechos de inferencias y no inventes contenido ausente.',
    'Cuando utilices una fuente proporcionada, cita su etiqueta entre corchetes, por ejemplo [S1].',
    'La memoria acumulativa resume mensajes antiguos; los mensajes recientes aparecen completos.',
    conversation.summary ? 'MEMORIA ACUMULATIVA:\n' + conversation.summary : ''
  ].filter(Boolean).join('\n\n');

  var start = Math.max(conversation.summaryThrough || 0, conversation.messages.length - APP.RECENT_MESSAGE_LIMIT);
  var contents = conversation.messages.slice(start).map(function(message) {
    return {role: message.role === 'assistant' ? 'model' : 'user', parts: [{text: message.text}]};
  });
  var latestParts = [];
  if (sourceContext.text) latestParts.push({text: 'FUENTES RECUPERADAS PARA ESTA CONSULTA:\n\n' + sourceContext.text});
  Array.prototype.push.apply(latestParts, sourceContext.inlineParts || []);
  latestParts.push({text: 'CONSULTA DEL USUARIO:\n' + newMessage});
  contents.push({role: 'user', parts: latestParts});
  return {systemInstruction: system, contents: contents};
}

function maybeSummarizeConversation_(conversation, config, project) {
  var cutoff = conversation.messages.length - APP.RECENT_MESSAGE_LIMIT;
  if (cutoff - (conversation.summaryThrough || 0) < 8) return;
  var pending = conversation.messages.slice(conversation.summaryThrough || 0, cutoff);
  var transcript = pending.map(function(message) { return message.role.toUpperCase() + ': ' + message.text; }).join('\n\n');
  var response = generateWithGemini_({
    config: config,
    systemInstruction: 'Mantén una memoria factual y compacta del proyecto. Conserva decisiones, requisitos, nombres, cifras, pendientes, preferencias y correcciones. No agregues hechos.',
    contents: [{role: 'user', parts: [{text: 'Proyecto: ' + project.title + '\n\nMemoria previa:\n' + (conversation.summary || '(ninguna)') + '\n\nNuevos mensajes:\n' + truncate_(transcript, 60000) + '\n\nDevuelve la memoria consolidada.'}]}],
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

function upsertConversationIndex_(project, conversation, fileId) {
  var index = readConversationIndex_(project);
  var existing = index.conversations.filter(function(item) { return item.conversationId === conversation.conversationId; })[0];
  var record = {
    conversationId: conversation.conversationId,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    createdBy: conversation.createdBy,
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
  if (!record) throw new Error('No se encontró la conversación.');
  var file = record.fileId ? DriveApp.getFileById(record.fileId) : getFirstFileByName_(DriveApp.getFolderById(project.folders.conversations), 'Conversation - ' + conversationId + '.json');
  var conversation = readJsonFile_(file, null);
  if (!conversation) throw new Error('El archivo de conversación está dañado.');
  return conversation;
}
