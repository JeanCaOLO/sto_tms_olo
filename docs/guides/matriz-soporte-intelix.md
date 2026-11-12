# Matriz de soporte de INTELIX

**Estado:** soporte vigente de la implementación actual.
**Uso:** consultar antes de ejecutar `init --here`, actualizar AI-DLC o aplicar la certificación.

## Escenarios

| Escenario | Nivel | Condiciones y límites |
|---|---|---|
| Proyecto nuevo AWS/SAM/Python/React | Soportado | AI-DLC 2.8.2 y uno de los agentes registrados. |
| Proyecto existente sin AI-DLC | Condicionado | Ejecutar primero `intelix-cli adopt --analyze`; adoptar sin `--force` y revisar el diff. |
| Proyecto existente con AI-DLC 2.8.2 | Condicionado | Mantener harness y versión; confirmar estado, settings/hooks y propiedad de instrucciones. |
| AI-DLC anterior al canal nativo 2.8.x | Condicionado | Tracker, estimación, seguimiento, consolidado y documentación HTML resuelven layout v1/v2. La migración de estado v1 → v2 requiere intent v2 inicializado, `--dry-run` y selección humana de `--resume-stage`. |
| Android con Kotlin o Kotlin Multiplatform | Soportado para QA técnico | `intelix-mobile-kmp`, estándar móvil y controles deterministas `MOB1`–`MOB8`; el dominio se evalúa aislado de AWS/SAM/React. |
| Publicación Google Play o App Store | No soportado | La skill no firma, publica ni certifica políticas de tienda. |

## Agentes

| Agente | Skills | AI-DLC | Guard preventivo | Nota |
|---|---|---|---|---|
| Claude Code | Sí | Sí | No disponible | `settings.local.json`; settings administrados se preservan durante refresh. |
| Codex CLI | Sí | Sí | No disponible | Los hooks propios del proyecto se preservan durante refresh. |
| Cursor | Sí | Sí | No disponible | `check_drift.py` detecta desalineaciones; no bloquea escrituras. |
| Kiro IDE | Sí | Sí | No disponible | Comparte `.kiro` con Kiro CLI; no pueden seleccionarse juntos. |
| Kiro CLI | Sí | Sí | No disponible | No documenta un hook con capacidad de denegar. |
| GitHub Copilot | Sí | Sí | No disponible | Comparte `.aidlc` con OpenCode. |
| OpenCode | Sí | Sí | No disponible | No se instala el antiguo plugin del guard. |
| Antigravity IDE / CLI | Sí | No en 2.8.2 | No disponible | Skills en `.agents/skills/` y regla aislada en `.agents/rules/`; puede convivir con otro agente que lleve AI-DLC. |

## Layouts de estado y tracking

| Layout | Estado AI-DLC | Tracking |
|---|---|---|
| AI-DLC v1 | `aidlc-docs/aidlc-state.md` | `aidlc-docs/tracking/` |
| AI-DLC v2 | `aidlc/spaces/<space>/intents/<record>/aidlc-state.md` | `<record>/tracking/` |
| Gobierno INTELIX | `.aidlc/aidlc-state.md` | No sustituye el tracking ni el estado del intent. |

`intelix-task-tracker`, el dashboard, `intelix-estimacion`,
`intelix-seguimiento-plan`, `intelix-consolidado-avance` e
`intelix-project-docs-html` comparten el criterio v1/v2. Si ambos layouts
coexisten, v2 tiene prioridad y todas estas herramientas consumen el mismo
registro activo. El selector respeta `aidlc/active-space` y el
`active-intent` dentro de ese space; con varios intents sin cursor válido se
detiene en vez de adivinar. Véase
[`resolucion-layout-aidlc.md`](resolucion-layout-aidlc.md).

Para reconciliar el estado v1 con un intent v2 sin eliminar el origen, consultar
[`migracion-estado-aidlc.md`](migracion-estado-aidlc.md) y ejecutar primero:

```bash
intelix-cli migrate aidlc-state --from v1 --to v2 --dry-run
```

## Preflight

```bash
intelix-cli adopt --analyze
intelix-cli adopt --analyze --json
intelix-cli adopt --apply --agents <agente> --aidlc-agent <agente>
```

El preflight identifica harnesses, layouts, conflicto de versiones, patrones
legacy de `.gitignore`, CI existente, configuraciones que deben preservarse y
conflictos entre AI-DLC, Intelix y reglas propias del proyecto.
`adopt --apply` solo continúa sin bloqueantes y sin `--force`; protege la
operación con snapshot, rollback e informe en `.intelix/adoption/`.

