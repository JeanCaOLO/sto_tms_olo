# 04 — Historial de modificaciones de eFlow antes de liberar

**Estado:** idea

**Qué falta:** la ingesta sobrescribe fecha, peso, volumen, líneas, dirección y prioridad con lo
que diga eFlow cada 10 min, sin guardar qué cambió ni cuándo. Solo la fecha cambiada a mano en la
bandeja tiene contador (`delivery_date_change_count`).

**Por qué:** pregunta de Eduardo (2026-11-11): "las modificaciones, ¿cómo las detecta
planificación?". Hoy el replan usa el dato nuevo, pero no hay rastro del cambio. Tras liberar ya
no aplica: la ingesta no toca pedidos liberados.

**Cómo:** en `ingest_orders._UPSERT`, comparar contra la fila vigente (p. ej. CTE con los valores
previos) y escribir una fila en `tbl_oms_logs` (acción `planif_pedido_modificado`, detail con
campo/antes/después) cuando cambien campos relevantes. Definir con negocio qué campos importan.
