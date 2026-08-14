# Instalación y despliegue

## Instalación manual

1. Abre `script.google.com` con la cuenta de Google Workspace administradora.
2. Crea un proyecto independiente llamado, por ejemplo, `Agent Console`.
3. Crea un archivo de secuencia de comandos por cada `.gs` del paquete.
4. Crea un archivo HTML por cada `.html`, incluido `ConsoleView.html`.
5. Activa la visualización de `appsscript.json` y reemplázalo por el manifiesto incluido.
6. Guarda todos los archivos.

## Instalación con clasp

```bash
npm install -g @google/clasp
clasp login
clasp create --type standalone --title "Agent Console"
clasp push
clasp open
```

## Despliegue

1. Selecciona **Implementar > Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Descripción: `Version 2.0.0-review.5`.
4. Ejecutar como: **Usuario que accede a la aplicación web**.
5. Acceso: usuarios del dominio de la organización.
6. Autoriza Drive, Docs, Sheets, Slides y conexiones externas.
7. Abre la URL `/exec`.

No uses “Ejecutar como yo”: rompería el aislamiento de llaves por usuario y cambiaría el modelo de permisos de Drive.

## Primera configuración o actualización desde 1.6.0

La primera cuenta se convierte en administradora.

1. Confirma el dominio.
2. Pega la carpeta raíz existente de v1.6.0 o deja vacío para crear `Agent Console`.
3. La consola crea `Agents`, `Projects` y `_System`.
4. Los proyectos existentes directamente bajo la raíz se mueven a `Projects`.
5. Se crea y publica `General Project Assistant 1.0.0`.
6. Los proyectos heredados se asocian automáticamente con ese agente.

La migración es idempotente y conserva IDs de proyecto, chats, fuentes y documentos.

## Llave individual de Gemini

Cada usuario abre Settings, guarda su llave y elige un modelo. Los stores del agente y del proyecto se crean por llave. Al abrir un proyecto, un colaborador nuevo inicia automáticamente sus propios índices; **Sync index** queda como acción manual de verificación o reparación.

## Prueba recomendada de 2.0.0-review.5

