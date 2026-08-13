# Propuesta de revisión — Agent Console 2.0.0-review.1

## Resultado propuesto

La consola pasa de tratar cada salida como texto de chat a distinguir dos resultados:

1. **Conversation response:** explicación, análisis o pregunta que sí se muestra en el chat.
2. **Project artifact:** entregable persistente que se guarda como Markdown, aparece en Documents y se abre en el visor lateral. Su contenido no se duplica en el chat.

## Flujo Greenlight

| Acción | Resultado visible | Archivo y nivel |
|---|---|---|
| El agente presenta el Canvas | Canvas de trabajo en la conversación | Ninguno todavía |
| El usuario envía `Accept Canvas` | Evento compacto de confirmación y dos rutas | `Project Approval Canvas.md`, Nivel 1 |
| El usuario elige `Executive Decision Brief` | Evento compacto; visor abierto | `Executive Decision Brief.md`, Nivel 2 |
| El usuario elige `Stakeholder Pitch Kit` | Evento compacto; visor abierto | `Stakeholder Pitch Kit.md`, Nivel 2 |

Las dos rutas son alternativas de navegación, pero ambas pueden generarse si el usuario lo decide. Cada archivo de Nivel 2 conserva como padre el Canvas aceptado.

## Cambios incluidos en el prototipo

- Contrato de artefacto entre Gemini y la consola.
- Intercepción determinista de `Accept Canvas`; no gasta otra llamada al modelo.
- Archivos Markdown nativos en `Generated Documents` con versión, tipo, estado, modelo, conversación y padres.
- Visor derecho para Markdown, HTML aislado, texto y previews de Drive; se colapsa al cerrarlo.
- Separación entre **usar como fuente** (checkbox) y **ver documento** (clic en tarjeta).
- Acciones de ruta en el evento del artefacto.
- Selector de modelo por chat, incluido File Search.
- Eliminación de conversación conservada y ramificación nueva desde mensajes del usuario.
- Icono de copia más legible y copia por bloque de código.
- Vista de código cercada; no ejecuta código.

## Decisiones para tu revisión

1. **Evento mínimo en el chat:** actualmente muestra nombre del archivo, confirmación y botones de ruta, pero nunca el contenido. Puede eliminarse también ese evento y mover las rutas al visor si deseas una interpretación totalmente literal de “nada en el chat”.
2. **Botones de ruta:** actualmente generan la ruta seleccionada de inmediato. Pueden cambiarse para solo preparar la instrucción y pedir confirmación.
3. **Ramificación:** actualmente abre una ventana para editar y, al confirmar, crea la rama y envía la petición. Puede cambiarse a “crear borrador sin enviar”.
4. **Versiones:** aceptar o generar nuevamente el mismo tipo crea `v2`, `v3`, etc.; no sobrescribe entregables anteriores.

## Fuera de alcance de esta revisión

- **Generación de imágenes:** el servicio actual solo recoge partes de texto de Gemini. Habilitar imágenes exige un endpoint/modelo de generación, almacenamiento del binario en Drive y una tarjeta/visor específico.
- **Ejecución de código:** los bloques se muestran y copian, pero no se ejecutan. Un sandbox de ejecución sería un subsistema separado.
- **Resaltado avanzado de sintaxis:** no se agregó una dependencia externa en Apps Script; puede incorporarse después con una librería empaquetada y revisada.
- **Edición directa del Markdown dentro del visor:** el prototipo es de lectura; la edición requeriría control de versiones y guardado explícito.

## Criterios de aceptación

- `Accept Canvas` no repite el Canvas en el chat.
- El Canvas se crea como `.md`, aparece en Nivel 1 y se abre en Preview.
- Una ruta crea el archivo correcto de Nivel 2 y su `parentId` apunta al Canvas.
- Cerrar el visor recupera el ancho completo del chat.
- La casilla de fuente no cambia al abrir o cerrar el visor.
- El modelo elegido permanece asociado a la conversación.
- Editar un mensaje crea un chat nuevo sin alterar el original.
- Scripts incluidos en un HTML no se ejecutan en el visor.

## Recomendación de despliegue

Probar esta copia como una implementación separada. No reemplazar la versión 1.9.0 hasta validar el flujo con un proyecto real, ambos paths y al menos dos modelos Gemini.
