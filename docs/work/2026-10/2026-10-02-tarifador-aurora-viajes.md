# 2026-10-02 — Liquidador automatizado: consume los viajes completados de guía de despacho vía ORM sobre Aurora

> Rama `dylan-tarifas`. Commits: `738f5ca` (Fase 2, ORM), `02ca4b2` (Fase 3, borde), `d31e2c0`
> (Fase 4, backend), y el de la Fase 5 (migración). Diseño completo: `docs/tarifador/ROADMAP.md` §8.
> Plan aprobado por fases, sin AI-DLC, con aprobación del usuario en cada fase.

## What changed

**Antes.** El liquidador guardaba todo en `localStorage` (driver JSON) y la liquidación se creaba a
mano: se tecleaba el número de viaje y se elegía una ruta comercial, un conductor y una compañía que
eran entidades PROPIAS del tarifador (duplicando el catálogo del TMS). Peajes, recolectas, bultos,
atraso e incidencias eran campos fijos del motor que nadie traía como dato.

**Ahora.**

1. **ORM con entidades externas** (`src/lib/tarifas/data/`)
   - `schema.ts` declara dos clases de entidad: PROPIAS (cálculo, tablas `tarifas_*`) y EXTERNAS de
     solo lectura (`external`): viaje (`trip` → vista `tarifas_v_viajes`), transportista
     (`carriers`), conductor (`drivers`), vehículo (`vehicles`), zona (`zones`), país (`countries`),
     guía (`dispatch_guides`) y devolución (vista `tarifas_v_devoluciones`).
   - Se eliminaron las entidades propias `route`, `driver`, `zone`, `country` y `partyVehicleType`.
   - `settlementParty` pasó a ser **perfil de cálculo** 1:1 con `carriers` (sin datos maestros).
   - Nueva `countrySettings` (redondeo, umbral de pernocta). `zoneGroup` guarda `zone_codes`.
   - `settlement` gana `trip_id`, `trip_info` (foto del viaje), `trip_edits` (lo cargado a mano) y
     `superseded_by`; índice único parcial: **una liquidación vigente por viaje**.
   - Drivers JSON y HTTP rechazan escrituras sobre externas (`ReadOnlyEntityError`); el JSON hace
     cumplir unicidad (`UniqueViolationError`, 23505). El HTTP manda el JWT de la sesión del TMS y
     usa por defecto `${VITE_API_BASE}/api`.
   - `ddl.ts`: `uuid`, `UNIQUE`, índice parcial, FK a tablas base del TMS. Nuevo
     `npm run tarifas:manifest` → `backend/tarifas/src/schema_manifest.json`.
   - `seed.json` convertido al modelo nuevo (clave de localStorage `tarifas-liquidador:v2`).
2. **Motor (kernel)**
   - Peajes, recolectas, bultos, atraso e incidencias dejaron de ser variables fijas: son
     **variables personalizadas** (`custom:*`, origen PER_TRIP) de cada compañía.
   - Sin driver de costo "por bulto". Origen de zona opcional (los viajes solo traen destino); una
     zona sin grupo ya no rompe el cálculo; la capacidad del camión viene con el viaje.
3. **Borde** (`src/lib/tarifas/*.ts`)
   - `catalogLoader.ts` asíncrono y 100 % por `db()`.
   - `tripContext.ts` (reemplaza `routeTrip.ts`): viaje → motor. km = `total_distance`,
     paradas = `completed_stops`, flota = `is_flota_propia`, tipo de camión = `vehicle_type`,
     capacidad en kg/1000, zona = destino.
   - `tripsDataSource.ts`: bandeja "por liquidar" (completados sin liquidación vigente), detalle,
     guías y devoluciones para precargar.
   - `tripSettlement.ts` → `calculateTrip()`: el ÚNICO camino viaje → total (pantalla y Probador).
   - `settlementsDataSource.ts`: `emitSettlement` relee el viaje y exige completado + sin vigente;
     `reliquidateSettlement` anula + emite en una transacción; bitácora integrada.
   - `partiesDataSource.ts`: `listCarrierProfiles`, `ensurePartyProfile` (perfil al primer uso).
   - `localRulesDataSource.ts`: zonas solo lectura, `saveZoneGroup` (una zona en un solo grupo),
     `saveCountrySettings`, `listSimulatedCarriers` desde `carriers`.
   - `vehiclesDataSource.ts`: tipos de camión desde `vehicles.vehicle_type`.
   - Eliminados: `routeTrip`, `routesDataSource`, `driversDataSource`, `driverSearch`,
     `partyVehicleTypesDataSource`, `settlementForm` (y sus tests); también los tests de las
     migraciones viejas de localStorage.
