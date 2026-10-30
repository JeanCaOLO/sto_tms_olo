# Documentacion del proyecto

Este proyecto fue configurado con la plantilla INTELIX · IA-DLC (`intelix-cli`).

## Que es esta plantilla

`template_base` es el **nucleo reutilizable** con el que INTELIX estandariza el
desarrollo asistido por agentes: metodologia **AI-DLC** (ciclo de vida asistido por
IA), **skills corporativas** (prefijo `intelix-`), **estandares** (desarrollo,
seguridad R1–R14, base de datos), **gobierno de ramas GitLab**, trazabilidad de
avance y **certificacion** de cumplimiento. No es la aplicacion de negocio: es el
ADN comun que se aplica tanto a proyectos nuevos como existentes, con un rigor
proporcional al riesgo del cambio.

## Como se aplica (y como se actualiza)

La plantilla la instala y mantiene el CLI `intelix-cli`. Comandos esenciales:

| Accion | Comando |
|--------|---------|
| Configurar un proyecto nuevo | `intelix-cli init` |
| Aplicar sobre el repo actual | `intelix-cli init --here` |
| Auditar una adopcion sin escribir | `intelix-cli adopt --analyze` |
| Adoptar con snapshot y rollback | `intelix-cli adopt --apply` |
| **Actualizar a la ultima version** de skills/docs | `intelix-cli sync --force` |
| Ver personalizaciones y conflictos tras `sync` | `intelix-cli managed-files --status` |

> **Para actualizar un proyecto ya configurado:** correr `intelix-cli sync --force`
> en la raiz del repo. El `sync` repone skills, docs, reglas/steering y el fragmento
> CI; preserva personalizaciones locales y, ante un cambio simultaneo, genera
> `.intelix-new` en vez de sobrescribir (resolver con `managed-files --accept-local`
> / `--accept-template`). No toca el codigo fuente del proyecto.

## Por donde empezar

| Si necesita… | Lea |
|--------------|-----|
| Saber **todo lo que incluye** la plantilla | [FUNCIONALIDADES_PRINCIPALES.md](FUNCIONALIDADES_PRINCIPALES.md) · [HTML](FUNCIONALIDADES_PRINCIPALES.html) |
| Entender o revisar el perfil del proyecto | [guides/perfiles-proyecto-intelix.md](guides/perfiles-proyecto-intelix.md) |
| Revisar el estándar Kotlin/KMP para QA | [estandares/estandares-mobile-kmp-intelix.md](estandares/estandares-mobile-kmp-intelix.md) |
| Operar el dia a dia (Discovery, gates, roles) | [guides/gobierno-iadlc-intelix.md](guides/gobierno-iadlc-intelix.md) |
| Pasar los gates de calidad (diseno, seguridad del diff, DoD) | [guides/gobierno-iadlc-intelix.md](guides/gobierno-iadlc-intelix.md) (seccion 5.1) |
| Diagnosticar un log de CI/CD o ver patrones de avance | [guides/gobierno-iadlc-intelix.md](guides/gobierno-iadlc-intelix.md) (seccion 5.1) |
| Estructurar prompts por fase (anti-alucinacion) | [guides/prompting-por-fase-aidlc.md](guides/prompting-por-fase-aidlc.md) |
| Clasificar un cambio y estimar segun la clase | [guides/gobierno-iadlc-intelix.md](guides/gobierno-iadlc-intelix.md) |
| Arrancar con Discovery | [guides/path-with-discovery.md](guides/path-with-discovery.md) |
| Arrancar sin Discovery | [guides/path-without-discovery.md](guides/path-without-discovery.md) |
| Validar el handoff (Gate 0) | [guides/quality-gate-0.md](guides/quality-gate-0.md) |
| Contar iteraciones de Inception / rework de alcance | [guides/inception-iterations.md](guides/inception-iterations.md) |
| Diseñar acceso seguro entre cuentas AWS | [guides/guia-cross-account-aws.md](guides/guia-cross-account-aws.md) |
| Entregar como PO | [guides/po-cheatsheet.md](guides/po-cheatsheet.md) |
| Optimizar Kiro (contexto y tokens) | [guides/guia-optimizar-kiro.md](guides/guia-optimizar-kiro.md) |
| Configurar steering + AI-DLC a mano (sin power) | [guides/guia-configuracion-steering-aidlc-manual.md](guides/guia-configuracion-steering-aidlc-manual.md) |
| Propiedad de AGENTS.md, steering y reglas por agente | [guides/contrato-propiedad-instrucciones.md](guides/contrato-propiedad-instrucciones.md) |
| Migrar AGENTS.md cuando el framework reclama su propiedad | [guides/migracion-propiedad-agents-md.md](guides/migracion-propiedad-agents-md.md) |
| Integrar CI sin reemplazar el pipeline existente | [guides/integracion-ci-aditiva.md](guides/integracion-ci-aditiva.md) |
| Revisar personalizaciones y conflictos de `sync` | [guides/archivos-administrados-intelix.md](guides/archivos-administrados-intelix.md) |
| Migrar estado AI-DLC v1 a v2 | [guides/migracion-estado-aidlc.md](guides/migracion-estado-aidlc.md) |
| Entender cómo se selecciona el layout o intent activo | [guides/resolucion-layout-aidlc.md](guides/resolucion-layout-aidlc.md) |

