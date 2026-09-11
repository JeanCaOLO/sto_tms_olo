# 2026-09-01 — Matriz de Rutas multi-sistema en /planificacion (COFERSA + Asignación de Viajes)

## What changed
Nueva pestaña **"Matriz de Rutas"** en `/planificacion` que muestra datos de
programación de rutas/viajes venidos de Excel como una matriz limpia, con un
selector de sistema config-driven (hoy: COFERSA y Asignación de Viajes; añadir
un 3º es trivial).

- `scripts/build-route-systems.ts` — convierte los dos `.xlsx` a JSON estático
  en `public/data/route-systems/` (dev/commit time). `pnpm run data:build`.
- `src/pages/planificacion/route-systems/` — `parse.ts` (mapeo puro Excel→JSON,
  testeado), `registry.ts` (definición config-driven de sistemas y columnas),
  `filter.ts` (filtro de texto puro), `use-route-system.ts` (fetch + cache +
  estado), `use-debounced.ts`.
- `components/DataMatrix.tsx` — tabla genérica: `<table>` real, `<thead>`
  sticky, divisores de fila (sin zebra), hover, columnas mono alineadas a la
  derecha para IDs de viaje, `—` para celdas vacías, contenedor con scroll
  propio (`role="region"`, `tabIndex=0`), paginación Anterior/Siguiente.
- `components/MatrizRutasTab.tsx` — selector (segmentado, pasa a `<select>` con
  >5 sistemas), buscador con `aria-live`, y los estados loading / error+
  reintento / no-generado / vacío / sin-coincidencias.
- Sistema activo en la URL (`?sistema=`), enlazable.

## Why
El usuario tiene dos Excel de programación de rutas que quiere visualizar dentro
de Planificación, y anticipa más sistemas. **No** son el sistema de rutas ni el
de horarios de EFLOW QA — son datos de referencia aparte; no se cruzan con la BD.

## Los dos Excel (esquema real)

### `Rutas cofersa.xlsx` — 9 KB, 1 hoja
- **Hoja1** (`A1:D35`, 34 filas de datos). Una fila = **una zona de reparto
  COFERSA y su calendario semanal**.
  - `Zona #` — nombre/código de zona ("08 San Carlos", "33 Cartago Epa", "44 REY").
  - (col B, sin cabecera) — categoría: `Rural` o `GAM` (Gran Área Metropolitana).
  - `Días de Carga` — texto libre ("Lunes -Miercoles-Viernes", "Cita Previa").
  - `Días de entrega` — texto libre; varias zonas GAM lo tienen vacío.
- Sin PII.

### `ASIGNACION DE VIAJES.xlsx` — 4.4 MB, 16 hojas
Sistema de programación de viajes por conductor/plaza/estado (Venezuela). Hojas:

| Hoja | Filas | Qué es |
|---|---|---|
| **PROGRAMACION DE VIAJES** | ~21 400 | **La que se muestra.** Ver abajo. |
| BASE DE DATOS | 216 | Catálogo conductor↔CI↔transporte. **PII: nombre + cédula.** |
| Personal | ~2 690 | Nómina de personal: código, estatus, nombre, cédula, teléfono, vehículo, plaza. **PII.** |
| SUSPENSIONES | 0 (solo cabecera) | Conductores suspendidos (vacía). |
| ESTADOS | ~135 | Matriz estado→plaza (localidades por estado). |
| PRUEBA | ~45 | Log antiguo de tiempos de carga por transporte (Febeca/Sillaca/Beval). |
| Tabla dinámica 1 | 0 | Vacía. |
| FLOTA TRIMESTRE | ~230 | Flota: conductor, transporte, tamaño, placa, código, vehículo. **PII + placas.** |
| VIAJES EN COLA | ~128 | Viajes pendientes de asignar. |
| ESTADOS/CONTROLES + LARA/ZULIA/APURE/… | varía | Hojas auxiliares por estado y catálogos (zonas, andenes, transportes, tabulador). |
| Cond disp Backup16-03-2019 | ~2 000 | Snapshot histórico de disponibilidad de conductores (2019). |