4. **Backend** `backend/tarifas/` (Lambda Python + SAM): implementa el contrato del driver HTTP
   (`/api/tarifas/{table}[/{id}]`, `/api/tarifas/tx`). Lista blanca desde el manifiesto; externas →
   405; bitácora append-only; permiso módulo `tarifas` + países del rol; transacciones todo o nada.
   `tms_common` propaga el SQLSTATE en `error.code` (23503/23505). Registrado en `serve.py`.
5. **Migración** `sql/19_tarifas_aurora.sql` (ESCRITA, NO APLICADA): DDL `tarifas_*`, vistas
   `tarifas_v_viajes` / `tarifas_v_devoluciones`, GRANT a `tms_app` (bitácora: solo leer/insertar;
   vistas: solo leer), trigger append-only, registro en `audit.tracked_tables` y configuración
   mínima de Costa Rica (redondeo y política de margen; SIN parámetros de costo, a propósito).

## Why

Pedido del usuario: el liquidador debe CONSUMIR automáticamente los viajes completados de guía de
despacho (km, paradas, etc.); no crear viajes ni liquidaciones manuales; editar solo lo variable;
guardar el historial; delegar flota propia / tercera, rutas y datos maestros al catálogo; y hacer
pasar TODO dato por el ORM, venga de Aurora o de las tablas del catálogo y de guía de despacho.

Decisiones tomadas con el usuario (2026-10-02): ORM = la capa propia del tarifador extendida;
viaje liquidable = estado completado; lo que el viaje no trae = variable personalizada; base
`tms_olo` esquema `public`; una liquidación vigente + historial; tipo de camión =
`vehicles.vehicle_type`; zona = solo destino; país del catálogo + configuración propia; moneda =
la del país en el catálogo; sin sembrar costos de flota propia.

## How

- Verificación: 525 tests del front (`npx vitest run src/lib/tarifas src/lib/liquidador`), 160 de
  pytest (`backend/`), `tsc` sin errores en `src/lib`, `strictNullChecks` en los 26 archivos
  nuevos/reescritos, eslint limpio, plantilla SAM validada con cfn-lint, migración en dry-run y
  vistas verificadas contra la base real dentro de una transacción con ROLLBACK (17 viajes
  completados, 10 planificados, 1 en ruta).
- La semilla se convirtió con un script de un solo uso (scratchpad); el resultado es `seed.json`.

## Promoted knowledge

- Guía viva: `docs/tarifador/ROADMAP.md` §8 (modelo, entidades, vista, mapeo viaje → motor).
- `backend/README.md` § "Tarifas / liquidador" (contrato, reglas, errores).
- Cambiar el esquema del tarifador = tocar `schema.ts` y regenerar `npm run tarifas:ddl` y
  `npm run tarifas:manifest` (un test falla si no); en Aurora, migración nueva (no editar la 19).

## Follow-ups

- [ ] **Aplicar la migración 19** cuando el usuario lo autorice:
      `node --env-file=.env.local scripts/run-migration.mjs sql/19_tarifas_aurora.sql --execute`.
- [ ] **Desplegar** `backend/tarifas` (solo Intelix): `npm run tarifas:manifest` → `sam build && sam deploy`.
- [ ] **Frontend (Kiro, vía `.agents/CANAL.md`)**: 17 archivos de `src/pages` / `src/components` no
      compilan contra el modelo nuevo (liquidaciones, compañías, reglas de tarifa, Probador,
      `DriverCarrierPicker`). Bandeja "Viajes por liquidar" + "Historial", modal "Liquidar viaje",
      flota propia/externa solo lectura, Probador "desde un viaje", y `VITE_TARIFAS_DATASOURCE=postgres`.
- [ ] **Datos del catálogo** (no del liquidador): la zona "Rural" no tiene `code` (sus viajes no se
      pueden tarifar hasta asignárselo); Costa Rica figura con moneda USD (se liquida en la moneda
      que diga el catálogo); Venezuela tiene código `VN`.
- [ ] **Configuración de Costa Rica**: cargar parámetros de costo de flota propia (Reglas de
      Tarifa → Costos), reglas, tarifarios (con clave por `destZone`, ya que el viaje no trae origen)
      y variables personalizadas por transportista (peajes, recolectas…).
- [ ] Proponer para `project.md ## Decided` las decisiones de este documento (con aprobación).
- [ ] `docs/tarifador/ROADMAP.md`: reescribir §2.3, §2.4, §2.13, §4.5 y §4.9 cuando la UI esté hecha.
