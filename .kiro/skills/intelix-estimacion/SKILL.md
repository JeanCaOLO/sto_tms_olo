---
name: intelix-estimacion
description: Construye planes de trabajo y estimaciones de esfuerzo senior en Excel usando el modelo de generacion y supervision v3, con borradores iterativos y validacion obligatoria pre-final cuando el usuario solicite --final. Usar para estimacion, estimar, effort, HH, horas hombre, plan de trabajo, cronograma, WBS, dimensionar, staffing, planes de trabajo desde historias o requerimientos.
---

# Project Estimation Plan (organization standard)

## When this skill MUST activate

Read and follow this skill **immediately** when the user request matches any of:

- Estimation / sizing: *estimación(es)*, *estimar*, *estimate*, *effort*, *HH*, *horas hombre*, *dimensionar*, *dimensionamiento*
- Work plan / schedule: *plan de trabajo*, *plan estimado*, *cronograma*, *WBS*, *timeline*
- Refinement of a prior estimate: *escenario razonable*, *ajustar HH*, *factores de aceleración*, AI-DLC vs traditional baseline

Do **not** wait for the user to `@`-mention the skill if the intent is clearly an estimate or work plan from stories/requirements/diagrams.

**Engine (this skill):** estimation rules, Excel layout, capacity math, parallel scheduling, AI acceleration models.  
**Input (each project):** scope artifacts, task grouping mode, collaborator count, dedication %, and AI tooling choice — provided by the user each run.

Never copy people, tasks, or modules from a previous project. Those are examples of *format*, not content.

**Output shape reference:** MS Project–style schedule (`Id`, `Nombre de tarea`, `% completado`, `Duración (horas)`, `Comienzo`, `Fin`, `Predecesoras`, `Nombres de los recursos`, y `ID Jerarquico` en la col 11) — in Excel, en **3 hojas**: **Plan** (con las horas condensadas en `Duración (horas)` y el `ID Jerarquico`), **Resumen** (desglose generación/supervisión, tipo de estimación, fechas de fase e `ID Jerarquico`) y **Colaboradores**. Implementación de referencia en la plantilla: `.kiro/skills/intelix-estimacion/scripts/generate_estimacion_v3.py`. Para una ejecución autocontenida en un proyecto, puede copiarse junto con sus archivos de configuración a `docs/scripts/`.

---

## Nomenclatura de entregables (sin prefijos)

Los entregables en el plan se nombran únicamente con su **nombre de negocio**, sin siglas ni prefijos. Ejemplos:

- ❌ `MOB — Mob Elaboration` / `E1 — Autenticación y shell PWA` / `CTI — Certificación técnica integral`
- ✅ `Mob Elaboration` / `Autenticación y shell PWA` / `Certificación técnica integral`

Esta regla aplica al WBS y a la hoja `Plan` del Excel. El generador v3 no crea una hoja separada `Plan AI`; el desglose de generación y supervisión queda en `Resumen`. No usar siglas o prefijos técnicos en los nombres visibles de entregables.

---

## Mandatory run inputs (collect before estimating)

**Do not invent these.** If any required field is missing, ask once with `AskQuestion` (or an equivalent clear multiple-choice / structured list) and wait for answers.

| Parameter | Required | Allowed values / shape | Notes |
|-----------|----------|------------------------|--------|
| **`task_grouping`** | Yes | `by_deliverable` \| `by_layer` | How the WBS / Plan outline is structured. **Always ask if not stated.** |
| **`personas`** | Yes | Lista de participantes. Por cada uno: `nombre`, `dedicacion` (0–1, 0–100 o `%`), `roles`, `fecha_inicio_participacion`, `ejecuta_desarrollo`, `agentes` cuando desarrolla y `asignacion` global o por entregables | Cada nombre representa una sola capacidad aunque tenga varios roles. `exclusivo` declara si una ventana impide o permite apoyo general. |
| **`artifacts`** | Yes (at least one) | User stories and/or requirements and/or diagrams | Source of truth for scope. Paths, pasted text, or attachments. |
| **Liderazgo y documentación** | Yes | Roles `lider_proyecto` o `responsable_solicitud`, y `responsable_documentacion`, dentro de `personas` | Organiza el trabajo y ejecuta seguimiento, ficha, actas y cierre. Esas tareas consumen su disponibilidad. `lider_solicitud` se acepta como alias compatible. |
| **`country`** | Yes | Código ISO del país base | `VE` carga feriados nacionales. Otro país exige `holidays` validados en `project-config.json`; nunca usar el calendario de otro país como fallback. |
| **`responsables_funcionales`** | Condicional | Lista de `{ "nombre", "area" }` | Interlocutores del negocio para reglas comerciales o funcionales. Se documentan, pero no aportan capacidad técnica salvo que también estén en `personas`. |
| **`dependencias_externas`** | Condicional | Lista de `{ "area", "necesidad", "contacto", "estado" }` | Áreas de soporte que deben habilitar algo antes o durante la construcción (base de datos, infraestructura, servidores, AWS/nube, comunicaciones/redes, seguridad). Ver *Dependencias de áreas de soporte (enlace temprano)*. |
| **`clasificacion`** | Yes | `menor` \| `intermedio` \| `mayor` | Clasificación confirmada en la ficha de solicitud; determina las HH fijas del Acta de Cierre. |
| **`ai_tooling`** | Condicional | Lista: `["Cursor"]`, `["Kiro"]`, `["Amazon Q"]`, etc. | Obligatorio si `methodology = ai-dlc`. |
| **`ai_acceleration_factors`** | Condicional | Objeto con factores por fase | Multiplicadores de velocidad frente al desarrollo humano tradicional. |

> **En proyectos AI-DLC**, `collaborator_count`, `dedication` y las fechas de
> fase **no se preguntan a ciegas**: se resuelven desde el estado real (ver
> *Anclaje a las fechas reales de fase AI-DLC*). El inicio de inception se lee de
> `aidlc-state.md`; el fin de inception, el inicio de construcción y los recursos
> se leen de `estimacion-fases.json`. La skill los **solicita** solo cuando el
> fin de inception ya está marcado y esos datos faltan.

## Dependencias de áreas de soporte (enlace temprano)

Antes de construir, muchos proyectos necesitan que **otras áreas habiliten algo**: una base de
datos, una VPC o red, un servidor o instancia, una cuenta o servicios de AWS, enlaces de
comunicaciones, o una revisión de seguridad. Estos trámites tienen tiempos propios que **no dependen
del desarrollador** y, si se dejan para cuando el desarrollo ya avanzó, se vuelven el cuello de
botella del proyecto.

**Regla.** Al definir los entregables y las tareas, la skill debe detectar estas necesidades y
**resaltar el contacto temprano** con el área correspondiente, para que el líder de soluciones o el
desarrollador abra esos enlaces **al inicio y en paralelo** al desarrollo. El objetivo es que cada
área avance su parte mientras el desarrollo avanza, y no llegar al final a averiguar cuánto cuesta la
infraestructura, si hay que montar una base de datos o si se requiere una VPC o un RDS.

### Áreas que la skill puede recomendar (cerrado a seis)

La detección solo recomienda contactar una de estas **seis áreas de soporte**; no inventa otras.
Cualquier señal (declarada, por perfil o por contenido del WBS) se resuelve a una de ellas:

- **Base de datos**
- **Infraestructura**
- **AWS / Nube**
- **Comunicaciones / Redes**
- **Seguridad**
- **Proveedor / Terceros**

Están codificadas en el directorio `AREAS_SOPORTE` del generador (`generate_estimacion_v3.py`), con
su necesidad típica y su contacto por defecto del directorio institucional *Responsables por
Servicio*. Cada área se recomienda **solo cuando aplica**; si ninguna señal aparece, no se agrega
ninguna.

### Cómo se detecta

La necesidad se toma de **tres fuentes**, que se combinan en este orden de precedencia (una fuente
de mayor prioridad nunca es pisada por una de menor; las de menor prioridad solo **agregan** áreas
que falten, deduplicando por área):

1. **`dependencias_externas`** declaradas en la corrida (lista de `{ area, necesidad, contacto,
   estado }`). Es la fuente explícita y preferida.
