# intelix-estandar-frontend

<!-- intelix:start -->
## Estandares y skills de Intelix

Este repositorio sigue los estandares de Intelix.

**Perfil del proyecto**: [`.intelix/project-profile.json`](.intelix/project-profile.json).
Leerlo antes de proponer arquitectura, infraestructura o cambios de stack. El perfil indica tipo de
solucion, si el proyecto es nuevo o existente, su baseline agentic/AI-DLC y la infraestructura
prevista. No exigir React/SAM a un arbol movil ni reinterpretar un proyecto existente como nuevo.

**Politica de aplicabilidad**: [`.intelix/applicability-policy.json`](.intelix/applicability-policy.json).
Es derivada del perfil y declara estandares aplicables, soporte de certificacion y propiedad de
actualizacion. Si el proyecto aun no tiene perfil, queda como `review-required`. Respetar
`preserve`, `reference-only`, `review-required` y `unsupported`.

**Estandar de desarrollo**: [`docs/estandares/estandares-desarrollo-intelix.md`](docs/estandares/estandares-desarrollo-intelix.md)
— AWS SAM, CloudFormation, React, serverless, design systems, Amplify vs ECS y seguridad.
Consultalo antes de definir infraestructura, elegir un servicio de AWS o levantar un frontend nuevo.

**Estandar movil Kotlin/KMP**:
[`docs/estandares/estandares-mobile-kmp-intelix.md`](docs/estandares/estandares-mobile-kmp-intelix.md).
Aplicalo solo cuando la politica marque `mobileKmp: applicable`; su certificacion `MOB1`–`MOB8`
mide preparacion tecnica para QA, no aprobacion de Google Play o App Store.

**Baseline de seguridad R1–R14**: [`docs/estandares/seguridad-baseline.md`](docs/estandares/seguridad-baseline.md).
HARD-STOP (R1, R3, R5, R6, R11) bloquean cierre de unidad o despliegue.

**Gobierno IA-DLC (equipo)**: [`docs/guides/gobierno-iadlc-intelix.md`](docs/guides/gobierno-iadlc-intelix.md).
Contrato de arranque: `Product-Definition/` + Gate 0 (`.intelix/scripts/validate_discovery_gate.py`).
No iniciar Inception si `gate_status` no esta aprobado cuando el modo lo exige.
Iteraciones de Inception / impacto Construction: `intelix-inception-iterations`
(`.intelix/scripts/inception_iterations.py`).

**CI aditiva**: los jobs administrados están en `.gitlab/intelix-ci.yml`. El pipeline raíz los
activa mediante un include local; no mover jobs propios al fragmento INTELIX. Ver
[`docs/guides/integracion-ci-aditiva.md`](docs/guides/integracion-ci-aditiva.md).

**Actualizacion segura**: consultar `intelix-cli managed-files --status` después de `sync`. Ante
un conflicto, revisar el archivo local y su `.intelix-new`; resolver con `--accept-local` o
`--accept-template`. No editar `.intelix/managed-files.json` a mano. Ver
[`docs/guides/archivos-administrados-intelix.md`](docs/guides/archivos-administrados-intelix.md).

**Migracion v1 → v2**: si coexisten `aidlc-docs/aidlc-state.md` y un intent bajo
`aidlc/spaces/`, no trasladar ni reinterpretar progreso a mano. Ejecutar primero
`intelix-cli migrate aidlc-state --from v1 --to v2 --dry-run` y exigir confirmacion humana del
`--resume-stage`. Ver
[`docs/guides/migracion-estado-aidlc.md`](docs/guides/migracion-estado-aidlc.md).

**Skills disponibles** (una carpeta por skill, con su `SKILL.md`):

