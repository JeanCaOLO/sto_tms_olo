---
name: intelix-file-to-markdown
description: >-
  Convierte archivos (PDF, Word, Excel, PowerPoint, SQL, JSON, YAML, XML, HTML,
  draw.io, imágenes) a Markdown en docs/conversiones/. Úsalo cuando pidan
  convertir un archivo a Markdown.
---

# Skill: File to Markdown

## Propósito

Este es un **skill de referencia**: no contiene el código Python del convertidor, sino que
instruye a Kiro sobre **cómo y cuándo** convertir archivos fuente (PDF, Word, Excel,
PowerPoint, SQL, JSON, YAML, XML, HTML, draw.io, imágenes, etc.) a Markdown para
incorporarlos como documentación del proyecto.

El enfoque es **referencia + lanzador**, con dos vías de invocación que comparten el mismo
backend y el mismo destino de salida (`docs/conversiones/`):

- **Vía Kiro (chat):** Kiro lee este `SKILL.md` y ejecuta el convertidor de forma automática,
  depositando el resultado en `docs/conversiones/` y manteniendo el índice de conversiones.
- **Vía Lanzador (`file-to-markdown.bat`):** un menú interactivo en la raíz del template para
  uso manual en Windows, pensado para quien prefiere no escribir comandos.

Ambas vías usan el paquete externo **`file-to-markdown`**, instalable vía pip desde el GitLab
corporativo (`pip install --user git+https://git.intelix.biz/grupomayoreo/file-to-markdown.git`),
que expone el comando `python -m file_to_markdown`. El template **no** incluye el código Python
del convertidor: se depende del paquete instalable remoto.

Este skill **no** participa del flujo de `install-skills.bat`: no incluye `requirements.txt`
ni un entorno virtual `.venv` en su directorio, porque sus dependencias se resuelven mediante
la instalación pip directa desde el repositorio remoto.

## Formatos soportados

El convertidor procesa **21 extensiones**, agrupadas por categoría:

| Categoría | Extensiones |
|-----------|-------------|
| Documentos | `.pdf`, `.docx` |
| Hojas de cálculo | `.xlsx`, `.csv` |
| Presentaciones | `.pptx` |
| Código fuente | `.sql` |
| Datos estructurados | `.json`, `.yaml`, `.yml`, `.xml` |
| Web/diagramas/texto | `.html`, `.htm`, `.drawio`, `.txt`, `.md` |
| Imágenes | `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp` |

Si el archivo fuente tiene una extensión que **no** pertenece a esta lista, el formato no es
soportado y se debe informar al usuario indicando las 21 extensiones válidas de arriba.

## Cómo convertir

Kiro invoca el convertidor mediante el comando:

```
python -m file_to_markdown <archivo> -o docs/conversiones/
```

Donde `<archivo>` se sustituye por la **ruta relativa o absoluta** del archivo fuente a
convertir. La salida se deposita en `docs/conversiones/` con el nombre `<nombre_original>.md`.

### Flags disponibles

| Flag | Descripción | Default |
|------|-------------|---------|
| `-o <ruta>` | Carpeta de salida | `docs/conversiones/` |
| `-r` | Procesar recursivamente un directorio | — |
| `--check` | Verificar dependencias (exit 0 si todo OK) | — |
| `--version` | Imprimir versión instalada (X.Y.Z) | — |

## Cuándo activarse

Kiro debe activar este skill cuando detecte cualquiera de los siguientes patrones de
intención del usuario:

- **(a) Solicitud explícita de convertir un archivo a Markdown.** Por ejemplo: "convierte
  este PDF a Markdown", "pásame `contrato.docx` a `.md`", "transforma este Excel en Markdown".
- **(b) Solicitud de generar documentación Markdown a partir de un archivo fuente** cuya
  extensión pertenezca a los Formatos soportados. Por ejemplo: "genera la documentación en
  Markdown de `esquema.sql`", "quiero documentar `diagrama.drawio` como Markdown".
- **(c) Solicitud de incorporar el contenido de un archivo externo como documentación del
  proyecto** en formato Markdown. Por ejemplo: "agrega el contenido de `requisitos.xlsx` a la
  documentación del proyecto", "suma este informe `.pptx` a la carpeta `docs/`".

Además, **proactividad:** si el usuario menciona un archivo con una extensión perteneciente a
los Formatos soportados dentro de un contexto de documentación (aunque no pida explícitamente
la conversión), Kiro debe **ofrecer proactivamente** convertir ese archivo a Markdown y
depositarlo en `docs/conversiones/`.

Este skill está disponible en las fases IA-DLC de Inception, Construction y Operations siempre
que se solicite convertir un archivo fuente a Markdown.

## Verificación e instalación

**Antes de convertir**, Kiro verifica que el convertidor esté instalado ejecutando:

```
python -m file_to_markdown --version
```

- Si el comando responde con exit code **0** e imprime una versión (formato `X.Y.Z`), el
  convertidor está instalado y se puede proceder con la conversión.
