---
name: intelix-seguridad-linter
description: >-
  Linter de seguridad INCREMENTAL (Cyber Neo) que da aviso temprano sobre un
  cambio acotado (diff, commit en preparacion o Merge Request) antes de que el
  codigo llegue a CI: detecta secretos embebidos, SQL sin parametrizar, endpoints
  sin autenticacion, comodines IAM, CORS abierto / CSP desactivada y logs con
  datos sensibles, reutilizando los patrones del motor de certificacion INTELIX.
  No emite el dictamen de certificacion ni recalcula puntuaciones: el dictamen
  oficial Apto / Con observaciones / No apto lo fija el motor (scripts/verificacion)
  en CI. Usar cuando el usuario pida: revisar seguridad del cambio, lint de
  seguridad, revisar antes de commitear o del MR, escanear secretos en el diff,
  chequeo OWASP rapido, pre-commit de seguridad, Cyber Neo.
---

# Skill: Linter de Seguridad Incremental (Cyber Neo)

Capa de **aviso temprano** de seguridad que fortalece la fase **Construction** de
AI-DLC v2.8.2. Corre sobre un **cambio acotado** (lo que esta por commitear o lo
que trae un MR) para atrapar problemas R1–R7 **antes** de CI y del cierre de
unidad.

> **Modelo (no lo rompas):**
> - El **motor de certificacion** (`scripts/verificacion/analizador.js`) es la
>   **unica fuente de verdad** del dictamen (Apto / Con observaciones / No apto) y
>   corre en CI. Lo interpreta `intelix-certificacion`.
> - Este **linter** NO emite dictamen ni recalcula puntuaciones: solo **advierte
>   temprano** reusando los mismos patrones del verificador de seguridad.
> - Objetivo: acortar el ciclo de retrabajo, no sustituir la puerta de calidad.

## Cuando se activa

- Antes de un commit o al preparar un Merge Request.
- Cuando se pida revisar la seguridad de un cambio puntual o escanear el diff.
- Como apoyo del cierre de unidad (complementa, no reemplaza, R1–R8 del baseline).

## Motor (deterministico, reusa el del certificador)

El linter vive junto al motor para compartir backend (`lib/fs-scan.js`) y los
mismos patrones de `verificadores/seguridad.js`:

```bash
# Archivos staged (o recibidos por stdin)
git diff --name-only --cached | node scripts/verificacion/lib/linter-incremental.js --staged

# Archivos explicitos
node scripts/verificacion/lib/linter-incremental.js src/handler.py template.yaml

# Salida JSON (para hooks/pipelines)
node scripts/verificacion/lib/linter-incremental.js --staged --json
```

Exit code: `1` si hay hallazgos HARD-STOP abiertos (R1, R3, R6), `0` si no.

## Controles que advierte

| ID | Control | HARD-STOP |
|----|---------|-----------|
| R1 | Secretos embebidos (incluye AWS keys y archivos sensibles en el cambio) | Si |
| R2 | SQL sin parametrizar (concatenacion) | No |
| R3 | Endpoint con `AuthorizationType: NONE` | Si |
| R4 | Comodin IAM (`Action`/`Resource: *`) | No |
| R6 | CORS abierto / CSP desactivada | Si |
| R7 | Log de datos sensibles / PII | No |

Los placeholders, variables de entorno y archivos `*.example` **no** cuentan como
secreto (misma regla que el motor). El contenido de archivos sensibles (`.env`,
`.pem`, `*secret*`…) nunca se vuelca: se avisa de su presencia y se enmascara la
evidencia.

## Relacion con la certificacion

- El linter es **pre-CI**: evita que un secreto o un `AuthorizationType: NONE`
  llegue siquiera al pipeline.
- El **dictamen** de QA lo sigue dando el motor + `intelix-certificacion` sobre el
  proyecto completo, con scoring ponderado y perimetro por exposicion.
- Si el linter y el motor discrepan, **manda el motor**: el linter solo mira el
  diff, el motor mira todo el proyecto y aplica los umbrales oficiales.

## Flujo tipico del agente

1. Obtener los archivos del cambio (`git diff --name-only --cached`).
2. Correr el linter sobre ese conjunto.
3. Explicar cada hallazgo y la correccion segun `docs/estandares/seguridad-baseline.md`.
4. Para hallazgos HARD-STOP, pedir que se resuelvan antes del commit/MR.
5. Recordar que el dictamen formal se obtiene al certificar (no lo da el linter).

## Reglas

- **Nunca** presentar el resultado del linter como "certificacion" ni como
  dictamen Apto/No apto.
- No modifica archivos: es solo lectura.
- No introduce dependencias nuevas (node puro + el backend del propio motor).
- Como gancho opcional de pre-commit, documentarlo sin alterar hooks administrados
  por AI-DLC (ver `docs/guides/integracion-ci-aditiva.md`).
