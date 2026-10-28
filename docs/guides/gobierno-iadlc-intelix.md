# Gobierno IA-DLC INTELIX — guia operativa del equipo

Proyecto: intelix-estandar-frontend · Actualizado: 2026-10-28

Esta guia dice **como trabajar**. El inventario completo de capacidades esta en
[`docs/FUNCIONALIDADES_PRINCIPALES.md`](../FUNCIONALIDADES_PRINCIPALES.md).
El indice de documentacion: [`docs/README.md`](../README.md).

---

## 1. En una frase

Todos construyen con el mismo ADN: AI-DLC, skills Intelix, estandares, seguridad R1–R14
y puertas humanas. El rigor crece con el riesgo del cambio.

## 1.1 Desvincular la plantilla (programador)

Si `git remote get-url origin` apunta a `template_base`, esa carpeta sigue atada al
repositorio base. El programador lo corta en un clon o copia nueva, no en la carpeta
con la que se mantiene la plantilla:

```powershell
git remote remove origin
Remove-Item -Recurse -Force .git
git init
git add -A
git commit -m "chore: scaffold inicial desde template_base IA-DLC"
git remote add origin <url-del-repo-nuevo>
```

`git remote set-url` no reemplaza este corte: dejaria el historial de la plantilla.
Detalle: `docs/guia-nuevo-proyecto-lider.md`. Si el lider ya entrego el link del
proyecto, el programador clona ese repo y no desvincula nada.

## 2. Antes de Inception

1. Declarar modo en `Product-Definition/ENTRY_MODE.md` y `.aidlc/aidlc-state.md`.
2. Completar o recibir `Product-Definition/` (vision, entorno tecnico, open questions, handoff).
3. Correr Gate 0:

```bash
python .intelix/scripts/validate_discovery_gate.py --mode with-discovery
# o, al cerrar Ideation sin Discovery previo:
python .intelix/scripts/validate_discovery_gate.py --mode no-discovery --strict-no-discovery
```

4. Sign-off humano → `gate_status: approved`.
5. Pegar `HANDOFF_PROMPT.md` en el agente que tenga AI-DLC.

Durante Inception y Construction, registrar vueltas de alcance en el ledger
(`.aidlc/audit/inception-iterations.jsonl`) y generar el reporte de gestion:
[inception-iterations.md](inception-iterations.md).

Detalle: [path-with-discovery.md](path-with-discovery.md) · [path-without-discovery.md](path-without-discovery.md) · [quality-gate-0.md](quality-gate-0.md) · [po-cheatsheet.md](po-cheatsheet.md).

## 3. Clasificacion y gates

| Clasificacion | Esfuerzo tradicional | Gates tipicos |
|---------------|----------------------|---------------|
| Menor | < 40 HH | Si al integrar a desarrollo |
| Intermedio | 40–240 HH | Concepcion + pre-despliegue |
| Mayor | > 240 HH | Ideacion + Concepcion + pre-despliegue + operacion |

El cuestionario y los elementos de la estimacion de cada clase estan en **Tres recorridos**, mas abajo.

**Como se obtiene la clasificacion**

1. **Por defecto (agentica):** al iniciar el proyecto o el pedido, el flujo hace preguntas de alcance; la agentica estima esfuerzo e **identifica** Menor / Intermedio / Mayor usando bandas de **HH tradicionales / impacto**.
2. **Lider:** si ya conoce el impacto del cambio, puede **determinar** la clasificacion. Esa declaracion prevalece cuando la clase que indica el esfuerzo quedo escrita. Si declara Menor y el esfuerzo indica Intermedio o Mayor, la diferencia queda anotada y no se borra.
3. El **calendario** con AI-DLC suele ser mas corto (generacion + supervision); eso **no** reclasifica solo a Menor por velocidad.
4. Si el alcance contradice la clase (p. ej. “Menor” que crece de esfuerzo o riesgo), se senala y se **reclasifica** de forma explicita — nunca en silencio.

**Tres recorridos**

Todo cambio empieza por tres respuestas. La clase no se pregunta primero.

1. Que se cambia y para que. Esa frase es el objetivo general.
2. Donde vive el cambio: pantalla, modulo, flujo, integracion, dato o permiso.
3. Como se sabe que quedo resuelto, en una frase comprobable.

Con esas respuestas la agentica propone la clase por HH tradicionales e impacto. El lider confirma y esa declaracion prevalece solo cuando la clase que indica el esfuerzo quedo escrita.

Si el esfuerzo o el impacto indican Intermedio o Mayor y la declaracion recibida es Menor, el cuestionario breve no se cierra. En la ficha queda anotado, y esa anotacion no se borra: clase que indica el esfuerzo, clase declarada y motivo. El cuestionario que sigue es el de la clase que indica el esfuerzo. Si, con la anotacion a la vista, el lider mantiene Menor, la declaracion prevalece y la anotacion permanece.

No se propone Menor si el lugar abarca varios frentes, si hay que crear un objeto o una columna, si aparece una regla de negocio nueva, o si el cambio toca mas de un flujo.

| Clase confirmada | Cuestionario | Puertas |
|------------------|--------------|---------|
| Menor | Termina en las tres respuestas. Un objetivo general. | Si al integrar a desarrollo |
| Intermedio | Ademas: sistemas, contratos o datos; uno a tres objetivos especificos; como se prueba y como se acepta; si toca acceso, datos personales, secretos o el esquema. | Concepcion, y el si previo al despliegue |
| Mayor | Cuestionario completo: ideacion, Concepcion, plan y operacion. | Ideacion + Concepcion + pre-despliegue + operacion |