La política del runtime persiste en `.intelix/config.json`. `none` impide una
instalación posterior accidental; `preserve` bloquea cambios implícitos de
versión o harness; `install` y `upgrade` son transiciones explícitas que, al
completarse, dejan el proyecto nuevamente en `preserve`.

## Propiedad de instrucciones

El contrato detallado esta en
[`contrato-propiedad-instrucciones.md`](contrato-propiedad-instrucciones.md).
El preflight aplica estos controles:

| Hallazgo | Nivel | Consecuencia |
|---|---|---|
| Politica de `AGENTS.md` distinta de `managed-block` | Bloqueante | No se adopta hasta definir una estrategia compatible. |
| Marcadores AI-DLC o Intelix incompletos | Bloqueante | No se regenera un archivo potencialmente truncado. |
| Skill externa que reescribe instrucciones | Bloqueante | Debe neutralizarse o migrarse antes de adoptar. |
| Regla activa que apunta a una skill inexistente | Bloqueante | Debe instalarse la skill o retirar la referencia. |
| `skill-sync` citado pero no instalado | Advertencia | Corregir la tabla o nota heredada. |
| `.cursorrules` declara `AGENTS.md` como fuente canonica | Advertencia | Contrastar con `.cursor/rules/` y el manifiesto del motor. |
| Evidencia historica cita `AGENTS.md` | Informativo | Registrar la fuente vigente sin reescribir historia automaticamente. |
| Reglas exactas duplicadas en `.gitignore` | Advertencia | Revisar manualmente; el orden y las negaciones pueden importar. |

El preflight **detecta y bloquea**, pero no corrige por sí solo. El runbook paso a paso para
resolver un proyecto que ya cayó en el conflicto de propiedad de `AGENTS.md` está en
[`migracion-propiedad-agents-md.md`](migracion-propiedad-agents-md.md).

## Fuera de alcance (no cubierto)

Para no generar falsas expectativas, estos puntos **no** están cubiertos por la versión actual y
requieren trabajo manual, decisión del equipo o infraestructura externa:

| Área | Qué no cubre | Vía disponible |
|---|---|---|
| Publicación en tiendas móviles | La certificación `MOB1`–`MOB8` no firma, no genera AAB/archive ni valida requisitos de Google Play o App Store. Es preparación técnica para QA. | Pipeline móvil propio del proyecto; decisión DevOps de firma y distribución. |
| Builds iOS en CI | No se aprovisionan runners macOS para compilar o probar el target iOS. | Infraestructura macOS a definir por DevOps. |
| Guard preventivo del task-tracker | No existe un hook que vete escrituras en tiempo real. **Por decisión del equipo, la integridad es reactiva por diseño** (revisiones Git, `check_drift.py` y reconciliación contra planes AI-DLC), no un estado provisional. | Enfoque reactivo actual; un guard preventivo se reconsideraría solo con evidencia de desalineación recurrente que el check no atrape. |
| Perfiles técnicos no cubiertos | La certificación por aplicabilidad granular existe para AWS/SAM/React y para el perfil móvil KMP. Otros stacks (Backend Java/Spring, Data Pipelines, etc.) **aún no tienen estándares definidos por el equipo de evolución**, por lo que no están definidos en esta plantilla y no cuentan con certificador propio. | La metodología base y la seguridad transversal aplican a todos; el stack específico se gobierna manualmente y la certificación queda en `review-required`. Se incorporará cuando el equipo de evolución defina la norma de ese stack. |
| Versiones de AI-DLC anteriores al canal nativo | Solo se instala una versión si el canal nativo la publica con binario, runtime, `checksums.txt`, `version.json` y atestación. No se asume compatibilidad por similitud de versión. | `migrate aidlc-state` reconcilia el estado; la instalación del runtime depende de que el release exista. |
| Corrección automática de instrucciones en conflicto | El preflight detecta conflictos de propiedad de `AGENTS.md`, pero no mueve reglas, no elimina skills ni reescribe evidencias. | Runbook manual: [`migracion-propiedad-agents-md.md`](migracion-propiedad-agents-md.md). |
| Refresh con el motor real sobre overlay `.aidlc` | Las pruebas automatizadas no ejecutan `aidlc config` real; el caso de que el motor elimine el overlay en un refresh se valida como integración manual. | `intelix-cli sync` repone el overlay en la misma corrida; verificación manual con el motor instalado. |
| Decisiones de gobernanza (canal de distribución, runbook del líder, responsables de versión) | El CLI no decide el canal único de distribución ni el runbook organizacional; son acuerdos del equipo. | Reunión de Arquitectura/Líderes; ver el informe de fuente autorizada. |
