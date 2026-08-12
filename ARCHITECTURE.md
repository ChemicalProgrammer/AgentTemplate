# Arquitectura técnica

Versión de referencia: 1.8.0.

## Modelo de la consola

La aplicación separa el diseño de agentes de su uso operativo:

```text
Agent Console/
├── Agents/                 # construir, copiar, escanear y publicar
├── Projects/               # cargar una versión publicada y trabajar
└── _System/                # datos internos de la consola
```

La regla central es:

> Un agente define cómo trabajar y contiene su propio conocimiento. Un proyecto carga una sola versión del agente y añade únicamente su contexto particular.

No existen Knowledge Packs globales. Las fuentes de un agente no se comparten ni se mezclan con otros agentes.

## Carpeta autocontenida de agente

```text
Agents/Technical Governance Agent/
├── Agent Manifest.json
├── Instructions/
│   └── System Instructions.md
├── Knowledge/
│   ├── Mandatory Sources/
│   └── Optional Sources/
├── Workflows/
├── Templates/
├── Output Formats/
├── Policies/
├── Examples/
├── Evaluations/
├── Assets/
├── Releases/
│   └── 1.0.0/
│       ├── Release Manifest.json
│       └── [instantánea de todas las secciones]
└── _Runtime/
```

`Agent Manifest.json` schema 2 agrega `logoPath`, `logoDriveId` y `logoMimeType`. `logoPath` es la referencia portable y apunta a un archivo dentro de `Assets`; `logoDriveId` es una referencia local reconstruible. Al escanear una carpeta copiada, la ruta lógica resuelve el nuevo ID de Drive. El icono y el color permanecen como respaldo cuando no hay logo.

La carpeta es la unidad portable. Al copiarla dentro de `Agents` y pulsar **Scan agents**, la consola:

1. valida o crea el manifiesto;
2. reconstruye los IDs internos por rutas lógicas;
3. detecta IDs de agente duplicados y convierte la segunda copia en un borrador independiente;
4. conserva versiones válidas cuando la carpeta proviene de otra instalación;
5. no copia llaves API, sesiones ni embeddings;
6. reconstruye el índice File Search desde los originales de Drive.

## Borradores y versiones

- Las carpetas superiores son el borrador editable.
- **Publish** crea una instantánea completa e inmutable en `Releases/{version}`.
- La identidad publicada —icono, color y logo— pertenece a esa versión y no cambia cuando se edita el borrador.
- Cada proyecto guarda `agentId` y `agentVersion`.
- Publicar una versión nueva no modifica proyectos existentes.
- Cambiar el agente o su versión crea un chat nuevo.
- Los chats anteriores conservan `agentId`, `agentName` y `agentVersion`.

## Carpeta de proyecto

```text
Projects/Project A/
├── Project Manifest.json
├── Project Control
├── Sources/
├── Templates/
├── Flows/
├── Generated Documents/
├── Conversation Data/
└── PDF Exports/
```

Los proyectos heredados de la v1.6.0 se mueven una sola vez desde la raíz a `Projects` y se asocian con `General Project Assistant 1.0.0`. Sus chats, fuentes, plantillas, flows y documentos se conservan.

## Aislamiento de recuperación

Cada usuario y llave API mantiene almacenes independientes:

```text
Agent {agentId} {version}  -> File Search Store del agente
Project {projectId}       -> File Search Store del proyecto
```

Una consulta puede incluir únicamente:

1. el store de la versión de agente cargada;
2. el store del proyecto actual;
3. fuentes locales de esos mismos dos ámbitos que aún no estén indexadas.

Las fuentes obligatorias del agente siempre se agregan en el servidor aunque el navegador no las envíe. Las opcionales se incluyen solo cuando el usuario las selecciona.

Cada documento remoto contiene `source_id`, `drive_id`, `scope_type` y, para conocimiento del agente, `agent_id` y `agent_version`. File Search recibe un filtro no vacío con los IDs autorizados. Las citas se validan antes de guardar la respuesta; una cita externa bloquea la respuesta completa.

Los IDs de fuente de agente se representan en conversaciones como `agent-source:{id}` y las fuentes del proyecto como `source:{id}`. El historial de otra selección o versión no entra en la solicitud.

## Contexto de ejecución

La solicitud combina, en este orden:

1. identidad y versión del agente;
2. instrucciones publicadas;
3. políticas del agente;
4. requisitos de salida;
5. descripción del proyecto;
6. historial permitido para la selección actual;
7. conocimiento recuperado del agente;
8. fuentes recuperadas del proyecto;
9. workflows heredados del agente y flows particulares del proyecto;
10. mensaje del usuario.

Las plantillas y workflows del agente aparecen dentro del proyecto como recursos heredados de solo lectura. Las personalizaciones del proyecto permanecen editables.

## Carga y caché

- El bootstrap entrega catálogos ligeros de Agents y Projects.
- La portada muestra dos rutas y no abre automáticamente un proyecto.
- Al abrir un proyecto, el encabezado y el agente aparecen primero.
- Chats y Documents cargan en paralelo.
- Templates y Flows cargan bajo demanda.
- Members carga al abrir Share.
- Los catálogos y localizadores usan `CacheService` durante tres minutos.

## Sistema visual

- Agents y Projects usan un componente conceptual común de tarjeta de entidad.
- Agent Knowledge, Project Sources y Generated Documents usan una tarjeta documental compacta con una insignia de origen.
- El color de formato se deriva de MIME y extensión; el origen no reemplaza el color del formato.
- El logo se carga como miniatura de Drive y nunca se guarda como base64 en manifiestos o catálogos.

## Seguridad

- Dominio, administrador y carpeta principal: `ScriptProperties`.
- Llave, modelo, stores, estados de indexación, favoritos y plantilla seleccionada: `UserProperties`.
- Permisos: manifiesto del proyecto más permisos reales de Drive.
- Los secretos y embeddings nunca se escriben dentro de una carpeta de agente.
- La app debe desplegarse como el usuario que accede.
- Un agente asignado que falta o cuya versión no existe produce un error; nunca se sustituye silenciosamente por otro agente.