| Skill | Para que |
|---|---|
| `intelix-ficha-de-solicitud` | Ficha de solicitud y plan de trabajo a partir de la clasificacion del pedido |
| `intelix-objetivos-y-plan-trabajo` | Objetivos generales y especificos, y plan de trabajo con estimaciones |
| `intelix-estimacion` | Plan de trabajo y estimacion de esfuerzo (HH) en Excel |
| `intelix-seguimiento-plan` | Reportes de seguimiento (snapshots) sobre el plan definitivo |
| `intelix-requirements-matrix-excel` | Matriz de identificacion de requerimientos en Excel |
| `intelix-requirements-matrix-pdf` | La misma matriz, en PDF |
| `intelix-roadmap-generator-html` | Roadmap HTML interactivo desde el plan de trabajo |
| `intelix-consolidado-avance` | Avance consolidado multi-rama / multi-colaborador |
| `intelix-inception-iterations` | Iteraciones de Inception y rework de alcance (fechas, develop, HH) |
| `intelix-project-docs-html` | Documentacion HTML del proyecto, con Swagger UI embebido |
| `intelix-file-to-markdown` | Convierte PDF, Word, Excel, PowerPoint, SQL, JSON, XML y HTML a Markdown |
| `intelix-db-provisioning` | Aprovisionamiento OLTP multi-motor (PostgreSQL, MySQL, SQL Server, Oracle) |
| `intelix-datalake-naming` | Validador de nomenclatura BD (OLTP, lago de datos y bridge) |
| `intelix-git-flow` | Gobierno de ramas (master/qa/develop) y alta de repo GitLab por API |
| `intelix-arquitectura-gate` | Gate de diseno (ADR) previo a codificar (`.intelix/scripts/arquitectura_gate.py`) |
| `intelix-seguridad-linter` | Aviso temprano de seguridad (R1–R7) sobre el diff antes de CI |
| `intelix-qa-gate` | Definition of Done por unidad (R1–R8) y checklist Pre-Deploy (R11) |
| `intelix-devops-diagnostico` | Clasifica un log de CI/CD (solo lectura) y propone fix guiado; no despliega |
| `intelix-observador-tareas` | Telemetria de patrones reusando tracking + ledger existentes (sin PII) |
| `intelix-certificacion` | Dictamen Apto / Con observaciones / No apto para QA (motor `scripts/verificacion/`) |
| `intelix-mobile-kmp` | Desarrollo, revision y preparacion tecnica para QA de Android Kotlin y Kotlin Multiplatform |

**Estandares de datos:** guia practica [`docs/README-solucion-base-de-datos.md`](docs/README-solucion-base-de-datos.md)
y normas en `docs/estandares-base-de-datos*.md`, lago, DWH y bridge.

Inventario completo: [`docs/FUNCIONALIDADES_PRINCIPALES.md`](docs/FUNCIONALIDADES_PRINCIPALES.md).
Indice: [`docs/README.md`](docs/README.md).

Varias de estas skills traen scripts de Python con su `requirements.txt`. Instala las dependencias
de la skill que vayas a usar antes de ejecutarla.

Las skills las instala `intelix-cli`. Para traer una version nueva sin tocarlas a mano, corre
`intelix-cli sync --force` en la raiz del proyecto.

## Task tracker: registro obligatorio del avance

El avance de las tareas de AI-DLC se mantiene en los indices `tracking/` del layout activo. Antes
de modificarlos, lee `.claude/skills/intelix-task-tracker/SKILL.md` y ejecuta la comprobacion de desalineacion:

```bash
python .claude/skills/intelix-task-tracker/check_drift.py
```

Registra 🔄 y el timestamp real antes de empezar, y 🟡 con fin y duracion al terminar. Solo el
humano concede ✅. No existe un guard preventivo ni un `tracker.py`: conserva el historial con Git,
reconcilia contra los planes AI-DLC y no fabriques timestamps.

Tres cosas que no se pueden hacer, por diseño:

- **Dictar una hora.** El timestamp lo toma el reloj del sistema. No existe `--at` ni equivalente.
  Si hubo trabajo sin registrar, deja el hueco y anotalo con `note`: un dato faltante es honesto,
  uno fabricado no.
- **Marcar una tarea como verificada.** El estado ✅ significa "un humano lo comprobo" y requiere
  su terminal. Podes pedirla —diciendo en concreto que probar y que comando correr— nunca
  concederla.
- **Editar los indices.** `INDICE-PROGRESO.md` e `INDICE-AJUSTES.md` son artefactos derivados de
  un log encadenado. Una edicion manual se detecta y se revierte en el render siguiente.

Al cerrar una unidad de trabajo, avisale al humano que verifique con instrucciones concretas. Solo
despues de su confirmacion actualiza la tarea `VER-<unidad>` a ✅ en el indice correspondiente.

Detalle completo en [`.claude/skills/intelix-task-tracker/SKILL.md`](.claude/skills/intelix-task-tracker/SKILL.md).
<!-- intelix:end -->
