# Gemini Project Agent para Google Apps Script

Aplicación web modular para crear agentes por proyecto, conversar con Gemini usando una llave distinta por usuario, recuperar fuentes específicas y conservar todos los artefactos en Google Drive.

## Funciones incluidas

- Dashboard inicial sin barra lateral, con búsqueda, filtros Ongoing/Favorites/Planning/Archived y creación de proyectos sobre la cuadrícula.
- Tarjetas con emoji, color configurable, estadísticas y menú contextual para clonar o mover proyectos a la papelera.
- Creación y descubrimiento automático de proyectos dentro de una carpeta raíz.
- Detección de carpetas copiadas con regeneración de `projectId` duplicados.
- Drive como única fuente de verdad de proyectos: no se conserva un registro `PROJECT_*` en propiedades del script.
- La carpeta raíz se restaura si entra en la papelera y se reconstruye si se elimina definitivamente; puede moverse libremente en Drive porque se identifica por ID.
- Una carpeta de proyecto movida fuera de la raíz o enviada a la papelera desaparece del dashboard en la siguiente carga.
- Chat con historial completo en JSON, memoria acumulativa y mensajes recientes.
- Fuentes desde archivos o carpetas de Drive y carga directa reanudable de hasta 100 MB.
- Lectura nativa de Google Docs, Sheets, Slides, TXT, Markdown, CSV, JSON y XML.
- File Search persistente por proyecto y por llave de usuario: cada fuente se fragmenta e indexa una vez y las consultas recuperan semánticamente solo el contenido pertinente.
- Perfil de indexación documental `gemini-embedding-001`: los PDF usan la fragmentación nativa de File Search y los archivos textuales conservan fragmentos de 200 tokens con 20 de superposición. Los almacenes heredados con perfil multimodal se migran en un reintento limpio.
- Libros y archivos de hasta 100 MB, tanto desde Drive como desde la computadora: el navegador carga a Drive en bloques de 2 MB y File Search recibe bloques de 8 MB entre ejecuciones.
- Estados visibles `Queued`, `Uploading`, `Indexing`, `Indexed`, `Status unknown` e `Index failed`, con diagnóstico remoto, etapa, hora, progreso, error exacto y reintento.
- El diagnóstico reconcilia la operación de larga duración con los documentos reales de la fuente, distingue sus intentos de los contadores globales, detecta operaciones huérfanas y elimina intentos fallidos antes de reintentar.
- Citas con archivo y página cuando Gemini devuelve ese dato.
- Aislamiento estricto por selección: cada consulta usa un filtro obligatorio de `source_id`, excluye del historial la memoria asociada con otras fuentes y bloquea respuestas que citen un documento no seleccionado.
- Eliminación completa de fuentes: la tarjeta desaparece de Drive/UI, se purgan todos sus documentos de File Search y una reconciliación en segundo plano retira índices huérfanos heredados.
- Pestaña Templates para importar Google Docs, Sheets o Slides como formatos de salida sin modificar la plantilla original.
- Generación de reportes desde cualquier tarjeta documental, con formato estándar o la plantilla seleccionada.
- Pestaña Flows para importar o subir instrucciones `.md` seleccionables por conversación y reporte.
- Exportación PDF disponible en cada tarjeta de conversación del historial.
- Compartición con usuarios del mismo dominio en cuatro modalidades:
  - Proyecto completo.
  - Fuentes y documentos.
  - Solo historial.
  - Personalizado.
- Roles Owner, Editor, Colaborador y Lector.
- Llave y modelo de Gemini configurados por usuario; la llave vuelve a aparecer en el campo protegido de Settings al recargar.
- Versión instalada visible junto al título de Settings.
- Interfaz responsiva completamente en inglés, basada en superficies de Material 3, densidad de shadcn/ui y patrones de Google Workspace.
- Vista de proyecto con encabezado compacto, Share en la parte superior y panel izquierdo Chats/Documents/Templates/Flows redimensionable.
- Apertura progresiva del proyecto: encabezado inmediato, Chats y Documents en paralelo, Templates/Flows bajo demanda, miembros al abrir Share y spinners independientes sin textos `Loading`.
- Caché transitoria de ubicación de proyectos y catálogo ligero; el arranque normal ya no repara índices, recorre documentos ni sincroniza `Project Control`.
- Emojis y colores de proyecto editables únicamente dentro del workspace del proyecto.
- Grafo de documentos por niveles: fuentes iniciales en Level 0 y documentos derivados en los niveles posteriores.
- Selección individual o por nivel de los documentos que Gemini puede utilizar en cada chat.
- Relaciones parent/child visibles mediante resaltado al pasar el mouse, enfocar o seleccionar una tarjeta.
- Notas o descripciones editables para fuentes, documentos generados y PDF; se muestran en la tarjeta y enriquecen el contexto del agente.
- Eliminación recuperable de chats, fuentes y documentos mediante Drive trash y diálogos de advertencia.
- Chat inspirado en Gemini con compositor tonal, respuestas sin burbuja, sugerencias iniciales y estados de carga con degradado suave.
- Vista de proyecto sin la barra lateral del dashboard y con desplazamiento principal dentro de la conversación.
- Indicador de análisis, control para detener la respuesta y escritura progresiva del contenido recibido.
- Animaciones de carga en acciones de larga duración.

