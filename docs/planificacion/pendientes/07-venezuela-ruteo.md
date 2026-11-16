# 07 — Venezuela en el motor de ruteo: datos por cargar y piezas faltantes

**Estado:** pendiente por implementar

**Qué ya está (2026-11-13, rama `motor-ruteo-fase4`):** el motor de ruteo planifica por almacén y
país. Por cada almacén toma:

- **Depósito:** las coordenadas del almacén (`tbl_warehouses.latitude/longitude`). Sin ellas,
  Costa Rica sale de San José y cualquier otro país del centro de los pedidos del día (aviso en
  el log; el T-n sale corto).
- **Mapa:** OSRM de su país (`ruta_geo.REGIONES`: `CR`/`DCR` → Costa Rica :5000, `VN`/`DVE` →
  Venezuela :5001). La matriz se pide por bloques de 100, así que un día de miles de pedidos no
  choca con el tope del servidor.
- **Flota:** la flota propia del país del almacén: vehículos sin transportista o de un
  transportista con `is_flota_propia`, cuyo país (`tbl_vehicles.country_id`, sql/71, o el del
  transportista) sea el del almacén. Si no hay, el plan responde 409.
- **Coordenadas del pedido:** las que traiga eFlow y, si no trae, las del punto de entrega del
  cliente destino (`tbl_delivery_points` → `tbl_addresses`).

## Qué falta cargar para los dos almacenes nuevos

1. **Almacenes con coordenadas.** `MICHELENA` y `SAN-DIEGO` ya existen (país `VN`, activos) pero
   sin coordenadas. Cargarlas desde la pantalla de almacenes o con:
   `UPDATE tbl_warehouses SET latitude = <lat>, longitude = <lng>, updated_at = now() WHERE code = '<CÓDIGO>';`
   Sin ellas el depósito sale del centro de los pedidos y el T-n queda corto.
2. **Flota propia de Venezuela.** Crear (o usar) un transportista con `is_flota_propia = true` y
   país Venezuela, y cargar sus camiones con capacidad de peso y volumen. Hoy Venezuela tiene 0
   camiones propios. La pantalla de vehículos no pide país: lo toma del transportista, así que el
   transportista debe tener país.
3. **Puntos de entrega (~20 mil).** Ya hay 8.723 de Beval, Febeca y Sillaca, 99,8 % con
   coordenadas. Los nuevos se cargan con `backend/local/ingest_delivery_points.py` (formato
   limpio de Venezuela; valida contra la caja del país y nunca guarda coordenadas inválidas).
4. **Zonas.** El solver no mezcla zonas en un camión: los pedidos sin zona (`delivery_zone`)
   caen todos en el grupo `S/R`. Funciona (600 pedidos en un grupo se resuelven en 2,6 s), pero
   las zonas de Venezuela deben venir de eFlow (`RUTA`) o de geocercas para que los viajes tengan
   sentido operativo.

## Qué falta construir

- **Ingesta de pedidos de Venezuela.** `ingest_orders.ingest_cr` es solo de Costa Rica
  (`PAIS = "cr"`, `ORG_CR`, `WAREHOUSE_CR` fijos). `tms_common.eflow_db` ya conoce `"ve"`. Hace
  falta un `ingest_ve` (o parametrizar por país): mapear `IDALMACEN` de eFlow a `MICHELENA` /
  `SAN-DIEGO`, compañías y sucursales de Venezuela, y credenciales `EFLOW_VE_*`. Sin esto no
  entra ningún pedido de Venezuela a la bandeja. Archivos: `ingest_orders.py`, `ingest_items.py`,
  `salientes.py`, `sim_eflow_sync.py`, `replan.py` (`ingestar_programado`).
- **Zona horaria.** La ventana del replan (`replan._PENDIENTES`) y la comparación usan la fecha de
  Costa Rica. Venezuela va 2 horas adelante: tomar la zona horaria del almacén
  (`tbl_warehouses.timezone`).
- **Horario de servidores.** Aurora y el OSRM se apagan a las 17:00 de Costa Rica (19:00 de
  Venezuela) y encienden 04:45 CR (06:45 VE). Confirmar que cubre la operación de Venezuela.
- **Dato erróneo:** el país `VN` tiene `timezone = America/Mexico_City` (los almacenes sí tienen
  `America/Caracas`). Corregir: `UPDATE tbl_countries SET timezone = 'America/Caracas' WHERE code = 'VN';`
- **Pantalla de vehículos sin país:** si se carga un camión propio SIN transportista (por script),
  hay que darle `country_id`; si no, no entra a ningún plan.
- **Mapa de Venezuela sin actualización automática** (igual que el de Costa Rica).

## Cómo verificar cuando haya datos
1. Coordenadas y flota: `{"accion": "comparar_motores"}` en la Lambda de planning muestra por día
   `region: VN`, `deposito: almacen` y `matriz: osrm`.
2. Mapa: `{"accion": "estado_ruteo"}` debe dar `regiones.VN.fuente = osrm`.
