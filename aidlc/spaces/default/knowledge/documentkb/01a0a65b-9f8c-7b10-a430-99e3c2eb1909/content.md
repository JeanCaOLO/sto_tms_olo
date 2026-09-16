# Reunión OMS — el "Simulador" es en realidad un configurador de simulaciones; y decisión de BD (logistica_olo)

**Fecha:** `2026-09-15`
**Participantes (equipo Intelix):** **Eduardo** (OMS, el usuario) y (al menos) un interlocutor de diseño/desarrollo.
**Fuente:** transcripción automática, resumida y estructurada. Reunión **interna de diseño**; varios puntos son de **modelado propuesto** y quedan por confirmar en el mockup.

> **Terminología:** **DISP** = disponible (estado y situación); **GENERADA** = situación tras "preparar"; **OMS** = Order Management System; **BD** = base de datos.

---

## 0. Titular
La pantalla que hoy llamamos **"Simulador"** se comporta más como un **configurador de simulaciones**: no es solo una vista previa puntual, sino un módulo donde se **define, persiste, programa y aplica** la simulación de priorización (manual, automática o mixta). Se mantiene el nombre "Simulador" pero su alcance real es el de un configurador + bitácora.

## 1. Qué reglas aplica la simulación
- Cada **regla tiene un estado activa/inactiva** (ya recogido en el catálogo del Motor de Reglas).
- **Al simular se aplican SOLO las reglas ACTIVAS** (todas las activas). El entendimiento base: si quieres que apliquen las 5, actívalas todas.
- Para no tener que ir al mantenimiento de reglas a activar/desactivar, la simulación abre un **modal previo** donde, **por defecto vienen todas las activas** y el usuario puede **desmarcar** o **elegir un subconjunto de reglas** solo para esa corrida.

## 2. Sobre qué pedidos aplica
- En el mismo **modal previo** se elige el **conjunto de pedidos** por **filtro de situación/estado** (p. ej. `DISP`, `GENERADA`, etc.): a **todos** o a un **subconjunto**.
- **Caso de valor explícito:** poder re-simular sobre **prioridades YA asignadas** — es decir, decidir si excluir o incluir los pedidos que ya tienen prioridad asignada o cuya situación ya cambió. ("Quiero volver a cambiar el estatus de las que ya cambiaron de situación" → ahí el filtro por situación tiene valor real.)

## 3. Qué muestra la simulación
- El resultado se muestra como **una tabla igual que la Cola de Priorización** — con **todas las columnas** (o selección de columnas), **no** solo las tres de hoy (pedido, prioridad, …).
- El **recuadro de "estado actual"** de la izquierda **no es necesario**: en su lugar, tras "Generar/Simular" se muestra directamente **cómo quedó** la cola simulada.

## 4. La simulación es una ENTIDAD persistida (bitácora)
- Cada simulación se **persiste** como **registro**: **fecha**, **quién** la generó (**usuario** o **automático**), reglas usadas y filtro aplicado.
- Puede haber **varias simulaciones simuladas**, pero **solo UNA aplicada** — y **una aplicada por compañía**. La aplicada suele ser la **última**, o la que el usuario **elija** manualmente.
- Estados de la entidad simulación (propuesta): **simulada** vs. **aplicada**; modo de aplicación **manual** vs. **automático**.

## 5. Aplicación: manual, automática o mixta (dualidad)
- **Manual:** el usuario simula, revisa que quedó bien, y **le da "Aplicar"**.
- **Automática:** la simulación se **genera sola** (programada) y, si **no recibe intervención/confirmación** antes de cierta hora de corte, **se aplica sola** ("si yo no la reviso antes de las 8 a.m., para mí está bien → se aplica").
- **Mixta:** generada automáticamente pero con **ventana de revisión**; a tal hora, si nadie interviene, se aplica.
- Motivación: al principio el cliente querrá **validar manualmente**; cuando confíe en que las prioridades salen bien, querrá pasarlo a **automático**.

## 6. El "modulito de configuración" de la simulación
Se configura por compañía (una aplicada por compañía):
- **Número de simulaciones al día** y **horarios/frecuencia** (p. ej. "3 al día a tales horas", o "una diaria").
- **Filtro de situación por simulación:** se pueden definir **varias configuraciones** — p. ej. una simulación que aplica solo a `DISP` y **otra** que aplica a `DISP`/`GENERADA` — cada una con su frecuencia.
- **Modo de aplicación por simulación:** **manual siempre**, **automático siempre**, o **mixto con hora de corte** ("hasta tal hora; si no digo nada, se aplica").
- La idea es poder **intervenir manualmente** mientras se valida, o **dejarla corriendo** automáticamente cuando ya hay confianza.

## 7. Decisión de base de datos (NO está en la transcripción; confirmada aparte)
- La base de datos se llamará **`logistica_olo`**.
- Dentro tendrá **dos esquemas**: **`OMS`** y **`TMS`**.
- Nota de coherencia: esto es **esquema por MÓDULO** (OMS / TMS), **no** esquema por compañía. La multi-compañía se sigue resolviendo con **`compañía` y `país` como COLUMNAS** dentro de las tablas (ver decisiones del 2026-09-14). Refina el nombre y la organización de la BD sin contradecir la postura de "columna compañía".

## Acciones / pendientes
1. Renombrar/entender la vista "Simulador" como **configurador de simulaciones** en requerimientos y mockup (mantener el nombre visible "Simulador" si se desea).
2. Modelar la **entidad Simulación** persistida: reglas usadas, filtro de situación, autor (usuario/automático), estado (simulada/aplicada), fecha, compañía; restricción **una aplicada por compañía**.
3. Modelar el **modal previo** (selección de reglas activas + filtro de conjunto de pedidos por situación, incl. re-simular sobre prioridades ya asignadas).
4. Modelar la **configuración/programación** por compañía: nº de simulaciones/día, frecuencia/horarios, filtro por situación por simulación, modo (manual/automático/mixto con hora de corte).
5. Mostrar el resultado como tabla completa (columnas de la Cola), no el recuadro de estado actual.
6. Reflejar la BD `logistica_olo` con esquemas `OMS` y `TMS` en el diseño de datos / dominio.