2. **Perfil del proyecto** (`.intelix/project-profile.json`, dimensión `infrastructure`) cuando no
   se declararon dependencias. El mapeo por defecto es:

   | Señal en el perfil / artefactos | Área a contactar | Necesidad típica | Responsable por defecto |
   |---|---|---|---|
   | `rds`, o mención de base de datos / esquema / tablas | Base de datos | Aprovisionar motor, esquema, usuarios y accesos | Alfredo Cobis |
   | `ec2`, `on-premise` (servidores locales CPG) | On-Premise / Servidores | Instancias locales, capacidad, accesos | Andelson Rodriguez / Victor Nuñez |
   | `serverless`, despliegue y arquitectura en general | Infraestructura / Arquitectura y Despliegue | VPC, subredes, instancias, balanceadores, DNS, despliegue | Javier Escobar |
   | `serverless`, `rds`, `ec2` (AWS) | AWS / Nube | Cuenta, roles IAM, servicios gestionados, costos y límites | Jose Rojas / Victor Nuñez |
   | Integraciones externas, VPN, enlaces entre sedes | Comunicaciones / Redes | Reglas de firewall, VPN, puertos, enlaces | Carlos Lecuna |
   | Datos sensibles, secretos, cumplimiento R1–R14 | Seguridad | Revisión de accesos, secretos y controles | Cesar Madrigal / Wilfredo Hurtado |
   | Dominios, correo corporativo, Google Workspace | Dominios / Workspace | Altas de dominio, DNS público, cuentas Workspace | Mariana Mavare / Merbelin Hug |
   | `external-saas` | Proveedor / Terceros | Altas, credenciales, cuotas y SLA del servicio | — (contacto del proveedor) |

   El **Responsable por defecto** proviene del directorio institucional *Responsables por Servicio*
   (ver abajo); se usa para completar `contacto` cuando la dependencia no lo declara.

   `none` no genera dependencias; `undecided` deja la decisión de infraestructura pendiente y genera
   una tarea de enlace temprana con el área de **Infraestructura** para definirla en Discovery (es,
   en sí, una decisión pendiente que bloquea el dimensionamiento).

3. **Contenido del WBS** (detección automática por texto) cuando ni la declaración ni el perfil
   cubren un área que el plan claramente necesita. El generador escanea los nombres de **unidades y
   tareas** del WBS (task-tracker o ficha corta) buscando señales léxicas de cada una de las seis
   áreas (p. ej. *base de datos, esquema, RDS* → Base de datos; *VPC, firewall, VPN, puertos* →
   Comunicaciones / Redes; *secreto, credencial, cifrado, dato sensible* → Seguridad; *Lambda, S3,
   IAM, bucket* → AWS / Nube; *proveedor, SaaS, API externa, pasarela de pago* → Proveedor /
   Terceros; *servidor, despliegue, contenedor, pipeline* → Infraestructura). Esta capa **solo
   agrega** las áreas que falten respecto de las fuentes 1 y 2; su contacto y necesidad salen del
   directorio `AREAS_SOPORTE`. Así, aunque el perfil quede en `none`/`other`, si el plan tiene
   trabajo de base de datos, redes o seguridad, la recomendación de contacto temprano aparece
   igual en la hoja Resumen. Es una **guía**, no una obligación: el equipo decide si ya lo tiene
   cubierto.

### Cómo se refleja en el plan

- Por cada área detectada, el plan incluye una tarea temprana de enlace, por ejemplo
  `Contactar al area de base de datos y acordar el aprovisionamiento`, ubicada al **inicio** (en
  Mayor, dentro de Habilitación del entorno; en Intermedio y Menor, como primera tarea del plan).
- Es una tarea **humana de gestión** (no se asigna a un agente de IA), con HH de respaldo bajas
  (0,5–1 HH): el esfuerzo real del área no se estima aquí, lo estima cada área. Lo que la skill
  asegura es que el **enlace quede agendado y visible** desde el día uno.
- Si la dependencia es **bloqueante** para construir (p. ej. no se puede desarrollar sin la base de
  datos), se declara como **predecesora** del entregable afectado en `dependencias`, para que el
  plan muestre el riesgo de cronograma de forma explícita.
- Las áreas y su estado (`pendiente`, `en gestión`, `resuelta`) se listan en la hoja **Resumen**,
  bajo un apartado de dependencias externas, junto con el **responsable de contacto** (declarado o
  tomado del directorio *Responsables por Servicio*), para que el líder las siga como un frente propio.

### Formato de `dependencias_externas`

```json
{
  "dependencias_externas": [
    {
      "area": "Base de datos",
      "necesidad": "Aprovisionar PostgreSQL, esquema y usuarios de la aplicacion",
      "contacto": "<nombre o unidad responsable>",
      "estado": "pendiente",
      "bloquea": "<Nombre del entregable que no puede empezar sin esto>"
    },
    {
      "area": "Infraestructura",
      "necesidad": "VPC, subredes privadas y acceso del servicio a RDS",
      "contacto": "<nombre o unidad responsable>",
      "estado": "pendiente"
    }
  ]
}
```

- `area` y `necesidad` son obligatorios; `contacto`, `estado` y `bloquea` son opcionales.
- `bloquea` nombra el entregable que la dependencia frena; si se indica, la tarea de enlace se vuelve
  predecesora de ese entregable.
- Sin `estado`, se asume `pendiente`.
- Sin `contacto`, la skill lo completa desde el directorio *Responsables por Servicio* según el
  `area`; un `contacto` declarado siempre gana sobre el directorio.

> **Por qué importa.** El desarrollador no decide ni ejecuta el montaje de una base de datos, una
> VPC, un RDS o un enlace de comunicaciones; esas decisiones y trámites son de otras áreas. Resaltar
> el enlace temprano evita el patrón de "primero construyo y al final busco quién me monta la
> infraestructura", que suele costar más tiempo que el propio desarrollo.

### Responsables por Servicio (directorio de contacto)

Lineamiento institucional (correo "Lineamientos de coordinación temprana con áreas técnicas en
nuevos proyectos", Anderson Cova, 2026-10-13): al iniciar una solicitud del Negocio (OLO / Mayoreo /
Inmobiliario), el **líder de la solicitud** —de desarrollo menor o intermedio— debe identificar
tempranamente las áreas técnicas involucradas y contactar a su referente. Para consultar e
identificar a los especialistas que participarán en cada proyecto, el líder se dirige directamente
al responsable del servicio requerido:

| Área / Servicio | Responsable(s) de contacto | Correo electrónico |
|---|---|---|
| Redes y Comunicaciones | Carlos Lecuna | clecuna@intelix.biz |
| Arquitectura y Despliegue | Javier Escobar | jescobarm@intelix.biz |
| Base de Datos | Alfredo Cobis | acobis@intelix.biz |
| Seguridad | Cesar Madrigal / Wilfredo Hurtado | cmadrigal@intelix.biz / whurtado@intelix.biz |
| AWS | Jose Rojas / Victor Nuñez | jrojas@intelix.biz / vnunez@intelix.biz |
| On-Premise (CPG — Servidores Locales) | Andelson Rodriguez / Victor Nuñez | arodriguez@intelix.biz / vnunez@intelix.biz |
| Gestión de Dominios y Google Workspace | Mariana Mavare / Merbelin Hug | mmavare@intelix.biz / mhug@intelix.biz |

**Uso en la skill.** Cuando una dependencia de área de soporte no declara `contacto`, la skill
**completa el contacto por defecto** desde este directorio según el área detectada (ver mapeo
abajo), de modo que la tarea de enlace del plan nombre a quién acudir. Un `contacto` declarado en
`dependencias_externas` **gana** sobre el directorio (puede ser una persona más específica del
proyecto). Este directorio es la fuente institucional; mantenerlo actualizado si el correo de
lineamientos cambia.

Correspondencia entre el área detectada por el perfil y el responsable del directorio:

| Área detectada (perfil / dependencia) | Responsable por defecto |
|---|---|
| Base de datos | Alfredo Cobis (Base de Datos) |
| Infraestructura / Servidores / Arquitectura y despliegue | Javier Escobar (Arquitectura y Despliegue) |
| AWS / Nube | Jose Rojas / Victor Nuñez (AWS) |
| On-Premise (servidores locales CPG) | Andelson Rodriguez / Victor Nuñez (On-Premise) |
| Comunicaciones / Redes | Carlos Lecuna (Redes y Comunicaciones) |
| Seguridad | Cesar Madrigal / Wilfredo Hurtado (Seguridad) |
| Dominios / Google Workspace | Mariana Mavare / Merbelin Hug (Dominios y Workspace) |

### Proceso de coordinación temprana del líder

El lineamiento fija cuatro pasos que la skill refleja en el plan y en la documentación del proyecto:

1. **Punto de contacto e identificación de áreas.** Una vez definido el plan de desarrollo y la
   arquitectura inicial, el líder contacta de inmediato a las áreas requeridas, usando el directorio
   de *Responsables por Servicio*.
2. **Confirmación de recursos y fechas.** Tras identificar las áreas, se solicita la confirmación de
   disponibilidad del personal de cada área y se alinean las fechas de aprovisionamiento y/o
   participación activa. Estas fechas alimentan `estado` y las predecesoras (`bloquea`) de la
   dependencia.
3. **Formalización en el plan de trabajo.** La intervención, tareas y entregables de estos equipos
   quedan reflejados **desde el inicio** en la ficha del proyecto, el plan de trabajo (tarea de
   enlace en el WBS) y el sistema de registro de horas. Para solicitudes **Intermedio**, el líder
   solicita antes a la PMO los permisos de registro de HH en **Xtiming**.
4. **Seguimiento del plan.** Semanalmente el líder sigue el plan, reporta avances en **Xperience**,
   verifica que el equipo registre sus HH en **Xtiming** y sincroniza esas HH con Xperience desde el
   Mapa de recursos. Esto se alinea con la skill de seguimiento del plan.

