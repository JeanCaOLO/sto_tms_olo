# Estrategia de Control de Versiones y Gobierno de Fuentes (INTELIX / IA-DLC)

> **Documento formal de branching (M1).** Capa 1 (prevención) del gobierno de
> ramas. Cierra la brecha B1 (ausencia de un modelo de branching formal).
> **Fuente de verdad** del modelo GitFlow adaptado INTELIX; el resto de las
> directivas y scripts (`branching-rules.md`, `bootstrap-ramas.js`,
> `configurar-gitlab.js`) implementan lo que aquí se define.

**Ramas permanentes (nombres en inglés, confirmados por el equipo):**
`master` (producción), `qa` (calidad), `develop` (desarrollo).

---

## 1. Propósito y alcance

Este documento define **cómo se versiona el código** en los proyectos que parten
de la plantilla `template_base`: qué ramas existen, cómo se nombran, de dónde
nacen, cómo se promueven entre entornos y qué gobierno las protege. Es de
cumplimiento **obligatorio** para agentes IA (Kiro, Copilot, Claude Code, Amazon
Q) y para desarrolladores humanos.

El modelo es un **GitFlow adaptado**: tres ramas permanentes alineadas a los
ambientes AWS (DEV/QA/PROD) y cuatro tipos de rama efímera para el trabajo diario.

El enforcement se organiza en tres capas (ver el Reporte de Control de Versiones):

- **Capa 1 — Prevención:** este documento + `branching-rules.md` + `AGENTS.md`.
  El agente IA guía al desarrollador por el camino correcto.
- **Capa 2 — Bloqueo:** protección de ramas en el servidor GitLab
  (`docs/guia-configuracion-gitlab.md` + `scripts/git-flow/configurar-gitlab.js`).
- **Capa 3 — Detección:** jobs de CI/CD que atrapan lo que se escapó
  (`.gitlab-ci.yml.reference`: `backport-check`, `orphan-branches`).

---

## 2. Árbol de ramas

```mermaid
gitGraph
   commit id: "inicio"
   branch develop
   checkout develop
   commit id: "integración"
   branch feature/ISSUE-45-login
   checkout feature/ISSUE-45-login
   commit id: "feat login"
   checkout develop
   merge feature/ISSUE-45-login tag: "MR squash"
   branch qa
   checkout qa
   merge develop tag: "MR a qa"
   checkout master
   merge qa tag: "v1.0.0"
```

> **Fallback en texto** (si el diagrama no renderiza): el flujo de promoción es
> `feature/*` → `develop` → `qa` → `master`. Las ramas efímeras nacen de su rama
> origen, se integran por Merge Request y se eliminan tras el merge. Los tags
> semánticos (`vX.Y.Z`) se colocan en `master`.

### 2.1 Ramas permanentes (NUNCA push directo)

| Rama | Concepto | Ambiente AWS | Recibe merges desde | Protección |
|------|----------|--------------|---------------------|------------|
| `master` | Producción | PROD | `qa`, `hotfix/*` | Máxima. Push: nadie. Merge: Maintainer. 1 aprobación. Tag `vX.Y.Z`. |
| `qa` | Calidad / certificación | QA | `develop`, `hotfix/*` | Push: nadie. Merge: Maintainer. 1 aprobación. |
| `develop` | Integración continua | DEV | `feature/*`, `bugfix/*` | Push: nadie. Merge: Developer+. 1 aprobación. |

### 2.2 Ramas efímeras

| Tipo | Nace de | Se integra a | Estrategia de merge | Propósito |
|------|---------|--------------|---------------------|-----------|
| `feature/*` | `develop` | `develop` | Squash & Merge | Nueva funcionalidad |
| `bugfix/*` | `develop` | `develop` | Squash & Merge | Corrección en desarrollo |
| `release/*` | `develop` | `qa` → `master` | Merge Commit | Preparación de versión |
| `hotfix/*` | `master` | `master` + backport a `develop` y `qa` | Merge Commit | Parche crítico de producción |

---

## 3. Nomenclatura obligatoria

```
feature/<ID-TICKET>-<descripcion-corta>
bugfix/<ID-TICKET>-<descripcion-corta>
hotfix/<ID-TICKET>-<descripcion-corta>
release/v<X.Y.Z>
```

- `<ID-TICKET>` es el número de issue de GitLab o el ID que use el equipo
  (ej. `ISSUE-45`, `PROD-12`).
- `<descripcion-corta>` en minúsculas, sin acentos, separada por guiones.
- Las ramas se crean con la herramienta, no a mano:

  ```
  node scripts/git-flow/bootstrap-ramas.js branch --tipo feature --id ISSUE-45 --desc "login" --apply
  ```

El regex de nomenclatura que aplica la Capa 2 (Push Rules de GitLab) es:

```
^(master|qa|develop|feature\/|bugfix\/|hotfix\/|release\/)
```

Cualquier rama fuera de ese patrón es rechazada por el servidor.

---

## 4. Rama origen (de dónde nace cada una)

El agente y la herramienta verifican la rama origen antes de crear; nunca se crea
una rama de trabajo desde una rama arbitraria.

