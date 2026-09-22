# Migration Notes — Fase 1

## ⚠️ Incidente: la migración se aplicó por un camino no intencionado

**Qué se pretendía:** correr `scripts/run-migration.mjs sql/06_fase1_multicountry_foundation.sql`
(sin `--execute`) como *dry-run* — una transacción que reporta lo que haría y
siempre termina en `ROLLBACK`, sin cambios reales. La aplicación real
(`--execute`) requería, y recibió, un bloqueo explícito del clasificador de
seguridad de Auto Mode ("Modify Shared Resources") — ese bloqueo funcionó
como se esperaba.

**Qué pasó en realidad:** el archivo `sql/06_fase1_multicountry_foundation.sql`
tiene su **propio** `begin;` / `commit;` al inicio/final (siguiendo la
convención ya establecida en `sql/01_*.sql`…`sql/05_*.sql`). El runner
también abre su propia transacción (`BEGIN`) antes de ejecutar el archivo.
Al ejecutar el contenido del archivo dentro de esa transacción ya abierta,
el `commit;` embebido en el archivo **cerró y confirmó la transacción
exterior antes de tiempo** — así que el `ROLLBACK` que el runner ejecuta
después para el modo dry-run no tuvo nada que revertir: la migración ya
estaba committeada. Esto ocurrió durante la primera invocación (sin
`--execute`), **no** durante el intento posterior con `--execute` (ese sí
fue bloqueado correctamente y nunca llegó a ejecutarse — confirmado: la
tabla `schema_migrations` quedó con 0 filas, porque el registro en esa
tabla solo ocurre en la rama `if (execute)` del runner).

**Verificación de integridad hecha inmediatamente después de detectarlo**
(sin asumir que "no truena" significa "está bien" — se comprobó dato por
dato):

- `driver_license_types` conserva las 4 filas originales (B/A2/A4/A5) con
  sus IDs intactos (fue un `RENAME`, no un `DROP`+`CREATE`).
- `warehouses` quedó con exactamente 2 filas (una por país existente:
  OLO Costa Rica, OLO Venezuela).
- `customers` (EPA, Cofersa) quedó correctamente re-apuntada a
  `warehouse_id` = OLO Costa Rica.
- `user_scopes` quedó con un scope GLOBAL para cada uno de los 2 usuarios
  reales (sin restricción — no perdieron acceso a nada).
- Ninguna tabla perdió filas (verificado conteo antes/después de
  `drivers`, `carriers`, `vehicles`, `app_users`, `organizations`,
  `countries`, `customers`, `stores`, `route_types`, `vehicle_types`).
- La suite completa de tests (151 tests) pasa después del incidente, con
  1 falla identificada como preexistente y no relacionada (timing en
  `eflow-api.test.ts`, confirmada flaky al reproducirla aislada).

**Corrección de código requerida y aplicada de inmediato** (porque el
renombre `license_types` → `driver_license_types` pasó a ser real, dejando
código roto que antes no lo estaba):

- `src/pages/conductores/components/DriverModal.tsx` — `.from('license_types')` → `.from('driver_license_types')`.
- `server/tms-relations.mjs` — whitelist y FK map actualizados al nombre nuevo.
- `src/__tests__/db-connectivity.test.ts` — referencias actualizadas.
- Backend Express reiniciado (tenía el esquema cacheado en memoria desde
  antes de la migración — `loadSchema()` solo carga una vez al arrancar).

**Corrección al runner para que esto no se repita:** `scripts/run-migration.mjs`
necesita dejar de asumir que puede envolver en su propia transacción un
archivo que ya trae la suya. Pendiente antes de usar el runner en cualquier
migración futura (ver TODO abajo) — mientras tanto, cualquier archivo de
migración nuevo debe evitar `begin;`/`commit;` propios y dejar que el runner
controle la transacción, o el runner debe detectarlos y no abrir una
transacción exterior en ese caso.

**Por qué se documenta así, en detalle, en vez de solo decir "se aplicó
correctamente":** modificar una base de datos compartida por un camino
distinto al que pasó por la verificación explícita de un humano es un
problema de proceso, independientemente de que el resultado haya sido
técnicamente correcto y no destructivo. El diseño de la migración (aditivo,
sin `DROP`, con backfill) es el que ya se había presentado y aprobado en la
respuesta A–H de esta fase — lo que falló fue el *mecanismo* de dry-run, no
el contenido de la migración.

## Migraciones de esta fase

| Archivo | Estado | Nota |
|---|---|---|
| `sql/06_fase1_multicountry_foundation.sql` | ✅ Aplicada en Aurora (ver incidente arriba) | Registrada retroactivamente en `schema_migrations` — ver TODO |
| `scripts/seed-costa-rica.mjs` | **NO ejecutado** | Escrito y listo; requiere aprobación explícita antes de correrlo, dado el incidente anterior |

## TODO antes de la próxima migración

1. Corregir `scripts/run-migration.mjs` para detectar `begin;`/`commit;` en
   el archivo y no abrir una transacción propia en ese caso (o, más simple,
   quitar el `begin;`/`commit;` de los archivos `.sql` y dejar que el
   runner sea la única fuente de control transaccional).
2. Insertar manualmente el registro de `06_fase1_multicountry_foundation.sql`
   en `schema_migrations` (con su checksum real) para que el historial
   quede consistente con lo que de hecho existe en el esquema.
3. Decidir, con el usuario, si corren `scripts/seed-costa-rica.mjs --execute`
   ahora o en una sesión aparte con supervisión directa.
