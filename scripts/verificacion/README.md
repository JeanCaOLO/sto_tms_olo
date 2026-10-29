# Motor de Verificacion y Certificacion de Estandares INTELIX

Analiza un desarrollo ya elaborado y emite un **dictamen de aptitud para QA** contra
los estandares INTELIX de **desarrollo, infraestructura, seguridad y DevOps**. Es
**analisis estatico de solo lectura**: no ejecuta ni modifica el proyecto auditado.

Forma parte del framework hibrido `verificacion-certificacion-intelix`:
- **Este modulo (motor):** determinista, corre en CI o local. Es la fuente de verdad.
- **Skill `/intelix-certificacion`:** capa interpretativa para humanos (interpreta
  hallazgos ambiguos, valida los N/A, redacta el acta). Ejecuta este motor.

Antes de evaluar, el motor lee `.intelix/applicability-policy.json` cuando existe. Un perfil móvil
activa únicamente MOB1–MOB8 y no ejecuta los controles AWS/SAM/React. Ese dictamen cubre
preparación técnica para QA; no certifica firma, publicación ni políticas vigentes de tiendas.

## Requisitos

- **Node.js** (el runtime que la plantilla ya exige). **Sin dependencias externas**
  ni `pip install`: usa solo modulos nativos de Node. Funciona apenas se importa la
  plantilla.

## Uso

```bash
node scripts/verificacion/analizador.js --proyecto <ruta-al-proyecto>
```

Opciones:

| Opcion | Descripcion |
|--------|-------------|
| `--proyecto`, `-p` | Ruta del proyecto a auditar (requerido). |
| `--salida`, `-o` | Carpeta de salida (por defecto `<proyecto>/docs/certificaciones`). |
| `--formato`, `-f` | Formatos separados por coma: `json,md,html` (por defecto todos). |
| `--exposicion`, `-e` | Perfil de exposicion de la app: `publica` \| `corporativa`. Define si los controles de perimetro (WAF, HTTPS/TLS, CORS estricto, IdP/MFA) son exigibles. Si se omite, se difieren al piloto. |
| `--alcance`, `-a` | Alcance de la certificacion: `estandares` (por defecto; desarrollo, arquitectura, BD y seguridad, sin pruebas) \| `completo` (puerta a produccion: agrega pruebas/cobertura como exigibles). |
| `--idioma`, `-i` | Idioma del informe ejecutivo: `es` (por defecto) \| `en`. |
| `--help`, `-h` | Ayuda. |

Ejemplo:

```bash
node scripts/verificacion/analizador.js -p C:/temp/Proyecto/Mayoreo/Cartera/Fuentes
```

## Perfil de exposicion (publica vs corporativa)

La exposicion cambia como se evaluan los controles de **perimetro**:

| Control | `--exposicion corporativa` | `--exposicion publica` |
|---------|----------------------------|------------------------|
| WAF (P1) | N/A (no exigible) | Exigible (Alto) |
| HTTPS/TLS + cookie secure (P2) | N/A | Exigible (Critico) |
| CORS estricto por dominios (P3) | N/A | Exigible (Critico) |
| IdP gestionado / MFA (P4) | N/A | Exigible (Alto) |
| CORS abierto / CSP off (R6) | Alto | **Critico** (sube por exposicion) |

- **corporativa** (interna): los controles de perimetro publico se marcan `na-justificado` y no penalizan.
- **publica** (internet): se vuelven exigibles; un CORS que refleja cualquier origen o una cookie no-secure pasan a **critico**.
- **omitido**: los controles de perimetro se difieren al piloto (`diferido-piloto`) y el motor avisa que conviene declarar el perfil.

Ejemplo:

```bash
node scripts/verificacion/analizador.js -p ./mi-app --exposicion publica
```

## Alcance de la certificacion (estandares vs completo)

La certificacion de **cumplimiento de estandares** (desarrollo, arquitectura, BD y
seguridad) es distinta de la **puerta a produccion**, que ademas exige pruebas.

| Alcance | Que evalua | COD6 (pruebas) |
|---------|------------|----------------|
| `estandares` (por defecto) | Desarrollo, arquitectura, BD, seguridad, DevOps | `na-justificado` (fuera de alcance, no penaliza) |
| `completo` | Todo lo anterior **+ pruebas/cobertura** | Exigible (penaliza si faltan) |

- Certificar estandares no mide pruebas: "tener suite de pruebas" es madurez de QA,
  no conformidad con el patron arquitectonico o de seguridad.
- Para **promover a produccion**, re-certificar con `--alcance completo`: las
  pruebas y la cobertura >= 80% pasan a ser exigibles.

Ejemplo:

