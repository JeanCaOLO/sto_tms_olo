# Hallazgos de la auditoría (mock frente a backend)

Auditoría del 2026-10-10 hecha **sin Aurora**: lectura trazada de `backend/tarifas/src/*` y `sql/*`, repetición de cargas reales contra los módulos Python del backend (sin base de datos) y recorridos de navegador sobre el mock. El detalle por fase (pasos, `archivo:línea`, capturas) estuvo en `.test/auditoria/` (carpeta de trabajo ignorada por git); lo que importa de ahí está resumido aquí y en `herramientas/`.

## Resumen

| ID | Hallazgo | Veredicto | Estado | Solo con backend |
|---|---|---|---|---|
| H1 | El formulario de reglas enviaba `updated_at`; `tarifas_pricing_rules` no tiene esa columna. El backend responde 400 («Columna desconocida») al crear y al editar; el mock lo aceptaba. Es el ejemplo 2 del usuario. | BUG | **Corregido** (P1a): se quitó el campo. Alternativa P1b (columna en Aurora) queda propuesta. | Sí |
| H9 | El primer componente de costo de una compañía sin estructura propia fallaba: dentro de una transacción el driver HTTP devuelve lo enviado (sin el id que genera el servidor), `structure.id` quedaba `undefined` y el `POST` iba sin `structure_id` (23502). En el mock funcionaba. La segunda vez funcionaba porque la estructura ya existía. | BUG | **Corregido** (P10a): el id se genera en el cliente. | Sí |
| B2 | Con un rol que solo configura (`tarifas.config`), guardar una regla funciona pero la bitácora devuelve 403 (exige el módulo `tarifas`) y el error se tragaba: el cambio quedaba sin rastro. En companias, desactivar parecía fallar aunque se guardaba. | BUG | **Corregido** (P16b): `registrarEventoSeguro` avisa con un toast. P16a (backend) queda propuesta. | Sí |
| H2 | El mock no validaba columnas, NOT NULL ni tipos. Causa de fondo de H1 y H9. | Divergencia | **Corregido**: el mock usa el cliente HTTP real y un backend simulado que replica el contrato. | — |
| H3 | La semilla demo usaba ids no uuid en columnas uuid. | Divergencia | **Corregido** (P4). | Sí |
| H7 | El mock siempre era administrador: no se veían botones deshabilitados ni 403. | Divergencia | **Corregido** (P5): selector «Rol de prueba». | Sí |
| H8 | El backend tiene topes (5.000 filas por consulta, 25 consultas por `/batch`, `q` largo por `POST /find`). | Divergencia | El backend simulado los replica. Falta probar con datos reales (checklist). | Sí |
| E1 | Ejemplo 1: «al liquidar, el viaje se queda en Por liquidar». El flujo normal funciona igual en mock y backend (11 casos probados). Lo que deja un viaje atascado es el bloqueo del motor, p. ej. viaje sin zona de destino (`routes.route_type_id` nulo). La política de margen **no** bloquea. | Explicado | Semilla con viajes sin zona en CR, VE y CO. Pendiente: confirmar con datos reales qué bloqueos aparecen. | Parcial |
| B1 | La bitácora del mock decía «usuario sin sesión». | Fidelidad | **Corregido** (P14). | No |
| P6-1 | (Retirado) El Probador lista escenarios de todos los países a propósito: elegir uno cambia el país. | No es bug | — | No |
| P6-2 | El selector de país del Probador no sigue el del encabezado (arranca en Colombia). | UX | **Abierto**: P17a (país inicial = el global), P17b (quitar el selector propio), P17c (rotularlo). | No |
| R1 | La tabla de reglas arranca filtrada por «Activa»: una regla recién desactivada desaparece de la lista. | UX | Se deja igual por decisión del usuario. | No |
| R2 | Se pueden crear dos reglas activas con el mismo código sin aviso (no hay índice único por código; las versiones comparten código). | A confirmar con negocio | Abierto. | No |
| C1 | Una compañía externa puede guardar una estructura de costos propia que no se usa para liquidarla (a un tercero se le paga por tarifa). | A confirmar con negocio | Abierto. | No |
| M-UX1 | Botones «Actualizar»/«Guardar» parecidos en Alerta Margen; los umbrales no avisaban al guardar. | UX | **Corregido** (P9). | No |
| C2 | Guardar parámetros de la estructura de costos no avisaba. | UX | **Corregido** (P8). | No |
| T3 | Crear tarifario de compañía hace dos escrituras sueltas (perfil + tarifario); si falla la segunda queda un perfil «Configurado» sin nada. | Riesgo bajo | P7 evaluada y no aplicada (rompería la idempotencia de `ensurePartyProfile`). | Sí |
| L-lint | `npm run lint` falla en `HEAD`: `liquidaciones/page.tsx` tiene 204 líneas contra un máximo de 200 y varios tests usan `process` sin declararlo. | Previo | No se tocó. | No |

## Cómo se confirmó cada bug

- **H1:** ejecutando `tarifas_sql.build_update` y `build_insert` reales con el payload capturado: `HttpError 400 Columna desconocida "updated_at" en "tarifas_pricing_rules"`. Con el mock nuevo y el código viejo, el modal muestra el mismo error. Ver `herramientas/replay_payloads.py`.
- **H9:** prueba con el `HttpDataSource` real y un `fetch` simulado (`herramientas/h9-http-tx-id.test.ts`): `structure.id` es `undefined` y el `POST` sale sin `structure_id`. Con el mock nuevo y el código viejo el navegador muestra «null value in column "structure_id" of relation "tarifas_cost_structure_rows" violates not-null constraint».
- **B2:** con el rol «Solo configurar» del mock: la regla se guarda y el backend simulado devuelve 403 al insertar la bitácora.

## Lo que el mock todavía no replica

Filtro por países del rol, orden con la colación de la base (`ORDER BY` con el idioma de Aurora; el flag `locale` del ORM se ignora en el backend), restricciones CHECK, la forma exacta de `numeric` con escala fija (el simulado devuelve el texto del número guardado), latencia y arranque en frío de la Lambda, concurrencia real entre usuarios. Todo eso está en la checklist.
