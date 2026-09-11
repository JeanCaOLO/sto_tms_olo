# Reunión con arquitectura (Javier) — estructura de repos, despliegue y alcance del TMS

**Fecha:** ~2026-09-03 `[verificar fecha exacta]`
**Participantes:** Ana María, Chirle, Eduardo, Jesús, **Javier** (arquitectura/despliegue, el consultado), Anderson, William y José Enrique (referenciados). Palencia (funcional). Jean y Andrey (desarrolladores del cliente).
**Fuente:** transcripción automática, resumida. Términos corregidos: **EPRAC** (no IPRAC/IPREX), **EFLOW** (no iflow/Flow), **GitLab** (no "Glapel/Gitlap"), **Amplify**, **CodeCommit**, **monorepo**, **common services**.

> El usuario (Eduardo) estaba muteado para el OBS; sus intervenciones no quedaron en el audio. Fueron: (1) que el cliente dio acceso a un GitHub propio con **solo el prototipo visual** del TMS (sin backend); (2) preguntar si conviene un repo por módulo o uno solo — respondido por Javier (ver abajo).

## Estructura de repositorios y despliegue (respuestas de Javier)

- **Front y back en repos SEPARADOS.** Motivo: aislamiento de despliegue — en un monorepo con auto-deploys "se pueden disparar integraciones que no nos interesen". Así lo trabajan con EPA.
- **Repo por módulo vs. uno solo:** Javier dice que existen **ambos escenarios**; la elección depende de **qué tan grandes son los módulos** y de **la frecuencia de cambio** ("si cambia poco, métetelos todos en uno"). "Lo más limpio" es uno por módulo, **pero hay que ver qué es común primero**.
- **Lo común va a un proyecto centralizado — "common services":** API Gateway **compartido** (cada módulo crea sus paths), Secrets Manager combinado, etc. Los demás repos **solo referencian** ese servicio común.
- **Aislamiento del cliente — ACLARADO (corrige entendimiento previo):** el cliente **puede ver TODO el código del TMS** (no hay "ciego" entre módulos del TMS). Lo que NO debe ver son los **otros proyectos de OLO** ya desarrollados (monitor, api-olo…), que viven en el **mismo grupo de GitLab**. Se resuelve dando acceso al **subgrupo del TMS**, no al grupo OLO.
- **Migración:** el prototipo (hoy en GitHub del cliente, hecho con Readdy, **solo frontend, sin backend**) se **migra una vez a GitLab de Intelix**; el cliente pasa a trabajar contra GitLab. Se piden accesos admin al equipo de arquitectura/despliegue.
- **Frontend → Amplify desde GitLab:** confirmado por Javier — "se puede, ya se puede hacer" (antes el monitor usaba CodeCommit; ya no es necesario).
- **Recomendación derivada del asistente (2026-09-04):** dado que **solo Intelix despliega** + sin ciego interno + backend muy compartido, la mejor opción es un **monorepo de backend con un stack SAM por módulo + pipeline filtrado por ruta** (deploy selectivo), + `common-services`; frontend en repo aparte. Detalle en el artefacto de referencia "Repos y despliegue TMS".

## Alcance y arquitectura del TMS

- **El TMS es UN SOLO SISTEMA con módulos interdependientes**, no sistemas separados. Motivo: **comparten tablas/entidades** — chofer, camión, ruta, **pedidos**. → hay un **núcleo de datos compartido**.
- **Módulos:** OMS (Eduardo/Intelix), Planificación (Jesús/Intelix), Logística Inversa (mixto Intelix+cliente, en inception), Última Milla (cliente).
- **Sistemas externos:** **EFLOW** y el **lago de datos**. **El TMS reemplaza a "Trade" y "GoRamp"** (el lago apunta hoy a Trade → desaparece y lo desarrollan ellos).
- **Metodología:** cada módulo lleva su **inception/discovery por separado** (como el OMS), con **comunicación entre módulos cuando cambian los modelos de datos**. Intelix (William/José Enrique/Javier) arma una **plantilla/framework sobre AI-DLC v2** con los estándares (serverless, despliegues, seguimiento) que se comparte con el repo.
- **Suite OLO / login único:** **descartada del alcance inicial.** Es un proyecto aparte enorme (gestión de roles/usuarios). Para arrancar: acceso plano/horizontal (correo del dominio) y cada sistema con sus propios roles. Se propondrá al cliente como proyecto separado después.
- **El monitor** también se mueve al grupo GitLab de OLO.

## Pendientes (para William / arquitectura)
- ¿GitLab self-hosted o gitlab.com? (afina el pipeline GitLab→Amplify).
- Alcance exacto del núcleo compartido (qué entidades/APIs van a `common-services` vs. cada módulo) — insumo del Domain Design.
- ¿API Gateway compartido (una URL)? — confirmar.
- Confirmar BD: un RDS PostgreSQL, esquema por compañía + núcleo compartido.
- ¿Desarrollo local permitido, o todo en ambientes AWS aprovisionados?
