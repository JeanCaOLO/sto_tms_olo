-- PROPUESTA (no aplicada): índices para la búsqueda universal de viajes en Liquidaciones.
--
-- El buscador consulta `tarifas_v_viaje_pedidos` con `ILIKE '%texto%'` sobre guía, código de pedido
-- y casa comercial. Un `%texto%` no usa un índice btree: sin pg_trgm cada búsqueda recorre las
-- tablas base. Las tablas son de OTROS módulos (despacho / pedidos / clientes), por eso este
-- archivo solo lo PROPONE: lo aplica quien sea dueño de esas tablas, y solo si la búsqueda se nota lenta.
--
-- Nota: el backend usa ILIKE (no distingue mayúsculas pero SÍ tildes); el almacén en memoria
-- ignora también las tildes. Es una diferencia conocida y aceptada para códigos y nombres.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Sin CONCURRENTLY: `run-migration.mjs` ejecuta cada archivo dentro de una transacción y Postgres no
-- permite CREATE INDEX CONCURRENTLY ahí. El costo: mientras se construye cada índice se bloquean las
-- ESCRITURAS de esa tabla (las lecturas siguen). Con pocas filas son milisegundos; con tablas grandes,
-- aplicarlo en una ventana tranquila o correr los tres CREATE a mano con CONCURRENTLY fuera de transacción.
CREATE INDEX IF NOT EXISTS dispatch_guides_guide_number_trgm
  ON dispatch_guides USING gin (guide_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS orders_order_number_trgm
  ON orders USING gin (order_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS customers_name_trgm
  ON customers USING gin (name gin_trgm_ops);

-- Reversa:
--   DROP INDEX IF EXISTS dispatch_guides_guide_number_trgm;
--   DROP INDEX IF EXISTS orders_order_number_trgm;
--   DROP INDEX IF EXISTS customers_name_trgm;
