# Funcionalidades de la plantilla INTELIX · IA-DLC

**Que es este documento.** El inventario oficial de lo que la plantilla entrega a cada proyecto. Sirve para onboarding, auditorias internas y alineacion con gerencia. Si una capacidad no aparece aqui, no forma parte del nucleo compartido.

**Como viaja al proyecto.** `intelix-cli init` / `sync` copia el contenido desde `templates/` del CLI. Este archivo queda en `docs/FUNCIONALIDADES_PRINCIPALES.md` de cada repo.

**Lectura recomendada por rol**

| Rol | Empiece por |
|-----|-------------|
| Gerencia / PM | Secciones 1–3, 8 y 8.1 |
| Desarrollador | Secciones 2, 4, 5, 8 y 9 |
| Arquitectura / DevSecOps | Secciones 3, 6, 7, 8 y 10 |
| Lider de proyecto / Maintainer | Seccion 11 y `docs/guia-nuevo-proyecto-lider.md` |
| Datos / DBA | Seccion 4.5, 8.1 y `docs/README-solucion-base-de-datos.md` |

Indice de docs del proyecto: [`docs/README.md`](README.md).  
Guia operativa diaria: [`docs/guides/gobierno-iadlc-intelix.md`](guides/gobierno-iadlc-intelix.md).

---

## 1. Proposito

La plantilla no es la aplicacion de negocio. Es el **nucleo reutilizable** con el que INTELIX estandariza:

- metodologia AI-DLC (ciclo de vida asistido por IA),
- skills corporativos (plan, docs, avance, iteraciones Inception, datos, gobierno, certificacion),
- seguridad (baseline R1–R14),
- estandares de desarrollo y de base de datos (OLTP / lago / bridge),
- gobierno de ramas y GitLab,
- trazabilidad de avance,
- certificacion de cumplimiento frente a estandares.

Un proyecto nuevo o uno existente reciben el mismo ADN. El rigor se ajusta al riesgo del cambio, no al gusto del equipo.

Antes del nombre y de los agentes, `init` registra `.intelix/project-profile.json`: tipo de
solucion, origen nuevo/existente, baseline agentic/AI-DLC e infraestructura. Es una decision del
proyecto separada de `.intelix/config.json`; `sync` no la modifica. Guia:
`docs/guides/perfiles-proyecto-intelix.md`.

El perfil se proyecta en `.intelix/applicability-policy.json`: allí quedan explícitos los perfiles
técnicos aplicables, las limitaciones de certificación y qué componentes administra Intelix o
preserva como propiedad del proyecto. Para perfiles móviles completos, el motor ejecuta únicamente
los controles KMP `MOB1`–`MOB8` y no mezcla requisitos AWS/SAM/React.

`intelix-cli profile --show` permite consultar la clasificación y
`intelix-cli profile --configure` completarla o corregirla. Cada cambio conserva el JSON anterior
en `.intelix/profile-history/` y no ejecuta una sincronización del proyecto.

---

## 2. Arranque del producto (Discovery opcional)

### 2.1 Contrato `Product-Definition/`

Carpeta contractual entre negocio y desarrollo:

| Artefacto | Contenido |
|-----------|-----------|
| `vision-document.md` | Problema, casos de uso, KPIs, fuera de alcance, clasificacion |
| `technical-environment.md` | Stack, integraciones, cumplimiento, restricciones Intelix |
| `open-questions.md` | Ambiguedades y riesgos |
| `HANDOFF_PROMPT.md` | Llave de arranque para Cursor o Kiro |
| `ENTRY_MODE.md` | `with-discovery` o `no-discovery` |
| `visual/` | Opcional (viajes, mockups) |

### 2.2 Dos modos de entrada

| Modo | Cuando | Resultado |
|------|--------|-----------|
| **with-discovery** | El PO ya entrego artefactos reales | Gate 0 → Inception |
| **no-discovery** | No hubo Discovery formal | Ideation completa `Product-Definition/` → Gate 0 estricto → Inception |

Al cerrar Ideation, ambos caminos deben converger en los mismos artefactos minimos.

### 2.3 Quality Gate 0 (handoff)

Filtro humano + script antes de Inception.

```bash
python .intelix/scripts/validate_discovery_gate.py --mode with-discovery
python .intelix/scripts/validate_discovery_gate.py --mode no-discovery --strict-no-discovery
```

