# Agent Console para Google Apps Script

Versión 1.9.0.

Consola web para construir agentes autocontenidos y versionados, y cargarlos dentro de proyectos que conservan su propio contexto, historial y entregables.

## Qué cambia en 1.9.0

- Vista interior del proyecto reconstruida con el mismo sistema visual de Agents y Projects.
- Encabezado tipo hero con identidad cromática, icono, estado, descripción y agente cargado.
- Panel de herramientas y chat convertidos en superficies elevadas independientes, con mejor uso del espacio.
- Pestañas segmentadas con iconos y estados activos derivados del color del proyecto.
- Lista de conversaciones mediante tarjetas compactas, con franja de selección, elevación y acciones contextuales.
- Barra contextual del chat con conversación, agente, versión y cantidad de recursos seleccionados.
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
- Bloques de 2 MB hacia Drive y 8 MB hacia File Search.
- Cinco fuentes nuevas por ámbito y por ejecución de **Sync index**.
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

`1.9.0` — renueva por completo la vista interior de proyectos: encabezado, navegación, panel lateral, chat, mensajes, estado vacío y compositor.

`1.8.1` — renueva el encabezado de Projects, corrige el desbordamiento de tarjetas y refuerza el color semántico de todos los recursos.

`1.8.0` — estandariza tarjetas, compacta fuentes y documentos, agrega colores por formato e identidad de agente mediante icono/logo y color portable.

`1.7.0` — introduce Agent Console, agentes autocontenidos y portables, releases inmutables, raíz Agents/Projects, asociación agente-versión por proyecto y stores aislados.

`1.6.0` — corrige eliminación incompleta y contaminación entre fuentes; agrega aislamiento por selección/citas, limpieza de huérfanos, caché y carga progresiva.
