# 2026-10-08 — Pulido de Guías de Despacho (documento imprimible real)

## What changed

- Guía de despacho ahora es un **documento imprimible de verdad**: precarga los artículos de todas las paradas, acordeón inline en pantalla, e impreso con encabezado (folio, viaje), totales (paradas/pedidos/peso/volumen), bloque por parada (secuencia, cliente, **dirección**, artículos, firma "Recibí conforme" + observaciones) y pie "Impreso el …".
- **Dirección por parada**: nuevo campo `delivery_address` encadenado en el backend de planificación (dominio `Pedido`/`Parada` → `ORDERS_SQL`/`ORDERS_BY_IDS_SQL` → `_congelar` → `serializers`) y en el tipo `PlanStop` del front. Sincronizado a TMS-Backend.
- Nuevos: `guias/components/ArticulosTabla.tsx`, `guias/components/GuiaImprimible.tsx`, `guias/use-articulos-guia.ts`; `GuideDetailModal.tsx` reescrito (ya no usa el `ParadaModal` anidado). Totales en `guia-model.ts`.

## Why

Daily 2026-10-08: la guía de despacho es informativa y su fin es **imprimirse** para el chofer. Faltaba todo lo de un documento físico. Spec de diseño por el subagente crew **ux-architect**.

## How

- Pre-fetch en paralelo de artículos (`window.print()` solo imprime lo que está en el DOM → no se puede cargar por clic). Imprimir deshabilitado mientras carga.
- Print con aislamiento por `#guia-imprimible`, `@page { margin }`, `break-inside-avoid` por parada, contraste B/N (`print:text-black`).

## Promoted knowledge

- `delivery_address` es parte del contrato de la parada (`PlanStop`) servido por `/planes`; viene del snapshot o del join vivo (pedidos viejos caen al join).

## Follow-ups

- [ ] Verificación en vivo pendiente (reiniciar backend con el serializer nuevo + túnel) — quedó sin correr por límite de uso.
- [ ] Revisión con subagente crew **code-reviewer** pendiente.
- [ ] Concurrencia del pre-fetch si un viaje trae muchas paradas con muchos artículos (hoy `Promise.all` directo).
