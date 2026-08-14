# Agent Console para Google Apps Script

Versión de revisión 2.0.0-review.5.

Consola web para construir agentes autocontenidos y versionados, y cargarlos dentro de proyectos que conservan su propio contexto, historial y entregables.

## Qué cambia en 2.0.0-review.5

- Corrige la desaparición temporal de knowledge heredado: toda actualización del grafo vuelve a solicitar el panel completo, no solo los documentos propios del proyecto.
- El borrador del agente permite decidir si las fuentes mandatorias publicadas se muestran en Projects. Aunque estén ocultas, siguen autorizadas y se indexan en segundo plano.
- Agentes, proyectos y documentos pueden reordenarse mediante drag-and-drop; el orden es personal, persistente y los documentos solo se mueven dentro de su nivel.
- Cada barra de nivel funciona como encabezado visual y control para colapsar o expandir sus tarjetas; deja de ser sticky para no cubrir documentos durante el desplazamiento.
- Las pestañas Chats, Documents, Templates y Flows, los controles de panel, el selector de agente, Open in Drive y Settings comparten una jerarquía visual más consistente.
- El selector de modelo se trasladó al compositor. La consola consulta `/v1beta/models` con la API key del usuario y distingue una lista verificada de un valor de respaldo no verificado.
- Cada mensaje nuevo conserva el modelo y una instantánea descriptiva de las fuentes adjuntas. El botón ℹ️ permite consultarlos sin recargar de metadatos la conversación.
- Scrollbars más discretos, sin botones inferiores cortados y con margen de seguridad al final de cada panel.

## Base conservada de 2.0.0-review.4

- El proyecto referencia la copia inmutable de las fuentes del release del agente; no las duplica dentro de `Project Sources`.
- El índice del conocimiento del agente se conserva por usuario, llave y versión, y se reutiliza entre todos los proyectos que cargan esa misma versión.
- Al abrir un proyecto se inicia o continúa automáticamente la indexación de conocimiento heredado, primero las fuentes obligatorias y después las opcionales.
- Una fuente binaria que todavía se indexa ya no bloquea una consulta combinada. Gemini responde con la evidencia disponible y el mensaje registra una advertencia de disponibilidad.
- Los encabezados de Documents, chat y visor comparten una altura única de 68 px.
- El encabezado del chat queda limitado al selector de modelo, identidad del agente y control de colapso; edición y borrado permanecen junto a cada mensaje o chat correspondiente.
- Los controles de colapso usan flechas direccionales y el contador de contexto se trasladó junto a las tarjetas sobre el compositor.
- Las tarjetas de contexto usan el color semántico del formato: PDF rojo, documentos azul, hojas verde, presentaciones naranja y demás tipos según su familia.
- Regresar a la portada usa la misma animación sutil aplicada al resto de las transiciones de vista.

## Base conservada de 2.0.0-review.3

- Los tres paneles conservan anchos mínimos, pero los grips ya no usan máximos fijos: se adaptan al ancho disponible.
- El chat puede colapsarse desde su encabezado o desde el panel izquierdo. Documents ocupa todo el workspace cuando no hay preview, y comparte el espacio con el visor cuando sí lo hay.
- Cada mensaje del usuario ofrece ✏️ para ramificar y 🗑️ para rebobinar desde ese punto. El borrado elimina el tramo posterior y las ramas derivadas, sin borrar documentos generados.
- Eliminar un chat completo elimina también sus descendientes para no dejar ramas huérfanas.
- Las fuentes de Drive se registran antes de indexarse; la indexación continúa en segundo plano con hasta dos trabajos concurrentes.
- Las cargas locales usan bloques de 8 MB y File Search avanza hasta tres bloques de 8 MB por llamada, reduciendo viajes entre navegador, Apps Script y Gemini.
- Cada tarjeta muestra progreso lineal: porcentaje durante Drive/File Search y animación indeterminada durante embeddings.
- Las fuentes en cola, transferencia o procesamiento se reanudan o verifican automáticamente al abrir el proyecto.

## Base conservada de 2.0.0-review.2

