# Migrar la propiedad de AGENTS.md cuando el framework la reclama

## Cuándo usarla

Esta guía aplica cuando un proyecto que nació con una versión anterior de AI-DLC o de la plantilla
migra a una versión del framework que **reclama la propiedad total de `AGENTS.md`** y lo regenera
desde su propia plantilla. En ese escenario, `AGENTS.md` pasa a tener dueños en conflicto y el que
escribe de último pisa a los demás:

- el **framework** regenera `AGENTS.md` y borra reglas del equipo o el bloque Intelix;
- una skill tipo **`skill-sync`** busca su ancla o su tabla Auto-invoke en un `AGENTS.md` que ya no
  la tiene, y puede corromper el contenido del framework o fallar;
- el **equipo** mantuvo reglas de arquitectura o dominio dentro de `AGENTS.md` que quedan expuestas
  a ser sobrescritas.

El contrato general que previene esto está en
[contrato-propiedad-instrucciones.md](contrato-propiedad-instrucciones.md). Esta guía es el runbook
concreto para resolver un proyecto que ya cayó en el conflicto.

## Principio de la solución: un solo dueño por archivo

Se entrega `AGENTS.md` al framework y se mueven las reglas propias a la superficie nativa de cada
agente, que se incluye en cada interacción:

| Contenido | Dónde vive tras la migración |
|---|---|
| `AGENTS.md` raíz | 100% plantilla del framework; sin reglas del equipo ni bloques de skills externas. |
| Reglas de arquitectura/lenguaje/dominio (p. ej. KMP, Clean Architecture, MVVM) | Steering propio del proyecto: `.kiro/steering/<proyecto>-rules.md` (`inclusion: always`). |
| Bloque de estándares Intelix | Steering propio: `.kiro/steering/<proyecto>-estandares.md` (`inclusion: always`), o el adaptador que corresponda al agente. |
| Reglas para Cursor | `.cursor/rules/<proyecto>-rules.mdc`, enlazando la documentación canónica. |

El bloque `BEGIN/END AI-DLC` de `AGENTS.md` es del framework y el bloque `intelix:start/end` es de
`intelix-cli`; ninguno se edita a mano (ver el contrato).

## 1. Diagnosticar antes de tocar nada

```bash
intelix-cli adopt --analyze --json
```

El preflight marca exactamente los cabos sueltos de este escenario:

| Hallazgo | Qué indica |
|---|---|
| `UNSUPPORTED_AGENTS_OWNERSHIP` | El manifiesto del framework declara `AGENTS.md` con una política distinta de `managed-block`: reclama propiedad total. |
| `BROKEN_INSTRUCTION_MARKERS` | `AGENTS.md` tiene un bloque administrado incompleto; no es seguro regenerarlo. |
| `INSTRUCTION_WRITER_SKILL` | Una skill externa (p. ej. `skill-sync`) puede reescribir `AGENTS.md`/`CLAUDE.md`/`.cursorrules`. |
| `MISSING_SKILL_REFERENCE` | Una tabla Auto-invoke o un Skill Index apunta a skills que no están instaladas. |
| `STALE_SKILL_SYNC_REFERENCE` | Quedan referencias a `skill-sync` que requieren revisión manual. |
| `STALE_CURSORRULES_CANONICAL` | `.cursorrules` todavía declara `AGENTS.md` como fuente canónica de reglas. |
| `AGENTS_EVIDENCE_REFERENCE` | Documentos de trazabilidad citan "Evidencia: AGENTS.md" como fuente de reglas que pudieron moverse. |

El análisis es de solo lectura: no mueve reglas, no elimina skills y no reescribe evidencias. Su
función es impedir una adopción mecánica mientras haya propietarios incompatibles.

## 2. Separar a los dueños

1. **Entregar `AGENTS.md` al framework.** Dejar que el framework sea el único dueño del archivo
   raíz. No conservar ahí reglas del equipo ni índices de skills.
2. **Mover las reglas del equipo a steering propio** (`.kiro/steering/<proyecto>-rules.md`), con
   `inclusion: always` para que apliquen en cada interacción sin depender de `AGENTS.md`.
3. **Mover el bloque de estándares Intelix** a su propio steering o al adaptador del agente, fuera
   de cualquier bloque administrado por el framework.

## 3. Neutralizar las skills escritoras

- Retirar o neutralizar `skill-sync` y cualquier skill que regenere archivos de instrucciones. Una
  skill personalizada puede conservarse solo si valida inventarios, no si reescribe `AGENTS.md`,
  `CLAUDE.md` o `.cursorrules`.
- Quitar de las tablas Auto-invoke y del Skill Index las filas que ordenen "regenerar AGENTS.md" o
  que apunten a skills inexistentes. Las tablas Auto-invoke solo pueden mencionar skills realmente
  instaladas en la ruta del agente.

> `intelix-cli sync` reinstala las skills que administra INTELIX. Si una skill escritora obsoleta
> sigue declarada en el proyecto, un `sync` podría reinstalarla y reabrir el conflicto: por eso debe
> retirarse del proyecto, no solo dejar de invocarla.

## 4. Corregir las referencias que describen el layout anterior

- **Notas de texto en el steering:** revisar que ningún steering afirme que el índice de skills o la
  tabla Auto-invoke "siguen en AGENTS.md". Tras la migración viven en el propio steering. El
  preflight no detecta notas de texto libre; esta revisión es manual sobre el diff.
- **`.cursorrules`:** dejar de declarar `AGENTS.md` como fuente canónica. El punto de entrada de
  reglas para Cursor debe apuntar al steering o a `.cursor/rules/` del proyecto.
- **Trazabilidad:** las citas "Evidencia: AGENTS.md → REQUIRE/REJECT" en `memory/` o en
  `discovered-rules.md` quedan colgando si las reglas se movieron a steering. Registrar la fuente
  nueva **sin borrar la evidencia previa**: se agrega la ubicación vigente, no se reescribe la
  historia.

## 5. Aplicar en una rama y revisar el diff

```bash
intelix-cli adopt --apply --agents <agente> --aidlc-agent <agente>
```

`adopt --apply` solo continúa sin bloqueantes, crea un snapshot, valida el resultado y restaura el
árbol si algo falla. Revisar el diff completo antes de integrar: confirmar que `AGENTS.md` quedó
como plantilla pura del framework y que las reglas del equipo están en steering.

## Qué NO resuelve esta guía

- No corrige automáticamente las notas de texto libre ni las citas de evidencia: son revisión
  humana sobre el diff (paso 4).
- No decide qué reglas son del equipo y cuáles del framework: esa clasificación es del responsable
  del proyecto.
- No valida versiones del framework por similitud de nombre: si una versión declara reemplazo total
  de `AGENTS.md`, la adopción queda bloqueada hasta definir el adaptador correspondiente.