- Estado: `.aidlc/aidlc-state.md` (`entry_mode`, `gate_status`, contadores de iteraciones).
- Reporte Gate 0: `.aidlc/audit/gate0-latest.md`.
- Iteraciones Inception / impacto Construction: ledger
  `.aidlc/audit/inception-iterations.jsonl` + reporte
  `inception-report.md|.html` (`python .intelix/scripts/inception_iterations.py`).
- Issues GitLab: *Discovery Handoff*, *Start Without Discovery*,
  *Inception Iteration or Scope Change*.
- Guias: `docs/guides/path-with-discovery.md`, `path-without-discovery.md`,
  `quality-gate-0.md`, `inception-iterations.md`, `po-cheatsheet.md`.

**Nota:** `.aidlc/` en esta plantilla es el **overlay de Gate 0 / entry mode / iteraciones**.
El estado por intent del motor AI-DLC vive en `aidlc/spaces/.../intents/`.

---

## 3. Metodologia AI-DLC

### 3.1 Cinco fases

1. **Initialization** — entorno y deteccion greenfield / brownfield  
2. **Ideation** — intencion y alcance  
3. **Inception** — en Menor, tres respuestas; en Intermedio, un cuestionario medio; en Mayor, requerimientos, historias y diseno  
4. **Construction** — el como (unidades, codigo, pruebas)  
5. **Operation** — despliegue, monitoreo, aprendizajes  

La IA propone; una persona con autoridad aprueba en cada puerta relevante.

### 3.2 Clasificacion y rigor proporcional

Principio: *aplica el proceso necesario para el riesgo del cambio.*

| Clasificacion | Esfuerzo tradicional | Gates tipicos |
|---------------|----------------------|---------------|
| Menor | < 40 HH | Si al integrar a desarrollo |
| Intermedio | 40–240 HH | Concepcion + pre-despliegue |
| Mayor | > 240 HH | Ideacion + Concepcion + pre-despliegue + operacion |

**Origen de la clasificacion:** al iniciar el pedido, la agentica propone Menor/Intermedio/Mayor segun el esfuerzo **tradicional / impacto** que surge de las preguntas de alcance. Si el Lider ya conoce el impacto, puede fijar la clase. Esa declaracion prevalece cuando la clase que indica el esfuerzo quedo escrita. Si declara Menor y el esfuerzo indica Intermedio o Mayor, la diferencia queda anotada y no se borra. El calendario con AI-DLC suele ser **mas corto**, pero **no** se baja de clase solo por velocidad agentica. Si el alcance contradice la clase, se senala y se reclasifica de forma explicita.

**Tres recorridos.** Todo cambio empieza con tres respuestas: que se cambia y para que, donde vive el cambio, y como se sabe que quedo resuelto. La clase se propone despues, con HH tradicionales e impacto, y el lider la confirma. Si el esfuerzo indica Intermedio o Mayor y la declaracion es Menor, esa diferencia queda anotada en la ficha y no se borra; el cuestionario que sigue es el de la clase que indica el esfuerzo. Menor confirmado termina en esas tres respuestas. Intermedio agrega sistemas, contratos o datos, de uno a tres objetivos especificos, prueba y aceptacion, y si toca acceso, datos personales, secretos o el esquema; con eso Arquitectura y Seguridad revisan el diseno. Mayor recorre el cuestionario completo, con ideacion, Concepcion, plan y operacion. La estimacion se hace en las tres clases y solo incluye los elementos de esa clase. Sesiones de entendimiento, prototipos, modelo de solucion y arquitectura completa se piden en Mayor. Los estandares se cumplen en la construccion. El si al integrar a desarrollo sigue en las tres clases. Gate 0 y `Product-Definition` se conservan para el arranque de un proyecto nuevo.

Un **gate** es decision humana con veto, materializada en Merge Request (`develop` → `qa` → `master`). No es un check automatico.

| Momento | Quien | Que verifica |
|---------|-------|--------------|
| Ideacion | RC/RT y patrocinador | Problema, alcance y viabilidad. Solo en Mayor. |
| Concepcion | Arquitectura / Seguridad | Diseno. En Intermedio y en Mayor. |
| Integracion a desarrollo | Lider de desarrollo y lider funcional | En Menor, el cambio sigue a calidad y a produccion. En Intermedio y Mayor, autoriza el despliegue a produccion. |
| Operacion | Operaciones | Despliegue, monitoreo y vuelta atras. Solo en Mayor. |

