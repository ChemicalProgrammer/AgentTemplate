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
3. Descripción: `Version 1.1.0`.
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

La pantalla muestra después solo los cuatro últimos caracteres de la llave.

## Prueba inicial recomendada

1. Crea un proyecto de prueba.
2. Agrega un TXT pequeño como fuente.
3. Inicia una conversación y formula una pregunta cuya respuesta aparezca en el TXT.
4. Confirma que la respuesta cite `[S1]`.
5. Exporta la conversación a PDF.
6. Confirma que la tarjeta actualiza los conteos de chats, fuentes y documentos.
7. Comparte “Sources and documents” con otro usuario del dominio.
8. Confirma con esa cuenta que no aparece el historial.
9. Copia manualmente la carpeta del proyecto dentro de la raíz.
10. Pulsa **Refresh projects** y confirma que aparece como un proyecto independiente.

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

El registro de la app y los permisos reales de Drive deben coincidir. El owner puede volver a compartir el mismo usuario con el alcance correcto para reparar los permisos.

### Gemini rechaza la llave

Comprueba que la Gemini API esté habilitada para la llave y que el modelo elegido aparezca al usar **Load models**. La cuota pertenece a cada llave individual.

### Un PDF o imagen grande no se utiliza

La app omite archivos binarios mayores de 8 MB y limita el conjunto binario a 12 MB por consulta. Divide o comprime el documento, o conviértelo a Google Docs/TXT para usar recuperación por fragmentos.

### La copia de una carpeta no aparece

La carpeta debe estar directamente dentro de la raíz configurada. Pulsa **Refresh projects** con una cuenta que tenga acceso a esa raíz.
