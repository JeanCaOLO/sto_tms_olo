# Pruebas locales del OMS — contraparte del plan Planificación ↔ OMS (ADR-013)

Lógica para probar en LOCAL el lado OMS del contrato de columnas en `public.orders`,
contra el Aurora del sandbox por el túnel SSM. **Creada, no ejecutada aún.**

> Corregida respecto al plan de Planificación (2026-10-21): **no existe `oms.pedidos`**
> (el OMS escribe en `public.orders` + `sim_expedicionescabecera`); **priorizar deja
> `DISP`** (no `GENE`, no `oms_processed_at`); **liberar** pone `GENE` + `oms_processed_at`
> solo dentro de la ventana `dispatch_date − dias_prep_picking`; `oms_processed_at` =
> LIBERADO (no priorizado).

## Cómo correr (cuando toque)

```
# túnel SSM arriba (localhost:15432) y:
pip install pg8000

# 1) Solo verificar el estado actual (READ-ONLY, no escribe):
python backend/oms/pruebas/verif_oms.py

# 2) Correr el barrido live y luego verificar (ESCRIBE en Aurora):
python backend/oms/pruebas/verif_oms.py --barrido

# 3) Probar "Procesar a Eflow" de un viaje (ESCRIBE, ignora la ventana):
python backend/oms/pruebas/verif_oms.py --viaje <AAAAMMDD-seq>
```

El barrido también se puede correr suelto con `python backend/oms/run_local.py`.

## Casos que verifica `verif_oms.py` (todos read-only)

| Caso | Qué asegura (ADR-013) |
|---|---|
| T6 — cola | `planning_run_id IS NOT NULL AND oms_processed_at IS NULL` = la cola |
| priorizar deja DISP | ningún priorizado-no-liberado está en `GENE` |
| liberado ⇒ priorizado | no hay `oms_processed_at` sin `prioritization_run_id` |
| liberado ⇒ GENE | todo `oms_processed_at` tiene `wms_situation='GENE'` |
| fuera de ventana no liberado | nada liberado con `dispatch_date > hoy+1` |
| espejo | cada liberado tiene fila `GENE` en `sim_expedicionescabecera` (por llave EFLOW) |
| trazabilidad | existe `oms_logs` |

## Mapeo al plan de Planificación

| Plan (Chus) | Lado OMS aquí | Corrección |
|---|---|---|
| T6 cola | ✅ igual | — |
| T7 "OMS procesa: prioridad + generada + marca procesado" | se parte en **priorizar** (deja DISP) y **liberar** (GENE + `oms_processed_at`) | `oms.pedidos`→`public.orders`; no marca procesado al priorizar |
| T8 escritura 2 GENE (stub, disparo_pendiente) | la costura escribe al espejo `sim_expedicionescabecera` y deja `completado` | `disparo_pendiente` solo si la costura falla |
| T9 idempotencia | UPSERT por llave EFLOW en `orders` y en el espejo (no duplica) | no es `oms.pedidos` |
| T10 replan limpia | lo valida Planificación (nulea markers); el OMS verifica que salen de la cola | — |
| T11 write-back nº viaje | al espejo, nunca al eFlow real | — |
| T12 trazabilidad | `oms_logs` + pestaña de Auditoría | — |
| (falta en el plan) | **ventana de liberación**, **barrido 5×/día**, **"Procesar a Eflow"** manual | agregar al plan |

## Fuera de alcance (igual que el plan)

- APIs reales de Iflow/EPRAC (no entregadas): hoy se simula contra Aurora/espejo.
- Escritura al WMS/EFLOW real: `sim_expedicionescabecera` es el espejo temporal.
- eFlow real = solo lectura, jamás se escribe.
