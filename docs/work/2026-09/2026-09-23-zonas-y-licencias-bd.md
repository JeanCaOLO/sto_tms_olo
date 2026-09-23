# 2026-09-23 — Catálogo de Zonas y licencias por país (base de datos)

## What changed
Migración `sql/09_zonas_y_licencias.sql` aplicada en Aurora: `route_types` se renombró a `zones` y ganó `country_id` (obligatorio; las 17 existentes quedaron en Costa Rica) y `code` (prefijo numérico del nombre = código de ruta del WMS, único por país). Se dejó una vista `route_types` de compatibilidad. En `driver_license_types`, el código pasó de único global a único por país, y el país es obligatorio.

## Why
Pedido del usuario: el catálogo de rutas pasa a ser un Catálogo de Zonas ligado a país ("tipos de ruta" = zonas), se elimina la sección Rutas de la UI y se agrega un CRUD de licencias de conducir.

## How
- Renombre y no tabla nueva: `orders.route_type_id` y `routes.route_type_id` siguen apuntando a las mismas filas; las FK se mueven con el renombre. La vista `route_types` mantiene funcionando Tarifas, Liquidaciones, Tracking y el Express legado.
- `zones` agregada a la lista blanca de la API genérica (`backend/data/src/relations.py` y `server/tms-relations.mjs`), con embeds hacia `countries`, `orders` y `routes`.
- `scripts/generar-viajes-automatico.mjs` busca la zona por `code` (antes, por prefijo del nombre); `scripts/copy-eflow-snapshot.mjs` inserta en `zones` con país y código.
- Supera al diseño de `zones` de `sql/01_fase1_zonas_reglas.sql`, que nunca se aplicó.
- La tabla `routes` (los viajes) no se tocó.

## Promoted knowledge
- Contrato para el frontend en `.agents/CANAL.md` (mensaje "Catálogo de Zonas y licencias").

## Follow-ups
- [ ] Frontend (Kiro): Catálogo de Zonas, quitar la sección Rutas, CRUD de licencias y estilos del botón "Importar CSV" en Transportistas.
- [ ] Retirar la vista `route_types` con `sql/11_retirar_vista_route_types.sql` **después de integrar a `main`**: esta rama ya no la usa (Kiro migró Tracking y Liquidaciones), pero `main` y las ramas de los compañeros sí, y la base Aurora es compartida.
- [x] Categorías oficiales de Costa Rica cargadas con `sql/10_licencias_costa_rica.sql` (A1–A3, B1–B4, C1–C2); borrados B, A4 y A5, que no existen en CR y no tenían referencias. Las categorías D y E (maquinaria) se agregan desde el CRUD si hacen falta.