> La tarea de enlace temprana sigue siendo **humana de gestión** con HH de respaldo bajas (0,5–1 HH):
> el esfuerzo real de cada área lo estima el área, no esta skill. Lo que la skill asegura es que el
> enlace quede **agendado, con responsable nombrado y visible** desde el día uno, y que la hoja
> **Resumen** liste el área, su responsable de contacto y su estado.

---

La estimación se hace en las tres clases. Los elementos del plan dependen de la clase confirmada. No omitir la estimación porque el cambio sea Menor o Intermedio.

| Elemento | Menor | Intermedio | Mayor |
|---|---|---|---|
| Construcción del cambio | Sí. Un paquete con las tres respuestas. | Sí. Según los objetivos y los sistemas, contratos o datos. | Sí. Plan completo. |
| Verificación del criterio de término | Sí | Sí | Sí |
| Prueba y aceptación | La frase de término | Sí. Lo escrito en el cuestionario medio. | Sí. Acompañamiento a la certificación funcional. |
| Certificación técnica | Los estándares se cumplen en la construcción. | Sí, acotada a acceso, datos, secretos o esquema cuando el cambio los toca. | Sí. Certificación técnica integral. |
| Implementación | Sí | Sí | Sí |
| Estabilización | No | Sí | Sí |
| Acta de Cierre | 0,5 HH | 0,5 HH | 1 HH |
| Mob Elaboration, modelo, arquitectura y habilitación del entorno | No | No | Sí. Mob Elaboration solo si la metodología es `ai-dlc`. |
| Calendario laboral, dedicación y país | No | Sí, para fechar el plan. | Sí |

### Cuando la clasificación es Menor

La fuente es el recorrido corto: qué se cambia y para qué, dónde vive el cambio, y cómo se sabe que quedó resuelto. Estimar solo los elementos de la columna Menor. No bloquear la estimación esperando artefactos de Discovery o de Concepción. Informar las HH tradicionales y la banda (< 40 HH).

El paquete de construcción de Menor **no sale del task-tracker** (que solo existe dentro de un flujo `/aidlc`), sino del archivo `scripts/construccion-menor.json`, que la skill de ficha escribe al cerrar la ficha corta con las tres respuestas. El generador resuelve la fuente de construcción con esta precedencia: **task-tracker** (si hay unidades) → **ficha corta** (`construccion-menor.json`) → **vacía**. Así, un cambio Menor hecho fuera de AI-DLC igual obtiene su construcción, y un proyecto con tracker se comporta como antes (el fallback no se activa). La hoja Resumen deja registrada la fuente usada y, cuando es la ficha, el objetivo, dónde vive el cambio y el criterio de término. Ver *Fuente de construcción sin task-tracker (`construccion-menor.json`)*.

Si las tres respuestas muestran varios frentes, un objeto o columna nuevos, una regla de negocio nueva o más de un flujo, estimar con la clase que indica el esfuerzo.

Si `clasificacion` llega como `menor` y el esfuerzo o el impacto indican `intermedio` o `mayor`, no usar los elementos de Menor. Anotar la clase que indica el esfuerzo, la clase declarada y el motivo. Esa anotación permanece. La estimación usa la clase que indica el esfuerzo, salvo que el líder, con la anotación a la vista, mantenga Menor.

### Cuando la clasificación es Intermedio

La fuente es el cuestionario medio. Estimar los elementos de la columna Intermedio. Pedir país, calendario y dedicación para fechar ese plan. No incluir Mob Elaboration, Modelo de la solución, Arquitectura de la solución ni habilitación del entorno.

### Cuando la clasificación es Mayor

Aplican la tabla de insumos, el anclaje a las fechas de fase y todos los elementos de la columna Mayor.

### Optional inputs

| Parameter | Default if omitted |
|-----------|-------------------|
| `methodology` / mode | Ask once: `ai-dlc` \| `traditional` |
| `start_date` | AI-DLC: `Start Date` de `aidlc-state.md`. Otro: today (ISO) |
| `construction_start` | AI-DLC: `construccion_inicio_real` de `estimacion-fases.json` |
| `hours_per_day` | `8` |
| `dependencias` | Los paquetes de construcción de personas distintas arrancan juntos. El cierre sigue certificación → aceptación → implementación → estabilización → acta. |
| `modo_asignacion` | `por_entregable`. Usar `por_tarea` cuando varias personas deban revisar actividades distintas de una misma unidad. |
| `roles_por_tarea` | Sin restricciones adicionales. Admite nombre exacto de tarea o `tipo:<categoria>` asociado a uno o varios roles; puede ejecutarla quien posea cualquiera de los roles indicados. |
| `responsables_funcionales` | Lista vacía. Informarlos cuando existan consultas de reglas de negocio o comerciales. |
| `dependencias_externas` | Lista vacía. Si se omite, se derivan del perfil (`infrastructure`). Ver *Dependencias de áreas de soporte (enlace temprano)*. |
| `lider_solicitud` / `responsable_solicitud` | Alias compatibles para configuraciones anteriores. En el formato recomendado se infieren desde los roles de `personas`. |
| Project `name` / `code` / `leader` / client | Placeholders only if truly unknown — prefer asking |

### `task_grouping` semantics

| Value | Plan / WBS structure | When to use |
|-------|----------------------|-------------|
| **`by_deliverable`** | En Mayor: Mob Elaboration → Modelo de la solución → Arquitectura de la solución → Habilitación del entorno → [Entregables de construcción] → Certificación técnica integral → Acompañamiento a la certificación funcional → Implementación → Estabilización → Acta de Cierre. En Intermedio se omiten Mob Elaboration, modelo, arquitectura y habilitación. En Menor quedan la construcción, la verificación, la implementación y el acta. Mob Elaboration solo entra en Mayor con `methodology = ai-dlc`. **No usar prefijos ni siglas** en los nombres visibles. | Plan según la clase confirmada. |
| **`by_layer`** | Outline by technical workstreams: **Frontend**, **Backend**, **Arquitectura**, **Base de datos**, then transverse `CTI` / `CF` / `IMP` / `EST` / `AC`. Tasks still trace to business scope from artifacts. | Team wants effort split by specialty / role. |

**Regla obligatoria del Acta de Cierre:** el entregable contiene exactamente una
sola tarea, `Elaborar el acta de cierre formal`, asignada al responsable de la solicitud.
Sus HH no se inventan ni se calculan proporcionalmente:

| Clasificación confirmada | HH del Acta de Cierre |
|---|---:|
| Mantenimiento Mayor (`mayor`) | 1 HH |
| Mantenimiento Intermedio (`intermedio`) | 0,5 HH |
| Mantenimiento Menor (`menor`) | 0,5 HH |

El generador exige `clasificacion` en `project-config.json`. La fila del
entregable y la fila `TOTAL PROYECTO` de la hoja Plan se escriben como fórmulas
Excel: el entregable usa `=SUM(D<primera_tarea>:D<ultima_tarea>)` y el proyecto
suma las filas de entregable. Al cambiar las HH de la tarea, ambos totales deben
recalcularse.


### Asignación por pareja (persona + agente)

- **Identidad y capacidad:** cada persona trae `nombre`, `dedicacion`, `roles`, `fecha_inicio_participacion` y `ejecuta_desarrollo`. La dedicación acepta `0.8`, `80` o `"80%"` y siempre se normaliza a 0–1. Una persona con varios roles conserva un solo cursor y una sola disponibilidad.
- **Roles:** `lider_proyecto` / `responsable_solicitud` coordina; `responsable_documentacion` elabora ficha, actas y cierre; `especialista_tecnico` define especificaciones y atiende dudas técnicas; `programador_principal` y `desarrollador` construyen. Un especialista puede desarrollar cuando `ejecuta_desarrollo` es `true`.
- **Consultas:** las dudas técnicas se asignan mediante `roles_por_tarea` al especialista correspondiente. Las dudas de reglas de negocio se canalizan a `responsables_funcionales`; esos contactos no se cuentan como recursos técnicos.
- **Inicio y alcance:** nadie recibe trabajo antes de `fecha_inicio_participacion`. `asignacion.tipo = "global"` cubre todo; `"entregables"` limita la participación a la lista declarada. Los campos planos `entregables` y `especialidades` siguen aceptados por compatibilidad.
- **Ventana.** `entregables` coincide por nombre y `especialidades` por texto. Quien trae ventana no recibe paquetes fuera de ella. `exclusivo: true` reserva esa ventana; con `false`, la persona especialista participa primero y el pozo general puede apoyar.
- **Asignación por entregable.** Una persona conserva la propiedad completa del entregable, como en el modelo original de persona + agente.
- **Asignación por tarea.** Cuando `modo_asignacion = "por_tarea"`, las actividades de la misma unidad se distribuyen entre personas elegibles por disponibilidad y dedicación. Esto permite que dos personas revisen en paralelo tareas diferentes generadas por agentes.
- **Tareas.** Con varios agentes, las tareas asignadas a una persona pueden repartirse entre ellos. La columna de recursos muestra `Nombre[NN%] + agente`.
- **Verificación.** La hace la misma persona, al terminar sus tareas de ese entregable.
- **Seguimiento.** Cada tarea `Realizar el seguimiento y la gestion del entregable` queda en quien tenga el rol de liderazgo y consume sus HH según dedicación. Si esa persona también desarrolla, gestión y desarrollo comparten el mismo cursor para evitar sobreasignación.
- **Acta de cierre.** La tarea `Elaborar el acta de cierre formal` queda en el responsable de la solicitud y arranca cuando termina el entregable del que depende (estabilización, o implementación si la clase no tiene estabilización).
- **Paralelo.** Dos entregables de personas distintas pueden avanzar a la vez. La predecesora que se escribe es la que de verdad retrasa el inicio. Si un paquete no puede empezar hasta que otro termine, se declara en `dependencias`.
- **Cierre por defecto**, si `dependencias` no dice otra cosa: certificación técnica, luego aceptación, implementación, estabilización y acta. En una estimación aproximada, la construcción espera al último entregable de ideación o concepción que esté en el mismo plan.
- El tiempo se acumula en horas dentro del día hábil. No se redondea cada tarea a un día.
- La hoja Colaboradores lista una sola fila por persona, con roles, dedicación, fecha de inicio, alcance, HH de trabajo, HH de verificación y número de tareas.