### 3.2bis Iteraciones de Inception y rework de alcance

Tras Gate 0, cada vuelta en Inception o cada cambio de alcance que impacte Construction
se registra en `.aidlc/audit/inception-iterations.jsonl`. El reporte de gestion
(`inception-report.html`) muestra:

- cantidad de iteraciones en Inception (con fechas de apertura/cierre);
- eventos que afectaron Construction (devs, ramas `feature/*`, efecto en `develop`);
- contadores resumidos en `aidlc-state.md`.

Guia: `docs/guides/inception-iterations.md`. Demo local:
`python .intelix/scripts/inception_iterations.py simulate` (no se espeja en init).

### 3.3 Runtime y version

- Canal oficial: binario `aidlc` + `aidlc config` (un solo agente por proyecto recibe AI-DLC).
- Pin de equipo: `.intelix/config.json` → `aidlcVersion` (default del CLI: **2.8.2**).
- No usar `latest` ni la rama flotante `v2` si el estandar del equipo es una version fija.
- Workspace: `aidlc/spaces/default/` (memory, knowledge, intents).
- Bedrock: el CLI lo desactiva en Claude Code; Intelix no opera sobre Bedrock.

Detalle de instalacion: `README.md` del `intelix-cli`.

---

## 4. Skills corporativos INTELIX

Capacidades invocables en el agente (Cursor, Kiro, Claude, etc.). Prefijo de carpeta `intelix-*`. Se instalan en la carpeta nativa de **cada** agente elegido.

### 4.1 Planificacion

| Skill | Para que | Salida tipica |
|-------|----------|---------------|
| `intelix-objetivos-y-plan-trabajo` | Objetivos segun la clase: uno general en Menor, 1 a 3 especificos en Intermedio, 1 a 5 en Mayor | Objetivos de la clase |
| `intelix-ficha-de-solicitud` | Ficha del recorrido de la clase | Ficha + estimacion de la clase |
| `intelix-estimacion` | Estimacion con los elementos de la clase | Excel (Plan, Resumen, Colaboradores) |

> En un cambio Menor hecho fuera de `/aidlc` no hay task-tracker: la construccion del plan
> se toma de `scripts/construccion-menor.json` (que escribe `intelix-ficha-de-solicitud` al
> cerrar la ficha corta). Precedencia de la fuente: task-tracker > ficha corta > vacia.

### 4.2 Documentacion y requerimientos

| Skill | Para que | Salida tipica |
|-------|----------|---------------|
| `intelix-requirements-matrix-excel` | Matriz de identificacion | `.xlsx` |
| `intelix-requirements-matrix-pdf` | Misma matriz | PDF |
| `intelix-project-docs-html` | Docs del proyecto + Swagger UI | HTML |
| `intelix-file-to-markdown` | Conversion de 21 formatos a Markdown | `.md` |

### 4.3 Seguimiento y trazabilidad

| Skill | Para que | Salida tipica |
|-------|----------|---------------|
| `intelix-task-tracker` | Avance por tarea con verificacion humana | Ledger + indices en `aidlc-docs/tracking/` (v1) o el intent activo (v2) |
| `intelix-seguimiento-plan` | Baseline vs real (% agente / % verificado) | Snapshot Excel |
| `intelix-roadmap-generator-html` | Plan Excel → roadmap interactivo | HTML |
| `intelix-consolidado-avance` | Avance multi-rama / multi-dev | Dashboard consolidado |
| `intelix-inception-iterations` | Vueltas de Inception + rework alcance (fechas, develop, HH) | Ledger + reporte gestion |

### 4.4 Gobierno y certificacion

| Skill | Para que | Salida tipica |
|-------|----------|---------------|
| `intelix-git-flow` | Arbol de ramas y protecciones GitLab | Ramas + comandos API |
| `intelix-certificacion` | Dictamen Apto / Con observaciones / No apto para QA, con la forma ejecutiva del acta (fortalezas, puntos de cierre, matriz de trazabilidad) integrada | Informe ejecutivo MD + HTML (8 secciones); no recalcula el dictamen |

### 4.5 Datos y base de datos

| Skill | Para que | Salida tipica |
|-------|----------|---------------|
| `intelix-db-provisioning` | Scripts SQL de aprovisionamiento OLTP multi-motor (no se conecta a BD) | SQL + validacion |
| `intelix-datalake-naming` | Linter de nomenclatura (OLTP, lago, bridge) | Reporte de cumplimiento |

