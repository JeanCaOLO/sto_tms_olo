# EFLOW PROD — fuentes de datos reales (Costa Rica y Venezuela)

Mapa de las bases productivas de EFLOW verificado directamente contra los
servidores (solo lectura) el 2026-09-08. Es lo que consume el backend `server/`
del prototipo de Planificación. Reemplaza la referencia anterior de QA
(`eflow-qa-schema-planificacion.md`), que apuntaba a otro host/esquema.

> Credenciales: SOLO en `.env.local` (gitignored), nunca aquí ni commiteadas.
> Servidores internos (VPN): CR `10.17.224.20:1433`, VE `10.57.129.126:1446`.

## Servidores y bases por país

| País | Host | BD WMH (torre de control) | BD SAP/WMS (expediciones + clientes) |
|---|---|---|---|
| **Costa Rica** | `10.17.224.20:1433` | `EFLOW_WMH` | `EFLOW_OLO` |
| **Venezuela** | `10.57.129.126:1446` | `WMH` | `EFLOW_FEBECA` (o `EFLOW_BEVAL` / `EFLOW_SILLACA` por compañía) |

El backend enruta por país con `?pais=cr|ve` (default `cr`); los nombres de BD
se toman de la config (`EFLOW_CR_*` / `EFLOW_VE_*` en `.env.local`) y se inyectan
en los queries — ver `server/db.mjs` y `server/queries.mjs`.

## Catálogos (BD WMH)

| Entidad | Tabla | Notas |
|---|---|---|
| Rutas | `distribution_routes` | `route_code → route_name → zone_id → state`. **Es el catálogo de rutas** (CR 38, VE 50). El mapeo número→zona vive aquí. |
| Transportistas | `transportation_companies` | `transportation_company_id`, `company_name`. |
| Conductores | `drivers` | `driver_id` (int) **y** `driver_code` (varchar). Ver ⚠️ abajo. |
| Vehículos | `trasportation_units` (sic) | `license_plate`, `vehicle_brand`, `weight_capacity`/`volumetric_capacity` **= 0** (sin dato real de capacidad). |

## Viajes (WMH + expediciones)

`journeys` es la cabecera del viaje de torre de control (`journey_id`,
`situation`, `dock`, `dispatch_date`). **No lleva ruta.** El chofer/unidad salen
de `journey_order_transportation` (por `journey_id`). La ruta, el conteo de
pedidos y el peso/volumen del viaje se derivan de `EXPEDICIONESCABECERA` filtrando
por `NUMEROVIAJEWMH = journey_id`. Ver `VIAJES_BASE` en `server/queries.mjs`.

## Pedidos de un viaje (SAP/WMS)

`EXPEDICIONESCABECERA` = cabecera del pedido (una fila por expedición):
`IDEXPEDICION`, `RUTA`, `PESOPEDIDO_TOTAL`, `CUBICAJEPEDIDO_TOTAL`, `PRIORIDAD`,
`TPEXPE`, `NUMEROVIAJEWMH`, `IDCLIENTE`. Se liga al viaje por `NUMEROVIAJEWMH` y a
`CLIENTES` (`IDCLIENTE` + `IDCOMPANIA`) para nombre / dirección / coordenadas.

## ⚠️ Gotchas confirmados con data real

- **Ruta:** `journey_orders.route_id` está **100% NULL** en CR y VE. La ruta real
  está en `EXPEDICIONESCABECERA.RUTA` (~95% poblada en CR). Nunca usar `route_id`.
- **Chofer, dos llaves:** el mismo conductor se referencia distinto según el
  sistema. En el **WMS** (`ALMACENMOVIMIENTOS_CARCAM.IDCHOFER`) se guarda el
  **`driver_code`** (varchar, p. ej. "264"); en el **WMH**
  (`journey_order_transportation.driver_id`) se guarda el **`driver_id`** (int).
  Al consolidar hay que alternar la llave — confundirlas cruza pedidos con el
  chofer equivocado.
- **Peso/volumen:** `PESOPEDIDO_TOTAL`/`CUBICAJEPEDIDO_TOTAL` poblados en CR
  (76%/48%) pero **en 0 en VE** (`EFLOW_FEBECA`). El bin-packing debe degradar
  con gracia cuando falten.
- **Coordenadas:** `CLIENTES.LATITUD/LONGITUD` poblado en **~2%** (698 de 35.651
  en CR). Es el mayor bloqueante para la optimización real; el pedido sin
  coordenadas queda fuera del cálculo (excepción ya contemplada).
- **`FECHAPLANIFICADADESPACHO`:** casi vacía (0.2%) — el cliente no la usa; el
  OMS deriva la fecha de la regla T-1 sobre fecha de entrega/cierre.
- **Capacidad de vehículo:** 0 en ambos países (VE: 15/225 con peso, 0 volumen).
- **`TPEXPE`:** `EXPERP` (ERP/picking, COFERSA) · `EXPCRO` (cross-docking, EPA,
  prioridad 0, sin ruta) · `EXPMAN` (manual) · `EXPTRA` (traslado).
- **Compañías (CR, `IDCOMPANIA`):** `0109` = COFERSA (el grueso), `0029` = EPA
  (cross-docking), `0085/0102/0110` = comercializadoras.

## Cómo correrlo

```
cp .env.example .env.local   # llenar EFLOW_CR_* y EFLOW_VE_* con las creds reales
pnpm server                  # API read-only en :4000
pnpm dev                     # front; el selector País (CR/VE) recarga los datos
```

Cada endpoint acepta `?pais=cr|ve`. Sin `server/` arriba o sin credenciales, el
front cae a los fallbacks mock (sigue funcionando offline).