- Jerarquía unificada para todos los formatos: Project Sources es la raíz; un archivo generado queda en `max(level de parents) + 1` y, sin parents, comienza en Nivel 1.
- Visor con animación de entrada/salida y grip persistente para distribuir el ancho entre chat y preview.
- Exportación del documento visible a PDF con dos destinos: como documento generado del proyecto o en otra carpeta de Drive sin incorporarlo al grafo.
- Controles por mensaje para ramificar una petición o rebobinar la conversación desde ese punto.
- Acciones de copia, edición, exportación y eliminación con emojis coloridos.
- Menús documentales elevados sobre las tarjetas y apertura automática hacia arriba cuando falta espacio inferior.

## Base funcional conservada de 2.0.0-review.1

- Los entregables del agente pueden regresar mediante un contrato JSON de artefacto y guardarse como archivos Markdown sin insertar su contenido en el chat.
- `Accept Canvas` guarda una instantánea de `Project Approval Canvas.md` como Nivel 1 y ofrece dos rutas: `Executive Decision Brief` o `Stakeholder Pitch Kit`.
- Los artefactos de Nivel 2 se vinculan al Canvas aceptado mediante `parentIds`; el grafo calcula el nivel en forma recursiva.
- Visor lateral colapsable para Markdown, HTML seguro, texto y vistas de Drive. La selección para contexto permanece independiente de la apertura del visor.
- Selector de modelo Gemini por conversación; cada envío conserva el modelo elegido en el historial.
- Ramificación desde mensajes del usuario: se copia el historial anterior, se modifica la petición y se continúa en un chat nuevo.
- Copia de respuestas con icono más claro y copia independiente de bloques de código.
- La generación de imágenes y la ejecución de código permanecen fuera de este incremento; se documentan como extensiones posteriores.

## Base visual conservada de 1.9.0

- Vista interior del proyecto reconstruida con el mismo sistema visual de Agents y Projects.
- Encabezado tipo hero con identidad cromática, icono, estado, descripción y agente cargado.
- Panel de herramientas y chat convertidos en superficies elevadas independientes, con mejor uso del espacio.
- Pestañas segmentadas con iconos y estados activos derivados del color del proyecto.
- Lista de conversaciones mediante tarjetas compactas, con franja de selección, elevación y acciones contextuales.
- Barra contextual del chat con conversación, agente y versión; el resumen de selección vive junto al compositor.
- Estado vacío renovado con identidad del agente y sugerencias de consulta más informativas.
- Mensajes, citas, compositor y controles de envío alineados con la identidad visual del proyecto.
- Título del chat y contador de contexto sincronizados en tiempo real con el estado funcional.
- Diseño adaptable del nuevo workspace para paneles estrechos y pantallas móviles.

## Base conservada de 1.8.1

- Encabezados de Agents y Projects basados en la misma familia visual, con identidad de ruta, gradiente propio, búsqueda y acciones consistentes.
- Filtros de Projects trasladados a una banda independiente para mejorar jerarquía, espacio y adaptación móvil.
- Tarjetas de proyecto y agente con el mismo recorte, radio, franja interna, elevación y animación.
- Corrección del desbordamiento de la franja superior en proyectos: la tarjeta solo permite `overflow` mientras su menú contextual está abierto.
- Tarjetas de recursos más coloridas mediante fondo, borde, franja lateral, halo, icono sólido y etiqueta de formato derivados del tipo de archivo.
- Identidad cromática preservada en conocimiento del agente, fuentes originales y documentos generados, sin perder sus etiquetas de origen e indexación.

### Base conservada de 1.8.0

- Sistema de tarjetas unificado para agentes y proyectos: misma jerarquía, proporciones, acento, métricas, estados y pie contextual.
- Catálogo de Projects rediseñado con el mismo nivel visual que Agents.
- Tarjetas de fuentes y documentos más compactas, con nombre, metadatos, origen, indexación y relaciones en una estructura horizontal.
- Colores por formato: PDF rojo; Sheets, Excel y CSV verde; Markdown amarillo-naranja; Docs y Word azul; Slides y PowerPoint naranja; imágenes violeta; JSON teal; archivos comprimidos y genéricos neutros.
- Identificación visible de conocimiento del agente, fuentes originales del proyecto y documentos generados.
- Icono o símbolo y color editables para cada agente desde Agent Builder.
- Logo opcional importado desde Drive, copiado dentro de `Assets` y conservado mediante una ruta lógica portable.
- Cada release publicado captura su propia identidad visual y copia del logo.
- `Agent Manifest` y `Release Manifest` schema 2, con migración automática y compatible desde schema 1.

