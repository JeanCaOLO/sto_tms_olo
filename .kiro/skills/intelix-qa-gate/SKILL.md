---
name: intelix-qa-gate
description: >-
  Puerta de QA formal (g-stack) que fortalece el cierre de unidad y el pre-despliegue
  de AI-DLC v2.8.2: formaliza la Definition of Done por unidad de trabajo cruzando
  criterios de aceptacion, baseline de seguridad R1-R8 y evidencia de pruebas, y
  consolida el checklist Pre-Deploy (R11) para decidir AUTORIZADO o BLOQUEADO antes
  del despliegue. Orquesta los artefactos que ya existen (task-tracker, ledger de
  Inception, linter de seguridad y motor de certificacion) sin reemplazar el
  sign-off humano ni recalcular el dictamen. Usar cuando el usuario pida: cerrar
  una unidad, definition of done, DoD, puerta de QA, checklist de aceptacion,
  revision de calidad antes de QA, listo para merge, checklist pre-deploy, quality
  gate, g-stack, auditoria cruzada de la unidad.
---

# Skill: QA Gate (g-stack)

Puerta de **QA formal** que fortalece dos momentos de AI-DLC v2.8.2: el **cierre de
unidad** (Construction) y el **Pre-Deploy** (Operacion). Convierte la Definition of
Done en un checklist **trazable y auditable** que cruza criterios de aceptacion,
baseline de seguridad y evidencia de pruebas.

> **Modelo (no lo rompas):**
> - Esta skill **orquesta** artefactos que ya existen; no crea un motor nuevo ni un
>   segundo dictamen.
> - El **dictamen de QA** (Apto / Con observaciones / No apto) lo fija el motor
>   `scripts/verificacion/` via `intelix-certificacion`. El QA Gate **no** lo
>   recalcula.
> - El **sign-off humano** (lider de desarrollo y lider funcional) sigue siendo
>   obligatorio: esta skill lo prepara, no lo sustituye.

## Cuando se activa

- Al dar una **unidad de trabajo** por terminada (antes de marcarla completada en
  el task-tracker y antes del MR a `develop`).
- En el **Pre-Deploy** (consolidacion del checklist R11 antes de promover a `qa`/`prod`).
- Cuando se pida un checklist de aceptacion, DoD, "listo para merge" o quality gate.

## Artefactos que orquesta (no los reemplaza)

| Necesidad | Artefacto / skill existente |
|-----------|-----------------------------|
| Estado y tareas de la unidad | `intelix-task-tracker` (INDICE-PROGRESO.md) |
| Vueltas de alcance / rework | `intelix-inception-iterations` (ledger) |
| Aviso temprano de seguridad | `intelix-seguridad-linter` (pre-commit/MR) |
| Dictamen de certificacion | `intelix-certificacion` + `scripts/verificacion/` |
| Baseline de seguridad | `docs/estandares/seguridad-baseline.md` (R1–R14) |
| Estandar de desarrollo | `docs/estandares/estandares-desarrollo-intelix.md` |

## Definition of Done por unidad (checklist)

La unidad **no** se cierra si queda abierto un HARD-STOP (R1, R3, R5, R6) o un
criterio de aceptacion sin cumplir.

```
[ ] Criterios de aceptacion de la unidad cumplidos y verificables
[ ] Pruebas ejecutadas con evidencia (unitarias/integracion segun el estandar)
[ ] R1  Sin secretos embebidos                              (HARD-STOP)
[ ] R2  Entradas validadas y consultas parametrizadas
[ ] R3  Endpoints con autenticacion/autorizacion            (HARD-STOP)
[ ] R4  IAM de minimo privilegio
[ ] R5  SAST + escaneo de dependencias/CVE en CI            (HARD-STOP)
[ ] R6  Revision de seguridad en la DoD                     (HARD-STOP)
[ ] R7  Evidencia sanitizada (sin PII/secretos)
[ ] R8  Threat modeling STRIDE al inicio de Construction
[ ] Task-tracker actualizado (tarea y % de avance)
[ ] Ledger de Inception actualizado si hubo cambio de alcance
[ ] Linter de seguridad del diff sin HARD-STOP abierto
```

Cada control cierra como **cumplido**, **no-cumplido**, **N/A-justificado** o
**diferido-piloto**, con evidencia (mismo vocabulario que el baseline).

## Checklist Pre-Deploy (R11)

Consolida la DoD de todas las unidades y decide la puerta de Operacion:

```
[ ] Todas las unidades con DoD cerrada (sin HARD-STOP abiertos)
[ ] Certificacion del motor ejecutada: dictamen != "No apto para QA"
[ ] R9  Cifrado en transito y en reposo
[ ] R10 Logs y auditoria sin datos sensibles
[ ] R11 Puerta de calidad Pre-Deploy                         (HARD-STOP)
[ ] R12 Lista explicita de controles diferidos al piloto (con dueno y fecha)
[ ] Sign-off: lider de desarrollo + lider funcional
=> Resultado: AUTORIZADO | BLOQUEADO
```

Un HARD-STOP abierto o un dictamen "No apto para QA" obliga a **BLOQUEADO**.

## Flujo tipico del agente

1. Identificar la unidad y sus criterios de aceptacion (desde el plan / task-tracker).
2. Correr `intelix-seguridad-linter` sobre el diff de la unidad.
3. Recorrer la DoD control por control, pidiendo evidencia; marcar estados.
4. Si todo cierra, actualizar el task-tracker y recomendar el MR a `develop`.
5. En Pre-Deploy, ejecutar la certificacion (`intelix-certificacion`), consolidar el
   checklist R11 y dejar el resultado AUTORIZADO/BLOQUEADO para el sign-off humano.

## Reglas

- **Nunca** cerrar una unidad ni autorizar un deploy con un HARD-STOP abierto.
- El QA Gate **no** emite el dictamen de certificacion: lo consume.
- No marca el sign-off humano por su cuenta: lo deja listo para el rol responsable.
- No duplica el task-tracker ni el ledger: los lee y los referencia.
- El % de avance oficial sale de `develop` (`intelix-consolidado-avance`), no de esta skill.