La estimacion se hace en las tres clases, con los elementos de cada una. Menor estima el cambio, su verificacion, la implementacion y el acta. Intermedio suma prueba y aceptacion, certificacion acotada, estabilizacion y el calendario para fechar el plan. Mayor estima el plan completo, con ideacion, modelo, arquitectura y, si el trabajo es AI-DLC, Mob Elaboration. En Menor e Intermedio no se exigen sesiones de entendimiento, prototipos, modelo de solucion ni arquitectura completa.

Siguen obligatorios en las tres clases: los estandares de desarrollo, arquitectura, seguridad y base de datos durante la construccion, y el si del lider de desarrollo y del lider funcional al integrar a desarrollo.

El arranque de un proyecto nuevo conserva Gate 0 y `Product-Definition`.

Los gates se materializan en Merge Requests (`develop` → `qa` → `master`).

## 4. Estandares que no se improvisan

| Documento | Uso |
|-----------|-----|
| `docs/estandares/estandares-desarrollo-intelix.md` | SAM, React, Lambda vs ECS, hexagonal |
| `docs/estandares/seguridad-baseline.md` | R1–R14 (HARD-STOP: R1, R3, R5, R6, R11) |
| `docs/README-solucion-base-de-datos.md` | Nomenclatura y aprovisionamiento BD (OLTP / lago / bridge) |
| `docs/estrategia-control-versiones.md` | Ramas y ambientes |

## 5. Skills que usara con mas frecuencia

| Necesidad | Skill |
|-----------|-------|
| Plan / ficha / estimacion | `intelix-objetivos-y-plan-trabajo`, `intelix-ficha-de-solicitud`, `intelix-estimacion` |
| Matrices y docs | `intelix-requirements-matrix-*`, `intelix-project-docs-html`, `intelix-file-to-markdown` |
| Avance | `intelix-task-tracker`, `intelix-seguimiento-plan`, `intelix-roadmap-generator-html`, `intelix-consolidado-avance` |
| Iteraciones Inception / rework alcance + HH | `intelix-inception-iterations` |
| Datos / BD | `intelix-db-provisioning`, `intelix-datalake-naming` |
| Ramas | `intelix-git-flow` |
| Gate de diseno (antes de codificar) | `intelix-arquitectura-gate` |
| Aviso temprano de seguridad (diff) | `intelix-seguridad-linter` |
| DoD de unidad / Pre-Deploy | `intelix-qa-gate` |
| Diagnostico de logs de CI/CD | `intelix-devops-diagnostico` |
| Patrones de avance / cuellos / rework | `intelix-observador-tareas` |
| Dictamen para QA | `intelix-certificacion` (+ `scripts/verificacion/`) |

Lista completa: seccion 4 de FUNCIONALIDADES.

## 5.1 Puertas de calidad por fase (gates)

Fortalecen el ciclo como puntos de control; **no** saltan fases ni reemplazan el
sign-off humano, y **no** recalculan el dictamen del motor.

| Momento del ciclo | Gate | Que verifica |
|-------------------|------|--------------|
| Antes de codificar (Inception → Construction) | `intelix-arquitectura-gate` | ADR alineado al estandar (hexagonal, Lambda/ECS, ambientes, secretos, exposicion) |
| Durante Construction (antes de commit/MR) | `intelix-seguridad-linter` | Aviso temprano R1–R7 sobre el diff |
| Cierre de unidad y Pre-Deploy | `intelix-qa-gate` | DoD (R1–R8) y checklist R11 AUTORIZADO/BLOQUEADO |
| Pre-Deploy / Operacion (diagnostico) | `intelix-devops-diagnostico` | Clasifica un log de CI/CD (solo lectura) y propone fix guiado; no despliega ni toca R11 |
| Transversal (mejora continua) | `intelix-observador-tareas` | Telemetria de patrones reusando tracking + ledger; sin PII |

Prompts por fase para reducir alucinaciones: [prompting-por-fase-aidlc.md](prompting-por-fase-aidlc.md).

El dictamen de QA sigue saliendo del motor + `intelix-certificacion` (seccion 6).

## 6. Certificacion rapida

```bash
node scripts/verificacion/analizador.js --proyecto . --exposicion corporativa --alcance estandares
```

El skill interpreta; el motor fija el dictamen (Apto / Con observaciones / No apto).

## 7. Version AI-DLC

Pin en `.intelix/config.json` (`aidlcVersion`, política `preserve`). Para subirlo:
`intelix-cli sync --aidlc-policy upgrade --aidlc-version <v>` y `aidlc doctor`.

Como asegurar que todo el equipo usa la **plantilla Git aprobada** y el **runtime pinneado**:
[fuente-autorizada-plantilla-y-aidlc.md](fuente-autorizada-plantilla-y-aidlc.md).

```bash
python .intelix/scripts/verify_authorized_stack.py
aidlc doctor
```

## 8. Roles

| Rol | Responsabilidad |
|-----|-----------------|
| RC/RT y patrocinador | Si de ideacion. Solo en Mayor. |
| Dev | Gate 0 al arrancar un proyecto, Construction y tracker |
| Arquitectura / Seguridad | Si de Concepcion en Intermedio y Mayor, y baseline |
| Lider de desarrollo y lider funcional | Si al integrar a desarrollo. En Menor deja seguir a calidad y produccion. En Intermedio y Mayor autoriza el despliegue a produccion. |
| Operaciones | Si de operacion. Solo en Mayor. |
| Lider | `intelix-cli` + proteccion GitLab |

## 9. Que mantener en Git

- `Product-Definition/` vivo
- `.aidlc/aidlc-state.md`
- `.aidlc/audit/inception-iterations.jsonl` (ledger de vueltas / alcance)
- `docs/estandares/` (cambios con MR de Arquitectura)
- Evidencia de gates en MR / audit

No versionar secretos ni el engine completo proyectado por `aidlc config`.
