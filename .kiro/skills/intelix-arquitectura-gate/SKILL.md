---
name: intelix-arquitectura-gate
description: >-
  Puerta de control de diseno (The Architect) previa a la codificacion: verifica
  que el diseno quede escrito en un ADR y alineado al estandar de desarrollo
  INTELIX (arquitectura hexagonal, Lambda vs ECS justificado, parametrizacion
  dev/qa/prod, secretos fuera del codigo, exposicion e IdP, IAM de minimo
  privilegio) antes de pasar a Construction. Ejecuta el motor deterministico
  .intelix/scripts/arquitectura_gate.py, interpreta los hallazgos y redacta el
  dictamen de diseno para el sign-off humano. No disena por el equipo, no escribe
  codigo y no reemplaza la certificacion del motor. Usar cuando el usuario pida:
  gate de arquitectura, validar diseno antes de codificar, revisar ADR, puerta de
  diseno, architecture gate, decision de arquitectura, revisar arquitectura del
  proyecto, luz verde de arquitectura, antes de Construction.
---

# Skill: Arquitectura Gate (The Architect)

Puerta de **control de diseno** que fortalece la transicion **Inception ->
Construction** de AI-DLC v2.8.2. Su funcion es asegurar que, antes de generar
codigo, el diseno este **escrito y alineado** al estandar INTELIX. Es una puerta
**humana**: el motor evidencia, el Arquitecto/Lider decide.

> **Modelo (no lo rompas):**
> - El **motor** (`.intelix/scripts/arquitectura_gate.py`) es **deterministico** y
>   de **solo lectura**: no modifica codigo ni el estado AI-DLC.
> - Este **skill** es **interpretativo**: ejecuta el motor, explica los controles
>   no evidenciados y acompana el sign-off.
> - **No reemplaza** Gate 0, Inception ni la certificacion (`scripts/verificacion/`).
>   Es una puerta **adicional** de diseno, no un atajo.

## Cuando se activa

- Al cerrar Inception y antes de empezar Construction (Intermedio y Mayor).
- Cuando se pida revisar, validar o aprobar el diseno/ADR de un proyecto.
- En Menor normalmente no aplica (no se exige arquitectura completa); si el cambio
  crea objetos, reglas de negocio nuevas o toca varios flujos, conviene correrlo.

## Fuente de verdad del estandar

- `docs/estandares/estandares-desarrollo-intelix.md` (SAM, Lambda vs ECS, hexagonal, React)
- `docs/estandares/seguridad-baseline.md` (R1–R14)
- `docs/README-solucion-base-de-datos.md` (nomenclatura y aprovisionamiento BD)
- `.intelix/project-profile.json` (clasificacion y decisiones del proyecto)

## Motor (deterministico)

```bash
# 1. Generar la plantilla de ADR si el proyecto no tiene una
python .intelix/scripts/arquitectura_gate.py --scaffold

# 2. Evaluar el ADR contra el checklist de diseno
python .intelix/scripts/arquitectura_gate.py

# 3. En pipeline, fallar si faltan controles criticos de diseno
python .intelix/scripts/arquitectura_gate.py --ci
```

El motor busca el ADR en `docs/arquitectura/ADR.md` (u otras rutas candidatas),
aplica el checklist y escribe el reporte en
`.aidlc/audit/arquitectura-gate-latest.md`.

## Checklist de diseno (lo que el motor evidencia)

| ID | Control | Bloquea el gate |
|----|---------|-----------------|
| ADR-1 | Capas hexagonales (Domain/Application/Infrastructure) | Si |
| ADR-2 | Decision Lambda vs ECS justificada | Si |
| ADR-3 | Parametrizacion por ambiente (dev/qa/prod) | Si |
| ADR-4 | Secretos fuera del codigo (Secrets Manager/SSM) | Si |
| ADR-5 | Exposicion declarada (publica/corporativa) e IdP/auth | Si |
| ADR-6 | IAM de minimo privilegio | No (recomendacion) |
| ADR-7 | Estrategia de datos / nomenclatura BD | No (recomendacion) |

"Bloquea el gate" = marca `REQUIERE_AJUSTES` en el reporte de diseno. **No** es un
HARD-STOP de seguridad: esos los fija el baseline R1–R14 y el motor de
certificacion durante Construction, no esta puerta.

## Dictamen de diseno

- **APROBADO**: todos los controles criticos evidenciados. El Arquitecto/Lider da
  el sign-off y habilita Construction.
- **REQUIERE_AJUSTES**: falta evidenciar al menos un control critico. Completar el
  ADR y re-ejecutar.

## Flujo tipico del agente

1. Confirmar la clase del cambio y leer `.intelix/project-profile.json`.
2. Si no hay ADR, correr `--scaffold` y acompanar al equipo a completarlo
   (reutilizando las decisiones ya tomadas en Inception, sin inventar).
3. Ejecutar el gate y leer `.aidlc/audit/arquitectura-gate-latest.md`.
4. Explicar en lenguaje claro cada control no evidenciado y como cerrarlo segun el
   estandar (enlazar la seccion exacta de `estandares-desarrollo-intelix.md`).
5. Cuando quede APROBADO, registrar el sign-off humano y habilitar Construction.

## Reglas

- El skill **nunca** aprueba por su cuenta: el dictamen de diseno lo confirma el rol
  de Arquitectura/Lider.
- No convierte recomendaciones en bloqueos ni al reves: respeta el checklist.
- No duplica la certificacion: al terminar Construction se corre
  `intelix-certificacion` + el motor para el dictamen de QA.
- Para datos, delega en `intelix-db-provisioning` / `intelix-datalake-naming`.
