# 2026-10-08 — Investigación EFLOW (WMS/WMH) y contexto de los dailies

> Complemento del work del mismo día sobre el código
> (`2026-10-08-pedidos-reales-ws-articulos-guias-merge.md`). Aquí queda la
> narrativa de la **investigación en EFLOW** y el **contexto de los dailies**
> (lo que me toca), como evidencia — no como verdad vigente.

## What changed

Investigación read-only sobre las BD productivas de EFLOW (con credenciales de solo-lectura del proyecto OL26004) para poder cargar data real a Aurora, y registro de lo que salió de los dailies 2026-10-07 y 2026-10-08.

## Why

El negocio (Andrey + lead) pidió dejar de usar data inventada por la IA y pasar a **"mock pero real"** copiado de EFLOW, porque la nomenclatura/valores inventados no calzan con lo real y rompen cuando entra la integración. Y hay que saber de dónde sale cada dato.

## How — hallazgos de la investigación

- **Conectividad**: CR `10.17.224.20:1433` (user `intelixsql`) y VE EPRAC `10.57.129.126\EPRAC,1446` (user `user_app_monitor_tms_autogestion`) son alcanzables desde la máquina de Jesús. Driver `pytds`.
- **EPRAC vs IPRAK**: `EPRAC` = la instancia EFLOW SQL Server de VENEZUELA (fuente de datos). `IPRAK/Iprak` = una EMPRESA (recepción/liquidación), no la fuente — no confundir.
- **Maestro de artículos** = `ARTICULOSGESTION` (`DESCRIPCIONLARGA`); join por `IDCOMPANIA`+`IDARTICULO`.
- **Coordenadas de cliente** = WMS `EFLOW_OLO.CLIENTES.LATITUD/LONGITUD` (el pedido las hereda por `IDCLIENTE`). El **WMH no guarda coords**; `IDGEOREFERENCIA1..5` = jerarquía administrativa, no lat/long.
- **`journey_orders` (WMH)**: liga viaje↔pedido por `journey_id`↔`order_number` (= `IDEXPEDICION`); `priority` INT, `route_id` NULL.
- **Encoding**: los `varchar` de EFLOW son cp1252 → `pytds` mete mojibake; leer con `CONVERT(VARBINARY)` + `decode('cp1252')`.
- **Nulos pre-despacho**: `GUIAFISCAL` y `FACTURA` llegan NULL en pedidos `DISP` (se llenan al despachar/facturar).

## How — contexto de los dailies (lo que me toca)

- **Mi trabajo (planificación)**: entregado hoy — data real en Aurora, WebSocket de pedidos nuevos en vivo, detalle de artículos del pedido, detalle de sin-asignar. (Es exactamente lo que reporté en el daily.)
- **Próxima tarea asignada**: **Guías de Despacho** — "la guía es el resultado de la planificación" (1 guía ≈ 1 viaje, básicamente la ruta), módulo **informativo + imprimible**; luego van al **tracking** y son lo que se le entrega al chofer. Base ya reescrita hoy contra el plan confirmado; falta pulir e integrar tracking.
- **Meta de equipo**: Palencia comprometió con Carlos (gerente de operaciones) los **3 módulos** (planificación, tarifas, OMS) listos **para testear a fin de mes** (no productivo). Tarifas (Dilan/José): motor parametrizable ya está, falta front. OMS (Eduardo): depende de IPRAC.

## Promoted knowledge

- Memoria `eflow-pull-gotchas` (cómo leer EFLOW real y cargar a Aurora).
- Notion (espacio INTELIX → TMS OLO → Documentos y referencias): página **"🔎 Descubrimientos EFLOW…"** y **página de credenciales restringida**.
- ADR-0004 para el modelo de las columnas WMS.

## Follow-ups

- [ ] VE-EPRAC (Febeca/Beval): cargar data real de Venezuela a Aurora cuando se decida.
- [ ] Guías de Despacho: terminar (impresión fina) y cablear `/tracking` al plan real.
- [ ] Geocoding de clientes VE lo hace **Jean** (no desarrollo); bloquea la ruta VE hasta que entregue coords.
- [ ] Rotar la access key AWS `ext.claude` (expuesta en chat).
