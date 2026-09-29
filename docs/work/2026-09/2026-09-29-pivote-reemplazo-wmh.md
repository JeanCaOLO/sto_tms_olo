# Pivote de alcance: OMS + TMS reemplazan el WMH (no progresivo) — actualización de contexto

**Fecha:** 2026-09-29
**Autor:** Eduardo Medina (equipo de desarrollo de aplicaciones, Intelix)
**Rama:** `backup/dev-pre-wmh-2026-09-29` (snapshot de `dev` antes de traer la base nueva)

---

## 1. Por qué existe este documento

En reuniones recientes de reestructuración se decidió un **cambio de alcance**: el OMS
y Planificación (y el/los módulos del TMS que correspondan) **reemplazan al WMH
(Control Tower) desde la salida**, NO de forma progresiva como se había planteado
antes. El compañero de equipo adelantó una **base nueva** del proyecto y la subió a
**GitHub (`JeanCaOLO/sto_tms_olo`, rama `main`)**; esa base **ya fue mergeada al
GitLab oficial** (`origin/main` en `TMS-Frontend`), junto con trabajo de despliegue en
el sandbox de AWS y cambios generados con Kiro.

Este archivo:
- deja **snapshot de seguridad** del estado previo (esta rama de backup), y
- documenta **qué hay que actualizar en el contexto** y **qué debe hacer Kiro** en
  AI-DLC ante el pivote.

## 2. Estado de repositorios (2026-09-29)

- **Repo oficial:** GitLab `origin` → `https://git.intelix.biz/olo/tms/TMS-Frontend.git`.
- **Repo de trabajo del compañero:** GitHub `github` → `https://github.com/JeanCaOLO/sto_tms_olo.git`.
- `origin/main` ya contiene la base nueva (merge hecho por el compañero). Cabeza actual:
  `f25a937 "Menú lateral agrupado por ciclo de vida del pedido (Kiro)"`.
- `dev` (donde vive el trabajo de AI-DLC: `aidlc/`, `docs/wmh-actual/`, domain-design,
  units-generation) está limpio y preservado en esta rama de backup.

## 3. Qué cambia en el contexto (decisiones a persistir vía Kiro)

> **Importante:** estas decisiones se persisten con el **ritual §13 de Kiro** (para que
> queden con evento de auditoría, dedupe y chequeo de conflictos). **No** editar
> `project.md` a mano. Abajo van redactadas listas para pasárselas a Kiro.

### D1 — Pivote de alcance (reemplazo del WMH)
```
DECIDED (pivote de alcance — reemplazo del WMH): El OMS y Planificación (y el/los
módulos del TMS que correspondan) REEMPLAZAN al WMH (Control Tower) DESDE LA SALIDA,
no de forma progresiva. Supera el planteamiento previo de que el OMS iría
implementando funcionalidades del WMH de manera incremental. Fuente: reuniones de
reestructuración (sept. 2026) + Figura 7 "Flujo funcional esperado del OMS". (2026-09-29)
```

### D2 — Reparto del WMH por módulos
```
DECIDED (reparto del WMH por módulos): Las funcionalidades del WMH actual (Control
Tower) se REPARTEN entre módulos: unas van al OMS, otras a Planificación y posiblemente
otras a un tercer módulo del TMS. La especificación de lo que se reemplaza vive en
`docs/wmh-actual/` (mapeo Control Tower + datos reales + RESUMEN). El reparto por
módulo es una tarea de diseño. (2026-09-29)
```

### D3 — Fuente de datos (SIN cambio con el reemplazo)
```
DECIDED (fuente de datos, reafirmado): El OMS SIGUE leyendo los pedidos del WMS/EFLOW
(`EFLOW_OLO`), o de la RÉPLICA cuando exista. El reemplazo del WMH NO cambia el ingreso
de pedidos: entran igual desde el WMS/réplica. Reafirma el DECIDED del 2026-09-14 y es
coherente con la Figura 7 ("Ingreso: pedidos del WMS o de la réplica definida"). (2026-09-29)
```