## Compatibilidad y adopcion

Antes de adoptar INTELIX en un repositorio existente, consultar
[guides/matriz-soporte-intelix.md](guides/matriz-soporte-intelix.md) y ejecutar
`intelix-cli adopt --analyze`.

## Estandares (no negociables)

| Documento | Tema |
|-----------|------|
| [estandares/estandares-desarrollo-intelix.md](estandares/estandares-desarrollo-intelix.md) | IaC, SAM, React, Lambda/ECS, hexagonal |
| [estandares/estandares-mobile-kmp-intelix.md](estandares/estandares-mobile-kmp-intelix.md) | Kotlin/KMP y preparación técnica para QA (`MOB1`–`MOB8`) |
| [estandares/seguridad-baseline.md](estandares/seguridad-baseline.md) | Controles R1–R14 |

> La copia canonica de desarrollo esta en `docs/estandares/`. Si existe
> `docs/estandares-desarrollo-intelix.md` en la raiz de docs, es un alias legado:
> use siempre la ruta bajo `estandares/`.

## Base de datos (nomenclatura y aprovisionamiento)

| Documento | Tema |
|-----------|------|
| [README-solucion-base-de-datos.md](README-solucion-base-de-datos.md) | Guia practica (OLTP / lago / bridge) |
| [estandares-base-de-datos.md](estandares-base-de-datos.md) | Marco general por naturaleza |
| [estandares-base-de-datos-oltp-intelix.md](estandares-base-de-datos-oltp-intelix.md) | OLTP multi-motor |
| [estandares-lago-de-datos-intelix.md](estandares-lago-de-datos-intelix.md) | Lago (bronze → silver → gold → ssot) |
| [estandares-datawarehouse-intelix.md](estandares-datawarehouse-intelix.md) | Modelo dimensional (DWH) |
| [estandares-bridge-intelix.md](estandares-bridge-intelix.md) | Bridge / interface |

Skills: `intelix-db-provisioning` (OLTP) y `intelix-datalake-naming` (validador).

## Gobierno GitLab

| Documento | Tema |
|-----------|------|
| [estrategia-control-versiones.md](estrategia-control-versiones.md) | develop · qa · master |
| [protocolo-hotfixes.md](protocolo-hotfixes.md) | Emergencias y backport |
| [guia-configuracion-gitlab.md](guia-configuracion-gitlab.md) | Proteccion de ramas |
| [roles-y-accesos-gitlab.md](roles-y-accesos-gitlab.md) | Roles |
| [guia-seguimiento-gitlab.md](guia-seguimiento-gitlab.md) | Seguimiento |
| [guia-nuevo-proyecto-lider.md](guia-nuevo-proyecto-lider.md) | Alta de proyecto (lider) |

## Herramientas

| Herramienta | Donde |
|-------------|--------|
| Gate 0 | `python .intelix/scripts/validate_discovery_gate.py` |
| Gate de arquitectura (diseno) | `python .intelix/scripts/arquitectura_gate.py` |
| Linter de seguridad incremental | `node scripts/verificacion/lib/linter-incremental.js --staged` |
| Diagnostico de logs de CI/CD | `python .intelix/scripts/devops_diagnostico.py --stdin` |
| Observador de tareas (patrones) | `python .intelix/scripts/observador_tareas.py` |
| Iteraciones Inception / impacto Construction | `python .intelix/scripts/inception_iterations.py` |
| Certificacion | `node scripts/verificacion/analizador.js --proyecto .` |
| Contrato de producto | `Product-Definition/` |
| Pin AI-DLC | `.intelix/config.json` → `aidlcVersion` |
| Asegurar plantilla + runtime autorizados | [guides/fuente-autorizada-plantilla-y-aidlc.md](guides/fuente-autorizada-plantilla-y-aidlc.md) |
| Chequeo local | `python .intelix/scripts/verify_authorized_stack.py` |

Las skills se invocan desde el agente de codigo (prefijo `intelix-`). Listado completo en [FUNCIONALIDADES_PRINCIPALES.md](FUNCIONALIDADES_PRINCIPALES.md) seccion 4.

## Catalogo de skills (que hacen y como se usan)