**Fechas:** aceptar ISO `AAAA-MM-DD` y entrada `DD/MM/AAAA`; persistir ISO en
JSON. `05/10/2026` significa 5 de octubre de 2026.

---

## Reglas de Estimación Asistida por IA (IDEs Agénticos)

Cuando `methodology = ai-dlc` y se especifique el uso de herramientas de IA:

1. **Unificación Frontend / Backend (Seguimiento Continuo):**
   - **No separar** Frontend y Backend en tareas desglosadas aisladas durante la fase de construcción.
   - La construcción se consolida en unidades verticales completas (UI + API + DB + Pruebas Técnicas Integradas) desarrolladas en interacción directa con los modelos LLM, eliminando hand-offs y tiempos muertos de negociación de contratos.

2. **Matriz de Aceleración Agentic-First (AI-DLC):**

   | Fase del Entregable | Factor Tradicional | Factor AI-Native (Agéntico) | Impacto Real (Tradicional → Agéntico) | Rol del Desarrollador |
   |---|---|---|---|---|
   | **Discovery / Specs** | 1.00x | **0.40x** | 40h → 16h | Redacción de prompts, historias y especificación técnica |
   | **Arquitectura y DB** | 1.00x | **0.20x** | 40h → 8h | Validación de esquemas ERD, seguridad y modelos generados |
   | **Construcción Core** | 1.00x | **0.15x – 0.20x** | 40h (1 sem) → 6h – 8h (1 día) | Agent steering, revisión de Pull Requests y auditoría |
   | **Pruebas y Refactor** | 1.00x | **0.25x** | 40h → 10h | Pruebas de borde, validación de UX y UAT con usuario |
   | **Despliegue / DevOps** | 1.00x | **0.20x** | 20h → 4h | Supervisión de scripts IaC y pipelines CI/CD generados |
   | **Documentación** | 1.00x | **0.10x – 0.15x** | 6h → 0.5h – 1h | IA genera docs desde código/specs; humano revisa y ajusta contexto |

3. **Clasificación por Complejidad de Specs (Agentic Unit Sizing):**

   > ⚠️ **Escala DEPRECADA por el modelo v3.** Esta tabla (2–12 HH) medía "horas
   > de humano acelerado" y sobredimensionaba ~50x–250x frente a la realidad
   > medida. Usar la **escala recalibrada del modelo v3** (sección *Modelo v3 —
   > Generación + Supervisión*), que separa `HH_generación` (fracciones de hora)
   > de `HH_supervisión`. Se conserva aquí solo como referencia histórica de las
   > categorías de complejidad.

   | Unidad | HH (histórico) | Criterio de clasificación | Ejemplos |
   |---|---|---|---|
   | **Básica** | ~~2 – 4 HH~~ | Pattern público conocido + es CRUD, config, formulario, API REST estándar | CRUD Inmuebles, Maestros, Usuarios, upload S3, PWA shell |
   | **Media** | ~~6 – 8 HH~~ | Lógica documentada en specs + flujos con estados + relaciones complejas | Inspección exploratoria, Plan reparaciones, Sync offline (Workbox) |
   | **Dashboard / Reportes** | ~~6 – 8 HH~~ | Visualización de datos, KPIs, gráficos, filtros, informes | Dashboard indicadores, Informe por Criticidad, Consultas |
   | **Compleja** | ~~10 – 12 HH~~ | Sin pattern público + investigación/diseño + integración legada sin API | Integración SAP/mainframe sin API, algoritmos propietarios |

   Las categorías (Básica / Media / Dashboard / Compleja / Tests) siguen vigentes;
   lo que cambia son las HH, ahora tomadas de la tabla del modelo v3.

4. **Sizing de Documentación (con IDE agéntico):**
   - Doc técnica (APIs, OpenAPI, README, diagramas): **0.5 HH** por documento.
   - Doc funcional / negocio (flujos, reglas, manuales): **1 HH** por documento.
   - Evidencias (CTI screenshots, reportes de prueba): **1 HH** por documento.
   - Máximo absoluto: **1 HH** por tarea individual de documentación.

5. **Perfiles de Equipo AI-Native (para hoja Colaboradores):**
   - **AI Spec Engineer / Prompt Architect:** Diseña especificaciones para el agente (Kiro/Cursor).
   - **Senior AI Code Auditor:** Ejecuta, valida y refina las salidas de código, arquitectura y seguridad.

---

## Modelo v3 — Generación + Supervisión (calibrado con datos reales)

> **Estado: implementado, calibración provisional.** Este modelo reemplaza la
> métrica de una sola columna ("horas de humano acelerado") por **dos
> componentes explícitos por tarea**. Los números finos siguen siendo
> provisionales (calibración agregada de proyectos AI-DLC previos); lo
> concluyente es el **método**. Recalibrar con la evidencia del propio proyecto.

### Hallazgo que motiva el cambio (evidencia del task-tracker)

- La **generación** del agente ocurre en **minutos** por tarea (desde ~1 min en
  un repositorio o config simple hasta ~9 min en tareas de pruebas).
- La **verificación humana** es el cuello de botella: puede tardar **días de
  reloj** entre el fin de la generación y el cierre de la verificación.

Conclusión: la generación del agente ocurre en **minutos**; el cuello de botella
real es la **supervisión humana + la cola de verificación**. La escala anterior
(2–12 HH de construcción) sobredimensionaba ~50x–250x.

### Regla del modelo v3 (obligatoria en modo `ai-dlc`)

1. **Dos componentes por tarea, siempre:**
   - `HH_generación` — trabajo del agente (fracciones de hora, calibrado real).
   - `HH_supervisión` — trabajo humano (revisar, dar feedback, verificar, UAT).
   El total = `HH_generación + HH_supervisión`. En la hoja **Plan** ambos se
   **condensan** en una sola columna `Duración (horas)`; el **desglose** se
   reporta en la hoja **Resumen**.

2. **Escala de generación recalibrada** (sustituye la de 2–12 HH):

   | Categoría | HH_generación | HH_supervisión | Evidencia real |
   |---|---|---|---|
   | Básica (CRUD/repo simple) | 0.05 | 0.4 | repos/config simples (~1 min) |
   | Media (lógica documentada) | 0.10 | 0.8 | lógica documentada (3–6 min) |
   | Dashboard / Reportes | 0.12 | 1.0 | proyecciones, KPIs |
   | Compleja (sin pattern) | 0.15 | 1.5 | lógica de dominio sin pattern (~7–8 min) |
   | **Tests** (categoría aparte) | 0.20 | 1.5 | pruebas (~9 min) — pico real |
   | Documentación técnica | 0.10 | variable | **0.5 HH total** | APIs, OpenAPI, README, diagramas |
   | Documentación funcional | 0.10 | variable | **1 HH total** | flujos, reglas, manuales |
   | Evidencias | 0.10 | variable | **1 HH total** | capturas CTI, reportes de prueba |
   | Verificación técnica | 0.05 | 1.0 | script + revisión humana |

   Categorías **humanas** (diseño, discovery, despliegue, CTI, UAT, cierre): la
   generación agéntica es 0 y la supervisión ES el trabajo, con su factor de
   aceleración tradicional (discovery 0.40x, despliegue/implementación 0.20x,
   CTI 0.25x, humano puro 1.0x).

