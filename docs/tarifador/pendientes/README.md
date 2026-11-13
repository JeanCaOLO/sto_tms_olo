# Pendientes del módulo Tarifas / data mock

> **Actualización 2026-11-12:** [reconciliación con auditoría y código integrado](02-auditoria-y-reconciliacion.md) y [plan consolidado](../../devoluciones/PLAN_CONSOLIDADO_2026-11-12.md). El selector de país ya tiene implementación local; falta verificar su publicación. El estado recibido de Devoluciones contiene evidencia posterior de m08 aplicada; no reejecutarla por la fila histórica siguiente. Las fotos/firmas del mock permanecen como idea.

| Pendiente incorporado | Estado |
|---|---|
| [02 — Auditoría, pruebas reales y reconciliación histórica](02-auditoria-y-reconciliacion.md) | Pendiente por verificar; decisiones e infraestructura separadas |
| [03 — Matriz de vigencia de ROADMAP F01–F12 y D1/D2/D4/D6](03-matriz-vigencia-2026-11-12.md) | Reconciliado estáticamente; pendientes reales separados |
| [04 — Reglas 4B en servidor](04-reglas-4b-implementadas.md) | Corrección local hecha; dos conexiones, CHECK y D4 pendientes |

| Pendiente | Estado |
|---|---|
| [01 – Fotos y firmas reales en la data mock](01-fotos-firmas-mock.md) | idea |
| El módulo Devoluciones ignora el selector de país de la barra superior (muestra todos los viajes del alcance del usuario) | pendiente por verificar |
| Aplicar `m08_photo_return.sql` en Aurora (sin ella la app no puede subir la foto de una devolución, ni con la mock) — ver `docs/devoluciones/pendientes/01-despliegue-contracamion.md` | pendiente por verificar (requiere aprobación) |
