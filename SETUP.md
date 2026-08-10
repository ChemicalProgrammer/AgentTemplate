# Instalación y despliegue

## Opción A: instalación manual

Esta opción no requiere instalar software.

1. Abre [script.google.com](https://script.google.com) con la cuenta de Google Workspace que administrará la app.
2. Crea un **Proyecto nuevo** independiente y asígnale un nombre, por ejemplo `Gemini Project Agent`.
3. En el editor, crea un archivo de secuencia de comandos por cada archivo `.gs` del ZIP y pega su contenido.
4. Crea un archivo HTML por cada `.html` del ZIP y pega su contenido.
5. Abre **Configuración del proyecto** y activa **Mostrar el archivo de manifiesto `appsscript.json` en el editor**.
6. Reemplaza el contenido del manifiesto por el archivo incluido en este paquete.
7. Guarda todos los archivos.

## Opción B: instalación con clasp

Si ya tienes Node.js y `clasp`:

```bash
npm install -g @google/clasp
clasp login
clasp create --type standalone --title "Gemini Project Agent"
```

Copia el contenido de la carpeta del ZIP junto al archivo `.clasp.json` creado y ejecuta:

```bash
clasp push
clasp open
```

## Despliegue correcto

1. En Apps Script, selecciona **Implementar > Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Descripción: `Version 1.5.2`.
4. Ejecutar como: **Usuario que accede a la aplicación web**.
5. Quién tiene acceso: **Cualquier usuario del dominio** o la opción equivalente de tu organización.
6. Autoriza los permisos solicitados.
7. Abre la URL terminada en `/exec`.

No uses “Ejecutar como yo”. Esa modalidad impediría el aislamiento correcto de las llaves por usuario y alteraría el modelo de permisos selectivos de Drive.

## Primera configuración

La primera cuenta que abre la app se convierte en administradora.

1. Confirma el dominio de la organización.
2. Opcionalmente pega el ID o URL de una carpeta raíz existente.
3. Si dejas el campo vacío, la app crea `Agent Projects` en Mi unidad.
4. Comparte la carpeta raíz como Editor únicamente con quienes deban crear o copiar proyectos directamente en ella.

Los usuarios que solo reciban un proyecto selectivo no necesitan acceso a la carpeta raíz.

## Llave individual de Gemini

Cada usuario debe:

1. Obtener una llave en Google AI Studio o mediante el mecanismo aprobado por la organización.
2. Abrir el engrane de la app.
3. Pegar la llave y elegir el modelo.
4. Pulsa **Validate and save**.

La pantalla superior muestra solo los cuatro últimos caracteres. Al volver a abrir Settings, el campo protegido vuelve a contener la llave completa para el mismo usuario.

## Carpeta de proyectos

El administrador puede cambiar la ubicación desde **Settings > Project location** pegando el ID o URL de otra carpeta. La carpeta configurada puede moverse a otra ubicación de Drive sin volver a configurarla porque la app conserva su ID.

- Si la carpeta raíz entra en la papelera, la app la restaura cuando el administrador vuelve a abrirla.
- Si se elimina definitivamente, la app crea otra con el último nombre conocido.
- Si una carpeta de proyecto se mueve fuera de la raíz o entra en la papelera, deja de aparecer en el dashboard.

## Prueba inicial recomendada

1. Crea un proyecto de prueba.
2. Agrega un TXT pequeño como fuente.
3. Confirma que la tarjeta cambie a **Indexed**; si queda pendiente, pulsa **Sync index**.
4. Inicia una conversación y formula una pregunta cuya respuesta aparezca en el TXT.
5. Confirma que la respuesta muestre la fuente recuperada.
6. Exporta la conversación desde el botón PDF de su tarjeta en Chats.
7. Confirma que la tarjeta actualiza los conteos de chats, fuentes y documentos.
8. Comparte “Sources and documents” con otro usuario del dominio.
9. Confirma con esa cuenta que no aparece el historial.
10. Copia manualmente la carpeta del proyecto dentro de la raíz.
11. Pulsa **Refresh projects** y confirma que aparece como un proyecto independiente.
12. Cambia el emoji y color desde el encabezado del proyecto y confirma que se actualizan en el dashboard.
13. Abre **Documents**, ajusta el ancho del panel y verifica la selección individual y por nivel.
14. Exporta un chat a PDF y confirma que aparece como documento derivado con sus relaciones parent/child.
15. Elimina un chat de prueba y confirma el diálogo de advertencia y su presencia en la papelera de Drive.
16. Agrega una nota a una fuente y a un documento generado; confirma que aparece en sus tarjetas.
17. Clona el proyecto desde el menú de la tarjeta y confirma que la copia conserva chats, fuentes y documentos sin compartir permisos.
18. Mueve manualmente una carpeta de proyecto fuera de la raíz, pulsa **Refresh projects** y confirma que deja de aparecer en el dashboard.
19. Envía la carpeta raíz a la papelera, recarga como administrador y confirma que se restaura conservando el mismo ID.
20. Importa un Google Sheet mediante su enlace de Drive y confirma que se copia e indexa sin mostrar una notificación vacía.
21. Importa un Google Doc, Sheet o Slides en Templates, selecciónalo y genera un Report desde el menú de una tarjeta documental.
22. Sube un archivo `.md` en Flows, selecciónalo y confirma que aparece como procedimiento utilizado en la siguiente respuesta.

## Actualizaciones

Después de cambiar archivos de código:

1. Guarda o ejecuta `clasp push`.
2. Abre **Implementar > Administrar implementaciones**.
3. Edita la implementación.
4. Selecciona **Nueva versión**.
5. Implementa de nuevo conservando la misma URL.

## Solución de problemas

### La app no identifica el correo

Verifica que el despliegue esté restringido al dominio y se ejecute como el usuario que accede. Algunas políticas de Workspace pueden impedir que `Session.getActiveUser()` devuelva el correo.

### Un usuario ve el proyecto pero no puede abrir una sección

El manifiesto y los permisos reales de Drive deben coincidir. El owner puede volver a compartir el mismo usuario con el alcance correcto para reparar los permisos.

### Gemini rechaza la llave

Comprueba que la Gemini API esté habilitada para la llave y que el modelo elegido aparezca al usar **Load models**. La cuota pertenece a cada llave individual.

### Un PDF grande no se indexa

Importa el archivo mediante un enlace de Drive o cárgalo desde la computadora, confirma que no exceda 100 MB y usa **Sync index**. La acción procesa cinco fuentes por lote y continúa cada archivo en bloques persistentes. Pulsa directamente el estado de la tarjeta o **Check index status** para verificar Drive, la operación remota, la etapa y el mensaje exacto antes de reintentar.

### Un colaborador ve `Not indexed`

File Search pertenece al proyecto de API asociado con cada llave. El colaborador debe guardar su llave personal y ejecutar **Sync index** para crear su propio almacén semántico del proyecto.

### La copia de una carpeta no aparece

La carpeta debe estar directamente dentro de la raíz configurada. Pulsa **Refresh projects** con una cuenta que tenga acceso a esa raíz.
