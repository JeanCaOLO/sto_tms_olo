-- 20_drop_wms_trip_number.sql
-- Quita orders.wms_trip_number (agregada en sql/19). Era el número de viaje del
-- WMH legado (EFLOW NUMEROVIAJEWMH), guardado "por si acaso" como referencia.
-- No se usa: el viaje nuevo lo arma el planificador en plan_trips/plan_stops, no
-- en orders; y NO hay migración masiva del WMH a Aurora (EFLOW sigue siendo la
-- fuente; a Aurora solo llegan los pedidos operativos que el OMS ingiere). Se
-- retira para no cargar el modelo con un dato legado que nadie lee. Ver ADR-0004.
-- `guia_fiscal` (misma migración 19) se MANTIENE: es del dominio de la guía.
-- Idempotente.

ALTER TABLE orders DROP COLUMN IF EXISTS wms_trip_number;
