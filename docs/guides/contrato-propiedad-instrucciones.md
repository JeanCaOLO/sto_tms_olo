# Contrato de propiedad de instrucciones

Este contrato evita que AI-DLC, Intelix y el equipo reescriban la misma fuente
de reglas sin coordinacion. Aplica tanto a proyectos nuevos como a adopciones.

## Principio

Cada contenido tiene un unico propietario. Un archivo puede ser compartido solo
cuando todos sus escritores usan bloques delimitados y el manifiesto del motor
declara esa politica.

| Superficie | Propietario | Regla |
|---|---|---|
| Bloque `BEGIN/END AI-DLC` de `AGENTS.md` | AI-DLC | No editar ni regenerar desde skills externas. |
| Bloque `intelix:start/end` | `intelix-cli` | Se repone con `init` o `sync`; no editar a mano. |
| `CLAUDE.md` compartido | AI-DLC + Intelix | Solo mediante los bloques que cada herramienta administra. |
| `.kiro/steering/aidlc-*` | AI-DLC | No usarlo para reglas propias del producto. |
| `.kiro/steering/` propio del proyecto | Equipo | Nombre especifico del proyecto; no debe regenerar archivos raiz. |
| `.cursor/rules/intelix-aidlc.mdc` | Intelix | Se repone durante `sync`. |
| Otras reglas `.cursor/rules/*.mdc` | Equipo | Deben enlazar la documentacion canonica del proyecto. |
| `docs/estandares/` y documentos de arquitectura | Equipo / Intelix segun archivo | Fuente durable; los adaptadores de agente deben referenciarla, no duplicarla. |

## Reglas del proyecto

Las reglas de arquitectura, lenguaje o dominio no deben vivir dentro de un
bloque administrado por el framework. Se mantienen en documentos propios y se
exponen mediante el adaptador nativo de cada agente:

- Kiro: `.kiro/steering/<proyecto>-rules.md`.
- Cursor: `.cursor/rules/<proyecto>-rules.mdc`.
- Claude Code: contenido propio fuera de bloques administrados en `CLAUDE.md`,
  mientras el manifiesto conserve una politica de merge.
- Agentes que consumen `AGENTS.md`: contenido propio fuera de los bloques
  administrados, solo si el manifiesto declara `managed-block`.

Si una version del motor declara reemplazo completo de `AGENTS.md`, la adopcion
queda bloqueada hasta definir otro adaptador. No se supone compatibilidad por
similitud de nombre o version.

## Skills externas

Una skill personalizada puede conservarse, pero no puede regenerar
`AGENTS.md`, `CLAUDE.md` o `.cursorrules` sin un contrato explicito. Herramientas
como `skill-sync` deben neutralizarse o limitarse a validar inventarios. Las
tablas Auto-invoke solo pueden mencionar skills realmente instaladas en la ruta
del agente.

## Migracion de un repositorio existente

1. Ejecutar `intelix-cli adopt --analyze --json`.
2. Resolver todos los hallazgos bloqueantes de propiedad y referencias.
3. Mover reglas propias fuera de bloques administrados hacia docs, steering o
   rules del agente.
4. Corregir `.cursorrules` y tablas Auto-invoke que describan el layout anterior.
5. Registrar en la trazabilidad la fuente nueva; no borrar la evidencia previa.
6. Ejecutar `adopt --apply` en una rama y revisar el diff completo.

El preflight no elimina skills, no mueve reglas y no reescribe evidencias. Su
funcion es impedir una adopcion mecanica cuando el repositorio todavia tiene
propietarios incompatibles.

El runbook paso a paso para resolver un proyecto que ya cayo en el conflicto
(framework que reclama `AGENTS.md`, `skill-sync`, tablas Auto-invoke obsoletas,
`.cursorrules` y evidencias colgantes) esta en
[migracion-propiedad-agents-md.md](migracion-propiedad-agents-md.md).