3. **El cronograma lo dicta la verificación humana, no `HH ÷ 8h/día`** — y esa
   verificación es una **tarea explícita** por unidad de construcción. Cada
   entregable de construcción con fila `VER-*` lleva al final una tarea
   sintética **"Verificación técnica de <entregable>"** que:
   - arranca cuando terminan las tareas de trabajo de esa persona en el entregable;
   - consume esfuerzo real de verificación: `VERIF_FACTOR × Σ Duración`;
   - la ejecuta la persona dueña del entregable;
   - bloquea el inicio del siguiente entregable hasta su finalización y la cola
     opcional `VERIF_LATENCY_DIAS`.

   Las horas de verificación se reflejan en `Duración (horas)`, en la columna
   `HH verificación` de Colaboradores y en los totales formulados del Plan.
   La columna `Latencia (horas)` conserva el mismo valor para trazabilidad; no
   se debe interpretar como una segunda suma independiente de HH.

   **Exclusiones** (`VERIF_EXCLUIDOS`): la tarea de verificación solo aplica a
   unidades de DESARROLLO / CONSTRUCCIÓN con una fila `VER-*`. No aplica a
   inception (Mob Elaboration, Modelo, Arquitectura, Habilitación) ni al cierre
   (CTI, Acompañamiento, Implementación, Estabilización, Acta de Cierre).

   **Nombres visibles de entregables:** los prefijos técnicos de unidad (`UC-01`,
   `UC-02`, etc.) no se muestran en el nombre del entregable. El identificador
   de unidad se conserva únicamente para joins y trazabilidad del task-tracker;
   el WBS presenta el nombre de negocio (por ejemplo, `Fundacion de Acceso a
   Datos`, no `UC-01 Fundacion de Acceso a Datos`).

   **Gestión por entregable:** cada entregable de inception y construcción debe
   tener exactamente una tarea `Realizar el seguimiento y la gestion del
   entregable`, con tipo `gestion` y HH de respaldo entre 1 y 4 cuando el
   tracker no la proporcione. Esta tarea es humana, no se asigna a un agente IA
   y consume la capacidad del participante que ejerce el liderazgo.

   **Exenciones de gestión** (`ENTREGABLES_SIN_GESTION`): Acompañamiento a la
   certificación funcional, Implementación, Estabilización y Acta de Cierre no
   llevan la tarea de gestión. La salvaguarda se aplica aunque el tracker la
   incluya.

4. **Margen de re-trabajo.** Se aplica `REWORK_FACTOR` (default **5%**) sobre la
   supervisión, evidencia: 1 ajuste 🔧 en 27 tareas. Ya no se asume cero
   re-trabajo.

5. **Feedback loop estimado → real activo, con calibración híbrida de la
   latencia.** La columna `% completado` se cruza con `INDICE-PROGRESO.md`
   (task-tracker). La latencia de cola se calibra así:
   - **Fallback**: mientras haya menos de 3 muestras válidas, se usa 12 h.
   - **Calibrado**: desde 3 muestras válidas, se usa la mediana de las
     duraciones reales de las filas `VER-*` finalizadas.
   - La latencia de cola es distinta del esfuerzo de verificación y no duplica
     las HH del Plan.
   - La hoja **Resumen** registra fuente, muestras, umbral, estadístico y fecha
     de corte.

6. **Tareas de proceso ligeras.** Documentación y gestión se modelan como
   esfuerzo humano de supervisión con sizing explícito, no como HH fijas grandes.

### Qué se mantiene (validado por la evidencia)

- El concepto de **Unit Sizing** por complejidad.
- El **bin-packing continuo** (no redondear días por tarea).
- El **tope bajo de documentación**.
- Reportar **% agente y % verificado por separado**.

### Implementación de referencia

El generador de referencia que materializa este modelo es
`.kiro/skills/intelix-estimacion/scripts/generate_estimacion_v3.py` (constantes `GEN_HH`, `SUP_HH`,
`REWORK_FACTOR`, `VERIF_CONFIG`, `VERIF_EXCLUIDOS`, `ENTREGABLE_A_VER_TRACKER`).
La latencia de verificación se resuelve por calibración híbrida en
`resolver_latencia_verificacion()` (fallback 12 h / mediana desde 3 muestras).
Las duraciones de calibración provienen de
`INDICE-PROGRESO.md` del registro AI-DLC activo (v1 o v2).

**Copia autocontenida (para recrear en otros proyectos):** el mismo script y la
plantilla de fases están empaquetados junto a esta skill en
`scripts/generate_estimacion_v3.py` y `scripts/estimacion-fases.example.json`.
Ver `scripts/README.md` para el paso a paso de recreación.

---

## Configuración central del proyecto (nombre y código)

El **nombre** y el **código** del proyecto **no se hardcodean** en el generador:
se leen de una configuración central compartida por las tres skills (estimación,
seguimiento, task-tracker):

```
docs/scripts/project-config.json
{ "code": "ABC12345", "name": "ABC12345-nombre-del-proyecto",
  "leader": "...", "country": "VE", "clasificacion": "mayor" }
```

- `code` es la clave de los nombres de archivo (`PLAN-ESTIMACION-<code>-v<N>.xlsx`,
  `SEGUIMIENTO-<code>-...`). Cambiar el código aquí lo propaga a todos los
  generadores; los planes ya emitidos con el código anterior quedan como
  histórico.
- La plantilla vive junto a la skill en `scripts/project-config.example.json`.

### La skill crea/solicita la config si falta (bloqueo, no fallback silencioso)

El generador se detiene si `project-config.json` no existe o le falta `code`,
`name` o `clasificacion` válida (`menor`, `intermedio`, `mayor`), y no genera
hasta tenerlos. La clasificación es necesaria para evitar un Acta de Cierre
incorrecta por valor predeterminado.

- **Si el JSON no existe**: la skill **crea una plantilla vacía**
  (`code`/`name`/`clasificacion` en blanco) y pide completarla; luego se vuelve a ejecutar.
- **Si existe pero le falta `code`, `name` o `clasificacion` válida**: se detiene y apunta a corregirlo,
  sin sobrescribir lo que ya haya.
- Solo cuando `code`, `name` y `clasificacion` están completos, la skill genera.

---

## Fuente de construcción sin task-tracker (`construccion-menor.json`)

El generador arma los entregables de **construcción** desde el task-tracker
(`INDICE-PROGRESO.md` del registro AI-DLC activo). Ese tracker **solo existe dentro de
un flujo `/aidlc`**. Para un cambio Menor (o Intermedio) hecho fuera de ese
flujo no hay tracker, así que la construcción se toma de un archivo de respaldo:

```
scripts/construccion-menor.json
```

Vive junto al script, igual que `project-config.json` y `estimacion-fases.json`.
La **skill de ficha lo escribe automáticamente** al cerrar la ficha corta, con
las tres respuestas y el paquete de construcción. También puede editarse a mano.

**Precedencia de la fuente de construcción** (la resuelve `resolver_construccion()`):

1. **Task-tracker** si tiene unidades → se usa y el archivo se ignora.
2. **Ficha corta** (`construccion-menor.json`) si el tracker está vacío.
3. **Vacía** si no hay ninguno → el plan se genera igual (solo con los
   entregables fijos de la clase) y la hoja Resumen muestra el aviso de que
   faltó la construcción.

Con tracker presente, el camino AI-DLC existente **no cambia**.

### Formato

Forma principal — una lista de paquetes (el caso típico de Menor: el cambio y
sus pruebas son paquetes distintos):

```json
{
  "paquetes": [
    {
      "entregable": "<Nombre de negocio del cambio>",
      "tareas": [
        "<Tarea de implementacion del cambio>",
        "<Otra tarea de implementacion, si aplica>",
        "<Tarea de documentacion, si aplica>",
        "Verificacion tecnica de <Nombre de negocio del cambio>"
      ]
    },
    {
      "entregable": "Pruebas tecnicas y funcionales",
      "tareas": [
        "<Escribir las pruebas que correspondan>",
        "<Ejecutar las pruebas>",
        "Registrar evidencias de las pruebas"
      ]
    }
  ],
  "recorrido_corto": {
    "objetivo": "<Respuesta 1: que se cambia y para que>",
    "donde_vive": "<Respuesta 2: pantalla, modulo, flujo, integracion o dato>",
    "criterio_termino": "<Respuesta 3: frase comprobable de termino>"
  }
}
```

Reglas del formato:

- Se acepta también la forma de objeto único `{ "entregable": "...", "tareas": [...] }`;
  el generador la normaliza a un solo paquete.
- `entregable` (obligatorio): nombre de negocio, sin prefijos ni siglas.
- `tareas` (1..N por paquete): el número de tareas es la dimensión del cambio.
  Cada nombre se clasifica con la heurística del generador para asignar
  `HH_generación` y `HH_supervisión` del modelo v3; no hay que indicar HH.
- Una tarea cuyo nombre empieza por "Verificacion…" se trata como la fila de
  **verificación técnica** del entregable (igual que una fila `VER-*` del
  tracker), por lo que aplica el modelo `VERIF_FACTOR`.
- `recorrido_corto` (opcional): trazabilidad hacia la hoja Resumen; no afecta las
  HH. Sus campos también se aceptan en la raíz del JSON.
- Degradación elegante: un paquete sin `tareas` recibe un mínimo de dos tareas
  (implementar + verificación técnica) para no quedar vacío.
