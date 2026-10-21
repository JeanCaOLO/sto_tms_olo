# Checklist para probar el tarifador con Aurora

Orden por prioridad. En cada paso: qué hacer, qué debe pasar y, si no pasa, dónde mirar. Las consultas SQL son **solo lectura**. No borrar ni modificar datos reales sin pedirlo.

## 0. Preparación

1. Túnel a Aurora (solo L–V 04:45–17:00 hora de Costa Rica): `powershell -ExecutionPolicy Bypass -File scripts/tunel-aurora.ps1` (ver `docs/guides/tunel-ssm-a-rds.md`).
2. `.env.local` con `TMS_DB_*` y `JWT_SECRET`; **quitar o poner en `false` `VITE_MOCK_AUTH`** para que el login y los datos sean reales.
3. `npm run api:local:base` (Lambdas en `:4000`) y `npm run dev`. Iniciar sesión con un usuario real del TMS.
4. Comprobar que el backend local tiene el esquema y el manifiesto de este repo: `npm run tarifas:manifest` no debe dejar cambios en `backend/tarifas/src/schema_manifest.json`. Si el backend desplegado es más viejo, varios pasos fallarán por eso.
5. Abrir las herramientas de desarrollo del navegador (pestaña Red) para ver las llamadas a `/api/tarifas/…`.

## 1. Reglas: crear, editar y desactivar (H1) — prioridad alta

1. Reglas → «Nueva Regla»: código `R_VERIF_BACKEND`, nombre y un importe. Crear.
   - **Esperado:** la regla aparece en la lista. En Red, el `POST /api/tarifas/tarifas_pricing_rules` responde 200 y su cuerpo **no** lleva `updated_at`.
   - **Si responde 400 «Columna desconocida»:** el frontend en uso no tiene el arreglo P1a (`ruleSubmit.ts`). Si pide otra columna, el manifiesto desplegado difiere del del repo.
2. Editar esa regla, quitar la casilla «Regla activa» y «Guardar cambios».
   - **Esperado:** el modal se cierra; la regla **desaparece de la lista** (filtro «Activa» por defecto); al quitar el filtro «Estado» aparece como «Inactiva», con la versión subida.
   - SQL: `select code, active, version from tarifas_pricing_rules where code = 'R_VERIF_BACKEND';` → `active = false`, `version = 2`.
3. Reactivarla y eliminarla desde la interfaz (confirmar el diálogo). SQL: la fila ya no existe.

## 2. Estructura de costos: primer componente (H9) — prioridad alta

1. Tarifas → Costos de flota → pestaña Flota Externa → elegir una compañía **sin estructura propia** (SQL para encontrarla: `select p.id, c.name from tarifas_settlement_parties p join carriers c on c.id = p.carrier_id where not exists (select 1 from tarifas_cost_structures s where s.party_id = p.id);`; si no hay, usar una compañía sin perfil: se creará).
2. Abrir «Estructura de costos de esta compañía» y agregar un componente (nombre y costo) sin guardar nada antes.
   - **Esperado:** el componente aparece. En Red, el `POST /tarifas/tx` con el `insert` de `tarifas_cost_structures` ya trae un `id` `cstr_…` y el `POST` del componente trae `structure_id`.
   - **Si falla con «null value in column "structure_id"»:** el frontend no tiene P10a (`costStructure/mutations.ts`).
   - SQL: `select s.id, count(r.id) from tarifas_cost_structures s left join tarifas_cost_structure_rows r on r.structure_id = s.id where s.party_id = '<party>' group by s.id;` → una estructura con una fila.

## 3. Liquidar un viaje normal (ejemplo 1)