## Estructura de Drive

```text
Agent Projects/
├── _System/
├── Proyecto A/
│   ├── Project Manifest.json
│   ├── Project Control              (Google Sheets)
│   ├── Sources/
│   │   └── Sources Index.json
│   ├── Templates/
│   │   └── Templates Index.json
│   ├── Flows/
│   │   └── Flows Index.json
│   ├── Generated Documents/
│   │   └── Documents Index.json
│   ├── Conversation Data/
│   │   ├── Conversations Index.json
│   │   └── Conversation - {id}.json
│   └── PDF Exports/
└── Proyecto B/
```

`Project Control` incluye las pestañas:

1. Project Information
2. Project Attribute History
3. Assignments
4. Sources
5. Templates
6. Flows
7. Conversations
8. Documents
9. Document Versions
10. Members
11. Share Policies
12. Links
13. Change Log

## Archivos de código

| Archivo | Responsabilidad |
|---|---|
| `App.gs` | Entrada web y datos iniciales |
| `ConfigService.gs` | Configuración global y llave/modelo por usuario |
| `SecurityService.gs` | Dominio, roles, alcances y validaciones |
| `ProjectService.gs` | Proyectos, manifiestos y descubrimiento directo desde Drive |
| `DriveService.gs` | Operaciones reutilizables con Drive |
| `SourceService.gs` | Importación, extracción y recuperación de fuentes |
| `FileSearchService.gs` | Almacenes, carga reanudable, indexación, recuperación semántica y citas |
| `TemplateService.gs` | Biblioteca de formatos y generación de reportes |
| `FlowService.gs` | Procedimientos Markdown seleccionables |
| `GeminiService.gs` | Modelos y llamadas REST a Gemini |
| `ConversationService.gs` | Conversaciones, contexto y memoria acumulativa |
| `DocumentService.gs` | Grafo, metadatos, relaciones y eliminación de documentos generados |
| `PdfService.gs` | Exportación de conversaciones |
| `SharingService.gs` | Permisos selectivos y miembros |
| `Utils.gs` | Utilidades comunes |
| `Index.html` | Composición principal de la interfaz |
| `Styles.html` | Sistema visual |
| `DashboardView.html` | Dashboard |
| `ProjectView.html` | Proyecto, chat, fuentes y documentos |
| `SettingsView.html` | Modales y configuración |
| `AppScripts.html` | Lógica del navegador |

## Referencias de diseño

- Material 3: roles semánticos de color, superficies tonales, forma y movimiento.
- Google Drive/Workspace: navegación contextual, acciones superiores y densidad de información.
- NotebookLM: workspace adaptable con paneles de contenido, chat y Share en el encabezado.
- Gemini: superficie conversacional, compositor, respuesta sin burbuja y estados de procesamiento.
- shadcn/ui: tarjetas compactas, panel redimensionable, menús y diálogos destructivos.

La implementación usa HTML, CSS y JavaScript nativos para conservar compatibilidad con HtmlService; no incorpora React ni copia componentes o assets propietarios.

## Instalación

Consulta [SETUP.md](SETUP.md) para la instalación manual o con `clasp`.

Resumen:

1. Crea un proyecto independiente de Google Apps Script.
2. Copia cada archivo `.gs` y `.html` respetando su nombre y tipo.
3. Reemplaza el manifiesto por `appsscript.json`.
4. Despliega como aplicación web:
   - Ejecutar como: **usuario que accede a la aplicación**.
   - Quién tiene acceso: **usuarios del dominio**.
5. El primer usuario configura el dominio y la carpeta raíz.
6. Cada usuario abre Configuración y guarda su propia llave de Gemini; el administrador también puede cambiar allí la carpeta raíz.

## Cómo funciona la memoria

La conversación completa siempre se conserva en el archivo JSON del proyecto. En una consulta general, el agente envía:

- instrucciones y descripción permanentes del proyecto;
- memoria acumulativa de los mensajes antiguos;
- los 24 mensajes recientes completos;
- resultados semánticos de File Search para fuentes indexadas y fragmentos locales para documentos generados;
- los Flows seleccionados como instrucciones de procedimiento, separados de la evidencia;
- el mensaje nuevo.

Cada ocho mensajes que quedan fuera de la ventana reciente, Gemini consolida la memoria. Si esa consolidación falla, la respuesta y el historial se guardan de todas maneras.

Cuando hay documentos seleccionados, la consulta cambia a modo aislado: no se envía la memoria acumulada y solo se conservan intercambios anteriores cuya selección o citas pertenecen a los documentos autorizados actualmente. File Search recibe siempre un `metadata_filter` no vacío. Las citas se validan contra esa misma lista antes de guardar la respuesta; una cita externa bloquea la respuesta completa.

## Templates y reportes

Las plantillas pueden contener estos marcadores:

- `{{PROJECT_TITLE}}`
- `{{REPORT_TITLE}}`
- `{{GENERATED_DATE}}`
- `{{CONTENT}}`

