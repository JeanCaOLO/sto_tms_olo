# Hallazgos de la auditoría (mock frente a backend)

Auditoría del 2026-10-10 hecha **sin Aurora**: lectura trazada de `backend/tarifas/src/*` y `sql/*`, repetición de cargas reales contra los módulos Python del backend (sin base de datos) y recorridos de navegador sobre el mock. El detalle por fase (pasos, `archivo:línea`, capturas) estuvo en `.test/auditoria/` (carpeta de trabajo ignorada por git); lo que importa de ahí está resumido aquí y en `herramientas/`.

## Resumen

| ID | Hallazgo | Veredicto | Estado | Solo con backend |
|---|---|---|---|---|
| H1 | El formulario de reglas enviaba `updated_at`; `tarifas_pricing_rules` no tiene esa columna. El backend responde 400 («Columna desconocida») al crear y al editar; el mock lo aceptaba. Es el ejemplo 2 del usuario. | BUG | **Corregido** (P1a): se quitó el campo. Alternativa P1b (columna en Aurora) queda propuesta. | Sí |
| H9 | El primer componente de costo de una compañía sin estructura propia fallaba: dentro de una transacción el driver HTTP devuelve lo enviado (sin el id que genera el servidor), `structure.id` quedaba `undefined` y el `POST` iba sin `structure_id` (23502). En el mock funcionaba. La segunda vez funcionaba porque la estructura ya existía. | BUG | **Corregido** (P10a): el id se genera en el cliente. | Sí |
| B2 | Si un rol puede configurar pero no escribir la bitácora (módulo `tarifas`), guardar una regla funciona y la bitácora devuelve 403; el error se tragaba. Con los roles reales (Liquidador: `tarifas` completo y `tarifas.config` de lectura; Desarrollador/administrador: todo) **no ocurre**: un rol «solo configura» no existe en la práctica. | Teórico | Se dejó el aviso en pantalla (P16b, `registrarEventoSeguro`) por si la bitácora falla por cualquier causa. **Sin cambios de backend** (P16a descartada). | Sí |
| H2 | El mock no validaba columnas, NOT NULL ni tipos. Causa de fondo de H1 y H9. | Divergencia | **Corregido**: el mock usa el cliente HTTP real y un backend simulado que replica el contrato. | — |
| H3 | La semilla demo usaba ids no uuid en columnas uuid. | Divergencia | **Corregido** (P4). | Sí |
| H7 | El mock siempre era administrador: no se veían botones deshabilitados ni 403. | Divergencia | **Corregido**: el backend simulado sigue a «Ver como» (Liquidador/Desarrollador). | Sí |
| H8 | El backend tiene topes (5.000 filas por consulta, 25 consultas por `/batch`, `q` largo por `POST /find`). | Divergencia | El backend simulado los replica. Falta probar con datos reales (checklist). | Sí |
| E1 | Ejemplo 1: «al liquidar, el viaje se queda en Por liquidar». El flujo normal funciona igual en mock y backend (11 casos probados). Lo que deja un viaje atascado es el bloqueo del motor, p. ej. viaje sin zona de destino (`routes.route_type_id` nulo). La política de margen **no** bloquea. | Explicado | Semilla con viajes sin zona en CR, VE y CO. Pendiente: confirmar con datos reales qué bloqueos aparecen. | Parcial |
| B1 | La bitácora del mock decía «usuario sin sesión». | Fidelidad | **Corregido** (P14). | No |
| P6-1 | (Retirado) El Probador lista escenarios de todos los países a propósito: elegir uno cambia el país. | No es bug | — | No |
| P6-2 | El selector de país del Probador no seguía el del encabezado (arrancaba en Colombia). | UX | **Corregido** (P17a): arranca en el país del selector global y conserva su selector propio. | No |
| R1 | La tabla de reglas arranca filtrada por «Activa»: una regla recién desactivada desaparece de la lista. | UX | Se deja igual por decisión del usuario. | No |
| R2 | Se podían crear dos reglas activas con el mismo código y alcance sin aviso (no hay índice único por código; las versiones comparten código). | UX | **Aviso sin bloqueo** (`ruleOverlap.ts`): si otra regla activa tiene el mismo código, país y compañía y su vigencia se pisa, el guardado pide confirmación. Las versiones consecutivas (R_DIESEL v1/v2) no avisan. | No |
| C1 | Una compañía externa puede guardar una estructura de costos propia que no se usa para liquidarla (a un tercero se le paga por tarifa). | A confirmar con negocio | **Sin cambios y sin aviso**, por decisión del usuario; confirmar con datos reales cuando haya conexión. | No |
| M-UX1 | Botones «Actualizar»/«Guardar» parecidos en Alerta Margen; los umbrales no avisaban al guardar. | UX | **Corregido** (P9). | No |
| C2 | Guardar parámetros de la estructura de costos no avisaba. | UX | **Corregido** (P8). | No |
| T3 | Crear tarifario de compañía hace dos escrituras sueltas (perfil + tarifario); si falla la segunda queda un perfil «Configurado» sin nada. | Riesgo bajo | P7 evaluada y no aplicada (rompería la idempotencia de `ensurePartyProfile`). | Sí |
| O1 | Las marcas de pedido («Anular», «Liquidar después») solo se pueden poner en la **Vista extendida** y se **guardan al instante**: cancelar el modal no las deshace; no cambian el total (por diseño). | Comportamiento | **Aviso agregado** en el panel: «Las marcas se guardan al momento: siguen ahí aunque cierres sin emitir». Sin cambio de lógica. | Sí (comprobar en Aurora que la marca queda) |
| L-lint | `npm run lint` falla en `HEAD`: varios tests usan `process` sin declararlo (y `liquidaciones/page.tsx` tenía 204 líneas contra un máximo de 200). | Previo | Lo de `page.tsx` quedó resuelto al extraer `TripsTable` (197 líneas); lo de `process` no se tocó. | No |