- No lleva `ID Tracker` (queda vacío en el plan); el `ID Jerárquico` se genera
  por orden de aparición, igual que con el tracker.

Los entregables fijos de la clase Menor (**Implementación** y **Acta de
Cierre**) se agregan siempre, además de los paquetes de la ficha. La tarea
`Realizar el seguimiento y la gestión del entregable` se mantiene como última
tarea de cada entregable de construcción, según la regla de gestión por
entregable.

---

## Anclaje a las fechas reales de fase AI-DLC

Las fechas de la estimación **no se hardcodean**: se resuelven desde el estado
real del proyecto.

- **Inicio de inception** → se lee del campo `Start Date` de
  `aidlc-state.md` del registro AI-DLC activo. Este archivo es **solo lectura**.
- **Fin de inception**, **inicio de construcción**, **recursos y dedicación** →
  se registran en un archivo escribible propio de la estimación
  (`docs/scripts/estimacion-fases.json`), porque `aidlc-state.md` no se puede
  modificar.

### Flujo de dos fases con solicitud de datos

1. **Estimación inicial aproximada** (inception en curso,
   `inception_fin_real: null`): se ancla todo al inicio real de inception y la
   construcción se estima como **continuación directa**. Se marca como
   `Tipo: APROXIMADA` en la hoja Resumen.

2. **Al marcar el fin de inception** (`inception_fin_real` con fecha): si faltan
   la fecha de inicio de construcción, el total de recursos o su dedicación, la
   skill **se detiene y los solicita** — no genera el Excel hasta tenerlos.

3. **Estimación completa** (datos completos): dos anclas reales. Inception
   arranca en su fecha; la construcción se **re-ancla** a su fecha real de
   arranque (independiente de cuándo terminó inception). Se marca como
   `Tipo: COMPLETA`.

La verificación humana se representa como una **tarea explícita** al final de
cada entregable de construcción que corresponda (fila `Verificación técnica de
<entregable>`). La tarea tiene las horas proporcionales definidas por
`VERIF_FACTOR`, se asigna a la persona dueña del entregable y arranca cuando
esa persona termina las tareas de trabajo; no se agrega como sufijo al nombre del
entregable padre.

---

## ID Jerárquico (clave de unión plan ↔ seguimiento)

Cada entregable y tarea lleva un **`ID Jerárquico`**: una clave estable de unión
(join) entre el plan de estimación y el seguimiento, **independiente del nombre y
de la posición** (ambos frágiles). El ID **nace en la estimación** (este
generador) para que el `.xlsx` del plan lo lleve y la skill de seguimiento lo
**herede** en vez de recalcularlo.

### Formato (2 niveles)

```
Entregable   <PREFIJO>-<NNN>          ej.  EST-001, PAR-002
Tarea        <PREFIJO>-<NNN>-<NNN>    ej.  EST-001-001, PAR-002-003
```

- **`PREFIJO`**: `EST` = estándar de arquitectura/proceso · `PAR` = particular
  del desarrollo. Se deriva con `prefijo_entregable()` (único punto a ajustar).
  Son `EST`: Mob Elaboration, Modelo de la solución, Arquitectura de la solución,
  Certificación Técnica Integral, Acompañamiento a la certificación funcional,
  Implementación, Estabilización, Acta de Cierre. El resto es `PAR`.
- **`NNN`**: 3 dígitos con cero a la izquierda (001..999), consecutivo por nivel.
- La numeración de entregables es **continua por prefijo** entre fases (inception
  y construcción comparten los contadores EST/PAR).
- Desde `EST-001-003` se lee el entregable padre `EST-001` sin tabla externa.

### Reglas

- **Aditivo, no destructivo.** No cambia la nomenclatura de negocio ni los IDs de
  tarea del task-tracker (`XX-T01`); el ID Jerárquico es un dato aparte, mapeado.
- **Determinista por orden de aparición.** Mismo orden de entregables/tareas →
  mismo ID. Depende de que el orden en el generador coincida con el del
  `INDICE-PROGRESO.md` para que el join tarea-a-tarea sea real.
- **Degradación elegante.** Un entregable no listado cae en `PAR`.
- Se emite en la hoja **Plan** (columna 11) y en la hoja **Resumen** (primera
  columna de la tabla por entregable).

---

## Unidad de medida, calendario laboral y empaquetamiento diario

- Un día hábil equivale a **8 HH únicamente para una dedicación de 100 %**.
- Capacidad productiva diaria por recurso: $\text{Capacidad Diaria}_k = 8 \times \text{Dedicación}_k$.
  - 100 % → 8 HH/día · 50 % → 4 HH/día · 25 % → 2 HH/día.
- Capacidad de equipo por día: $\sum_k (8 \times \text{Dedicación}_k)$. Ej: 2 recursos al 100 % = **16 HH/día**.

### Algoritmo de Programación Continuo (Bin-Packing Diario)

- **PROHIBIDO** hacer `ceil()` de días a nivel de tarea individual. Tareas cortas (ej: 2-4 HH) **no** consumen un día completo.
- El tiempo se modela como un **flujo continuo de horas** por recurso. Cada recurso lleva un cursor de horas; las tareas **acumulan horas dentro del mismo día** hasta llenar su capacidad diaria (8 HH al 100 %) antes de saltar al siguiente día hábil.
- Ejemplo (recurso al 100 % = 8 HH/día) que ejecuta `Tarea 1` (4 HH) y `Tarea 2` (4 HH) secuenciales el Día 1:
  - `Tarea 1`: Comienzo Día 1 (08:00) — Fin Día 1 (12:00).
  - `Tarea 2`: Comienzo Día 1 (13:00) — Fin Día 1 (17:00).
  - **Resultado:** ambas tareas registran **el mismo día** en `Comienzo` y `Fin`. No se desperdician horas.

### Programación de la construcción (pareja persona + agente)

- En `por_entregable`, la unidad se asigna entera a una persona. En `por_tarea`, cada actividad se asigna a la persona elegible que termine antes, respetando ventanas y exclusividad.
- Personas distintas avanzan a la vez cuando ninguna depende de la otra.
- La verificación tiene un responsable humano: el dueño en `por_entregable` o una de las personas participantes en `por_tarea`. Es predecesora solo de lo declarado en el DAG.
- El seguimiento del líder consume su cursor. Si el líder también desarrolla, no puede usar la misma disponibilidad simultáneamente para ambas responsabilidades.
- Consumir `h` horas con dedicación `d` avanza `h / d` horas de calendario.

### Tarea explícita de verificación técnica (esfuerzo proporcional)

Tras las tareas de trabajo de cada entregable **incluido** (todos salvo
las exclusiones), se **anexa** una tarea sintética "Verificación técnica de
\<entregable>". Esa tarea:

- arranca cuando terminan las tareas de trabajo que cubre;
- tiene **Duración = `VERIF_FACTOR × (suma de la Duración de las tareas de trabajo del entregable)`**. `VERIF_FACTOR = 0.30` por defecto: verificar (auditar/revisar lo que produjeron los agentes) cuesta ≈ 30% de lo que costó generarlo+supervisarlo. Es un **esfuerzo real**, no una latencia vacía;
- la ejecuta la persona participante que pueda terminarla antes, con preferencia por el dueño cuando hay empate;
- su **fin es el fin del entregable** y, sumada la latencia de cola `VERIF_LATENCY_DIAS` (default 0), fija el inicio del siguiente entregable.

Se **anexa al final** de la lista de tareas del entregable para **no renumerar**
los IDs jerárquicos de las tareas existentes.

**Calibración del `VERIF_FACTOR`:** el valor por defecto 0.30 es coherente con la
matriz de aceleración AI-DLC de esta skill (Discovery/Specs 0.40x, Pruebas y
Refactor 0.25x): la verificación humana es auditoría de PRs + pruebas manuales,
que cuesta una fracción de la generación. Ajustable en `generate_estimacion_v3.py`
(p. ej. 0.20x si es solo auditoría de código; 0.40x si incluye validación de
negocio extensa). **Antes** este factor era 1.0x (verificar costaba lo mismo que
todo el entregable), lo que sobredimensionaba el esfuerzo humano.

### Parámetros CLI de verificación humana (configurables)

El generador acepta dos flags para ajustar la verificación sin editar código:

| Flag | Unidad | Default | Efecto |
|------|--------|---------|--------|
| `--verif-factor F` | fracción (0–1) | `0.30` | Horas de verificación = `F × Duración de las tareas del entregable`. Ej: `--verif-factor 0.20` (solo auditoría de código), `0.40` (incluye validación de negocio). |
| `--verif-latency D` | días hábiles | `0` | Cola de aprobación humana tras cada verificación, antes de arrancar el siguiente entregable. Ej: `--verif-latency 1` = el próximo entregable espera 1 día hábil adicional. |

Ejemplos:
```
python generate_estimacion_v3.py                                 # 0.30x, sin cola
python generate_estimacion_v3.py --verif-factor 0.20             # auditoría ligera
python generate_estimacion_v3.py --verif-factor 0.40 --verif-latency 1
python generate_estimacion_v3.py --final --verif-factor 0.25     # versión definitiva
```

