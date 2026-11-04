# 2026-11-04 — Sincronización de prioridad a eFlow (hecho) + liberación manual (pendiente)

Reunión del 2026-11-04 sobre cómo el OMS comunica la prioridad a eFlow. Dos temas:
uno implementado en esta tanda, otro **dejado pendiente a pedido del negocio**.

## Contexto previo

Rango de prioridad (estrategia `dias_hasta_salida` de Cofersa, horizonte 3,
liberación 1 día antes de la salida): **0 … 3**.
- `0` = pedido ya liberado ("ya se va"), es lo que se manda a eFlow; nunca aparece en cola.
- `1, 2, 3` = cola de priorización (en la práctica se ven sobre todo 2 y 3; el 1 se
  libera en la misma corrida que lo calcula).
- El tope lo fija el horizonte de planificación, no es un número fijo.

## HECHO — Sincronizar el número de prioridad a eFlow desde que se prioriza (solo Cofersa)

Antes, el OMS solo escribía a eFlow al **liberar** (`GENE` + prioridad). El negocio
pidió que, para **Cofersa** (EPA NO), eFlow reciba el número de prioridad **desde que
se prioriza y en cada cambio** (3 → 2 → … → 0), porque para eFlow es relevante cualquier
cambio de prioridad.

Diseño (reusa la costura intercambiable `EscritorSituacion`, eFlow sigue READ-ONLY):

- **Dos verbos en la costura**, que mañana serán **dos endpoints EPRAC**:
  - `actualizar_prioridad(pk, prioridad)` → manda SOLO el número, la situación NO cambia
    (queda `DISP`). (Pasada 1b.)
  - `marcar_generada(pk, prioridad)` → liberación: número + `TPEXSI='GENE'`. (Pasada 2.)
- **No hay "primera escritura"** en el contrato: con los endpoints EPRAC siempre es un
  UPDATE porque el registro ya existe en eFlow. El upsert del writer de prueba
  (`SimExpedicionesWriter` → `sim_expedicionescabecera`) es solo un artificio de la tabla
  temporal: INSERT nace en `DISP` (nunca `GENE`), y el `DO UPDATE` toca únicamente
  `"PRIORIDAD"` (jamás `"TPEXSI"`, para no pisar un `GENE`).
- **Write-on-delta**: el barrido compara el número nuevo (`registro.prioridad`) contra el
  previo (`orders.priority`, que ya trae el candidato; `None` = primera vez) y solo
  sincroniza si cambió. Evita martillar la tabla hoy y el endpoint EPRAC mañana.
- A los pedidos que se **liberan en la misma corrida** NO se les manda el número
  intermedio: la liberación ya les escribe el `0`.
- La pasada 1b NO estampa `oms_processed_at` ni saca el pedido de la cola.

Archivos: `backend/oms/src/handoff_pedidos.py` (verbo `actualizar_prioridad`, SQL
`SIM_PRIORIDAD_SQL`, función `sincronizar_prioridad`), `backend/oms/src/app.py`
(pasada 1b en `correr`, helper `_sincronizar_prioridades`, `sincronizados` en el
resumen/log). Tests: `backend/tests/test_oms.py` (+3). 65 tests en verde.

> **SUPERSEDE PARCIAL de ADR-013**: el ADR decía que la pasada de priorización NO tocaba
> la costura. Ahora SÍ la toca, pero SOLO para el número de prioridad; `GENE` y
> `oms_processed_at` siguen siendo exclusivos de la liberación. Actualizar el ADR-013.

### Robustez (abierta, no bloquea v1)

Si la costura del sync falla, como el delta se mide contra `orders.priority` (que ya se
actualizó), el reintento no re-dispara hasta el próximo cambio real. Para v1 (tabla
temporal, misma Aurora) es best-effort con log. Al pasar a los endpoints EPRAC, evaluar
un marcador `last_synced_priority` (o entrega garantizada) para no perder un cambio.

## PENDIENTE — La interacción manual pasa a ser "liberar el pedido"

**Ajuste del negocio (2026-11-04):** la prioridad va atada a la fecha de salida, y **no
podemos alterar ni la fecha de salida ni la de entrega**. Por eso desaparece el "alterar
prioridad a un número arbitrario": no tendría respaldo en una fecha. La **única
interacción manual** pasa a ser **liberar el pedido**:

> prioridad `0` + situación `GENE` + enviar a eFlow.

> **SUPERSEDE del DECIDED** *"la única intervención humana permitida es que el rol
> Responsable del OMS altere la prioridad de un pedido puntual"* (Adenda 2026-08-26) →
> ahora la única intervención humana es **liberar el pedido**. Registrar por el ritual
> AI-DLC (no editar `project.md` a mano).

### Lógica para implementar (cuando se retome)

**Backend** (la pieza ya existe casi entera):
- La liberación manual **por viaje** ya está: `app.procesar_viaje`
  (`POST /api/v1/oms/viajes/{numero_viaje}/procesar`), gated por rol, reusa
  `liberar_pedido` ignorando la ventana, y ya estampa `0` para `priorizar=true` / la
  propia de EPA. 
- Falta el análogo **por pedido** (la cola es a grano pedido): nueva ruta p. ej.
  `POST /api/v1/oms/pedidos/liberar` (body con la llave EFLOW, motivo opcional), gated
  por `("oms","edit")`, que reusa `_resolver_registros` + `_liberar` filtrando ese
  pedido. Queda `0` para Cofersa y su prioridad para EPA (misma regla del barrido).
- Decisión tomada: la acción está disponible para **cualquier** pedido de la cola
  (gated por rol); estampa `0` solo si `priorizar=true`, y la prioridad de origen si no.

**Frontend** (revierte el override numérico de esta sesión):
- `OverrideModal` numérico → modal **"Liberar pedido"** (confirmación, motivo opcional).
- `OrderDetailModal` / `cola/page.tsx` / `useColaController.ts`: botón "Alterar
  prioridad" → **"Liberar pedido"**; `applyOverride(priority)` → `liberarPedido(reason)`
  contra el endpoint nuevo. El pedido sale de la cola tras liberar (`oms_processed_at`).
- El historial de "cambios de prioridad manual" ya no aplica; dejar (si acaso) un evento
  de liberación manual.

## Despliegue / commits

- Cambio de `backend/oms` (sync de prioridad) requiere **deploy por Intelix** para que
  el barrido del sandbox empiece a sincronizar.
- Commits: los hace el usuario (rama `oms`).
