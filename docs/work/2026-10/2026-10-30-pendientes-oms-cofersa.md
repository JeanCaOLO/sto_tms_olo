# Pendientes OMS — estrategia de prioridad Cofersa (handoff)

**Fecha:** 2026-10-30
**Rama:** `oms`
**Contexto:** cierra la sesión del rediseño de prioridad de Cofersa (`dias_hasta_salida`,
estrategia por scope). El código y las migraciones ya están en la rama; falta aplicarlos y
probarlos en un entorno desplegado. Incluye también el incidente del layer que rompió el
sandbox el 27-oct (ver abajo), ya reportado arreglado por Intelix.

## Estado de lo YA hecho (en la rama `oms`, commiteado)

- **Código** del motor de estrategias de prioridad: `estrategias_prioridad.py` (nuevo),
  `models.py`, `regla_fecha.py`, `motor_reglas.py`, `reglas_config.py`. Commits `743997b`
  (escala por compañía) y `ac28984` (estrategias configurables). Suite OMS: 59 tests en verde.
- **Migraciones** versionadas: `sql/54_oms_rule_configs_escala_prioridad.sql` (columna
  `escala_prioridad` + fila customer de Cofersa, escala 5) y
  `sql/55_oms_rule_configs_estrategia_prioridad.sql` (columnas `estrategia`/`ancla_fecha`/
  `prioridad_piso` + apunta Cofersa a `dias_hasta_salida`).
- Diseño y modelo documentados en `docs/work/2026-10/2026-10-29-prioridad-cofersa-dias-hasta-salida.md`.

> Nota: el 30-oct se aplicaron `sql/54`+`sql/55` a la Aurora dev/QA (`tms_olo`) por error y
> se **revirtieron** el mismo día (base idéntica al pre-estado, registros de `schema_migrations`
> eliminados). O sea hoy NO están aplicados en ningún entorno.

## PENDIENTE

### 1. Ejecutar los queries (migraciones) — al desplegar
- **Orden obligatorio: `sql/54` ANTES de `sql/55`.** El `55` apunta la fila de Cofersa que
  crea el `54`; sin el `54` la validación del `55` aborta.
- El código nuevo hace `SELECT ... escala_prioridad, estrategia, ancla_fecha, prioridad_piso`,
  así que **las migraciones deben estar aplicadas antes o junto con el deploy del código**, o
  el `SELECT` revienta en vivo.
- Comando (con túnel Aurora arriba y `AWS_PROFILE=olo-tms`):
  ```
  node --env-file=.env scripts/run-migration.mjs sql/54_oms_rule_configs_escala_prioridad.sql --execute
  node --env-file=.env scripts/run-migration.mjs sql/55_oms_rule_configs_estrategia_prioridad.sql --execute
  ```
  (sin `--execute` = dry-run). Aplicar en CADA entorno donde corra el OMS nuevo.
- **Quién:** aplicar contra una base compartida/desplegada es terreno de Intelix / requiere
  OK explícito; NO tratar la Aurora del túnel como "local".

### 2. Desplegar el backend del OMS — Intelix
- Deploy del código nuevo del motor (stack SAM del OMS) + migraciones 54/55 en el mismo entorno.
- Para ver la numeración `dias_hasta_salida` de Cofersa en vivo hace falta: migraciones
  aplicadas + backend nuevo corriendo + `OMS_SOURCE=live`.

### 3. Pruebas de flujo real (end-to-end) — pendiente de credenciales
- Flujo: EFLOW (prod, read-only) → bandeja de pedidos → planificación → cola OMS → priorización.
- Driver: `agregar_pedidos_reales.py` (lee pedidos reales de COFERSA CR de EFLOW en
  **solo lectura** vía `pytds` e inserta DISP/DISP en Aurora `orders`).
- Requisitos aún no cubiertos: **credenciales del usuario read-only de EFLOW prod**
  (`EFLOW_CR_*` en `.env.local`), **alcance de red/VPN** a EFLOW (el bastión de AWS no tiene
  ruta), y el **túnel Aurora** (puerto 15432). Conseguir las creds con Alfredo/quien corresponda.
- Los tests automatizados (pytest/vitest/Playwright) usan mocks; NO ingieren data real de EFLOW.

### 4. Incidente del layer (scramp) — reportado arreglado, falta blindarlo
- El sandbox `/dev` daba 500 en todo lo que toca la base porque el layer `tms-common`
  desplegado traía `scramp < 1.4.5` con `pg8000 1.31.2` (que necesita `scramp>=1.4.5`):
  `module 'scramp' has no attribute 'make_channel_binding'`. Se rompió con el **deploy del
  layer v9 el 2026-10-27 ~13:39 UTC** (SAM/CloudFormation, usuario `ext.claude`), arrastrado a v10.
- **Para que no recaiga:** agregar pin explícito `scramp>=1.4.5` en
  `backend/common-services/layers/tms_common/requirements.txt` (hoy NO está) + `sam build`
  limpio. Revisar el mismo riesgo en `backend-planif/requirements.txt` (mismo `pg8000==1.31.2`).

### 5. Cambios / follow-ups NO implementados
- **"0 = liberado" end-to-end:** falta que la pasada de LIBERACIÓN (ADR-013) **escriba**
  prioridad 0 al WMS al liberar. Hoy la estrategia solo garantiza que la cola nunca muestre 0.
- **Pendientes de negocio del DECIDED Cofersa (2026-10-29):** (A, aparcada) peso de otras
  reglas/observaciones dentro del mismo día; (B) confirmar con almacén (Dylan/José) que las
  demás compañías de mayoreo numeran igual; (C) afinar el ancla fina del día vs. la ventana de
  liberación de ADR-013.
- **Refresh de contexto en Kiro/AI-DLC:** hay cambios **sin commit** en `aidlc/`
  (requirements, user-stories, domain-design, functional-design y `project.md` por el ritual
  de learnings del DECIDED Cofersa). Falta commitearlos (commit del usuario).

### 6. Commits pendientes (los hace el usuario)
- Artefactos `aidlc/` modificados (incl. `project.md`). El código y los `sql/` ya están commiteados.
