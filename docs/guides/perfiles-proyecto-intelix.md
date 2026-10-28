# Perfiles de proyecto INTELIX

`intelix-cli init` clasifica el proyecto antes de solicitar nombre, agentes y agente titular de
AI-DLC. El resultado se conserva en `.intelix/project-profile.json`, separado de
`.intelix/config.json` para no mezclar decisiones de negocio y arquitectura con la configuración
operativa del CLI.

## Política persistente del runtime AI-DLC

La configuración operativa registra `projectMode`, `aidlcPolicy`,
`aidlcVersion` y `aidlcAgent`. Las políticas admitidas son:

| Política | Comportamiento |
|---|---|
| `none` | No instala ni actualiza AI-DLC; `sync` conserva esta decisión. |
| `preserve` | Conserva versión y agente; cualquier contradicción detiene `sync`. |
| `install` | Instala AI-DLC donde aún no existe y, al terminar, pasa a `preserve`. |
| `upgrade` | Exige `--aidlc-version`; tras completar la actualización pasa a `preserve`. |

`--skip-aidlc` equivale a seleccionar `none`. Para reactivar un proyecto que
está en `none`, se requiere una decisión explícita, por ejemplo
`sync --aidlc-policy install`. Un cambio de versión usa
`sync --aidlc-policy upgrade --aidlc-version <v>`. `profile --show` y su salida
JSON muestran esta política operativa junto con el perfil técnico.

## Dimensiones

### Tipo de solución

| Valor | Uso |
|---|---|
| `mobile` | Android, iOS o Kotlin Multiplatform. |
| `client-server` | Cliente instalado y backend. |
| `web-app` | Aplicación web transaccional y sus servicios. |
| `integration-data` | APIs, microservicios, Lambda, Glue, ETL o integración entre sistemas. |
| `website` | Página informativa, portal o contenido web. |
| `other` | Solución no clasificada todavía. |

### Origen y baseline

`lifecycle` distingue `new` de `existing`. Para un proyecto existente se registran dos ejes
independientes:

- `agenticStatus`: no usa agentes (`none`) o ya los usa (`in-use`);
- `aidlcStatus`: no usa AI-DLC (`none`), usa una versión anterior (`older`) o usa la versión fijada
  por el paquete (`current`).

Cuando se elige `older`, el perfil también registra `aidlcVersion`. En modo interactivo el CLI la
pregunta; con `--yes` exige `--aidlc-version X.Y.Z`. La adopción falla antes de escribir si una
variable de entorno intenta resolver otra versión. Así el perfil no convierte una adopción
en una actualización implícita del runtime.

Esta separación cubre proyectos tradicionales, proyectos agentic sin AI-DLC, migraciones desde
AI-DLC anterior y proyectos actuales que solo necesitan refrescar skills y estándares.

## Política de aplicabilidad derivada

Después de guardar el perfil, el CLI genera `.intelix/applicability-policy.json`. Este segundo
archivo no contiene nuevas decisiones humanas: traduce el perfil a reglas consumibles por agentes,
automatizaciones y el motor de certificación.

La política distingue:

- metodología base y seguridad transversal, aplicables a todos los proyectos;
- perfil AWS/SAM/React, aplicable cuando se declara infraestructura `serverless`, `rds` o `ec2`;
- perfil `mobile-kmp`, aplicable a soluciones móviles;
- integración de datos y contexto brownfield;
- dominios disponibles o todavía no soportados por la certificación;
- propiedad de actualización de cada grupo de artefactos.

> **Alcance de certificación por stack (decisión del equipo).** Hoy solo **AWS/SAM/React** y
> **móvil KMP** (`MOB1`–`MOB8`) tienen estándar normativo y certificador propio. Otros stacks como
> **Backend Java/Spring** o **Data Pipelines** todavía **no tienen estándares definidos por el
> equipo de evolución**, por lo que no están definidos en esta plantilla ni cuentan con certificador
> automático. En esos proyectos la metodología base y la seguridad transversal siguen aplicando, y
> la certificación queda en `review-required` hasta que un responsable confirme su aplicabilidad.
> Cada stack nuevo se incorporará cuando el equipo de evolución defina su norma.

Las estrategias de actualización son explícitas:

| Estrategia | Alcance |
|---|---|
| `governed` | El perfil solo cambia mediante `profile --configure`, con validación e historial. |
| `append-only` | Las revisiones anteriores se agregan a `.intelix/profile-history/`; no se reescriben. |
| `managed-copy` | Skills, documentación y `.gitlab/intelix-ci.yml`; se actualizan según el contrato de `sync`. |
| `managed-overlay` | Reglas/steering propios de Intelix; se reponen después del refresh del harness. |
| `pinned-runtime` | AI-DLC conserva la versión efectiva declarada. |
| `preserve` | Código, `.gitlab-ci.yml`, CI propio, `.env` y `Product-Definition/`; no se reemplazan automáticamente. |
| `shared-merge` | `.gitignore` raíz; respeta el bloque administrado por AI-DLC y reglas locales. |

`sync` regenera la política porque es un artefacto derivado, pero preserva sin cambios
`.intelix/project-profile.json`, que sigue siendo la decisión canónica del proyecto.

## Consultar y corregir el perfil

Para consultar el estado vigente y su política:

```bash
intelix-cli profile --show
intelix-cli profile --show --json
```

Para completar un perfil inferido, clasificar un proyecto anterior o corregir una decisión:

```bash
intelix-cli profile --configure
```

El modo interactivo presenta los valores actuales como selección inicial. Para automatización se
exige el perfil completo:

```bash
intelix-cli profile --configure --yes \
  --solution-type integration-data \
  --project-lifecycle existing \
  --agentic-status in-use \
  --aidlc-status current \
  --infrastructure serverless,rds
```

Antes de reemplazar un perfil existente, el CLI guarda su contenido exacto bajo
`.intelix/profile-history/`. Después regenera `.intelix/applicability-policy.json`. El comando no
instala ni actualiza AI-DLC, y rechaza una versión contradictoria con `.intelix/config.json`.

### Certificación móvil

Una política móvil completa habilita el dominio `mobile-kmp`. El motor evalúa MOB1–MOB8 contra
`docs/estandares/estandares-mobile-kmp-intelix.md` y no ejecuta los controles AWS/SAM/React sobre
el árbol móvil. El dictamen cubre preparación técnica para QA; Play Store y App Store permanecen
en `unavailableDomains` porque requieren una revisión vigente, firma y publicación separadas.

El objetivo se deriva sin ambigüedad:

| Baseline | `adoptionGoal` |
|---|---|
| Proyecto nuevo | `new-project` |
| Existente sin AI-DLC | `adopt-intelix` |
| Existente con AI-DLC anterior | `upgrade-aidlc` |
| Existente con AI-DLC vigente | `refresh-intelix` |

### Infraestructura

Es multiselección: `serverless`, `rds`, `ec2`, `on-premise`, `external-saas` u `other`.
`none` declara que no se requiere infraestructura propia. `undecided` indica que Discovery debe
resolverla. `none` y `undecided` son excluyentes y no se combinan con valores concretos.

## Automatización

Para CI o scripts se pueden pasar todas las decisiones sin prompts:

```bash
intelix-cli init integracion-afv \
  --yes \
  --agents cursor \
  --solution-type integration-data \
  --project-lifecycle existing \
  --agentic-status in-use \
  --aidlc-status older \
  --aidlc-version 2.7.9 \
  --infrastructure serverless,rds
```

Si `--yes` omite datos, el CLI mantiene compatibilidad con automatizaciones anteriores y crea un
perfil con `capture.mode: "inferred"` y `capture.complete: false`. Debe revisarse antes de usarlo
como decisión arquitectónica definitiva.

## Propiedad y preservación

- `init` crea el perfil una sola vez.
- `sync`, incluso con `--force`, no lo modifica.
- `sync` sí regenera `.intelix/applicability-policy.json`, porque es una proyección administrada del
  perfil y no una fuente de decisiones.
- Una segunda ejecución de `init --here` reutiliza el perfil existente.
- Pasar flags de perfil cuando el archivo ya existe produce un error en lugar de sobrescribir
  silenciosamente decisiones del proyecto.
- Los agentes deben leer el perfil antes de proponer stack o infraestructura. Un perfil móvil no
  convierte SAM/React en requisitos para el árbol KMP; un proyecto existente conserva su stack.