```bash
# Certificacion de estandares (por defecto)
node scripts/verificacion/analizador.js -p ./mi-app --exposicion publica

# Puerta a produccion (exige pruebas)
node scripts/verificacion/analizador.js -p ./mi-app --exposicion publica --alcance completo
```

## Salidas

En la carpeta de salida se generan tres artefactos:

- `certificacion-<proyecto>-<fecha>.json` — evidencia estructurada (para CI / el skill).
- `certificacion-<proyecto>-<fecha>.md` — acta legible.
- `certificacion-<proyecto>-<fecha>.html` — informe ejecutivo visual con las mismas ocho secciones del Markdown y el logo Beconsult INTELIX embebido.

## Dictamen y codigos de salida

| Dictamen | Regla | Exit code |
|----------|-------|-----------|
| **APTO PARA QA** | Puntuacion ponderada >= 85% y sin criticos abiertos | 0 |
| **CON OBSERVACIONES** | 70-84% y a lo sumo un Alto por categoria | 1 |
| **NO APTO PARA QA** | < 70%, o >= 1 critico no cumplido, o multiples altos | 2 |
| (error de uso) | ruta invalida / falta argumento | 3 |

Un hallazgo **Critico no cumplido** fija su categoria en 0% y fuerza **No apto**,
con independencia del agregado. Los estados **`na-justificado`**, **`diferido-piloto`**
y **`no-verificable`** no penalizan la puntuacion, pero se listan.

## Ponderacion por categoria

| Categoria | Peso |
|-----------|------|
| Infraestructura (IaC/SAM, serverless, SQS, IAM) | 30% |
| Codigo (Python hexagonal, React, Design System, pruebas) | 25% |
| Seguridad (baseline R1-R7 verificable estaticamente) | 35% |
| DevOps (CI con SAST, despliegue por ambiente, health, deps) | 10% |

Para `mobile-kmp` se usa una categoría aislada **Móvil Kotlin/KMP** con peso 100%; las categorías
AWS/web no participan en ese dictamen.

Los pesos y umbrales viven en `umbrales.json` y se editan sin tocar codigo.

## Estandares como datos

Las reglas verificadas viven en `estandares/*.json` (una por categoria), con `id`,
`nombre`, `criticidad`, `regla` y `descripcion`, trazables a las fuentes vinculantes
(`docs/estandares/estandares-desarrollo-intelix.md`, `docs/estandares/seguridad-baseline.md`).
Agregar o ajustar un estandar es editar su JSON; el motor de puntuacion no cambia.

## Estructura del modulo

```
scripts/verificacion/
├── analizador.js            # CLI / orquestador (punto de entrada)
├── umbrales.json            # pesos, umbrales y reglas de dictamen
├── estandares/              # definiciones de estandares (datos)
│   ├── infraestructura.json
│   ├── codigo.json
│   ├── seguridad.json
│   └── devops.json
├── verificadores/           # un verificador por categoria
│   ├── infraestructura.js
│   ├── codigo.js
│   ├── seguridad.js
│   └── devops.js
├── reportes/                # generadores de salida
│   ├── markdown.js          # informe ejecutivo en ocho secciones
│   ├── html.js              # misma estructura con identidad visual INTELIX
│   ├── idiomas.js           # textos en espanol e ingles
│   └── logo-beconsult.png   # logo embebido en el HTML
└── lib/                     # utilidades y motor
    ├── fs-scan.js           # escaneo seguro (no vuelca secretos)
    ├── ingesta.js           # deteccion de artefactos
    └── dictamen.js          # puntuacion y dictamen
```

## Uso como puerta en CI

El motor devuelve un exit code por dictamen, asi que puede usarse como gate:

```yaml
certificacion_estandares:
  stage: test
  script:
    - node scripts/verificacion/analizador.js --proyecto . --formato json,html
  # exit 0/1 pasan; exit 2 (No apto) falla el job
  artifacts:
    paths:
      - docs/certificaciones/
```

## Que es y que no es

- **Es** analisis estatico: detecta ausencia de IaC, framework de frontend,
  concatenacion de SQL, CORS abierto, secretos embebidos, falta de CI de seguridad, etc.
- **No es** analisis dinamico: no hace DAST, pentest ni prueba la app corriendo.
  Esos controles se marcan **diferidos al piloto** y se resuelven con la app desplegada.
- Los hallazgos **`no-verificable`** requieren revision manual (para eso esta el skill).

## Limitaciones

- Las reglas son heuristicas: pueden producir falsos positivos/negativos en bordes.
  El skill `/intelix-certificacion` existe justamente para interpretar esos casos.
- La puntuacion es una guia objetiva reproducible; el criterio final sobre
  excepciones (p. ej. un stack no estandar aprobado por Arquitectura) lo aporta el
  humano via el skill, registrando un ADR.