Guia practica: `docs/README-solucion-base-de-datos.md`.  
Normas: `estandares-base-de-datos.md`, `estandares-base-de-datos-oltp-intelix.md`, `estandares-lago-de-datos-intelix.md`, `estandares-datawarehouse-intelix.md`, `estandares-bridge-intelix.md`.

### 4.6 Desarrollo movil

| Skill | Para que | Salida tipica |
|-------|----------|---------------|
| `intelix-mobile-kmp` | Desarrollo y revision tecnica de Android con Kotlin y proyectos Kotlin Multiplatform | Codigo y pruebas del proyecto; informe de verificaciones y pendientes por target |

La skill implementa el estándar arquitectónico corporativo Intelix para Kotlin y KMP
(`references/estandar-arquitectura-kmp.md`: Clean Architecture, patrón `Result<T>`, MVVM/MVI, Koin
con casos de uso como `factory`, KDoc estructurado).

Para el sistema **AFV (cliente Mayoreo)**, incorpora el estándar específico
(`references/estandar-afv-mayoreo.md`: Compose Multiplatform, Voyager, Room + SQLCipher, SDS/sincronización,
y bridge iOS nativo), el cual **prevalece sobre el genérico** en caso de conflicto.

Usa el estándar `docs/estandares/estandares-mobile-kmp-intelix.md` y el motor
determinista `MOB1`–`MOB8` para emitir un dictamen de preparación técnica para QA. No certifica
cumplimiento de Google Play o App Store, no firma artefactos y no publica aplicaciones.

### 4.7 Puertas de calidad del ciclo (gates)

Puertas de control que **fortalecen** fases de AI-DLC v2.8.2 sin saltarlas ni
reemplazar el sign-off humano. No recalculan el dictamen del motor.

| Skill | Fase que fortalece | Para que | Salida tipica |
|-------|--------------------|----------|---------------|
| `intelix-arquitectura-gate` | Inception → Construction | Verifica el diseno (ADR) contra el estandar antes de codificar | Reporte `.aidlc/audit/arquitectura-gate-latest.md` + ADR |
| `intelix-seguridad-linter` | Construction | Aviso temprano de seguridad (R1–R7) sobre el diff, antes de CI | Hallazgos por archivo (texto/JSON); no emite dictamen |
| `intelix-qa-gate` | Cierre de unidad + Pre-Deploy | Formaliza la DoD (R1–R8) y el checklist R11 AUTORIZADO/BLOQUEADO | Checklist trazable |
| `intelix-devops-diagnostico` | Pre-Deploy / Operacion | Clasifica un log de CI/CD (solo lectura) y propone fix guiado; no despliega ni toca R11 | `.intelix/outputs/devops_diagnostico/` |
| `intelix-observador-tareas` | Transversal (mejora continua) | Telemetria de patrones reusando tracking + ledger existentes; sin PII | `.intelix/outputs/observador_tareas/` |

Guia complementaria (no skill): `docs/guides/prompting-por-fase-aidlc.md` estructura
los prompts por fase para reducir alucinaciones (Prompt Master).

Las dos ultimas son de **solo lectura/diagnostico**: no ejecutan despliegues, no
automatizan la puerta R11 ni capturan datos nuevos.

**Total skills corporativas en la plantilla: 22** (mas el runtime AI-DLC del agente elegido).

**Regla de procedencia (skills de plan):** los artefactos deben venir de Discovery, Inception o `Product-Definition/` validado. Sin fuente, se bloquea la generacion.

---

## 5. Task tracker y avance

- El avance se registra en los indices Markdown del layout AI-DLC activo, siguiendo la skill.
- `check_drift.py` detecta desalineaciones contra los planes; no bloquea escrituras.
- Git conserva el historial auditable de los indices y ajustes.
- Timestamps del sistema: no se fabrican horas.
- El estado ✅ (verificado) solo lo concede un humano en su terminal.

Reporte de avance (doble salida):

- Markdown para equipo tecnico (GitLab).
- HTML para gerencia / cliente (artefacto de CI o generacion local).

CLI auxiliar: `.intelix/cli/reporte-avance/`.

---

## 6. Certificacion de estandares

Modelo hibrido:

| Capa | Rol |
|------|-----|
| Motor `scripts/verificacion/` | Determinista (Node, sin deps). Misma entrada → mismo dictamen. Sirve en CI. |
| Skill `intelix-certificacion` | Interpreta bordes, valida N/A y redacta el acta con la forma ejecutiva integrada (ficha, fortalezas, cierre, plan, matriz). **No recalcula** la puntuacion. |
| Linter `intelix-seguridad-linter` | Aviso temprano (pre-CI) sobre el diff, reusa los patrones del motor. **No** emite dictamen. |

```bash
node scripts/verificacion/analizador.js --proyecto . --exposicion corporativa|publica --alcance estandares|completo
```

| Alcance | Uso |
|---------|-----|
| `estandares` | Desarrollo, arquitectura, BD, seguridad (sin exigir pruebas) |
| `completo` | Puerta a produccion: suma pruebas / cobertura |

Pesos: Infraestructura 30% · Codigo 25% · Seguridad 35% · DevOps 10%.  
Dictamen: **Apto** (≥85%, 0 criticos) · **Con observaciones** · **No apto**.  
Salida por defecto: `docs/certificaciones/`.  
Job CI manual: `certificacion_estandares`.

---

## 7. Seguridad baseline R1–R14

Documento compartible: `docs/estandares/seguridad-baseline.md`  
Steering operativo: `.kiro/steering/seguridad-baseline.md`

Estados por control: cumplido · no-cumplido · N/A-justificado · diferido-piloto.

**HARD-STOP** (bloquean cierre de unidad o despliegue): R1, R3, R5, R6, R11.

| Bloque | Controles |
|--------|-----------|
| Construccion | R1–R8 |
| Operacion | R9–R12 |
| Transversal | R13–R14 |

La seguridad se cierra **dentro de cada unidad**, no al final del proyecto. El enforcement tecnico (SAST, scanners) se activa por proyecto consumidor; la baseline documental ya viaja con la plantilla.

Complemento: seccion de seguridad interno vs publico en `docs/estandares/estandares-desarrollo-intelix.md`.

---

## 8. Estandares de desarrollo

Fuente canonica: `docs/estandares/estandares-desarrollo-intelix.md`.

Incluye, entre otros:

- IaC / SAM: si no esta en el template, no esta listo para desplegar.
- Serverless-first (Lambda por defecto; ECS justificado).
- Controles SQS de resiliencia.
- IAM de minimo privilegio.
- Frontend: React + design system.
- Backend: Python hexagonal, SOLID, DRY.
- Diferenciacion de controles segun app interna vs externa.

### 8.1 Estandares de base de datos

La naturaleza de la BD decide la convencion (**no se mezclan**):

| Naturaleza | Norma | Skill |
|------------|-------|-------|
| OLTP (transaccional) | `estandares-base-de-datos-oltp-intelix.md` | `intelix-db-provisioning` |
| Lago de datos | `estandares-lago-de-datos-intelix.md` (+ DWH) | `intelix-datalake-naming` |
| Bridge / interface | `estandares-bridge-intelix.md` | `intelix-datalake-naming` |

Guia de uso: `docs/README-solucion-base-de-datos.md`. Marco: `docs/estandares-base-de-datos.md`.

---

## 9. Gobierno Git / GitLab

### 9.1 Ramas y ambientes

| Rama | Ambiente |
|------|----------|
| `feature/*` / `bugfix/*` | Trabajo aislado → merge a develop |
| `develop` | DEV |
| `qa` | QA |
| `master` | PROD (+ tag `vX.Y.Z`) |
| `hotfix/*` | Emergencia desde master + backport a develop y qa |

Documentos: `estrategia-control-versiones.md`, `protocolo-hotfixes.md`, `guia-configuracion-gitlab.md`, `roles-y-accesos-gitlab.md`, `guia-seguimiento-gitlab.md`.

Si la carpeta local es un clon de `template_base`, el programador desvincula ese
repositorio (`git remote remove origin`, borrar `.git`, `git init`) y asocia el
repo del proyecto (`git remote add origin`). No se hace sobre la copia de trabajo
de la plantilla ni con `git remote set-url`. Guia: `docs/guia-nuevo-proyecto-lider.md`.

### 9.2 Tres capas de enforcement

1. **Prevencion** — docs y agente guian el flujo correcto.  
2. **Bloqueo** — GitLab rechaza push directo; exige MR con aprobacion.  
3. **Deteccion** — CI / chequeos de sincronizacion y backport.

### 9.3 Pipeline aditivo (`.gitlab/intelix-ci.yml`)