Las skills viven en la carpeta nativa del agente elegido (p. ej. `.kiro/`,
`.cursor/skills/`, `.claude/skills/`, `.agents/skills/`). Se **invocan desde el chat
del agente** describiendo la tarea; algunas traen un motor/script que se corre en la
terminal. Varias skills con scripts Python traen su `requirements.txt`: instalarlo
antes de usarlas.

### Planificacion y requerimientos

| Skill | Para que sirve | Como se usa |
|-------|----------------|-------------|
| `intelix-objetivos-y-plan-trabajo` | Objetivos y plan segun la clase (Menor/Intermedio/Mayor) | Pedir en el agente "definir objetivos / plan de trabajo" |
| `intelix-ficha-de-solicitud` | Ficha de solicitud trazable desde el pedido | "crear/completar una ficha de solicitud" |
| `intelix-estimacion` | Estimacion de esfuerzo (HH) en Excel | "estimar" / "plan de trabajo"; genera `.intelix/outputs/estimacion/` |
| `intelix-requirements-matrix-excel` | Matriz de requerimientos en Excel | "matriz de requerimientos en Excel" |
| `intelix-requirements-matrix-pdf` | La misma matriz en PDF | "matriz de requerimientos en PDF" |

### Documentacion y conversion

| Skill | Para que sirve | Como se usa |
|-------|----------------|-------------|
| `intelix-project-docs-html` | Documentacion HTML del proyecto + Swagger UI | "generar documentacion HTML" |
| `intelix-file-to-markdown` | Convierte PDF/Word/Excel/etc. a Markdown | "convertir este archivo a Markdown" |

### Seguimiento y avance

| Skill | Para que sirve | Como se usa |
|-------|----------------|-------------|
| `intelix-task-tracker` | Avance por tarea con verificacion humana | Trabaja sobre el tracking AI-DLC; "ver avance / tareas pendientes" |
| `intelix-seguimiento-plan` | Snapshot baseline vs real (% agente / verificado) | "reporte de seguimiento del plan" |
| `intelix-roadmap-generator-html` | Roadmap/linea de tiempo en HTML | "generar un roadmap" desde el Excel del plan |
| `intelix-consolidado-avance` | Avance consolidado multi-rama / multi-dev | "avance consolidado de todo el proyecto" |
| `intelix-inception-iterations` | Vueltas de Inception y rework de alcance (HH) | `python .intelix/scripts/inception_iterations.py` |

### Gates de calidad del ciclo (Oleada A)

| Skill | Para que sirve | Como se usa |
|-------|----------------|-------------|
| `intelix-arquitectura-gate` | Valida el diseno (ADR) antes de codificar | `python .intelix/scripts/arquitectura_gate.py --scaffold` y luego sin flags |
| `intelix-seguridad-linter` | Aviso temprano de seguridad (R1–R7) sobre el diff | `git diff --name-only --cached \| node scripts/verificacion/lib/linter-incremental.js --staged` |
| `intelix-qa-gate` | Definition of Done por unidad y checklist Pre-Deploy (R11) | Pedir "cerrar la unidad / checklist pre-deploy"; orquesta tracker + certificacion |

### Diagnostico y mejora continua (Oleada B, solo lectura)

| Skill | Para que sirve | Como se usa |
|-------|----------------|-------------|
| `intelix-devops-diagnostico` | Clasifica un log de CI/CD y propone fix guiado (no despliega) | `python .intelix/scripts/devops_diagnostico.py --stdin` (pegar el log) o `--archivo <log>` |
| `intelix-observador-tareas` | Patrones de avance/cuellos/rework reusando tracker + ledger | `python .intelix/scripts/observador_tareas.py` |

### Gobierno, certificacion, datos y movil

| Skill | Para que sirve | Como se usa |
|-------|----------------|-------------|
| `intelix-git-flow` | Arbol de ramas y protecciones GitLab | "preparar git flow / proteger ramas" |
| `intelix-certificacion` | Dictamen Apto / Con observaciones / No apto para QA | Corre el motor `scripts/verificacion/` y redacta el acta |
| `intelix-db-provisioning` | Scripts SQL de aprovisionamiento OLTP multi-motor | "aprovisionar base de datos transaccional" |
| `intelix-datalake-naming` | Valida nomenclatura analitica (lago/DWH/bridge) | "validar nombres de tablas del lago" |
| `intelix-mobile-kmp` | Desarrollo/revision Android Kotlin y KMP (+ estandar AFV) | "feature/correccion/revision en modulo Kotlin o KMP" |

Guia de prompts por fase para usar mejor las skills:
[guides/prompting-por-fase-aidlc.md](guides/prompting-por-fase-aidlc.md).
Como encajan los gates en el ciclo: [guides/gobierno-iadlc-intelix.md](guides/gobierno-iadlc-intelix.md) (seccion 5.1).