- Si el comando retorna un **exit code distinto de 0** o **no se reconoce** (por ejemplo, el
  módulo no existe), el convertidor **no está instalado**. En ese caso Kiro debe instalarlo
  ejecutando:

  ```
  pip install --user git+https://git.intelix.biz/grupomayoreo/file-to-markdown.git
  ```

  Como alternativa, Kiro puede sugerir al usuario ejecutar el Lanzador `file-to-markdown.bat`
  en la raíz del template, que verifica e instala el convertidor de forma interactiva.

Tras una instalación correcta, Kiro repite la verificación de `--version` y continúa con la
conversión. Si la instalación falla (por ejemplo, por falta de conexión con el GitLab
corporativo o acceso VPN), Kiro informa al usuario y sugiere verificar la red o usar el
Lanzador.

## Actualización del índice INDEX.md

Tras **cada conversión exitosa**, Kiro actualiza el índice de conversiones ubicado en
`docs/conversiones/INDEX.md` aplicando las siguientes reglas:

1. **Si `INDEX.md` no existe**, Kiro lo crea con el encabezado de la tabla antes de agregar la
   primera fila. La tabla tiene exactamente **cuatro columnas**: `Archivo Original`, `Formato`,
   `Archivo Convertido` y `Fecha de Conversión`. Encabezado semilla:

   ```markdown
   # Índice de Conversiones

   Archivos convertidos a Markdown mediante el skill file-to-markdown.

   | Archivo Original | Formato | Archivo Convertido | Fecha de Conversión |
   |------------------|---------|--------------------|---------------------|
   ```

2. **Agregar una fila nueva** con los datos de la conversión:
   - **Archivo Original**: nombre del archivo fuente con su extensión (por ejemplo, `contrato.pdf`).
   - **Formato**: la extensión original **en mayúsculas y sin el punto** (por ejemplo, `PDF`, `XLSX`).
   - **Archivo Convertido**: enlace relativo en formato Markdown `[<nombre>.md](./<nombre>.md)`
     (por ejemplo, `[contrato.md](./contrato.md)`), relativo a `docs/conversiones/`.
   - **Fecha de Conversión**: fecha actual en formato **ISO 8601** (`AAAA-MM-DD`).

3. **Si el archivo ya tiene una fila** en el índice (misma clave "Archivo Original"), Kiro
   **reemplaza SOLO la Fecha de Conversión** de esa fila con la fecha actual, **sin duplicar la
   fila**. El archivo `.md` de salida se sobrescribe.

4. Tras registrar la conversión, Kiro **sugiere al usuario** referenciar el archivo `.md`
   convertido desde la documentación principal del proyecto, para mantenerla navegable.

Ejemplo de tabla con filas:

```markdown
| Archivo Original | Formato | Archivo Convertido | Fecha de Conversión |
|------------------|---------|--------------------|---------------------|
| contrato.pdf | PDF | [contrato.md](./contrato.md) | 2025-02-14 |
| datos.xlsx | XLSX | [datos.md](./datos.md) | 2025-02-14 |
```

## Manejo de errores

Kiro debe manejar los siguientes casos de error de forma clara e informativa:

- **Formato no soportado.** Si el archivo fuente tiene una extensión que **no** pertenece a los
  Formatos soportados, Kiro informa al usuario que el formato no es soportado y **lista las 21
  extensiones válidas**: `.pdf`, `.docx`, `.xlsx`, `.csv`, `.pptx`, `.sql`, `.json`, `.yaml`,
  `.yml`, `.xml`, `.html`, `.htm`, `.drawio`, `.txt`, `.md`, `.png`, `.jpg`, `.jpeg`, `.gif`,
  `.svg`, `.webp`. No se genera ningún archivo de salida.

- **Convertidor no instalado.** Si `python -m file_to_markdown --version` retorna un exit code
  distinto de 0 o no se reconoce, Kiro informa que el convertidor no está instalado y sugiere
  como solución ejecutar el Lanzador `file-to-markdown.bat` o el comando
  `pip install --user git+https://git.intelix.biz/grupomayoreo/file-to-markdown.git`.

- **Error durante la conversión.** Si el convertidor falla durante la conversión, Kiro reporta
  al usuario el **mensaje original del convertidor** junto con **al menos una acción correctiva**
  sugerida, por ejemplo:
  - verificar que el archivo de entrada exista y sea accesible en la ruta indicada,
  - reinstalar el paquete con `pip install --user git+https://git.intelix.biz/grupomayoreo/file-to-markdown.git`,
  - ejecutar la conversión mediante el Lanzador `file-to-markdown.bat`.

## Independencia del instalador

Este skill **NO participa del flujo de `install-skills.bat`**. A diferencia de otros skills del
template, no incluye un `requirements.txt` ni un entorno virtual `.venv` en su directorio
`.kiro/skills/intelix-file-to-markdown/`, por lo que `install-skills.bat` no lo lista ni lo instala.

La instalación del convertidor se realiza de forma independiente, mediante una de estas vías:

- el Lanzador `file-to-markdown.bat` en la raíz del template (verifica e instala de forma
  interactiva), o
- el comando `pip install --user git+https://git.intelix.biz/grupomayoreo/file-to-markdown.git`.