### Base funcional de 1.7.0

- Portada con dos rutas: **Agents** para construir y **Projects** para usar.
- Raíz de Drive separada en `Agents`, `Projects` y `_System`.
- Migración automática de proyectos v1.6.0 sin perder chats ni fuentes.
- `General Project Assistant 1.0.0` para proyectos heredados.
- Un agente principal por proyecto, fijado a una versión publicada.
- Agentes portables mediante una carpeta autocontenida.
- Borrador editable y releases inmutables con versionado semántico.
- Conocimiento obligatorio y opcional aislado por agente.
- File Search Store separado por agente-versión y por proyecto.
- Consultas multi-store limitadas al agente cargado y al proyecto actual.
- Citas validadas contra los `source_id` autorizados.
- Cambio explícito de agente o versión con creación de un chat nuevo.
- Historial etiquetado con agente y versión.
- Workflows y plantillas heredados del agente como recursos de solo lectura.
- Estilo visual con gradientes funcionales, botones con estados activos y colores inspirados en Docs Assistant v0.4.0.

## Estructura de Drive

```text
Agent Console/
├── Agents/
│   ├── General Project Assistant/
│   └── Technical Governance Agent/
│       ├── Agent Manifest.json
│       ├── Instructions/
│       ├── Knowledge/
│       │   ├── Mandatory Sources/
│       │   └── Optional Sources/
│       ├── Workflows/
│       ├── Templates/
│       ├── Output Formats/
│       ├── Policies/
│       ├── Examples/
│       ├── Evaluations/
│       ├── Assets/
│       ├── Releases/
│       └── _Runtime/
├── Projects/
│   └── Project A/
│       ├── Project Manifest.json
│       ├── Project Control
│       ├── Sources/
│       ├── Templates/
│       ├── Flows/
│       ├── Generated Documents/
│       ├── Conversation Data/
│       └── PDF Exports/
└── _System/
```

## Ciclo de vida del agente

1. **Create:** genera la estructura completa del borrador.
2. **Edit:** modifica identidad, instrucciones y recursos.
3. **Publish:** copia todas las secciones a `Releases/{version}`.
4. **Assign:** un proyecto selecciona `agentId + agentVersion`.
5. **Run:** el chat recibe instrucciones y recursos de esa versión.
6. **Update:** una versión posterior no modifica proyectos existentes.
7. **Change:** el proyecto puede cargar otra versión y crear un chat separado.

Copiar una carpeta de agente no copia embeddings ni secretos. **Scan agents** reconstruye referencias por rutas lógicas y el índice se crea nuevamente con la llave del usuario.

## Aislamiento del conocimiento

La app nunca busca en un catálogo global de fuentes. Para una consulta se autorizan únicamente:

- fuentes obligatorias de la versión cargada;
- fuentes opcionales seleccionadas de esa misma versión;
- fuentes y documentos seleccionados del proyecto actual.

File Search recibe solo los dos stores correspondientes. El `metadata_filter` es obligatorio y las citas se validan antes de guardar la respuesta. Si un chat pertenece a otra versión del agente, el servidor exige iniciar uno nuevo.

## Funciones conservadas de 1.6.0

