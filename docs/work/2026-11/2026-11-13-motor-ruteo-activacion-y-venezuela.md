# 2026-11-13 — Motor de ruteo: solver activo en el sandbox y lógica de Venezuela

Rama `motor-ruteo-fase4`. Pedido del usuario: activar el solver y contemplar Venezuela (dos
almacenes nuevos con coordenadas, su flota y ~20 mil puntos de entrega).

## Qué cambió
- **Solver activo en el sandbox:** `MotorRuteo=ortools` en `backend/planning/samconfig.toml`
  (dev). El replan horario arma los viajes no liberados con OR-Tools; si el solver falla, ese
  día sale con la heurística.
- **Sede por almacén** (`ruta_geo.Sede`, `sede_de`): depósito = coordenadas del almacén. Sin
  ellas, Costa Rica sale de San José y cualquier otro país del centro de los pedidos del día
  (con aviso). Antes todo salía de San José: un plan de Venezuela habría calculado ~19 días de
  anticipación. La sede viaja por `motor_ruteo.asignar_y_ordenar(pedidos, flota, sede)`, la
  heurística, el solver, el T-n y el orden de paradas. Para Costa Rica nada cambia.
- **Mapa por país:** `OSRM_URL = "CR=…:5000;VN=…:5001"`; `matriz_distancias.url_de(region)`.
  Región por código de país (`REGIONES`: `CR`/`DCR` → CR, `VN`/`DVE` → VN).
- **Matriz por bloques:** más de 100 puntos se piden en bloques de 100×100 en paralelo (8 hilos),
  para días grandes de Venezuela. Si un bloque falla, todo el día cae a línea recta.
- **Flota por país:** `plan_builder._FLOTA` toma la flota propia (sin transportista o de un
  transportista con `is_flota_propia`) cuyo país —el del vehículo o, si no tiene, el del
  transportista— sea el del almacén, con capacidad cargada. Sin flota del país: 409.
- **Coordenadas del pedido desde el punto de entrega:** si eFlow no trae lat/lng, se toman del
  punto de entrega activo del cliente destino (`PUNTO_ENTREGA` en `plan_builder`; también en la
  comparación histórica). Hoy no cambia nada en Costa Rica (ningún pedido sin coordenadas tiene
  punto geocodificado); sirve a Venezuela, cuyos puntos están geocodificados.
- **Migración `sql/66_vehiculos_pais.sql`** (aplicada en Aurora; rollback incluido):
  `tbl_vehicles.country_id` con FK e índice. Relleno: vehículos de transportista → país del
  transportista; flota propia → Costa Rica (supuesto: los 12 camiones propios operan en Costa
  Rica). Validación: ningún camión propio activo quedó sin país.
- **OSRM con Venezuela:** la instancia se reemplazó (`i-08c1c00ca6a64bc99`) con dos
  contenedores, Costa Rica :5000 y Venezuela :5001; disco 24 GB y 6 GB de swap.

## Lo que encontré en los datos de Venezuela
- Almacenes `MICHELENA` y `SAN-DIEGO` (activos) y `OLO-VN` (inactivo): **ninguno tiene
  coordenadas**, igual que `OLO-CR`.
- **0 camiones propios** de Venezuela. Hay 3 vehículos de un transportista demo (`VN`).
- **8.723 puntos de entrega** de Beval, Febeca y Sillaca, 99,8 % con coordenadas.
- La **ingesta de pedidos es solo de Costa Rica** (`ingest_orders.ingest_cr`): no entra ningún
  pedido real de Venezuela.
- El país `VN` tiene `timezone = America/Mexico_City` (los almacenes sí, `America/Caracas`).

Lo que falta (datos y piezas): `docs/planificacion/pendientes/07-venezuela-ruteo.md`.

## Verificación
- Backend: 680 → 699 tests en verde. Nuevos: `tests/test_ruta_geo.py` (sede y T-n desde el
  depósito correcto), mapa por región y matriz por bloques (`test_matriz_distancias.py`), sede
  y flota del país en `plan_builder`, y el solver usando el depósito y el mapa de Venezuela.
- Consultas nuevas contra Aurora (túnel): flota por almacén (OLO-CR 12 camiones, igual que
  antes; almacenes de Venezuela 0), pedidos de la ventana y del histórico con coordenadas
  (62/62, 59/59, 22/22, 161/161).
- Solver con grupos grandes (local, sintético, un solo grupo): 150 pedidos 0,1 s, 300 → 0,5 s,
  600 → 2,6 s.
- Sandbox, `estado_ruteo`: `motor: ortools`, solver ok, y las dos regiones con `fuente: osrm`:
  Costa Rica San José–Liberia 213,2 km / 243 min (igual que con el servidor anterior) y
  Venezuela Valencia–Caracas 168,0 km / 135 min (en línea recta se estimaban 340 min). El mapa
  de Venezuela tardó unos 6 minutos en procesarse.
- Comparación de 45 días después de los cambios: idéntica a la de la fase 4 (32 días, −9,4 %
  km, 0 errores). Costa Rica no se movió con la lógica por país.
- **Primer replan real con el solver** (invocado a mano a las 12:38, el mismo que corre el
  Scheduler cada hora): Cofersa 2026-11-16, 62 pedidos → 9 viajes, 325,8 km (OSRM), 0,9 s. En
  Aurora quedaron 10 viajes ese día (los 9 del solver + 1 ya congelado antes), 74 pedidos con
  número de viaje y salida 2026-11-15.
- Visto en ese plan: el viaje congelado y uno nuevo comparten camión (10 viajes, 9 camiones).
  El motor no sabe qué camiones ya usan los viajes liberados; la heurística tenía lo mismo.
