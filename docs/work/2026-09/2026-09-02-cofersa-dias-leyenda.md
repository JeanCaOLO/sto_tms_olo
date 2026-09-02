# KIRO REPORT — Matriz COFERSA por días + leyenda + rutas por día

Rama: `kiro/cofersa-dias` (creada desde `jesus-planificacion`). Sin merge, sin
tocar `jesus-planificacion` ni `main`.

## Archivos tocados

Modificados:

- `src/pages/planificacion/route-systems/parse.ts` — modelo de días ampliado +
  reglas cita/GAM; `Cell` ampliado a `boolean`.
- `src/pages/planificacion/route-systems/parse.test.ts` — casos GAM/cita/rural.
- `src/pages/planificacion/route-systems/registry.ts` — descripción COFERSA sin
  la frase "verde = carga, rojo = entrega".
- `src/pages/planificacion/components/DataMatrix.tsx` — celda `ambos` (cuadro
  diagonal), chip de cita previa; exporta `AmbosSwatch` / `CitaPreviaChip`.
- `src/pages/planificacion/components/MatrizRutasTab.tsx` — monta la leyenda.
- `src/pages/planificacion/components/RouteConfigForm.tsx` — select "Viaje (WMS)"
  agrupado por día + línea de ayuda `aria-live`.
- `public/data/route-systems/cofersa.json` — regenerado con `pnpm run data:build`.

Nuevos:

- `src/pages/planificacion/components/MatrizLeyenda.tsx` — leyenda visual.
- `src/pages/planificacion/route-systems/cofersa-dias.ts` — loader + `rutasActivas`.
- `src/pages/planificacion/route-systems/use-cofersa-dias.ts` — hook fino.
- `src/pages/planificacion/route-systems/cofersa-dias.test.ts` — tests del helper.

No commiteado: `public/data/route-systems/meta.json` (gitignored).

## Decisiones (Partes 1–3)

### Parte 1 — modelo de días

- `DiaEstado = 'carga' | 'entrega' | 'ambos' | 'cita' | null`. En la práctica el
  valor `'cita'` **no se asigna a ningún día**: la cita previa es un atributo de
  FILA (`citaPrevia: true`) y sus 6 días quedan en `null`. Se deja `'cita'` en la
  unión por completitud del modelo y porque el helper lo tolera al normalizar.
- Orden de reglas en `expandirDiasCofersa` (importa):
  1. **Cita previa primero**: si `diasCarga` contiene "cita previa"
     (case/acentos-insensible) → fila cita, 6 días `null`, `citaPrevia: true`.
     Va antes que la regla GAM porque "44 REY" es `categoria === 'GAM'` **y**
     "Cita Previa"; sin este orden se marcaría erróneamente como `ambos`.
  2. **Regla "GAM sin días"**: `categoria === 'GAM'` y sin split explícito
     (ambas listas de días vacías, **o** sólo `diasCarga === "Lunes a Viernes"`
     sin entrega) → Lunes..Viernes = `'ambos'`, Sábado = `null`. Refleja el
     negocio: las rutas GAM cargan y entregan el mismo día de lunes a viernes.
  3. **Resto** (incluidas las GAM con split real, p. ej. EPA 33–38): `'carga'` si
     el día está en `diasCarga`, `'entrega'` si está en `diasEntrega`, `'ambos'`
     si aparece en **ambas** listas explícitas, `null` si en ninguna.
- Verificado en el JSON regenerado: `1 Casco`, `3 Guadalupe`, `17 Grecia`,
  `21 Casco`, `26 Cartago` → Lun–Vie `ambos`, Sáb `null`. `44 REY` → `citaPrevia:
  true` y 6 días `null`. Las EPA (33–38) conservan su split carga/entrega.

### Parte 2 — render + leyenda

- `'ambos'` se dibuja como cuadro ~14×14 px con gradiente diagonal verde/rojo
  (`role="img"`, `aria-label`), distinguible por FORMA además de color.
- La leyenda (`MatrizLeyenda`) reutiliza el mismo `AmbosSwatch` de la celda para
  que el swatch y la celda sean idénticos. `role="list"` / `role="listitem"`.
  Se muestra sólo cuando `system.id === 'cofersa'`, encima de la tabla.

### Parte 3 — match ruta↔zona en "Nueva Ruta"

- **Match por número**: `numeroRuta = parseInt(Viaje.route_type_name, 10)`
  ("01 · Casco Central" → 1) se une con `CofersaDia.numero`
  (`parseInt(zona)`, con fallback al primer dígito para casos como "Upala 31").
- Viaje cuya ruta **no** está en COFERSA → siempre visible en "Otros días / sin
  programación", sin marca.
- Dos zonas COFERSA con el mismo `numero`: **no ocurre** en los datos actuales
  (hay "1 Casco" y "21 Casco", números distintos). El diseño usaría la primera
  vía `Set`; queda documentado como duda abierta abajo.
- La carga del calendario es no invasiva: hook `useCofersaDias` dentro de
  `RouteConfigForm`, con caché de módulo. Si el fetch falla, el select cae al
  listado plano y no bloquea la creación de rutas.