- Dashboard de proyectos con búsqueda, filtros, favoritos, clonación y papelera.
- Chat con historial JSON, memoria acumulativa y selección documental.
- Fuentes de Drive y cargas reanudables de hasta 100 MB.
- File Search con estados, progreso, diagnóstico, reintento y limpieza de huérfanos.
- PDF, Docs, Sheets, Slides, TXT, Markdown, CSV, JSON y XML.
- Templates de Google Workspace y generación de reportes.
- Flows Markdown seleccionables.
- Exportación PDF por conversación.
- Compartición por dominio con roles y alcances.
- Carga progresiva: shell inmediato, Chats/Documents en paralelo y paneles diferidos.
- Grafo documental con niveles, relaciones, notas y selección por conversación.
- API key y modelo por usuario.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `AgentService.gs` | Estructura, catálogo, portabilidad, edición, releases y ejecución de agentes |
| `ProjectService.gs` | Proyectos, migración, asociación de agente y carga progresiva |
| `ConversationService.gs` | Historial, aislamiento por selección y versión, contexto del agente |
| `FileSearchService.gs` | Stores aislados, indexación, consultas multi-store y citas |
| `SourceService.gs` | Fuentes del proyecto y fallback local |
| `TemplateService.gs` | Templates del proyecto y heredados del agente |
| `FlowService.gs` | Flows del proyecto y workflows heredados |
| `DocumentService.gs` | Grafo de documentos y metadatos |
| `ConfigService.gs` | Configuración de consola, usuario y límites |
| `DriveService.gs` | Copia recursiva y operaciones Drive |
| `SecurityService.gs` | Dominio, roles y alcances |
| `SharingService.gs` | Miembros y permisos |
| `GeminiService.gs` | API de Gemini |
| `PdfService.gs` | Exportación PDF |
| `Utils.gs` | Utilidades comunes |
| `ConsoleView.html` | Portada, catálogo y editor de agentes |
| `DashboardView.html` | Catálogo de proyectos |
| `ProjectView.html` | Chat y paneles del proyecto |
| `SettingsView.html` | Settings y modales |
| `AppScripts.html` | Control del navegador |
| `Styles.html` | Sistema visual responsivo |

## Instalación

Consulta [SETUP.md](SETUP.md). El despliegue debe ejecutarse como **usuario que accede** y limitarse al dominio.

## Límites

- 100 MB por fuente de conocimiento o del proyecto.
- Bloques de 8 MB hacia Drive y File Search; hasta tres bloques de File Search por llamada.
- Dos fuentes nuevas por ámbito y por ejecución de **Sync index**; la cola del navegador trabaja con hasta dos fuentes simultáneas.
- 50 archivos por importación de carpeta.
- 90,000 caracteres de contexto local de fuentes.
- 120,000 caracteres de workflows.
- 24 mensajes recientes completos antes de usar memoria resumida.
- Apps Script y Gemini mantienen sus cuotas propias.

Los límites se concentran en `ConfigService.gs`.

## Seguridad

- Las llaves se guardan en `UserProperties` y nunca dentro de agentes o proyectos.
- Los stores y estados de indexación también están aislados por usuario.
- Drive es la fuente de verdad; File Search es una copia derivada reconstruible.
- Un agente o release faltante bloquea la apertura; nunca se sustituye silenciosamente.
- Las acciones de servidor vuelven a validar dominio, proyecto, rol y alcance.
- La eliminación normal usa la papelera de Drive.

## Versión

`2.0.0-review.5` — estabiliza el conocimiento heredado, agrega orden y colapso persistentes, registra contexto por mensaje y valida los modelos contra la llave asignada.

`2.0.0-review.3` — agrega layout de tres paneles adaptable, colapso del chat, borrado desde mensajes con poda de ramas e indexación no bloqueante con progreso por tarjeta.

`2.0.0-review.2` — generaliza niveles por parents, agrega grip y animación al visor, exportación PDF con destino, controles de chat visibles y corrige menús documentales.

`2.0.0-review.1` — agrega artefactos Markdown silenciosos, niveles documentales, visor lateral, rutas de aprobación, ramas y modelo por chat.

`1.9.0` — renueva por completo la vista interior de proyectos: encabezado, navegación, panel lateral, chat, mensajes, estado vacío y compositor.

`1.8.1` — renueva el encabezado de Projects, corrige el desbordamiento de tarjetas y refuerza el color semántico de todos los recursos.

`1.8.0` — estandariza tarjetas, compacta fuentes y documentos, agrega colores por formato e identidad de agente mediante icono/logo y color portable.

`1.7.0` — introduce Agent Console, agentes autocontenidos y portables, releases inmutables, raíz Agents/Projects, asociación agente-versión por proyecto y stores aislados.

`1.6.0` — corrige eliminación incompleta y contaminación entre fuentes; agrega aislamiento por selección/citas, limpieza de huérfanos, caché y carga progresiva.