Sin flags, se usan los defaults `VERIF_FACTOR = 0.30` y `VERIF_LATENCY_DIAS = 0`
definidos en el script.


### Totales formulados (recálculo automático en Excel)

Las celdas de **Duración (col 4)** de los totales se escriben como **fórmulas de Excel**, no como valores fijos:
- **Total de cada entregable**: `=SUM(D<primera_tarea>:D<última_tarea>)` — suma las Duraciones de sus tareas (incluida la fila de verificación técnica).
- **TOTAL PROYECTO**: `=D<ent1>+D<ent2>+…` — suma solo las celdas de total de los entregables (nunca las tareas, para no duplicar).

Así, si el usuario cambia las HH de cualquier tarea en el Excel, **el total del entregable y el del proyecto se recalculan automáticamente**. El Acta de Cierre contiene una sola tarea, `Elaborar el acta de cierre formal`, con HH fijas según la clasificación confirmada: 1 HH para Mayor y 0,5 HH para Intermedio/Menor.


### Traducción de horas-offset a fechas

- `dia_indice = offset_horas // capacidad_diaria_recurso` → índice del día hábil (0-based).
- `Comienzo`: fecha del día hábil donde cae la hora inicial de la tarea.
- `Fin`: fecha del día hábil de la última hora consumida (offset final exclusivo).
- La lista de días hábiles se construye desde `start_date`. `VE` carga sus feriados nacionales para el año calculado. Otro país requiere `holidays` validados (`AAAA-MM-DD`) en `project-config.json`; si faltan, el generador se detiene.
- **Dos anclas de fecha:** inception arranca en `Start Date` de `aidlc-state.md`;
  la construcción se re-ancla a `construccion_inicio_real` de
  `estimacion-fases.json`. Cada fase tiene su propia línea de días hábiles.

---

## Outputs obligatorios

El skill genera el **Excel** en cada corrida en
`.intelix/outputs/estimacion/`. El resumen en Markdown es opcional
(bajo petición). El sufijo `-FINAL` se añade solo cuando la versión se confirma
como definitiva (ver *Estimación iterativa y versión definitiva*).

### 1. PLAN-ESTIMACION-{CODIGO}-v{N}[-FINAL].xlsx  (obligatorio)

Excel estructurado en **3 hojas** (Plan, Resumen, Colaboradores):

#### Hoja: Plan (Estilo MS Project)
Columnas requeridas en la cabecera (Fila 4, fondo cian `#00BCB4` o similar con texto blanco).
Las columnas **9 y 10 quedan RESERVADAS** para la skill de seguimiento (`Inicio real` / `Fin real`),
la **11** es el `ID Jerarquico` que nace aquí, y las **12 y 13** (v11) son
`Latencia (horas)` e `ID Tracker`, añadidas **después de K** para no romper a los
consumidores de las columnas I/J/K:

| 1 Id | 2 Nombre de tarea | 3 % completado | 4 Duración (horas) | 5 Comienzo | 6 Fin | 7 Predecesoras | 8 Nombres de los recursos | 9 *(reservada)* | 10 *(reservada)* | 11 ID Jerarquico | 12 Latencia (horas) | 13 ID Tracker |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

- **`Id`**: Identificador numérico secuencial (`1`, `2`, `3`...).
- **`Nombre de tarea`**: Nombre del entregable o tarea (sin prefijos de negocio).
  Las **tareas van con sangría** (3 espacios); los entregables sin sangría — así
  la skill de seguimiento distingue nivel.
- **`% completado`**: Formato porcentaje (ej: `0%`). Se alimenta del avance real
  del task-tracker (ver *Cruce del % completado con el task-tracker*).
- **`Duración (horas)`**: HH totales de la tarea = `HH_generación + HH_supervisión`
  **condensadas en una sola columna** (ej: `3.4`, `0.47`, `20.07`). El desglose
  generación/supervisión NO va en la hoja Plan; se reporta en la hoja Resumen.
- **`Comienzo`**: Fecha inicial con formato `DD/MM/AAAA`.
- **`Fin`**: Fecha final con formato `DD/MM/AAAA`.
- **`Predecesoras`**: Id numérico de la(s) tarea(s) dependiente(s).
- **`Nombres de los recursos`**: Recurso asignado con su dedicación real
  (ej: `Persona A[100%] + agente`, `Persona B[20%]`).
- **Cols 9–10 (`Inicio real` / `Fin real`)**: se dejan **vacías** en el plan de
  estimación; las rellena la skill de seguimiento con datos del task-tracker.
- **`ID Jerarquico`** (col 11): clave estable de unión plan ↔ seguimiento (ver
  *ID Jerárquico*). Entregable `<PREFIJO>-<NNN>`, tarea `<PREFIJO>-<NNN>-<NNN>`.
- **`Latencia (horas)`** (col 12): en el modelo v12 la verificación humana es
  **esfuerzo** (col 4), no latencia vacía. Esta columna refleja las horas de
  verificación del entregable (= `VERIF_FACTOR × Duración de sus tareas`) para
  trazabilidad; en las tareas de trabajo es `0`. La cola opcional entre
  entregables se controla con `VERIF_LATENCY_DIAS` (default 0).
- **`ID Tracker`** (col 13): para las filas de **verificación humana**, el
  ID de la unidad en el task-tracker (`VER-<PREFIJO_UNIDAD>`, p. ej. `VER-XX`)
  que permite al seguimiento vincularlas **por ID** (no por posición). Vacío en
  el resto.
- **Fila de verificación humana**: `Duración (horas) = VERIF_FACTOR × ΣDuración`,
  `Nombres de los recursos = <persona dueña>[NN%]`, nombre `Verificación técnica
  de <entregable>`; arranca cuando esa persona termina las tareas de trabajo
  y su fin es el fin del entregable.

#### Otras Hojas del Libro Excel:
- **`Resumen`**: tabla por entregable con **`ID Jerarquico`** como primera
  columna, **desglose `HH_generación` vs `HH_supervisión`** por entregable y
  total, y una columna de **latencia de verificación (horas)** mantenida
  **separada** de las HH de esfuerzo. La metadata reporta, además del
  `Tipo de estimación` (APROXIMADA / COMPLETA), fechas reales de fase, capacidad,
  período, país y feriados: la **latencia por verificación** (12 h / 1,5 días),
  el **nº de verificaciones** y las 5 exenciones, la **latencia total de
  calendario** (`11 × 12 = 132 h`, nunca HH), el **modo** (fallback / calibrado),
  las **muestras válidas / umbral**, el **estadístico** y la **fecha de corte**.
  Incluye **`Version`** y **`Estado`** (Borrador / Definitiva, con fecha).
  Cuando hay `dependencias_externas` (declaradas o derivadas del perfil), la hoja añade un apartado
  **Dependencias externas** con `area`, `necesidad`, `contacto` y `estado`, para seguir el enlace con
  las áreas de soporte como un frente propio (ver *Dependencias de áreas de soporte (enlace temprano)*).
- **`Colaboradores`**: una fila por persona con roles, dedicación %, inicio de participación, alcance, HH de trabajo, HH de verificación y tareas. La ejecución y la verificación quedan en participantes habilitados; el seguimiento y el acta se asignan por rol sin duplicar la capacidad de una misma persona.
- **No se genera una hoja separada `Plan AI`**; el desglose de generación agéntica y supervisión humana queda en `Plan` y `Resumen`.

### 2. ESTIMACION-RESUMEN-{CODIGO}-v{N}[-FINAL].md  (opcional, bajo petición)

Markdown estructurado con resumen de estimación, WBS, capacidad y riesgos.

---

## Corrección ortográfica y de acentuación (Reglas RAE)

El generador de estimación aplica un **corrector ortográfico automático** basado en las reglas de la Real Academia Española (RAE) para garantizar la correcta acentuación y ortografía en los nombres de tareas y entregables.

### Características del corrector

1. **Diccionario de palabras con tilde**: Corrige palabras que frecuentemente se escriben sin tilde (ej: "disenar" → "diseñar", "parametros" → "parámetros", "solucion" → "solución", "analisis" → "análisis", "autenticacion" → "autenticación", "gestion" → "gestión", "lider" → "líder", "nucleo" → "núcleo", "agnostico" → "agnóstico", "catalogos" → "catálogos").

2. **Protección de términos técnicos**: Los términos técnicos en inglés y acrónimos se mantienen en su forma original (API, REST, SDK, JWT, AWS, Lambda, SQL, PostgreSQL, UDF, DDL, etc.).

3. **Corrección de conectores**: Las preposiciones y conectores ("de", "del", "la", "las", "y", "e", "o", "para", "por") se escriben en minúscula, excepto cuando son la primera palabra.

4. **Mayúsculas correctas**: Los nombres propios y siglas mantienen su capitalización.

### Ejemplos de corrección aplicada

