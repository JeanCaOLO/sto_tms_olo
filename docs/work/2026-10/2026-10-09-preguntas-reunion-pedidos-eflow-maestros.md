# Preguntas para la reunión: pedidos de EFLOW en `orders` y tablas maestras

> **Fecha:** 2026-10-09 · **Contexto:** el OMS va a leer los pedidos de `EFLOW_OLO.dbo.EXPEDICIONESCABECERA`
> y guardarlos en `public.orders` (Aurora `tms_olo`). El mapeo campo por campo está en
> [`docs/reference/mapeo-pedidos-eflow-orders.md`](../../reference/mapeo-pedidos-eflow-orders.md).
> Los datos citados se leyeron de Aurora el 2026-10-09.

## Ya decidido (no hace falta reabrirlo)

- `orders` es la tabla de pedidos; se le agregan campos, no se crea otra tabla.
- `orders.priority` pasa a número entero (menor número = más urgente).
- "Fecha Alisto" ya no existe: se quitó de la Cola, del detalle y del Simulador. El OMS decide con la fecha de
  entrega (`FECHAEXPEDICIONPLANIFICADA`) y no la modifica.

---

## 1. Tablas maestras para los ID de EFLOW

En EFLOW, los cuatro ID del pedido son llaves foráneas con su propia tabla: `ALMACENCOMPANIA`, `CLIENTES`
(por compañía) y `SUCURSAL` (por compañía). Si en `orders` solo guardamos el código (`0029`, `0001`…), no
sabemos qué significa sin ir a EFLOW. Esto es lo que hay hoy en Aurora:

| ID de EFLOW | Tabla en Aurora | Estado hoy |
|---|---|---|
| Compañía (`IDCOMPANIA`) | `customers` (EPA, Cofersa) | Existe, pero no guarda el código EFLOW (`code` = `EPA` / `COFERSA`) |
| Almacén (`IDALMACEN`) | `warehouses` (`OLO-CR`, `OLO-VN`) | Existe, pero no guarda el código EFLOW; solo hay uno por país |
| Sucursal (`IDSUCURSAL`) | — | No existe |
| Cliente (`IDCLIENTE`) | `final_customers` | **Ya existe y ya tiene los clientes de EFLOW** (1.583, `external_code` = `IDCLIENTE`, único por compañía) |

**Preguntas:**

1. ¿Confirmamos que en Aurora debe haber una tabla maestra por cada ID (compañía, almacén, sucursal, cliente),
   en lugar de guardar solo códigos sueltos en `orders`?
2. ¿Usamos las tablas que ya existen (`customers` para compañía, `warehouses` para almacén, `final_customers`
   para cliente) agregándoles el código EFLOW, y creamos solo la de sucursales?
3. ¿`0029` = EPA y `0109` = Cofersa? ¿Hay otras compañías en EFLOW CR (por ejemplo, la comercializadora) que
   debamos cargar desde ya?
4. ¿Cuántos almacenes hay en EFLOW por país? ¿Cada uno corresponde a un `warehouse` nuestro, o `OLO-CR`
   agrupa varios?
5. ¿Qué es una sucursal en el negocio (`0001`, `0002`)? ¿Hay que mostrarla con nombre en la Cola?
6. ¿Cómo se mantienen al día los maestros? ¿Se copian de EFLOW cada cierto tiempo, o cuando llega un pedido
   con un cliente que todavía no existe en Aurora? ¿Quién es el dueño de cada maestro?
7. Se decidió que el nombre de la compañía se resuelve con un maestro en Capa X. ¿Dónde vive ese maestro
   hoy y lo usamos para compañía, o lo hacemos en `customers`?

## 2. `store_id` y los clientes del WMS

Vimos que los códigos de `stores` (`T002`…`T008`) son clientes de la tabla `CLIENTES` de EFLOW. Pero los
clientes de EFLOW **ya están todos en `final_customers`**, y las 6 tiendas EPA también están en
`delivery_points` (lo hizo `sql/13`). Hoy `orders.store_id` significa dos cosas: para Cofersa es la bodega de
origen (`CD-CR`) y para EPA la tienda de destino.

**Preguntas:**

8. ¿Confirmamos que los clientes del WMS van en `final_customers` (con sus direcciones en `delivery_points`) y
   que `stores` **no** se usa para los clientes de cada compañía?
9. Si es así, ¿`stores` queda solo para las bodegas de origen (`CD-CR`) y `orders.store_id` siempre es el
   origen? ¿Corregimos los pedidos EPA que hoy tienen la tienda destino en `store_id`?
10. ¿Qué hacemos con las 6 tiendas EPA que están en `stores`: se desactivan, se borran o se dejan?
11. Un cliente de EFLOW puede tener varias direcciones (cada pedido trae `DIRECCIONPEDIDO`). ¿Creamos un punto
    de entrega por dirección distinta, o usamos siempre la dirección del pedido?

## 3. La llave del pedido y los datos que ya están en `orders`

12. `IDEXPEDICION` se repite entre sucursales (la expedición `P0002002260922` está en la `0001` y en la `0002`).
    ¿Estamos de acuerdo en que la llave del pedido sea almacén + compañía + sucursal + expedición, igual que en
    EFLOW?
13. Los 36 pedidos reales de EFLOW cargados en `orders` tienen `order_number` con sufijo `-M`, `-O` o `-P`.
    ¿Qué significan, y quién los cargó? El script no está en el repo.
14. En `orders` hay 1.172 pedidos de prueba (`SEED…`, `DEMO-…`). ¿Se borran antes de cargar pedidos reales,
    o se marcan como prueba?
15. Si un pedido cambia en EFLOW después de cargarlo (fecha, dirección, cancelación, cierre), ¿lo actualizamos
    en `orders`? ¿Cada cuánto se vuelve a leer?

## 4. Campos

16. ¿`COSTO_TOTAL` es el monto del pedido o un costo interno?
17. "Fecha creación": ¿mostramos `FECHAEXPEDICION` o `FECHACREACION`?
18. ¿Importa la **hora** de `FECHAEXPEDICIONPLANIFICADA`? Hoy `orders.delivery_date` es solo fecha, y la regla
    T-1 usa horas de corte.
19. Cofersa no manda fecha de entrega y EFLOW la llena con un valor por defecto. ¿Cuál es ese valor y cómo lo
    reconocemos?
20. ¿Cuáles son los códigos posibles de estado (`TPEXES`) y situación (`TPEXSI`)? ¿"Generada" es `GENE`?
21. ¿El OMS sobrescribe `PRIORIDAD` en EFLOW con la que calcula? ¿Y `NOMBREPRIORIDAD`?
22. ¿Usaremos `BAJADA`, `EMERGENCIA`, `FECHAPLANIFICADADESPACHO` o `IDALMACENDESTINO`?

## 5. Acceso y dónde se aplica

23. Para escribir de vuelta en EFLOW (situación y prioridad) hace falta permiso de escritura en producción;
    la réplica sería solo de lectura. ¿Quién lo da y con qué usuario?
24. ¿En qué va la réplica de `EFLOW_OLO` (CR)? Se pidió a Alfredo.
25. ¿Venezuela tiene las mismas tablas y la misma estructura en su EFLOW?
26. Se decidió que la base final es `logistica_olo` con esquemas `OMS` y `TMS`, pero `orders` está hoy en
    `tms_olo.public`. ¿Hacemos los cambios en `tms_olo` ahora y migramos después, o esperamos a `logistica_olo`?
27. ¿Quién aplica las migraciones en Aurora (usuario `olo_db`) y con qué revisión previa?