1. Confirma `Version 2.0.0-review.5` en Settings.
2. Usa una implementación de prueba o una copia del proyecto; no sustituyas todavía la implementación productiva 1.9.0.
3. Abre un chat que contenga un `Project Approval Canvas` y envía exactamente `Accept Canvas`.
4. Confirma que el cuerpo del Canvas no aparezca de nuevo en el chat y que `Project Approval Canvas.md` aparezca en Documents como Nivel 1.
5. Confirma que el visor se abra a la derecha y muestre Preview y Raw; ciérralo y verifica que el chat recupere el espacio.
6. Pulsa `Executive Decision Brief` y confirma que se cree el Markdown de Nivel 2 con el Canvas como padre.
7. Repite con `Stakeholder Pitch Kit` en otro Canvas o conversación si deseas probar la segunda ruta.
8. Cambia el modelo en la barra del chat, envía una consulta y vuelve a abrir el chat para confirmar que conserve el modelo.
9. En un mensaje del usuario pulsa ✏️, modifica el texto y confirma que se cree y continúe una conversación ramificada.
10. Genera una respuesta con un bloque de código y prueba el botón `Copy` del bloque y el botón de copia de la respuesta.
11. Importa o genera un archivo HTML, selecciónalo en Documents y confirma que el visor lo renderice sin ejecutar scripts.
12. Abre y cierra el visor; confirma la animación sutil y que el chat recupere el espacio gradualmente.
13. Arrastra el grip entre chat y visor, recarga la aplicación y confirma que el ancho se conserve.
14. Exporta el documento visible a PDF dentro del proyecto: debe aparecer como hijo del documento original y en el siguiente nivel.
15. Exporta nuevamente a una carpeta externa: el PDF debe abrirse desde esa ubicación y no aparecer en Documents.
16. Confirma que el encabezado del chat no muestre acciones redundantes de edición o borrado; usa ✏️ y 🗑️ junto a un mensaje del usuario para ramificar o rebobinar.
17. Abre el menú de tarjetas superiores, inferiores y contiguas; debe mostrarse por encima de todas y cambiar de dirección cuando falte espacio.
18. Mantén Documents, chat y visor abiertos; mueve ambos grips hasta sus mínimos y comprueba que no existan máximos fijos innecesarios.
19. Pulsa ⬅️ para colapsar el chat y ➡️ para restaurarlo. Sin visor, Documents debe llenar el workspace; con visor, ambos paneles deben compartirlo. Recarga y confirma que la preferencia se conserve.
20. Crea una rama desde un mensaje intermedio. En el chat original pulsa 🗑️ sobre ese mensaje y confirma que se retiren el tramo posterior y la rama derivada, pero no los documentos generados.
21. Importa una fuente desde Drive: la tarjeta debe aparecer antes de que termine el índice y cambiar por `Queued`, transferencia, procesamiento y `Indexed` o error.
22. Sube un archivo local mayor de 8 MB y confirma que la barra de Drive avance por porcentaje sin mensajes emergentes repetitivos.
23. Durante embeddings confirma que la barra sea animada e indeterminada; no debe mostrar un porcentaje ficticio.
24. Cierra y vuelve a abrir el proyecto con una fuente pendiente; debe reanudar la transferencia o verificación automáticamente.
25. Carga en el proyecto un agente con PDFs obligatorios y opcionales que todavía no tengan índice para el usuario actual. Confirma que las tarjetas comiencen a procesarse automáticamente y que una consulta pueda iniciar usando las fuentes ya disponibles, sin el error de mezcla entre File Search y binarios inline.
26. Comprueba que los tres encabezados midan lo mismo, que los chips sobre el compositor adopten el color del formato y que regresar a Home tenga una transición sutil.
27. Crea un documento o actualiza una nota y confirma que el knowledge heredado del agente permanezca visible sin recargar la página.
28. Reordena tarjetas de Agents, Projects y Documents; recarga y confirma que el orden personal se conserve. En Documents, confirma que una tarjeta no pueda arrastrarse a otro nivel.
29. Colapsa dos niveles documentales, recarga el proyecto y confirma que el estado se conserve y que los encabezados no cubran las tarjetas.
30. En el borrador de un agente desactiva **Show mandatory sources in projects**, publica una versión y crea un proyecto con ella. Confirma que las fuentes mandatorias no aparezcan como tarjetas, pero se indexen y se utilicen automáticamente.
31. Abre ℹ️ en mensajes de usuario y agente; verifica que muestre el modelo y las fuentes adjuntas correspondientes a ese envío.
32. Abre el selector de modelo bajo el input. Debe mostrar **Available for your API key** solo después de que Gemini devuelva el catálogo compatible con `generateContent`.