La app crea una copia dentro de `Generated Documents` y reemplaza los marcadores. Si `{{CONTENT}}` no existe, agrega el reporte al final del Google Doc, en una hoja `Generated Report` del Google Sheet o en una diapositiva nueva del Google Slides.

## Flows

Cada Flow es un archivo `.md` con instrucciones ordenadas. La selección se conserva por conversación en su JSON y se envía a Gemini como procedimiento, no como fuente factual. Las respuestas registran qué Flows se usaron.

## Compartición y permisos

El dashboard se reconstruye directamente desde las carpetas activas que son hijas de la raíz configurada. No existe un índice persistente alternativo que pueda conservar tarjetas huérfanas.

- **Proyecto completo:** se comparte la carpeta del proyecto.
- **Fuentes y documentos:** se comparten `Sources`, `Flows`, `Generated Documents` y `Templates`.
- **Solo historial:** se comparten `Conversation Data` y `PDF Exports`.
- **Personalizado:** se comparten únicamente las subcarpetas seleccionadas.

La app vuelve a validar el rol y el alcance en el servidor; ocultar un botón en la interfaz no es el control de seguridad principal.

## Seguridad

- La llave de Gemini se guarda con `PropertiesService.getUserProperties()` y solo se devuelve al navegador autenticado del mismo usuario para rellenar el campo `password` de Settings.
- El almacén File Search, sus estados y la plantilla predeterminada también se aíslan por usuario y proyecto; un colaborador con otra llave ejecuta **Sync index** para crear su índice propio.
- La app debe ejecutarse como el usuario que accede para aislar las llaves y respetar permisos reales de Drive.
- El dominio se verifica en cada operación de servidor.
- No se transmiten tokens OAuth de Google al navegador ni a Gemini.
- Al retirar una fuente, documento generado o chat, el archivo se mueve a la papelera de Drive y puede recuperarse.
- Al retirar una fuente, su estado local deja de ser elegible antes de llamar a Gemini. La app elimina todos los documentos remotos con su `source_id` o `drive_id` y vuelve a buscar huérfanos al cargar Documents.

## Límites prácticos

- Las fuentes cargadas desde el navegador admiten hasta 100 MB y se transmiten a Drive en bloques de 2 MB; ya no pasan completas como Base64 en una sola llamada.
- File Search acepta hasta 100 MB por documento y la app transmite cada fuente en bloques persistentes de 8 MB, de modo que un libro grande no depende de una sola ejecución de Apps Script.
- Los Flows Markdown conservan un límite independiente de 6 MB porque se usan como instrucciones y se truncan al presupuesto de contexto configurado.
- Los binarios no indexados que usan el fallback local conservan el límite de 8 MB por archivo y 12 MB por consulta.
- Cada acción **Sync index** procesa como máximo cinco fuentes; vuelve a ejecutarla cuando queden elementos en cola.
- Una carpeta importada copia como máximo 50 archivos por operación.
- El contexto de texto recuperado se limita a 90,000 caracteres por consulta.
- Apps Script y Gemini aplican sus propias cuotas de ejecución, almacenamiento y solicitudes.
- Apps Script no expone streaming desde `google.script.run`; la app muestra la respuesta de forma progresiva al recibirla. El control Stop usa una señal de cancelación y conserva el mensaje del usuario.
- Las cuentas deben poder obtener una dirección de correo mediante `Session.getActiveUser().getEmail()`, normalmente disponible dentro del mismo dominio de Google Workspace.

Todos estos límites se concentran en `ConfigService.gs` para poder ajustarlos.

## Modelo de Gemini

El valor inicial es `gemini-3.6-flash`. Al guardar la llave, la app consulta los modelos disponibles mediante la API; si el modelo solicitado no está habilitado para esa llave, selecciona automáticamente el primer modelo Flash compatible con `generateContent`.

## Versión

`1.6.0` — corrige la eliminación incompleta y la contaminación entre fuentes, aplica aislamiento estricto por selección/citas, limpia índices huérfanos y añade carga progresiva con caché de proyectos, paneles paralelos o diferidos y spinners independientes.

`1.5.4` — migra los almacenes documentales a `gemini-embedding-001`, usa fragmentación PDF nativa y muestra la versión instalada en Settings.

`1.5.3` — reconcilia operaciones de indexación con los documentos remotos reales y añade reintento limpio por fuente.

`1.5.2` — corrige la inicialización de File Search con fragmentos compatibles de 200 tokens y 20 tokens de superposición, y protege la solicitud para que nunca exceda el máximo de 512 tokens aceptado por la API.

`1.5.1` — carga local de fuentes de hasta 100 MB por bloques, transferencia de File Search reanudable entre ejecuciones, corrección del cuerpo de metadatos de indexación, diagnóstico verificable y eliminación del texto “No note added”.

`1.5.0` — RAG persistente con Gemini File Search, fuentes de hasta 100 MB desde Drive, citas por archivo/página, Templates de Google Workspace, Flows Markdown, más iconos y colores, importación reparada de Google Sheets y PDF por tarjeta de conversación.
