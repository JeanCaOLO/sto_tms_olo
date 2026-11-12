# Guía paso a paso: steering + AI-DLC por repo (configuración manual)

Esta guía cubre la configuración manual de las dos cosas que conviven en `.kiro/steering/` de cada repo: los steering docs base y el framework AI-DLC de AWS. Se hace repo por repo, de forma manual, sin depender de un Power que lo automatice.

## Justificación (fuentes oficiales)

Cada paso de esta guía está respaldado por documentación oficial, no por interpretación propia:

- **Los 3 archivos base (`product.md`, `tech.md`, `structure.md`) van en `always` por defecto**: la documentación oficial de Kiro dice textualmente que estos archivos de fundamento se incluyen en cada interacción por defecto, formando la base del entendimiento del proyecto ([kiro.dev/docs/steering](https://kiro.dev/docs/steering/)).
- **El modo `auto` existe y requiere `name` + `description`**: confirmado en la misma documentación oficial — los archivos se incluyen automáticamente cuando la solicitud coincide con la descripción, funcionando de forma similar a los skills; ambos campos son obligatorios.
- **`aidlc config --harness kiro-ide` y `aidlc doctor` son los comandos reales**: tomados directamente del repositorio oficial de AWS, [awslabs/aidlc-workflows en GitHub](https://github.com/awslabs/aidlc-workflows), sección de instalación (Quick Start).
- **Los comandos de instalación (`curl`/`irm`)**: también del mismo repositorio oficial, tal cual los publica AWS en sus releases.
- **`core-workflow.md` de AI-DLC no trae modo explícito y por lo tanto queda en `always`**: es consecuencia directa de la misma regla oficial de Kiro — cualquier steering sin `inclusion` definido en el front matter se comporta como `always` por defecto. Esto no está documentado como una decisión de diseño de AWS, es simplemente lo que pasa si no se le agrega el front matter.

---

## Parte 1: Steering docs base (manual)

### Paso 1 — Crear la carpeta
Desde la raíz del repo:

```bash
mkdir -p .kiro/steering
```

### Paso 2 — Crear `product.md`
Archivo: `.kiro/steering/product.md`

```markdown
---
inclusion: always
---

# Producto

[Qué hace este sistema, para quién, y su función dentro del ecosistema de la empresa]
```

### Paso 3 — Crear `tech.md`
Archivo: `.kiro/steering/tech.md`

```markdown
---
inclusion: always
---

# Tecnología

[Stack, lenguajes, frameworks, versiones, dependencias clave]
```

### Paso 4 — Crear `structure.md`
Archivo: `.kiro/steering/structure.md`

```markdown
---
inclusion: always
---

# Estructura

[Organización de carpetas, convenciones de nombres, dónde vive cada tipo de código]
```

### Paso 5 — Crear `.kiroignore`
Archivo: `.kiroignore` (en la raíz del repo, no dentro de `.kiro/`)

```
node_modules/
dist/
build/
.env
*.log
```

Ajustar según lo que ya excluye tu `.gitignore` de ese repo.

### Paso 6 — Completar el contenido real
Los tres archivos de arriba están vacíos a propósito. Completalos vos, o pedile a Kiro dentro de ese repo: *"Leé el código de este repo y completá tech.md, structure.md y product.md con lo que encuentres."*

---

## Parte 2: Framework AI-DLC (instalación nativa)

### Paso 1 — Instalar el comando `aidlc` (una sola vez, no por repo)

macOS/Linux:
```bash
curl -fsSL https://github.com/awslabs/aidlc-workflows/releases/latest/download/install.sh | sh
```

Windows (PowerShell):
```powershell
irm https://github.com/awslabs/aidlc-workflows/releases/latest/download/install.ps1 | iex
```

### Paso 2 — Configurar el repo puntual
Desde la raíz de ESE repo (repetir por cada repo donde lo quieras usar):

```bash
cd /ruta/a/tu-repo
aidlc config --harness kiro-ide
```

### Paso 3 — Verificar la instalación

```bash
aidlc doctor
```

Esto confirma que `.kiro/steering/aws-aidlc-rules/` quedó bien instalado en ese repo.

### Paso 4 — Repetir para cada repo del workspace
El comando `aidlc config` no es global al workspace: hay que correrlo en la raíz de cada repo por separado.

---

## Parte 3: Corregir los modos de inclusión

### Paso 1 — Revisar qué quedó en modo `always`
Por defecto, `aws-aidlc-rules/core-workflow.md` se instala sin modo explícito, lo que en Kiro equivale a `always`. Se carga en cada interacción, uses `/aidlc` o no.

### Paso 2 — Cambiarlo a `auto`
Abrí `.kiro/steering/aws-aidlc-rules/core-workflow.md` y agregale (o corregile) el front matter al inicio del archivo:

```markdown
---
inclusion: auto
name: aidlc-core-workflow
description: Reglas de orquestación de AI-DLC — fases, bolts, unidades de trabajo, gates de aprobación. Aplica cuando la tarea menciona AI-DLC, Inception, Construction, Operations, o se invoca con /aidlc.
---
```

### Paso 3 — Confirmar que los 3 archivos base quedaron en `always`
Revisá que `product.md`, `tech.md` y `structure.md` tengan `inclusion: always` en su front matter (ya quedó así si seguiste la Parte 1).

### Paso 4 — Medir el efecto
En la barra de estado del IDE, fijate el gasto de créditos en un prompt normal antes y después del cambio del Paso 2, para confirmar que bajó.

---

## Orden recomendado si arrancás de cero en un repo

1. Parte 1 completa (steering base).
2. Parte 2 completa (instalar y configurar AI-DLC).
3. Parte 3 completa (corregir el modo de `core-workflow.md`).
4. Repetir Partes 1 a 3 en cada repo adicional del workspace.