## Prueba de regresión conservada de 1.9.0
12. Verifica que la portada muestre **Agents** y **Projects**.
3. Abre Agents y confirma que exista `General Project Assistant` publicado.
4. Crea un agente de prueba.
5. Escribe sus instrucciones.
6. Agrega una fuente obligatoria y otra opcional.
7. Agrega un workflow Markdown y una plantilla de Google Workspace.
8. Publica `1.0.0`.
9. Crea un proyecto seleccionando ese agente y versión.
10. Abre Documents y confirma dos secciones: Agent knowledge y Project sources.
11. Verifica que la fuente obligatoria no pueda desactivarse.
12. Ejecuta **Sync index** y confirma que procese conocimiento del agente y fuentes del proyecto.
13. Pregunta por una fuente del agente y comprueba sus citas.
14. Agrega una fuente particular al proyecto y pregunta usando ambas capas.
15. Confirma que Templates y Flows muestren recursos heredados del agente como solo lectura.
16. Publica `1.0.1` del agente y verifica que el proyecto continúe en `1.0.0`.
17. Cambia el proyecto a `1.0.1`; debe crearse un chat nuevo.
18. Abre el chat anterior y confirma que indique la versión previa.
19. Copia una carpeta completa de agente dentro de `Agents`, pulsa **Scan agents** y confirma que aparezca.
20. Si la copia duplicó un agente existente, confirma que se registre como borrador independiente.
21. En Agent Builder, cambia el icono y el color, guarda y confirma que la tarjeta y el encabezado se actualicen.
22. Importa un logo cuadrado desde Drive y confirma que aparezca en Agents y, después de publicar/cargar esa versión, dentro del proyecto.
23. Copia la carpeta del agente, pulsa **Scan agents** y comprueba que el logo de la copia use el archivo copiado en su propia carpeta `Assets`.
24. Abre Documents y verifica los colores de PDF, Sheets/CSV, Markdown, Docs, Slides e imágenes.
25. Confirma que cada tarjeta indique `Agent`, `Original` o `Generated` sin mezclar esos ámbitos.
26. Compara Agents y Projects: ambos encabezados deben compartir jerarquía, identidad visual, búsqueda y acciones.
27. Abre y cierra el menú de una tarjeta de proyecto; la franja superior debe permanecer dentro de la tarjeta y el menú debe mostrarse completo.
28. Verifica que las tarjetas de PDF, Sheets/CSV, Markdown, Docs, Slides, imágenes y JSON tengan fondo, franja, icono y etiqueta de formato con su color correspondiente.
29. Abre un proyecto y confirma que el encabezado muestre icono, estado, descripción y agente cargado dentro de la misma identidad cromática.
30. Cambia entre Chats, Documents, Templates y Flows; las pestañas deben comportarse como un control segmentado y conservar la carga progresiva.
31. Abre dos conversaciones y comprueba que la barra superior del chat actualice título, agente y versión.
32. Selecciona o deselecciona fuentes y workflows; el contador de recursos activos en la barra del chat debe actualizarse.
33. Envía un mensaje y confirma la nueva presentación de mensajes del usuario, respuesta del agente, citas y compositor.
34. En una pantalla estrecha, abre el panel del proyecto y comprueba que aparezca como una tarjeta superpuesta sin ocultar permanentemente el chat.

## Actualización del despliegue

1. Reemplaza los archivos indicados por el paquete `update_only` o ejecuta `clasp push`.
2. Abre **Implementar > Administrar implementaciones**.
3. Edita la implementación.
4. Selecciona **Nueva versión**.
5. Conserva la misma URL.

## Solución de problemas

### El agente copiado no aparece

La carpeta debe estar directamente dentro de `Agents`. Pulsa **Scan agents**. Un borrador debe publicarse antes de cargarlo en un proyecto.

### La versión asignada no está disponible

Restaura la carpeta del agente o su release desde la papelera. La consola bloquea el proyecto en lugar de sustituir el agente silenciosamente. Después puedes cargar explícitamente otra versión publicada.

### Agent knowledge muestra `Not indexed`

Guarda la llave personal y pulsa **Sync index** en el proyecto. La misma acción procesa el store del agente activo y el store del proyecto, hasta dos fuentes nuevas por ámbito y ejecución.

### Una carpeta copiada conserva referencias antiguas

Pulsa **Scan agents**. La consola compara el ID físico de cada release y reconstruye los IDs de Drive por rutas lógicas. Los embeddings no se copian y deben reconstruirse.

### Un PDF grande no se indexa

El límite es 100 MB por documento. La carga a Drive usa bloques de 8 MB y File Search conserva bloques de 8 MB, procesando hasta tres por llamada. La tarjeta muestra el progreso y la consola reanuda automáticamente trabajos pendientes mientras el proyecto permanezca abierto.
