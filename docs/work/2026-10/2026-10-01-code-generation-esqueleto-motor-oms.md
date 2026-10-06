# Code-generation: esqueleto del Motor de Reglas del OMS (rebanada delgada)

**Fecha:** 2026-10-01
**Intent AI-DLC:** 260826-modulo-oms
**Rama:** `oms`
**Alcance:** primera rebanada delgada del OMS (2 reglas de 1a entrega: T-1 por fecha
+ cliente retira/observaciones). NO es el OMS completo.

---

## Qué se entregó (verificado)

Esqueleto **ejecutable** del motor de reglas del OMS, en `backend/oms/src/`, como Lambda
Python siguiendo el patrón del repo (handler `tms_handler(ROUTES)`, módulos por función):

- **5 componentes** con firmas tipadas + docstrings de contrato (functional-design inline):
  - `cola_candidatos.py` — lectura de EFLOW/WMS (adaptador de entrada; filtro
    `TPEXES='DISP' AND TPEXSI='DISP' AND FECHACIERRE IS NULL AND NUMEROVIAJEWMH IS NULL`).
  - `motor_reglas.py` — orquestador de la corrida + resolución de config por scope.
  - `regla_fecha.py` — regla T-1 (fecha base `FECHAEXPEDICIONPLANIFICADA`; fallback por
    valor centinela/default, no por NULL).
  - `analizador_observaciones.py` — cliente retira; stub determinístico (Bedrock diferido).
  - `handoff_pedidos.py` — las **dos escrituras** (D6): tabla propia del OMS + `TPEXSI='GENE'`
    en el WMS (`TPEXES` permanece `DISP`); sin 2PC, idempotencia por PK, `estado_handoff`.
  - `score.py` — cálculo de score **submódulo PURO y testeable** (Testing Posture del proyecto).
- **Flag `escribir_prioridad_al_wms`** parametrizable (default `False`) con TODO visible —
  el destino de la escritura de `PRIORIDAD` (WMS / tabla OMS / ambos) está **por confirmar**.
- **Esquema U2** en `sql/oms_pedidos.sql` (`oms.pedidos`, PK compuesta idempotente).
- **SAM** (`backend/oms/template.yaml` + `samconfig.toml`), `OMS_SOURCE=mock`, rutas con
  `AuthorizationType: CUSTOM` + JWT authorizer (NO repite el `AuthorizationType: NONE` del
  backend viejo).
- **Tests:** 16/16 de la unidad + 142/142 de la suite del backend. No se rompió nada.

Corre **contra mocks/stubs** (EFLOW y Bedrock): demuestra el flujo de punta a punta con
datos simulados, **no** una corrida contra el WMS real ni UI.

## Decisiones de diseño que aterrizó este tramo

- **C2 RESUELTO:** motor de reglas **propio del OMS, nuevo, en el backend (Python)**. No se
  porta el AST de `src/lib/tarifas/`, no se toca Liquidaciones, no hay motor compartido con el TMS.
- **D6:** flujo de dos escrituras OMS→Planificación (tabla propia = handoff; WMS = dispara picking).
- Anclaje al **DDL real** del WMS (`docs/wms-eflow/EFLOW_OLO-ddl.sql`): `TPEXES`/`TPEXSI`,
  `DISP`/`GENE`, PK como clave de idempotencia, `OBSERVACIONESEXPEDICION`, peso/volumen (OQ-8).

## Etapas de diseño diferidas (gate de reactivación)

Se saltaron con motivo (esqueleto sobre domain-design acotado ya hecho): **functional-design,
nfr-requirements, nfr-design, infrastructure-design**. DEBEN correr **antes** de: (a) conectar
datos reales (EFLOW/WMS), (b) desplegar al sandbox, (c) cualquier paso hacia producción.

## Pendientes técnicos (de la revisión del esqueleto)

- **CORREGIR — tipos de ID:** los IDs del pedido están como `int`/`bigint` pero en el DDL real
  son `varchar` (`IDEXPEDICION varchar(50)`, puede no ser numérico). Cambiar a `str`/`text` en
  `models.py` y `sql/oms_pedidos.sql` (es la PK → corregir ahora evita una migración).
- **Cosmético:** normalizar el marcador de comentario `# ponytail:` a `# NOTE:`/`# TECH-DEBT:`.
- **Menor (decisión):** `/api/v1/oms/health` está tras el JWT; evaluar si un uptime-check lo
  necesita público.
- **Confirmar negocio:** destino de la escritura de `PRIORIDAD` (hoy flag, default off).
- **Pedir catálogos** antes de datos reales: `TIPOSINTEGRACION` (códigos estado/situación),
  `CLIENTES`/`ALMACENCOMPANIA` (maestro cliente/compañía).

## Seguridad

- `.env` figura **modificado y trackeado** en git (sigue en el historial). Pendiente de
  **rotación de llaves** y saneo — independiente de este tramo, ya anotado como deuda ALTO.

## Estado de la contabilidad AI-DLC

- Artefactos de code-generation escritos para U1 y U2; reviews por unidad READY; Plan Approval
  de U1 aprobado.
- **Sello final del gate (RFC #662) pendiente a propósito:** el guard (por mtime) detecta
  archivos del editor sin relación con el código del OMS (`.env`, docs, buffer). No se reclamaron
  en el manifest, no se revirtieron, no se hizo bypass. Se cierra en una **sesión limpia** con
  `report --stage code-generation --result approved --user-input "Approve"`.

## Nota sobre estimación

Esta entrada es **factual**: registra lo entregado, no cifras de estimación. No se produjo una
estimación formal para este esqueleto; se construyó dentro de la sesión. No se inventan datos
de esfuerzo/velocidad.