## Cubierto en navegador después del primer informe

Marcas de pedido (anular y liquidar después, emitir con marcas: el Historial muestra «10 en el reparto, 1 para después, 1 anulados»), devoluciones (informativas, no cambian el pago), importar un CSV de tarifario (Beval, formato español, modo «Actualizar»: cinco `update` por `/tx` más la bitácora, todos válidos contra el backend). «Descargar PDF» no produce errores de consola; el contenido de la impresión no se pudo verificar en un navegador sin interfaz.

## Cómo se confirmó cada bug

- **H1:** ejecutando `tarifas_sql.build_update` y `build_insert` reales con el payload capturado: `HttpError 400 Columna desconocida "updated_at" en "tarifas_pricing_rules"`. Con el mock nuevo y el código viejo, el modal muestra el mismo error. Ver `herramientas/replay_payloads.py`.
- **H9:** prueba con el `HttpDataSource` real y un `fetch` simulado (`herramientas/h9-http-tx-id.test.ts`): `structure.id` es `undefined` y el `POST` sale sin `structure_id`. Con el mock nuevo y el código viejo el navegador muestra «null value in column "structure_id" of relation "tarifas_cost_structure_rows" violates not-null constraint».
- **B2:** con un 403 simulado de la bitácora (prueba `auditLog.test.ts`): la operación no se tumba, `registrarEventoSeguro` devuelve false y avisa con un toast.

## Lo que el mock todavía no replica

Filtro por países del rol, orden con la colación de la base (`ORDER BY` con el idioma de Aurora; el flag `locale` del ORM se ignora en el backend), restricciones CHECK, la forma exacta de `numeric` con escala fija (el simulado devuelve el texto del número guardado), latencia y arranque en frío de la Lambda, concurrencia real entre usuarios. Todo eso está en la checklist.
