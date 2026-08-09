# Gemini Project Agent para Google Apps Script

Aplicación web modular para crear agentes por proyecto, conversar con Gemini usando una llave distinta por usuario, recuperar fuentes específicas y conservar todos los artefactos en Google Drive.

## Funciones incluidas

- Dashboard con búsqueda, estados, favoritos y tarjetas de proyecto.
- Creación y descubrimiento automático de proyectos dentro de una carpeta raíz.
- Detección de carpetas copiadas con regeneración de `projectId` duplicados.
- Chat con historial completo en JSON, memoria acumulativa y mensajes recientes.
- Fuentes desde archivos o carpetas de Drive y carga directa de archivos de hasta 6 MB.
- Lectura nativa de Google Docs, Sheets, Slides, TXT, Markdown, CSV, JSON y XML.
- Envío de PDF, imágenes y otros archivos binarios compatibles directamente a Gemini, dentro de los límites configurados.
- Recuperación léxica por fragmentos para enviar a Gemini únicamente contenido relevante.
- Citas de fuentes con etiquetas `[S1]`, `[S2]`, etc.
- Exportación del historial a PDF.
- Guardado de respuestas como Google Docs.
- Compartición con usuarios del mismo dominio en cuatro modalidades:
  - Proyecto completo.
  - Fuentes y documentos.
  - Solo historial.
  - Personalizado.
- Roles Owner, Editor, Colaborador y Lector.
- Llave y modelo de Gemini configurados por usuario.
- Interfaz responsiva inspirada en Drive y Gemini.

## Estructura de Drive

```text
Agent Projects/
├── _System/
├── Proyecto A/
│   ├── Project Manifest.json
│   ├── Project Control              (Google Sheets)
│   ├── Sources/
│   │   └── Sources Index.json
│   ├── Generated Documents/
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
5. Conversations
6. Documents
7. Document Versions
8. Members
9. Share Policies
10. Links
11. Change Log

## Archivos de código

| Archivo | Responsabilidad |
|---|---|
| `App.gs` | Entrada web y datos iniciales |
| `ConfigService.gs` | Configuración global y llave/modelo por usuario |
| `SecurityService.gs` | Dominio, roles, alcances y validaciones |
| `ProjectService.gs` | Proyectos, manifiestos, registro y descubrimiento |
| `DriveService.gs` | Operaciones reutilizables con Drive |
| `SourceService.gs` | Importación, extracción y recuperación de fuentes |
| `GeminiService.gs` | Modelos y llamadas REST a Gemini |
| `ConversationService.gs` | Conversaciones, contexto y memoria acumulativa |
| `DocumentService.gs` | Documentos generados |
| `PdfService.gs` | Exportación de conversaciones |
| `SharingService.gs` | Permisos selectivos y miembros |
| `Utils.gs` | Utilidades comunes |
| `Index.html` | Composición principal de la interfaz |
| `Styles.html` | Sistema visual |
| `DashboardView.html` | Dashboard |
| `ProjectView.html` | Proyecto, chat, fuentes y documentos |
| `SettingsView.html` | Modales y configuración |
| `AppScripts.html` | Lógica del navegador |

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
6. Cada usuario abre Configuración y guarda su propia llave de Gemini.

## Cómo funciona la memoria

La conversación completa siempre se conserva en el archivo JSON del proyecto. Para cada consulta, el agente envía:

- instrucciones y descripción permanentes del proyecto;
- memoria acumulativa de los mensajes antiguos;
- los 24 mensajes recientes completos;
- fragmentos relevantes de las fuentes activas;
- el mensaje nuevo.

Cada ocho mensajes que quedan fuera de la ventana reciente, Gemini consolida la memoria. Si esa consolidación falla, la respuesta y el historial se guardan de todas maneras.

## Compartición y permisos

El registro de proyectos se conserva en propiedades del script para que un usuario pueda ver en el dashboard un proyecto compartido sin necesidad de acceder a la carpeta raíz completa.

- **Proyecto completo:** se comparte la carpeta del proyecto.
- **Fuentes y documentos:** solo se comparten `Sources` y `Generated Documents`.
- **Solo historial:** se comparten `Conversation Data` y `PDF Exports`.
- **Personalizado:** se comparten únicamente las subcarpetas seleccionadas.

La app vuelve a validar el rol y el alcance en el servidor; ocultar un botón en la interfaz no es el control de seguridad principal.

## Seguridad

- La llave de Gemini se guarda con `PropertiesService.getUserProperties()` y nunca se inserta en HTML.
- La app debe ejecutarse como el usuario que accede para aislar las llaves y respetar permisos reales de Drive.
- El dominio se verifica en cada operación de servidor.
- No se transmiten tokens OAuth de Google al navegador ni a Gemini.
- Al retirar una fuente, su copia se mueve a la papelera de Drive y puede recuperarse.

## Límites prácticos

- La carga directa desde el navegador está limitada a 6 MB; para archivos mayores se debe usar “Desde Drive”.
- Los archivos binarios enviados a Gemini se limitan a 8 MB por archivo y 12 MB por consulta en esta implementación.
- Una carpeta importada copia como máximo 50 archivos por operación.
- El contexto de texto recuperado se limita a 90,000 caracteres por consulta.
- Apps Script y Gemini aplican sus propias cuotas de ejecución, almacenamiento y solicitudes.
- Las cuentas deben poder obtener una dirección de correo mediante `Session.getActiveUser().getEmail()`, normalmente disponible dentro del mismo dominio de Google Workspace.

Todos estos límites se concentran en `ConfigService.gs` para poder ajustarlos.

## Modelo de Gemini

El valor inicial es `gemini-3.6-flash`. Al guardar la llave, la app consulta los modelos disponibles mediante la API; si el modelo solicitado no está habilitado para esa llave, selecciona automáticamente el primer modelo Flash compatible con `generateContent`.

## Versión

`1.0.0` — paquete funcional completo.