En proyectos nuevos, `.gitlab-ci.yml` activa este fragmento mediante un `include` local. En
proyectos existentes, INTELIX preserva el pipeline raiz y solicita incorporar el include
manualmente. Los jobs usan `.pre` y `.post`, sin imponer stages al proyecto consumidor.
El pipeline mínimo de un proyecto nuevo añade un job ancla en `test` para que GitLab inicie el
pipeline cuando solo sean aplicables jobs reservados.

| Job | Funcion |
|-----|---------|
| `gate0_discovery` | Valida `Product-Definition/` |
| `certificacion_estandares` | Motor de certificacion (manual) |
| `build_dashboard` | Regenera reporte de avance (MD + HTML) |
| `daily_sync_check` | Recordatorio en issues sin actividad (schedule) |

---

## 10. Arnes multi-IDE

| Capacidad | Cursor | Kiro IDE | Antigravity | Otros (Claude, Codex, Copilot, opencode, Kiro CLI) |
|-----------|--------|----------|-------------|-----------------------------------------------------|
| Skills Intelix | Si | Si | Si, en `.agents/skills/` | Si (carpeta nativa de cada uno) |
| AI-DLC runtime | Si el agente elegido lo recibe | Idem | No en AI-DLC 2.8.2 | Idem (solo **uno** por proyecto) |
| Reglas plantilla | `.cursor/rules/intelix-aidlc.mdc` | `.kiro/steering/*` | `.agents/rules/intelix-aidlc.md` | Bloque `intelix` en `AGENTS.md` / `CLAUDE.md` |
| Integridad task-tracker | `check_drift.py` + Git | `check_drift.py` + Git | Mismo mecanismo | Mismo mecanismo para todos los agentes |

Instrucciones permanentes anexadas por el CLI: `templates/agents/intelix-block.md`.
El contrato de propiedad impide adoptar cuando el manifiesto no permite bloques,
una skill externa reescribe instrucciones o las reglas apuntan a skills ausentes:
`docs/guides/contrato-propiedad-instrucciones.md`.

---

## 11. Que deja `intelix-cli` en el repositorio

```text
<proyecto>/
  .intelix/                    config, scripts (Gate 0), tracking, CLI reporte
  .intelix/project-profile.json tipo de solucion, baseline e infraestructura
  .intelix/managed-files.json   checksums, personalizaciones y conflictos de sync
  Product-Definition/          contrato Discovery
  .aidlc/                      overlay Gate 0 / entry_mode
  aidlc/spaces/default/        memory, knowledge, intents
  docs/                        estandares, guias, funcionalidades
  scripts/verificacion/        motor de certificacion
  .gitlab/                     templates + intelix-ci.yml administrado
  .gitlab-ci.yml               pipeline propio; incluye el fragmento INTELIX si se activa
  .kiro/steering/              seguridad + Discovery (solo si se eligio Kiro)
  .cursor/rules/               reglas Cursor (solo si se eligio Cursor)
  .agents/rules/               reglas Antigravity (solo si se eligio Antigravity)
  <harness>/skills/intelix-*   skills por agente
```

Comandos esenciales del CLI:

| Comando | Uso |
|---------|-----|
| `intelix-cli init` | Crea o configura un proyecto |
| `intelix-cli init --here` | Sobre el repo actual |
| `intelix-cli adopt --analyze` | Audita una adopcion sin escribir |
| `intelix-cli adopt --apply` | Adopta con snapshot y rollback |
| `intelix-cli sync --force` | Actualiza skills/docs y retira guards obsoletos |
| `intelix-cli managed-files --status` | Muestra personalizaciones y conflictos |
| `intelix-cli managed-files --accept-local <ruta>` | Conserva la version local |
| `intelix-cli managed-files --accept-template <ruta>` | Acepta la propuesta `.intelix-new` |
| `intelix-cli migrate aidlc-state --from v1 --to v2 --dry-run` | Planifica la migración sin escribir |
| `intelix-cli migrate aidlc-state --from v1 --to v2 --apply --resume-stage <slug>` | Migra tracking y progreso con respaldo e informe |
| `--aidlc-version` | Fija la version de AI-DLC |
| `--aidlc-policy install|preserve|upgrade|none` | Persiste la decisión de instalar, conservar, actualizar u omitir el runtime |
| `--skip-aidlc` | Solo skills y docs; persiste `aidlcPolicy: none` |

Mantenimiento de contenido de la plantilla: `GUIA-CONTENIDO.md` en el repo del CLI.