- `feature/*` y `bugfix/*` nacen **SIEMPRE** de `develop`.
- `hotfix/*` nace **SIEMPRE** de `master`.
- `release/*` nace **SIEMPRE** de `develop`.

---

## 5. Flujo de promoción entre entornos

```
feature/*  --MR-->  develop  --MR-->  qa  --MR-->  master
 (trabajo)          (DEV)             (QA)          (PROD, tag vX.Y.Z)
```

1. El desarrollador trabaja en su `feature/*` o `bugfix/*` (aislado).
2. Abre un **Merge Request** hacia `develop`; con el **sí del líder de desarrollo
   y del líder funcional** y CI en verde, se integra con **Squash & Merge**. La rama se elimina.
3. Cuando `develop` está listo para certificar, se promueve a `qa` vía MR
   (Calidad / Arquitectura). Deploy automático a calidad.
4. Certificado en `qa`, se promueve a `master` vía MR. En Intermedio y Mayor,
   el sí del líder de desarrollo y del líder funcional autoriza el despliegue.
   Se coloca el **tag semántico** `vX.Y.Z` y se despliega a producción.

Para un cambio intermedio o mayor se interpone una `release/*` entre
`develop` y `qa`/`master` para estabilizar la versión (ver sección 7).

---

## 6. Vinculación con la metodología AI-DLC v2

| Fase AI-DLC | Rama asociada | Gate de merge |
|-------------|---------------|---------------|
| Construction (dev local) | `feature/*` | — (trabajo aislado) |
| Construction (integración) | `develop` | MR + sí del líder de desarrollo y del líder funcional |
| Operation (certificación) | `qa` | MR + Calidad / Arquitectura |
| Operation (producción) | `master` | MR + tag. En Intermedio y Mayor, el sí del líder de desarrollo y del líder funcional |
| Hotfix (emergencia) | `hotfix/*` | Aprobación acelerada, solo fallo crítico en producción |

### Mapeo ambientes AWS ↔ ramas (estándar INTELIX)

Los ambientes DEV/QA/PROD son stacks SAM independientes desde la misma plantilla
(`estandares-desarrollo-intelix.md`). Cada uno se despliega desde su rama:

- **DEV** ↔ `develop` (`sam deploy --config-env dev`)
- **QA** ↔ `qa` (`sam deploy --config-env qa`)
- **PROD** ↔ `master` (`sam deploy --config-env prod` + tag)

---

## 7. Gobernanza adaptativa y branching

La cantidad de ramas y gates de merge escala con la clase del cambio.
El cuestionario y los elementos de la estimacion estan en
`docs/guides/gobierno-iadlc-intelix.md`.

| Nivel de cambio | Ramas involucradas | Gates de merge |
|-----------------|--------------------|-----------------|
| **Menor** | `feature/*` o `bugfix/*` → `develop` → `qa` → `master` | 1 gate: si al integrar a desarrollo |
| **Intermedio** | `feature/*` → `develop` → `release/*` → `qa` → `master` | 2 gates: Concepcion + pre-despliegue |
| **Mayor** | `feature/*` → `develop` → `release/*` → `qa` → `master` | 4 gates: ideacion, Concepcion, pre-despliegue y operacion |
| **Hotfix** | `hotfix/*` → `master` + backport a `develop` y `qa` | 1 gate acelerado, solo fallo critico en produccion |

---

## 8. Reglas de gobierno (resumen inquebrantable)

- **Cero push directo** a `master`, `qa` ni `develop`. Toda integración pasa por
  Merge Request con mínimo 1 aprobación del líder.
- **Estrategia de merge:** Squash & Merge para `feature/*` y `bugfix/*`; Merge
  Commit para `hotfix/*` (preserva la trazabilidad del parche).
- **Eliminación automática** de la rama efímera tras el merge (auto-delete).
- **Tags semánticos** `vX.Y.Z` en cada release a `master`.
- **Commits semánticos** (Conventional Commits en español) con el ID jerárquico
  del `SEGUIMIENTO-*.xlsx`, armados con `scripts/entregables/seleccionar-commit.js`
  (ver `commit-rules.md`).
- **Compuerta por unidad:** no se inicia una nueva unidad con cambios sin
  commitear (ver `unit-commit-gate.md`).
- **`.gitignore` estricto:** sin binarios ni secretos (ver estándar INTELIX).

---

## 9. Documentos relacionados

- `.kiro/steering/branching-rules.md` — directiva de la Capa 1 que carga el agente.
- `docs/protocolo-hotfixes.md` — runbook operativo del hotfix (Capa 1 + 3).
- `docs/guia-configuracion-gitlab.md` — configuración de la Capa 2 (protección).
- `.gitlab-ci.yml.reference` — pipeline de referencia (Capa 2 + 3).
- `docs/guia-seguimiento-gitlab.md` — Milestones, Boards, Labels y `/spend`.
- `.kiro/steering/commit-rules.md` — formato de commit e imputación de tiempo.
- `.kiro/steering/unit-commit-gate.md` — compuerta de commit por unidad.
- `docs/estandares/estandares-desarrollo-intelix.md` — ambientes AWS ↔ ramas.