1. Liquidaciones → «Por liquidar» → «Listos»: abrir un viaje con transportista y zona, revisar el cálculo, «Emitir liquidación».
   - **Esperado:** pasa a la pestaña «Historial» con la fila resaltada y el aviso «Liquidación LIQ-… emitida»; el contador «Listos» baja en uno; el viaje ya no está en «Por liquidar».
   - SQL: `select number, status, trip_id, total_amount from tarifas_settlements order by created_at desc limit 3;` y `select id, settlement_id from tarifas_v_viajes where id = '<trip_id>';` (`settlement_id` debe ser el id de la liquidación).
   - **Si el viaje sigue en «Por liquidar»:** mirar si la emisión devolvió un aviso (Red: 409 de `tarifas_settlements_trip_vigente_uq` o de numeración) y si `tarifas_v_viajes.settlement_id` quedó vacío.
2. Cambiar el estado en el Historial: `Borrador → En Revisión → Aprobado → Pagado`; intentar `Pagado → Borrador` (debe rechazarse con «No se puede pasar de…»).

## 4. Viajes que el motor bloquea (el «se queda bloqueado») — prioridad alta

1. Buscar viajes completados sin zona de destino: `select count(*) from routes where route_type_id is null and lower(status) in ('completada','completado','completed');`.
2. Si hay: en «Por liquidar» aparecen en «Listos». «Liquidar» debe mostrar el aviso rojo «No se puede emitir: El viaje no tiene zona de destino… Asígnale el tipo de ruta (zona) en guía de despacho» con «Emitir liquidación» deshabilitado.
3. Anotar qué otros avisos de bloqueo salen con datos reales (zona de otro país, total negativo, regla que depende de otra, falta de base) y cuántos viajes afectan: eso dice cuánto trabajo de datos falta antes de poder liquidar todo.

## 4b. Marcas de pedido y devoluciones (O1)

1. «Liquidar viaje» → **Vista extendida** → sección «Pedidos del viaje»: anular un pedido (con motivo) y dejar otro en «Liquidar después».
   - **Esperado:** cada marca es un `POST /tarifas/tx` (insert o update de `tarifas_trip_order_marks`); el total a pagar no cambia. Cancelar el modal sin emitir deja las marcas guardadas. SQL: `select order_id, mark, reason, actor from tarifas_trip_order_marks where trip_id = '<trip_id>';`
   - Emitir: el Historial debe mostrar «N en el reparto», «1 para después», «1 anulados».
2. Un viaje con devoluciones (`select count(*) from returns`): el modal muestra «Devoluciones · N», informativas.

## 5. Re-liquidar y anular

1. En el Historial, «Re-liquidar el viaje» sobre una liquidación en `Borrador`, escribir el motivo y confirmar.
   - **Esperado:** la anterior queda `Anulado` con `superseded_by`; la nueva queda vigente; ambas se ven en el Historial.
   - SQL: `select number, status, superseded_by from tarifas_settlements where trip_id = '<trip_id>' order by created_at;`
2. Anular la vigente: el viaje vuelve a «Por liquidar» y se puede emitir de nuevo (el índice único parcial solo cubre las no anuladas).

## 6. Roles y bitácora (B2, H7)

1. Con un usuario Liquidador (módulo `tarifas` completo y `tarifas.config` solo de lectura): la configuración debe verse en solo lectura (sin «Nueva Regla» ni acciones de edición); emitir una liquidación funciona y deja su fila en `tarifas_audit_log`. Si intenta escribir configuración por la API, 403.
2. Con un usuario Desarrollador/administrador: guardar una regla deja su fila en la bitácora. SQL: `select entity, entity_id, action, user_name, created_at from tarifas_audit_log order by created_at desc limit 5;`
3. Si alguna vez falla la bitácora (cualquier causa), debe aparecer el aviso amarillo «El cambio se guardó, pero no quedó registrado en la bitácora…» y el cambio debe quedar guardado.
4. Con un usuario con país restringido: las listas solo muestran su país.
5. Probador: con «Operando en Venezuela» arriba, debe arrancar en Venezuela (P17a).

## 7. Tarifarios

