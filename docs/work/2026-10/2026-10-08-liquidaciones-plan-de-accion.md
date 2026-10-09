# Plan de acción — módulo Liquidar

Restricciones vigentes: solo tablas `tarifas_*`; no tocar AWS central ni otros módulos; los despliegues los hace solo Intelix; commits locales sin push; las devoluciones del tarifador son solo informativas; sin bloqueo por pérdida ni tarifa plana de terceros.

Esfuerzo: S (menos de medio día), M (1–2 días), L (3 días o más).

## Orden
P0 (E14, requiere a Intelix) → P1 y P2 en paralelo (independientes) → P3 → re-auditoría. P1 da el mayor beneficio al usuario; P0 es el único bloqueante funcional.

## P0 — Bloqueante

### E14. Emitir liquidación falla por `settlement_date`
| Paso | Quién | Esfuerzo |
|---|---|---|
| 1. Confirmar con Intelix qué versión del manifiesto tiene desplegada `backend/tarifas` | Equipo tarifador + Intelix | S |
| 2. Desplegar `backend/tarifas` con `schema_manifest.json` actual (`settlement_date` = `date`) | Intelix | S |
| 3. Prueba opt-in que compare `backend/tarifas/src/schema_manifest.json` con `information_schema.columns` de Aurora (patrón de `aurora.seed-demo.test.ts`: `TARIFAS_AURORA_SEED=1`, `BEGIN READ ONLY`) | Equipo tarifador | S |
| 4. Añadir el paso "desplegar backend" a `docs/tarifador/RUNBOOK_OPTIMIZACION_AURORA.md` junto a cada migración | Equipo tarifador | S |

Aceptación:
- Emitir RT-DEMO-3 crea `LIQ-xxxx` en Borrador.
- Recorrer Borrador → En Revisión → Aprobado → Pagado y luego Anular.
- Repetir con un viaje de flota propia (RT-DEMO-17).
- La prueba de manifiesto falla si se cambia un tipo de columna sin actualizar el manifiesto.

## P1 — Rendimiento

La causa es el número de viajes de ida y vuelta (mínimo 0,6 s cada uno) y los duplicados, no el cálculo.

| Hallazgo | Acción | Archivos a revisar | Esfuerzo |
|---|---|---|---|
| E2 | Deduplicar `app_users`, `me/permissions`, `countries`, `me/context`, `warehouses`; lanzar la lista de viajes en paralelo con auth y permisos | `src/hooks/useAuth.tsx`, `usePermissions.tsx`, `useOperationalContext.tsx`, `src/pages/configuracion/admin/admin-api.ts` | M |
| E4, E16 | Una sola carga compartida entre hooks (caché de consulta con clave); tras marcar, anular o incluir actualizar el estado local en lugar de recargar 8 consultas | `src/pages/liquidaciones/components/LiquidarViajeModal.tsx`, `src/lib/tarifas/settlementsDataSource.ts`, `src/lib/tarifas/tripSettlement.ts` | M |
| E3, E5 | Traer reglas, tarifarios con filas, variables y estructuras en una sola llamada reutilizando el "lote de lecturas" de la fase 3; precalentar en idle los transportistas de la lista visible; caché por (país, perfil, fecha) | `backend/tarifas/src/app.py`, `tarifas_sql.py`, `src/lib/tarifas/catalogLoader.ts` | L |
| Medición | Repetir con `vite build` + `preview` y la API real | — | S |

Aceptación (con los mismos scripts de `02-entorno-y-metodologia.md`):
- Modal con catálogo en caché: 3 s o menos.
- Primera apertura por transportista: 6 s o menos.
- Lista visible: 4 s o menos.
- Peticiones duplicadas: ninguna en el arranque ni en el modal.

## P2 — Corrección de comportamiento

| Hallazgo | Acción | Dónde | Esfuerzo |
|---|---|---|---|
| E1 | Distinguir "cargando" de "sin acceso" | `src/pages/liquidaciones/page.tsx` | S |
| E6, E8 | Formateador central por país (moneda real y miles) usado en cabecera, modal, historial y estructura de costos; sin tocar el catálogo de países | capa de presentación o `tarifas_country_settings` | M |
| E7 | Alinear el mensaje de identificación fiscal con el comportamiento real, o aplicar la regla (decisión de negocio) | `src/pages/companias/` | S |
| E11 | Revisar qué campo filtra la búsqueda e incluir la placa | `src/pages/liquidaciones/page.tsx` | S |
| E12 | Aplicar Desde/Hasta a Viajes por liquidar, o ocultarlos en esa pestaña | `src/pages/liquidaciones/page.tsx` | S |
| E15 | Limpiar el error de emisión al ejecutar otra acción exitosa | `LiquidarViajeModal.tsx` | S |
| E17 | Definir con negocio las transiciones de estado; bloquear o pedir motivo al sacar una liquidación de Anulado | selector de estado en `src/pages/liquidaciones/` | M |

Aceptación: cada hallazgo se verifica en el navegador con el mismo recorrido de la auditoría.

## P3 — Pulido

| Hallazgo | Acción | Esfuerzo |
|---|---|---|
| E13 | Aviso de éxito al exportar y tipo MIME de `.xlsx` | S |
| E9 | Indicador de carga en la tabla de la estructura de costos | S |
| E10 | Marca visual de "ya tuvo una liquidación anulada" | S |
| E18 | Ocultar el panel "¿Por qué este total?" cuando hay aviso "sin lógica" | S |

## Datos y calidad

- Venezuela: pedir transportistas, zonas y viajes (y revisar el código `VN`) a quien corresponda para poder probar liquidaciones de ese país.
- Aviso "sin lógica" con datos reales: crearlo en una base de pruebas con un transportista sin reglas ni tarifario. En Aurora no se desactivó la estructura de Costa Rica porque es la real.
- Prueba E2E con Playwright (`e2e/`) del flujo lista → modal → emitir → cambiar estado → anular, con aserciones de tiempo.
- Errores previos fuera del módulo: tipos en `src/pages/planificacion/*` y el warning de `LiquidarViajeModal.tsx:148`.
- El commit `536cbd7` y el informe de `docs/work/2026-10/` siguen sin push.
- Repetir la auditoría tras cada fase y comparar con `mediciones.json`.

## Criterio de cierre
La auditoría se repite completa y: se puede emitir y recorrer todos los estados; el modal cumple los umbrales de P1; ningún hallazgo de severidad Crítico, A o M queda abierto.
