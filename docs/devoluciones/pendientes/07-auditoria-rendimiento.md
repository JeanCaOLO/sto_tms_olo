# 07 — Rendimiento y volumen después de la integración

**Estado:** pendiente por verificar. Corte: 2026-11-12.

## Qué falta

- AUD-07 está corregido: páginas de 100 viajes, cursor estable, botón Cargar más y conservación de filtros. Falta ejecutar el SQL integrado en PostgreSQL nativo, con volumen y planes de consulta. Las pruebas SQLite no certifican el optimizador de Aurora.
- AUD-08 sigue pendiente: medir bytes, filas y latencia del detalle de un viaje con muchas devoluciones, formularios y fotos. Después decidir paginación de detalle o carga diferida; no reducir campos sin identificar consumidores.
- Contrastar el filtro operativo de país con los países autorizados del rol. Ambos se aplican en resumen y páginas; seleccionar país no amplía permisos.
- Medir firma/consulta de medios y consultas por apertura de viaje/formulario. No usar una URL firmada vencida como prueba de un fallo de autorización.

## Por qué

Reducir la primera página de 500 a 100 filas puede disminuir hasta un 80 % las filas iniciales, cuando existen al menos 500. No prueba menor costo SQL: la vista puede seguir agregando u ordenando muchas filas. Cargar todo genera más llamadas que la antigua lista truncada.

## Cómo verificar

1. Ejecutar `TRIPS_SQL` y sus parámetros en PostgreSQL aislado, incluyendo claves repetidas/nulas, `pais`, cursor y scope del rol juntos. Comparar páginas contra el conjunto completo ordenado.
2. Con túnel autorizado y transacción de solo lectura, medir tiempos, bytes y `EXPLAIN` de consultas representativas. No ejecutar DDL, crear índices ni usar `EXPLAIN ANALYZE` sobre escrituras.
3. Medir primera página, todas las páginas y detalle con volumen; registrar p50/p95, número de llamadas y tamaño transferido. Separar Vite/túnel de producción.
4. Corregir dentro de `backend/admin/src/admin_returns*`, cliente y hook de Devoluciones solo después de una regresión reproducible. Índices/configuración quedan para el responsable autorizado.

## Ya conservado

AUD-02 protege formularios frente a respuestas antiguas. AUD-03 limita cantidades al rango entero de PostgreSQL, pero **no** valida el acumulado contra el pedido. La integración combina paginación, país y bandeja de solicitudes autenticada. No reabrir estos arreglos como funciones ausentes.
