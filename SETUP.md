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
3. Descripción: `Version 1.7.0`.
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

Cada usuario abre Settings, guarda su llave y elige un modelo. Los stores del agente y del proyecto se crean por llave. Un colaborador nuevo debe ejecutar **Sync index** para construir sus propios índices.

## Prueba recomendada de 1.7.0

1. Confirma `Version 1.7.0` en Settings.
2. Verifica que la portada muestre **Agents** y **Projects**.
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

Guarda la llave personal y pulsa **Sync index** en el proyecto. La misma acción procesa el store del agente activo y el store del proyecto, hasta cinco fuentes nuevas por ámbito.

### Una carpeta copiada conserva referencias antiguas

Pulsa **Scan agents**. La consola compara el ID físico de cada release y reconstruye los IDs de Drive por rutas lógicas. Los embeddings no se copian y deben reconstruirse.

### Un PDF grande no se indexa

El límite es 100 MB por documento. La carga a Drive usa bloques de 2 MB y File Search bloques persistentes de 8 MB. Ejecuta **Sync index** nuevamente cuando haya elementos pendientes.
