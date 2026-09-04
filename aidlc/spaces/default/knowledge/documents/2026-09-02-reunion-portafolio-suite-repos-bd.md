# Reunión de portafolio — arranque de construcción, Suite OLO, repos y base de datos

**Fecha:** ~2026-09-02 `[verificar fecha exacta]`
**Participantes mencionados:** Ana María, Chirle, Jesús, Eduardo, William (admin Git/despliegues, referenciado), José Enrique, José Castro / "Joseito" (skills AI-DLC), José Pérez (backup de Nelmer), Anderson; Jean y Andrey (desarrolladores del cliente); Palencia y Antonio (funcionales).
**Fuente:** transcripción automática, resumida y estructurada. Términos corregidos: **EFLOW** (no "iflow"), **QA** (no "CUA"), **API KEY** (no "piqui"), **Readdy** (el generador del prototipo — "Y").

> Reunión de **portafolio/arquitectura/organización**, no de requerimientos funcionales del OMS. Lo funcional del OMS se valida **mañana con Antonio**.

## Arranque de construcción + fecha
- El cliente ordena **arrancar construcción ya**, aun sin cerrar todas las validaciones.
- Fecha comprometida por Jean/Andrey: **30 de septiembre de 2026** (una fecha previa "9/19" apareció sin origen conocido).
- **Mañana:** sesión con **Antonio** (funcional del OMS) → visto bueno / observaciones, compartir requerimientos, **cerrar/aprobar el inception** en la herramienta y seguir con los planes. Antonio cubre solo OMS; planificación la ve Ricardo.

## Suite OLO (hub / login / landing) — FUERA del alcance de este workflow OMS
- Hub con **login único** (cuenta Google del dominio OLO) → landing con la lista de sistemas (TMS —prioridad—, SRO, Monitor…). Multi-país/compañía. Inspirada en "Experience" y en la suite de EPA.
- Es un **entregable del proyecto TMS**, pero **la desarrolla otro desarrollador** y va en **repositorio SEPARADO**. **No es parte del módulo OMS** ni de este workflow.

## Estructura de repos y Git
- Hoy el TMS es **un solo repo en GitHub** (nació como "SRO"; prototipo hecho con **Readdy** — coincide con los `__READDY_*` del codekb). **Aún no está en el GitLab de Intelix.**
- Objetivo: **Suite (main) → Sistemas (TMS, SRO, Monitor…) → dentro de TMS → Módulos** (planificación, OMS, logística inversa, tracker…); módulos no desarrollados quedan listados pero "apagados".
- Repos separados: **suite**, **TMS-front**, **TMS-back**.
- Primer proyecto con **desarrolladores mixtos** (Intelix + Jean/Andrey). Los del cliente ven **solo su rama/módulo** (ciegos al resto).
- **Solo Intelix despliega** (no negociable). El cliente sube código bajo plantillas/estándares Intelix (SAM); Intelix revisa y despliega (QA: Eduardo/Jesús; despliegues: William).
- Migrar GitHub → GitLab Intelix: evalúan **mirroring**; dudas → preguntar a **William y José Enrique**. Pendiente técnico: soporte de Amplify (historia del monitor con CodeCommit + VPN).

## Stack y estándares — OFICIAL
- Stack estándar Intelix: **AWS (serverless), Python + Lambdas (backend), React (frontend), PostgreSQL, arquitectura por eventos, plantillas SAM.** Despliegue por el esquema normal de Intelix.
- **El código actual sobre Supabase es del prototipo (Readdy) y NO es el target.** La construcción va sobre este stack.

## Arquitectura de base de datos — DECISIÓN ABIERTA (requiere más análisis)
- **Login de la Suite:** BD de usuarios/roles; se inclina a **misma BD, esquema específico** (no BD aparte solo para usuarios). Login único compartido; el reto es que monitor y TMS ya tienen su propio sistema de roles → unificar sin romper lo existente (ideas: reusar el del monitor, o cada app con su tabla + una **API KEY** que envía la suite).
- **Datos del TMS (módulos):** tres opciones en evaluación —
  1. **Mismas tablas para todas las compañías** (una schema, columnas `país`/`compañía`).
  2. **Esquema por compañía** en una misma BD (tablas separadas por schema).
  3. **BD por compañía.**
  Consenso tentativo hacia una **sola BD separada por esquema por compañía/país**, con **convención de nombres** (prefijo de 2 letras por módulo). Debate abierto según **volumen** y **aislamiento** ("si un cliente se cae, no afectar a otros").
- Contexto multi-tenant: CR = 1 país / 3 compañías (Cofersa, EPA, comercializadora); VE = 1 país / 3 compañías (Beval, Febeca…). EFLOW en CR es uno para todas las compañías; en VE hay **una BD por compañía** → orígenes heterogéneos.
- **Recomendación del asistente (para su decisión, NO oficial):** **opción 2 (esquema por compañía en una BD compartida)** — ver el análisis con pros/contras registrado en la conversación del 2026-09-03. Argumento principal: el codekb ya probó que el enfoque de columna discriminadora (`organization_id`) **fuga entre organizaciones** en este código (13 archivos sin filtrar); el esquema-por-compañía elimina esa clase de bug estructuralmente, con costo moderado (una instancia) y aislamiento fuerte; la analítica cross-compañía va al SSOT, no al transaccional. Escalar una compañía puntual a BD propia queda como opción futura de bajo arrepentimiento.

## OMS — decisión clave (pre-desarrollo)
- Confirmado como **bloqueante**: definir si el OMS **reemplaza** a la torre de control, es **intermedio** o **convive**. Se espera **definirlo mañana con Antonio** (según cómo opera la torre de control), para orientar si se interviene, sustituye o convive.

## Metodología AI-DLC (equipo mixto)
- Se usa **AI-DLC** con IA (Palencia entrenado). Skills en desarrollo para generar los planes tras aprobar el inception. Proyecto en **cascada** (main → módulos). Los **4 validadores** (uno por módulo) verifican lo que genera la IA. Configuración Git/metodología a coordinar con William + José Castro.

## Provisioning / ambientes
- Tras cerrar el inception (diseño = modelado de datos "flash"), pedir a infraestructura el **QA** y el ambiente de desarrollo. Duda abierta: ¿se puede seguir desarrollando **local**? → coordinar con William.

## Próximos pasos
1. Sesión con **Antonio** (mañana) → validar OMS y cerrar/aprobar el inception.
2. Definir la estructura main/repos (Jesús + Eduardo) y entregar lineamientos a Jean/Andrey.
3. Reunión con Jean/Andrey (4pm) con el primer esquema de trabajo.
4. Consultar a **William + José Enrique**: estructura Git, acceso ciego del cliente, mirroring GitHub→GitLab, Amplify, desarrollo local.
5. **Falta el contexto de la reunión de mañana con Antonio** (se agregará).