- `fechaRuta` vacío → lista plana. Domingo o día sin rutas → todos los viajes se
  listan igual en "Otros días", y la línea de ayuda avisa "sin rutas COFERSA
  programadas ese día".

## Salida literal de verificación

### `pnpm test`

```
 RUN  v4.1.11 C:/Users/jaraujo/Documents/Desarrollo/TMS_NEW/sto_tms_olo
 Test Files  10 passed (10)
      Tests  70 passed (70)
   Start at  09:39:49
   Duration  2.97s (transform 1.79s, setup 0ms, import 2.93s, tests 204ms, environment 3.83s)
```

### `pnpm exec tsc --noEmit --project tsconfig.app.json`

Sin errores NUEVOS bajo `src/pages/planificacion/**` (0). Los errores restantes
son preexistentes en otros módulos (no tocados por este brief):

```
src/components/feature/CsvImportModal.tsx(207,13): error TS2741: Property 'organization_id' is missing in type 'Record<string, any>' but required in type '{ organization_id: string; }'.
src/pages/conductores/page.tsx(129,19): error TS2322: Type '"error" | "success" | "warning"' is not assignable to type '"default" | "success" | "warning" | "danger" | "info"'.
src/pages/conductores/page.tsx(449-459,13): error TS2353: Object literal may only specify known properties, and 'name' does not exist in type 'CsvField'. (x11)
src/pages/contratos/page.tsx(162,78): error TS2322: Type '"green"' is not assignable to type '"teal" | "emerald" | "amber" | "red" | "blue"'.
src/pages/contratos/page.tsx(163,94): error TS2322: Type '"yellow"' is not assignable to type '"teal" | "emerald" | "amber" | "red" | "blue"'.
src/pages/devoluciones/components/ReturnModal.tsx(233,35): error TS2322: Type '"outline"' is not assignable to type '"success" | "danger" | "primary" | "secondary" | "ghost"'.
src/pages/guias/page.tsx(168,11): error TS2322: Type '"green"' is not assignable to type '"teal" | "emerald" | "amber" | "red" | "blue"'.
src/pages/reportes/page.tsx(255,35): error TS2339: Property 'first_name' does not exist on type '{ first_name: any; last_name: any; }[]'.
src/pages/reportes/page.tsx(255,62): error TS2339: Property 'last_name' does not exist on type '{ first_name: any; last_name: any; }[]'.
src/pages/rutas/components/RouteModal.tsx(154,15): error TS2322: Type '"outline"' is not assignable to type '"success" | "danger" | "primary" | "secondary" | "ghost"'.
src/pages/rutas/components/RouteTypeDeleteModal.tsx(62,15): error TS2322: Type '"outline"' is not assignable to type '"success" | "danger" | "primary" | "secondary" | "ghost"'.
src/pages/rutas/components/RouteTypeModal.tsx(122,15): error TS2322: Type '"outline"' is not assignable to type '"success" | "danger" | "primary" | "secondary" | "ghost"'.
src/pages/rutas/page.tsx(155,17): error TS2322: Type '"green"' is not assignable to type '"teal" | "emerald" | "amber" | "red" | "blue"'.
src/pages/rutas/page.tsx(161,17): error TS2322: Type '"purple"' is not assignable to type '"teal" | "emerald" | "amber" | "red" | "blue"'.
src/pages/transportistas/page.tsx(139,16): error TS2322: Type '"error"' is not assignable to type '"default" | "success" | "warning" | "danger" | "info"'.
src/pages/transportistas/page.tsx(437-445,13): error TS2353: Object literal may only specify known properties, and 'name' does not exist in type 'CsvField'. (x9)
src/pages/vehiculos/page.tsx(660,9): error TS2322: Property 'onSuccess' does not exist on type 'IntrinsicAttributes & CsvImportModalProps'.
```

> Nota: hubo 1 error NUEVO transitorio en `parse.ts(144)` ("boolean not
> assignable to Cell") al añadir `citaPrevia: true`. Resuelto ampliando
> `Cell = string | number | boolean | null` (seguro: `cell()` hace `String(v)`,
> y `filterRows`/alineación operan sobre strings).

### `pnpm build`

```
vite v7.3.6 building client environment for production...
✓ 305 modules transformed.
out/index.html    0.73 kB │ gzip: 0.44 kB
...
out/assets/index-DJTQ4RNK.js  426.22 kB │ gzip: 129.73 kB │ map: 2,094.24 kB
✓ built in 5.54s
```

## Dudas abiertas

- **`numero` duplicado**: hoy no hay colisión real (los números de zona son
  únicos). Si el Excel llegara a repetir un número, `rutasActivas` devolvería el
  número una vez y el select agruparía todos los viajes de esa ruta juntos; no
  hay desambiguación por nombre de zona. Confirmar con negocio si puede pasar.
- **Semántica de `ambos` en optimización**: Parte 3 sólo agrupa/anota el select;
  no se tocó la generación/optimización ni el modelo `Viaje` (por brief). Si más
  adelante la ruta debe respetar carga vs. entrega el mismo día, hará falta
  propagar el estado del día al motor de rutas.
- **Sábado GAM**: se asume `null` (sin actividad) para todas las GAM sin split.
  Si alguna zona GAM trabaja sábado, necesitará días explícitos en el Excel.