**PROGRAMACION DE VIAJES** — cabecera en la fila 5 (hay basura arriba). Una fila
= **un viaje programado en una fecha, a un destino (estado) y localidad**, con su
conductor y los números de viaje en cada subsistema. Columnas mostradas:
`MES`, `Fecha De Asignacion` (serial Excel → ISO), `Destino` (estado),
`Localidad Referencia`, `Conductor`, `N° Prioridad`, `PUERTA DE CARGA`,
`Febeca Patio Viaje`, `Febeca Bulto`, `N° Viaje Sillaca`, `N° Viaje Beval`,
`VIAJE WMH`, `GUIAS ADICIONALES`. Rango: 2024-01-02 → 2026-08-31. 20 conductores
distintos. Columnas `ORDEN DE CARGA / C/S / C/B / PESO / Transporte / Tipo de
Carro` existen en la cabecera pero vienen vacías → no se muestran.

## PII
- **COFERSA**: ninguna.
- **PROGRAMACION DE VIAJES**: nombres reales de conductores (nombre + apellido,
  **sin** cédula). El pipeline los **enmascara por defecto** ("ARAMIS VILLASANA"
  → "A. VILLASANA"); `DATA_PII=full pnpm run data:build` emite los reales.
- Otras hojas (BASE DE DATOS, Personal, FLOTA TRIMESTRE): nombre + **cédula** +
  placas. **No se procesan ni se muestran.**

## Pipeline de datos (decisión)
Son ficheros estáticos, no una BD; parsear 4.4 MB de xlsx en el navegador es
inviable. Se convierten **una vez** a JSON con SheetJS en un script de dev/commit
(`pnpm run data:build`) y la vista solo hace `fetch` del JSON — `xlsx` queda como
`devDependency` y **nunca entra al bundle** (verificado en `pnpm build`).

## Qué se commitea
- **Sí**: código, tests, `scripts/build-route-systems.ts`, y
  `public/data/route-systems/cofersa.json` (3 KB, sin PII, para que COFERSA
  funcione en clone limpio).
- **No** (gitignored, regenerables): `programacion-viajes.json` (~6 MB, nombres
  de conductores) y `meta.json`. La vista muestra el estado "todavía no se ha
  generado" hasta correr `pnpm run data:build`. El `.xlsx` de COFERSA tampoco
  (el de ASIGNACION ya estaba trackeado de antes).

## Extensibilidad (añadir un 3er sistema)
1. Añadir el mapeo en `parse.ts` si el formato es nuevo (o reusar uno).
2. Emitir su JSON en `scripts/build-route-systems.ts`.
3. Añadir **una entrada** a `ROUTE_SYSTEMS` en `registry.ts` (id, label, file,
   descripción, columnas, `pageSize`, `hasPII`).
Sin tocar `MatrizRutasTab`, `DataMatrix` ni `page.tsx`. El selector pasa solo de
segmentado a desplegable al superar 5 sistemas.

## Verificación
- `pnpm test` → verde (8 files, incluye `route-systems/parse.test.ts`).
- `tsc --project tsconfig.app.json` → 0 errores en `src/pages/planificacion/**`
  (persisten ~2 preexistentes en `transportistas`/`vehiculos`, ajenos).
- `pnpm build` → OK; `xlsx` ausente del bundle.
- Diseño de la matriz revisado con el skill crew `ux-architect`.

## Simplificaciones deliberadas (ponytail)
- JSON como array de objetos, no columnar — el servidor lo sirve gzip (~700 KB).
  Migrar a columnar si el peso molesta.
- Sin cabecera de columnas de dos niveles, sin columna ancla sticky horizontal,
  sin sombras de scroll, sin skeleton animado (bloques estáticos). Añadir si la
  densidad real lo pide.
- Sin ordenación por columna (el filtro cubre el 90% del uso). Añadir en
  `DataMatrix` si se pide.

## Follow-ups
- [ ] Decidir si `programacion-viajes.json` se commitea (enmascarado o no) o se
      genera en CI. Hoy: gitignored.
- [ ] Si se añaden muchos sistemas grandes, virtualizar filas en `DataMatrix`
      (hoy pagina a 50).