### D4 — Reversión del "rediseño fuera de alcance"
```
DECIDED (reversión): Queda SUPERADO el punto del DECIDED (act. 2026-09-14) que ponía el
REDISEÑO completo del flujo (pedido → TMS → OMS → WMS) FUERA del alcance actual. Con el
reemplazo del WMH desde la salida, ese rediseño ENTRA en alcance. (2026-09-29)
```

### Referencia — Ciclo de priorización del OMS (Figura 7, se mantiene)
El núcleo funcional del OMS **no cambia** con el pivote:
`Ingreso de pedidos → Enriquecimiento de datos → Evaluación de reglas → Priorización →
Asignación / planificación → Auditoría`.
- Ingreso: pedidos y atributos operativos del WMS o de la réplica definida.
- Enriquecimiento: fecha de expedición planificada y demás datos maestros.
- Reglas: evaluación determinística de condiciones configuradas por negocio.
- Priorización: generación de orden/score o clasificación según el diseño funcional.
- Planificación: entrega del resultado al proceso que construye viajes/rutas.
- Auditoría: registro de entrada, reglas ejecutadas, resultado y momento de decisión.

## 4. Qué debe hacer Kiro (AI-DLC) ante el pivote

**No se rehace desde cero — se REVISA (drift).** Buena parte del diseño del OMS sobrevive
(motor de prioridad, reglas, score, IA de observaciones, Simulador=configurador, Capa X,
BD `logistica_olo` OMS/TMS, ciclo de la Figura 7). Cambia la **frontera/alcance** y
**aparecen módulos nuevos**.

Secuencia recomendada:
1. **Persistir D1–D4** vía el ritual §13 (no edición directa de memoria).
2. **Pausar `units-generation`** (etapa en curso): su insumo va a cambiar.
3. **Re-correr `reverse-engineering` contra el código NUEVO** (la base ya integrada en
   `main`), para que el análisis brownfield refleje la realidad, no el prototipo viejo.
4. **Re-correr `requirements-analysis → user-stories → domain-design`** del OMS
   tratando los artefactos existentes como **base a CORREGIR** (regla ya aprendida),
   no como página en blanco.
5. **Crear intents nuevos** para Planificación (y el tercer módulo si se define),
   arrancando desde reverse-engineering/requirements, con `docs/wmh-actual/` como insumo.
6. Considerar **`/aidlc compose`** para re-planificar las etapas pendientes con un gate
   de aprobación.
7. **Indexar `docs/wmh-actual/` en DocumentKB** (`/aidlc-knowledge onboard`) para que las
   etapas puedan citarlo.

## 5. Checklist de la reestructuración

- [x] Crear rama de backup de `dev` (`backup/dev-pre-wmh-2026-09-29`).
- [x] Documentar el pivote y las decisiones a persistir (este archivo).
- [ ] Revisar en `main` la documentación NUEVA que generaron (requerimientos, historias
      de usuario, design) del **OMS** y de **Planificación** — ¿qué tienen, qué falta,
      qué contradice lo nuestro?
- [ ] Traer/consolidar la base de `main` en `dev` conservando el árbol `aidlc/` y `docs/`.
- [ ] Persistir D1–D4 con Kiro (§13).
- [ ] Re-correr etapas afectadas de AI-DLC (reverse-engineering → requirements → stories → domain-design).
- [ ] Crear intents de Planificación / otros módulos.
- [ ] Definir el reparto WMH → módulos (qué pantalla/función va a cada uno).

---

_Nota: la fuente de verdad de lo que reemplazamos es `docs/wmh-actual/` (Control Tower
v4.18.4.4, Angular/AG Grid, BD `EFLOW_OLO`). Ver `RESUMEN — Control Tower (WMH actual).md`._