| Entrada (sin corregir) | Salida (corregida) |
|---|---|
| Disenar arquitectura hexagonal | Diseñar arquitectura hexagonal |
| Elaborar 38 requerimientos funcionales | Elaborar 38 requerimientos funcionales |
| Parametros de configuracion | Parámetros de configuración |
| Pruebas de integracion Lambda | Pruebas de integración Lambda |
| Verificacion tecnica de seguridad | Verificación técnica de seguridad |
| API REST con autenticacion | API REST con autenticación |
| Disenar el nucleo agnostico | Diseñar el núcleo agnóstico |
| Validacion de catalogos y UDF | Validación de catálogos y UDF |
| Nombre del lider (lider) | Nombre del líder (líder) |

### Implementación

El corrector está implementado en el módulo `corrector_ortografico.py` que se importa automáticamente en `generate_estimacion_v3.py`. Se aplica a:

- Nombres de tareas derivados del task-tracker
- Nombres de tareas predefinidas de las fases de inception y cierre
- Nombres de entregables
- Cabeceras visibles del libro Excel

**Nota**: Los términos técnicos estándar de la industria (API, REST, AWS, Lambda, etc.) se preservan en inglés por ser convenciones internacionales.

---

## Cruce del % completado con el task-tracker

Cuando el proyecto tiene `INDICE-PROGRESO.md` en el registro AI-DLC activo, la columna
**`% completado`** de la hoja Plan se rellena con el **avance real** registrado
por la skill task-tracker, en lugar de dejarla en `0%`. El generador
(`generate_estimacion_v3.py`) lee el índice y calcula el avance por entregable.

### Cómo se calcula

- **Escala (pesos del task-tracker):** ⬜/🔄 = 0, 🟡/🔧 = 0.9, ✅ = 1.0, ⏭️ excluida
  del denominador. El % de la unidad = Σ(pesos) / nº tareas no omitidas × 100
  (el "% agente" del tracker).
- **Filas de entregable:** muestran el % agregado de su unidad.
- **Mapeo entregable → unidad del tracker:** cada proyecto lo declara en
  `UNIDAD_A_ENTREGABLE` (en la plantilla viene vacío). Asocia el id de la unidad
  del tracker con el nombre de negocio del entregable:

  | Entregable (nombre en el plan) | Unidad (id del tracker) |
  |---|---|
  | `<Nombre del entregable>` | `<id-unidad-del-tracker>` |

- **Entregables de inception** (`Mob Elaboration`, `Modelo de la solucion`,
  `Arquitectura de la solucion`) se fijan al **100%** (completados al generar el
  índice).
- **Entregables sin unidad rastreada** (Entorno, CTI, CF, Implementación,
  Estabilización, Cierre) quedan en `0%`.
- Si no existe el índice, la columna cae a `0%` (salvo los overrides de
  inception) sin romper la generación.

**Nota:** el plan de estimación es el baseline (HH y fechas estimadas). El
seguimiento fino del avance en el tiempo lo produce la skill **seguimiento-plan**
(snapshots versionados por fecha/hora), que además re-ancla las fechas de
construcción al inicio real. Esta skill solo refleja el % agregado en el plan.

---

## Estimación iterativa y versión definitiva

La estimación es un **artefacto iterable**: se regenera tantas veces como haga
falta hasta que el usuario confirme que una versión es la **definitiva**. Ninguna
corrida sobrescribe iteraciones previas — el historial completo se conserva.

### Ciclo de versionado

1. **Borrador por defecto.** Toda corrida produce un **borrador** iterable.
   La versión se **auto-incrementa**: se detecta el mayor `vN` existente en
   `.intelix/outputs/estimacion/` (patrón
   `PLAN-ESTIMACION-{CODIGO}-v{N}[-FINAL].xlsx`) y se genera
   `v(N+1)`. Nunca se pisa una iteración anterior.
2. **Refinamiento.** El usuario revisa, pide ajustes y se vuelve a generar
   (nueva `vN+1`). Se repite cuantas veces sea necesario.
3. **Confirmación explícita.** La estimación **solo** se marca como definitiva
   cuando el usuario lo confirma de forma explícita (p. ej. "confírmala como
   definitiva"). La skill **nunca** marca una estimación como definitiva por su
   cuenta.
4. **Definitiva.** Al confirmar, la versión se fija como **Definitiva**:
   - El archivo lleva sufijo `-FINAL`: `PLAN-ESTIMACION-{CODIGO}-v{N}-FINAL.xlsx`.
   - La hoja **Resumen** registra `Estado: Definitiva (confirmada DD/MM/AAAA)`.
   - `--final` fija la iteración actual (la última `vN`), no crea una nueva.
   - Antes de escribir el archivo definitivo se ejecuta obligatoriamente la
     **Validación pre-final** descrita abajo. El borrador es la fuente del cierre;
     no se reconstruye silenciosamente desde las fuentes originales.

### Validación pre-final obligatoria

Cuando el usuario solicite confirmar, fijar o marcar una versión como definitiva,
`--final` debe ejecutar estos pasos en orden antes de crear el archivo `-FINAL`:

1. **Leer el borrador actual.** Abrir el último
   `PLAN-ESTIMACION-{CODIGO}-v{N}.xlsx` de
   `.intelix/outputs/estimacion/` (o la versión indicada por `--version`) y leer
   completa la hoja `Plan`: entregables, tareas, HH de la
   columna D, fechas E/F, predecesoras G, recursos H, dedicación, ID
   Jerarquico, latencia e ID Tracker.
2. **Detectar cambios manuales.** Comparar por `ID Jerarquico` contra la última
   salida generada por el script. Revisar HH de tareas, recursos, nombres,
   tareas añadidas y tareas eliminadas. Si no hay cambios, imprimir exactamente
   `El plan no tiene modificaciones manuales`. Si los hay, listar cada uno con
   tarea, campo y valor anterior → valor nuevo. Los cambios se conservan para
   el recálculo; no se descartan ni se sobrescriben.
3. **Recalcular fechas.** Usar los valores actuales del Excel, no las fechas
   anteriores, aplicando 8 HH por día al 100%, capacidad `8 × dedicación`,
   fines de semana y feriados del calendario del proyecto, predecesoras y flujo
   continuo de horas sin redondear cada tarea. Las fechas recalculadas sustituyen
   E/F del borrador.
4. **Validar y corregir totales.** Comprobar que cada entregable sea la suma
   exacta de las HH de sus tareas, incluida la verificación técnica, y que
   `TOTAL PROYECTO` sea la suma de los entregables. Reportar cada discrepancia
   como `entregable, total actual, total calculado, diferencia` y corregir las
   fórmulas/valores antes de guardar.
5. **Mostrar resumen.** Imprimir el archivo leído, cambios encontrados, fechas
   recalculadas, discrepancias corregidas, total del proyecto y resultado de la
   validación. Si hay predecesoras inexistentes, HH o dedicaciones inválidas,
   fechas imposibles o falta el borrador, detenerse sin generar `-FINAL`.

El `-FINAL` se crea como copia validada del borrador, preservando nombres,
recursos y tareas manuales y actualizando sus fechas y totales. Si ya existe el
`-FINAL`, la versión está congelada y la ejecución se detiene para evitar
`sobrescribirla`.

### Estados de la estimación

| Estado | Significado | Nombre de archivo | Campo Resumen |
|---|---|---|---|
| **Borrador** | Iteración en refinamiento, editable | `...-v{N}.xlsx` | `Estado: Borrador` |
| **Definitiva** | Confirmada por el usuario, congelada | `...-v{N}-FINAL.xlsx` | `Estado: Definitiva (confirmada …)` |

### Invocación del generador

```bash
# Borrador: auto-incrementa a la siguiente vN (lee fechas de aidlc-state.md
# + estimacion-fases.json; aplica modelo v3 generacion+supervision)
python .kiro/skills/intelix-estimacion/scripts/generate_estimacion_v3.py

# Forzar un número de versión concreto
python .kiro/skills/intelix-estimacion/scripts/generate_estimacion_v3.py --version 3

# Definitiva: lee y valida el borrador actual antes de crear -FINAL
python .kiro/skills/intelix-estimacion/scripts/generate_estimacion_v3.py --final
```

**Comportamiento por fase:**
- Si `inception_fin_real` está en `null` → genera estimación **APROXIMADA**.
- Si el fin de inception está marcado pero faltan `construccion_inicio_real`,
  `recursos` o su dedicación → **no genera** y **solicita** esos datos (sale con
  código 2).
- Con todo completo → genera estimación **COMPLETA** con dos anclas de fecha.

**Regla dura:** no marcar `--final` sin confirmación explícita del usuario. Ante
la duda, generar un borrador y preguntar si esa es la versión definitiva.

---

## Regla de procedencia obligatoria

En Mayor, los artefactos fuente del plan completo provienen de discovery, inception o requerimientos validados. Si no existen, solicitarlos como bloqueador antes de generar ese plan.

En Menor, las tres respuestas son la fuente de la estimación. En Intermedio, las respuestas del cuestionario medio son la fuente. No exigir Mob Elaboration, modelo ni arquitectura para esas dos clases.