1. Crear un tarifario de compañía; agregar, editar y quitar filas; importar con «Importar planilla» (mapear columnas, formato de números, modo Actualizar o Reemplazar todo) un CSV (`docs/tarifador/demo-data/tarifario-beval-zona.csv`) y un XLSX con 300 filas o más.
   - **Esperado:** el `POST /tarifas/tx` de la importación responde antes del timeout; las filas quedan con `row_order` consecutivo. SQL: `select count(*), min(row_order), max(row_order) from tarifas_rate_table_rows where table_id = '<id>';`
2. Si falla la creación del tarifario justo después de crear el perfil (T3), queda una compañía «Configurada» sin tarifarios; reintentar debe reutilizarla.

## 8. Formatos y rendimiento

1. Montos: comparar un total en el Historial con `tarifas_settlements.total_amount` (texto con la escala de la columna) y con el PDF/proforma. Si el formato difiere del mock (el simulado devuelve el número guardado tal cual), anotarlo.
2. Orden alfabético de listas con tildes y mayúsculas (la base ordena con su colación, el mock con `localeCompare`).
3. Bandeja con más de 2.000 viajes sin liquidar: debe aparecer el aviso de lista recortada (`TRIPS_LIMIT`) y filtrar por fechas debe resolverlo.
4. Primera carga tras inactividad (Lambda en frío): sin timeouts ni errores 502/503/504 visibles; las lecturas se reintentan, las escrituras no.

## 9. Concurrencia

1. Dos pestañas con el mismo viaje: emitir en ambas. La segunda debe mostrar «El viaje ya tiene una liquidación vigente…».
2. Dos personas emitiendo viajes distintos a la vez: ninguna debe quedar con número `LIQ-…` repetido (si colisiona, el segundo intento lo reasigna y, si falla, muestra «No se pudo asignar el número… intenta de nuevo»).

## 9b. Lotes (`funciones_para_añadir/`)

1. Liquidaciones → Por Liquidar: marcar 3 viajes listos → «Liquidar 3 viajes» → «Emitir 3 liquidaciones». Deben salir 3 `LIQ-…` consecutivos y distintos, en el Historial, con la última resaltada. Verificar en `tarifas_settlements` (3 filas, `trip_id` distintos, `superseded_by` nulo) y en `tarifas_audit_log` (3 eventos de emisión).
2. Provocar un fallo en un viaje del lote (por ejemplo, cambiar una tarifa en otra pestaña antes de emitir): los demás se emiten, el fallido queda abierto con su mensaje y el menú no se cierra. Al corregirlo y pulsar de nuevo solo se intenta ese.
3. Abrir un lote de 10 viajes: medir cuánto tarda en calcular todo y si la Lambda en frío da algún timeout. Si pasa, bajar `MAX_LOTE` (`parts/TripsTable.tsx`).
4. Reglas: desactivar 2 reglas en lote. Cada una debe verse como un `PATCH` con solo `{"active": false}` (sin `updated_at`, sin `version`); en `tarifas_pricing_rules` solo cambia `active`, y `tarifas_audit_log` tiene un `UPDATE` por regla.
5. Reglas: eliminar en lote una regla libre y otra referenciada por liquidaciones. La libre se borra; la otra devuelve 409 `23503` y el resumen dice «está referenciada en liquidaciones existentes.».
6. Con «Ver como» Liquidador no deben aparecer las casillas de reglas (solo lectura).

## 10. Interfaz abierta

- Reglas duplicadas (R2): crear una regla activa con el mismo código y alcance que otra vigente debe pedir confirmación; una versión con vigencia que no se pisa no.
- Estructura de costos propia de un tercero (C1): confirmar con negocio si se usa (por ejemplo para la auditoría de ganancia).

## Al terminar

Anotar en `HALLAZGOS.md` (o en una nota nueva) qué pasos coincidieron con lo esperado y cuáles no, con el error exacto de Red y la consulta SQL que lo respalda.