---

## 12. Mapa rapido de documentos compartibles

| Documento | Audiencia | Contenido |
|-----------|-----------|-----------|
| Este archivo | Todos | Inventario de funcionalidades |
| `FUNCIONALIDADES_PRINCIPALES.html` | Direccion / onboarding visual | Misma narrativa en HTML |
| `guides/gobierno-iadlc-intelix.md` | Equipo de proyecto | Como operar dia a dia |
| `guides/prompting-por-fase-aidlc.md` | Todos los roles | Estructura de prompts por fase (anti-alucinacion) |
| `guides/inception-iterations.md` | PM / Arquitectura / Dev | Vueltas de Inception, rework alcance y HH |
| `guides/fuente-autorizada-plantilla-y-aidlc.md` | Lider + Dev | Plantilla Git oficial + pin AI-DLC en la PC |
| `guides/integracion-ci-aditiva.md` | Dev / DevOps | Activar jobs INTELIX sin reemplazar el pipeline propio |
| `guides/archivos-administrados-intelix.md` | Dev / Maintainer | Checksums, `.intelix-new` y resolución de conflictos |
| `guides/migracion-estado-aidlc.md` | Dev / Maintainer | Migración explícita y preservación de AI-DLC v1 → v2 |
| `guides/resolucion-layout-aidlc.md` | Dev / Maintainer | Selección inequívoca del space, intent y tracking v1/v2 |
| [guia-cross-account-aws.md](guides/guia-cross-account-aws.md) | Arquitectura / DevSecOps | Patrones seguros para acceso AWS entre cuentas |
| `estandares/estandares-desarrollo-intelix.md` | Dev / Arquitectura | Patron tecnico AWS / React |
| `estandares/estandares-mobile-kmp-intelix.md` | Dev movil / Arquitectura | Kotlin/KMP y controles MOB1–MOB8 para QA |
| `estandares/seguridad-baseline.md` | Dev / CISO | R1–R14 |
| `README-solucion-base-de-datos.md` | Dev / DBA | Nomenclatura y aprovisionamiento BD |
| `estrategia-control-versiones.md` | Dev / Lider | Ramas y promocion |
| `guia-nuevo-proyecto-lider.md` | Maintainer | Crear proyecto en GitLab |
| `scripts/verificacion/README.md` | Dev / QA | Motor de certificacion |

---

## 13. Limites conscientes

La plantilla **no** pretende:

- sustituir el juicio humano en los gates,
- instalar AWS AI-DLC desde el registry npm (canal oficial: instalador nativo),
- vendorizar el engine completo de agents/skills de AI-DLC en Git (lo proyecta `aidlc config`),
- garantizar enforcement automatico de todos los R1–R14 sin herramientas por proyecto,
- ser la aplicacion de negocio del cliente.

Su valor es el **contrato comun**, el **control proporcional** y la **continuidad** entre Discovery, Inception, Construction y Operacion.

### 13.1 Capacidades evaluadas y diferidas (spikes)

Capacidades del ecosistema externo que se evaluaron y **no** se incorporaron, por
romper invariantes de la plantilla (unica dependencia runtime, sin servidores MCP,
sin telemetria con PII). Quedan como spikes con un criterio explicito de entrada:

| Capacidad | Por que se difiere | Que tendria que cumplir para entrar |
|-----------|--------------------|-------------------------------------|
| Headroom / OmniRoute (routing IA, compresion de contexto) | Es infraestructura de modelo, no una fase del ciclo; exige dependencias externas | No requerir deps nuevas ni servidor; aportar un control de calidad verificable al ciclo |
| Graphify (knowledge graph del codigo) | Un grafo real implica persistencia/MCP externo; un sustituto JSON seria un placebo | Memoria util sin servicio externo y sin capturar datos sensibles (R7/R10) |

Lo que **si** se incorporo de ese ecosistema (fortaleciendo fases sin romper nada):
`intelix-arquitectura-gate` (The Architect), `intelix-seguridad-linter` (Cyber Neo),
`intelix-qa-gate` (g-stack), `intelix-devops-diagnostico` (Ally Deploy, recortado a
diagnostico de logs de solo lectura), `intelix-observador-tareas` (Task Observer,
recortado a agregacion de artefactos existentes) y la guia de prompting por fase
(Prompt Master).

---

*Documento vivo: al agregar una skill, un gate o un estandar, actualizar esta pagina en el mismo MR.*
