# Estructura de código — STO / TMS OLO

> Organización de módulos, clasificación de archivos y patrones de código
> observados el 2026-08-27 en `sto_tms_olo`.

## Organización del repositorio

Paquete único. `pnpm-workspace.yaml` existe pero **no declara `packages:`**, así
que no hay monorepo: el archivo solo lleva `allowBuilds` /
`onlyBuiltDependencies` (`@firebase/util`, `@swc/core`, `esbuild`,
`protobufjs`) como lista de aprobación de scripts de build de pnpm.

```
sto_tms_olo/
├── index.html                          entrada Vite, lang es, CDN de Remix Icon
├── package.json                        private true, version 0.0.0, 5 scripts
├── pnpm-workspace.yaml                 sin packages
├── pnpm-lock.yaml                      lockfileVersion 9.0, 133 KB
├── vite.config.ts                      alias, define, auto-import, outDir out
├── tsconfig.json                       raiz con files vacio y references
├── tsconfig.app.json                   strict false, 10 flags apagados
├── tsconfig.node.json                  strict true, solo vite.config.ts
├── tailwind.config.ts                  theme.extend vacio, plugins vacio
├── postcss.config.ts                   tailwindcss y autoprefixer
├── eslint.config.ts                    flat config via jiti
├── eslint-rules/route-element-jsx.js   plugin ESM local
├── vite-env.d.ts                       declara las 5 constantes define
├── auto-imports.d.ts                   GENERADO, presente pero gitignored
├── .env                                VERSIONADO en git
├── .mcp.json                           5 servidores MCP, tooling no aplicacion
├── CONTEXTO_PROYECTO_TMS.md            44 KB, 10 secciones
├── PLAN_MODULO_OMS.md                  31 KB, 9 secciones
├── Estandares_Desarrollo_AWS_Intelix.md 39 KB, 15 secciones
├── AGENTS.md, AGENTES_IA_KIRO.md       andamiaje metodologico
└── src/
    ├── main.tsx                        createRoot, StrictMode, AuthProvider
    ├── App.tsx                         layout autenticado, guardas de sesion
    ├── index.css                       entrada Tailwind
    ├── router/
    │   ├── config.tsx                  26 rutas, React.lazy
    │   └── index.ts                    useRoutes y puente window.REACT_APP_NAVIGATE
    ├── lib/supabase.ts                 unico cliente y tipo Database
    ├── hooks/useAuth.tsx               contexto de sesion y carga de app_users
    ├── i18n/
    │   ├── index.ts                    i18next, lng en, fallbackLng en
    │   └── local/index.ts              import.meta.glob sin idiomas
    ├── components/
    │   ├── base/                       5 atoms: Badge Button Card Input Select
    │   └── feature/                    Sidebar Header StatCard CsvImportModal
    └── pages/                          26 paginas en 22 modulos
```

**No existen** en el repositorio: `README.md`, `.env.example`, `.prettierrc`,
`.editorconfig`, `.github/`, `.husky/`, `template.yaml`, migraciones de base de
datos, ni ningún directorio de pruebas.

## Métricas de tamaño

**79 archivos, 19.323 líneas** en `src/` más `eslint-rules/`.

| Zona | Líneas aproximadas | Porcentaje |
|---|---|---|
| `src/pages/` | 17.700 | 91,6 % |
| `src/components/` | 1.050 | 5,4 % |
| `src/hooks/`, `src/lib/`, `src/router/`, `src/i18n/` | 200 | 1,0 % |

El peso está casi enteramente en las páginas, lo que es la huella directa de la
ausencia de capa de servicios: cada página lleva su propio acceso a datos, su
propio mapeo de estados y su propio manejo de errores.

Módulos más grandes por líneas totales (página más sus componentes):

| Módulo | Líneas | Componente más grande |
|---|---|---|
| `configuracion` | 1.497 | `UsersTab` 383 |
| `liquidaciones` | 1.432 | `SettlementModal` **893** |
| `tracking` | 1.377 | `MapView` 372 |
| `vehiculos` | 1.264 | `VehicleModal` 327 |
| `tiendas` | 1.238 | `StoreModal` 612 |
| `planificacion` | 1.129 | 4 componentes |
| `contratos` | 1.027 | `ContractModal` 412 |
| `reportes` | 939 | 4 gráficos |
| `seed` | 912 | archivo único |
| `oms` | **844** | `QueueSidePanel` 130 |

## Clasificación de archivos

| Clase | Convención observada | Ejemplos |
|---|---|---|
| Entrada de aplicación | `src/main.tsx`, `src/App.tsx` | 2 archivos |
| Enrutado | `src/router/config.tsx`, `src/router/index.ts` | 2 archivos |
| Cliente de datos | `src/lib/<nombre>.ts` | `supabase.ts` |
| Hook de contexto | `src/hooks/use<Nombre>.tsx` | `useAuth.tsx` |
| Atom del design system | `src/components/base/<Nombre>.tsx` | 5 archivos, 14-52 líneas |
| Componente de dominio compartido | `src/components/feature/<Nombre>.tsx` | 4 archivos |
| Página de módulo | `src/pages/<modulo>/page.tsx` | 26 archivos |
| Componente de módulo | `src/pages/<modulo>/components/<Nombre>.tsx` | ~40 archivos |
| Datos de prueba | `src/pages/<modulo>/mockData.ts` | solo `oms` |
| Tipos generados | `auto-imports.d.ts` | generado, gitignored |
| Regla de linting propia | `eslint-rules/<regla>.js` | `route-element-jsx.js` |

El nombre de archivo `page.tsx` en minúsculas para el componente de página es la
convención universal del repositorio; los componentes usan `PascalCase.tsx`.

## Patrones de código observados

**Página como unidad total.** Cada `page.tsx` es a la vez vista, controlador y
capa de datos: declara sus `useState`, dispara sus `useEffect`, construye sus
consultas PostgREST, aplica sus filtros y renderiza su JSX.

**Auto-import como convención de fondo.** `unplugin-auto-import` inyecta 24
símbolos de `react`, 8 de `react-router-dom` y 2 de `react-i18next`, con
`dts: true`. Consecuencia: los `page.tsx` **no importan** `useState`,
`useEffect` ni `useNavigate`, y `eslint.config.ts` tiene que declarar **62
globales a mano** para que `no-undef` no falle. Es una convención implícita que
no se puede deducir leyendo un archivo aislado.

**Cinco constantes inyectadas en build.** `vite.config.ts` define
`__BASE_PATH__`, `__IS_PREVIEW__`, `__READDY_PROJECT_ID__`,
`__READDY_VERSION_ID__` y `__READDY_AI_DOMAIN__`, declaradas en
`vite-env.d.ts`. Las tres `__READDY_*` son provenance del generador que produjo
el andamiaje inicial.

**Design system disciplinado, uso desigual.** Los 5 atoms de
`src/components/base/` cumplen el límite de 120 líneas del estándar (14-52) y
son el único vocabulario visual del sistema. Las 5 variantes de `Badge`
(`default` en slate, `success` en emerald, `warning` en amber, `danger` en red,
`info` en teal) son el único vocabulario de estado visual, y
`PLAN_MODULO_OMS.md` §4 las reserva explícitamente para `priority_tier` y para
el estado de las reglas. `src/pages/oms/` es el módulo que mejor lo respeta: usa
solo `Card`, `Button`, `Badge`, `Input`, `Select` y `StatCard`, sin colores fuera
de slate y teal más los 5 de estado.

**Tailwind sin tokens propios.** `tailwind.config.ts` tiene `theme.extend` vacío
y `plugins` vacío: la paleta es 100 % Tailwind por defecto y toda la identidad
visual está en clases sueltas dentro del JSX.

**Iconografía por clase CSS.** Las 26 páginas usan clases `ri-*` de Remix Icon
4.1.0, cargado por `<link>` desde `cdn.jsdelivr.net` en `index.html` y **no
declarado en `package.json`**.

**Idioma en el JSX, no en catálogos.** Todo el texto visible está en español
literal en el JSX. Los formatos de fecha y número están fijados a mano a
`'es-CL'` en `pedidos`, `oms/cola`, `oms/panel`, `oms/auditoria` y
`QueueSidePanel`, y a `'es-ES'` en `reportes` y `DocumentsList` — dos locales
distintos codificados a mano en un producto declarado multi-país.

**Manejo de errores por `console.*` y `alert()`.** Aproximadamente **55 usos de
`console.*`** en 27 archivos como única traza, y **21 usos de `alert()`** tanto
para error como para éxito. El único módulo con notificaciones tipo toast es
`tracking`, con un `ToastContainer` local no reutilizable.

## Antipatrones y desviaciones del estándar

**Arquitectura de pantalla contraria a `Estandares_Desarrollo_AWS_Intelix.md`
§11.** El estándar prescribe
`Page → use<Modulo>Controller → <modulo>Api → axiosApiGateway` con carpetas
`src/views/<modulo>/{api,routes,pages,hooks,components}`. El repositorio usa
`src/pages/<modulo>/page.tsx` plano y llama a `supabase` dentro del componente.
No existe `axiosApiGateway`, ni `axios`, ni un solo `AbortController` en todo
`src/`. Hay cascadas de `useEffect` en `guias/page.tsx:45-49` y
`devoluciones/page.tsx:69-73`. `PLAN_MODULO_OMS.md` §6.1 ya identifica esta
brecha y propone que el OMS se construya alineado al estándar en lugar de heredar
la deuda.

**Límites de líneas del estándar §11 incumplidos** (atoms 120, sections 200,
pages 250):

- **17 de 26 `page.tsx` superan 250 líneas**: `seed` 912, `vehiculos` 671,
  `tracking` 668, `tiendas` 586, `liquidaciones` 539, `reportes` 528,
  `conductores` 503, `transportistas` 483, `paises` 482, `devoluciones` 400,
  `planificacion` 392, `configuracion` 390, `rutas` 377, `clientes` 348,
  `contratos` 338, `guias` 318, `login` 254.
- **16 componentes superan 200 líneas**: `SettlementModal` 893, `StoreModal`
  612, `CustomerModal` 473, `CsvImportModal` 467, `ContractModal` 412,
  `UsersTab` 383, `CountryModal` 349, `VehicleModal` 327, `DriverModal` 292,
  `RolesTab` 284, `DocumentsList` 277, `UserModal` 275, `GuideModal` 263,
  `CarrierModal` 258, `ReturnModal` 246, `ConfiguracionRuta` 222.
- **Cumplen**: los 5 atoms (14-52) y las 5 pantallas del OMS (75-129) con sus 2
  componentes (22 y 130).

**Dos convenciones de import conviviendo.** El alias `@/` está configurado en
`vite.config.ts` y en `tsconfig.app.json`, pero solo lo usa el módulo
`contratos` (3 archivos, 17 imports). Los 22 módulos restantes usan rutas
relativas de hasta 3 niveles; las 5 pantallas del OMS escriben
`'../../../components/base/Card'`.

**Dos patrones de definición de ruta en el mismo array.**
`src/router/config.tsx` usa `element: <Page />` con `lazy()` para 24 rutas, y
`lazy: async () => {...}` —la API de data-router de React Router 7— para
`/guias` y `/tracking`. La regla local `route-element-jsx` solo vigila
`element`, así que las dos excepciones pasan sin control.

**Duplicación de montaje.** `AuthProvider` se monta dos veces
(`src/main.tsx:10` y `src/App.tsx:65`), y `Header` o `Sidebar` se renderizan una
segunda vez en 4 páginas: `devoluciones/page.tsx:168`,
`liquidaciones/page.tsx:201,204`, `rutas/page.tsx:114-134` (dos bloques) y
`vehiculos/page.tsx:196,198`.

**Código muerto y puentes globales frágiles.** `HomePage` se declara con
`lazy()` en `src/router/config.tsx:4` y **nunca se usa** —la ruta `/` apunta a
`DashboardPage`—; `src/pages/home/page.tsx` navega a `'/'` en un `useEffect`, lo
que sería un bucle si se enrutara. `navigatePromise` se exporta en
`src/router/index.ts:14` sin importadores. `src/router/index.ts:20-24` escribe
`window.REACT_APP_NAVIGATE` en un `useEffect` **sin array de dependencias**, así
que se reasigna en cada render. `PedidosDisponibles.tsx` (182 líneas) se exporta
y nadie lo importa.

**Uso invertido de una prop del design system.**
`src/pages/oms/components/QueueSidePanel.tsx:104` escribe
`<Card padding={false} className="p-4 ...">`: desactiva el padding del design
system para reintroducirlo por clase.

**Navegación con recarga completa.** `src/pages/oms/panel/page.tsx:46` usa
`<a href="/oms/cola">` en lugar de `<Link>`, lo que provoca una recarga completa
de la SPA.

**Formato inconsistente sin formateador.** 4 espacios y llave final sin salto de
línea en `tailwind.config.ts` y `postcss.config.ts` frente a 2 espacios en el
resto; comillas dobles en `vite.config.ts` frente a simples en todo `src/`.

## Estructura del submódulo OMS

`src/pages/oms/` — 844 líneas en 8 archivos, todos dentro de los límites del
estándar.

| Archivo | Líneas | Contenido |
|---|---|---|
| `mockData.ts` | 320 | 3 tipos y 4 constantes de datos ficticios |
| `panel/page.tsx` | 81 | 4 `StatCard` más tabla de pedidos con `sla_at_risk` |
| `cola/page.tsx` | 129 | Tabla por `priority_score` desc, filtros, panel lateral, override en estado local |
| `reglas/page.tsx` | 119 | Reglas agrupadas por `profile`, toggle activa/inactiva, alta de 3 campos |
| `simulador/page.tsx` | 87 | Comparación cola actual frente a simulada, un único cambio codificado |
| `auditoria/page.tsx` | 75 | Tabla filtrable por `automatico` / `manual` |
| `components/PriorityBadge.tsx` | 22 | `alta` a `danger`, `media` a `warning`, `baja` a `default` |
| `components/QueueSidePanel.tsx` | 130 | Detalle, reglas coincidentes, formulario de override con motivo obligatorio |

Contenido de `mockData.ts`: `PriorityTier = 'alta' | 'media' | 'baja'`;
`OmsOrder` con 19 campos; `mockQueueOrders` con 9 pedidos; `OmsRule` (`id`,
`name`, `condition` como **texto libre**, `weight`, `active`, `profile`);
`mockRules` con 6 reglas en 3 perfiles (`General`, `Perecederos Venezuela`,
`Mayoreo VIP`); `OmsAuditEntry` (`change_type: 'automatico' | 'manual'`,
`previous_tier`, `new_tier`, `reason`, `actor`, `created_at`); `mockAuditLog`
con 6 entradas; `mockKpis` con `pendientes: 128`, `slaEnRiesgo: 14`,
`reprioritizadosManualPct: 7`, `antiguedadPromedioHoras: 6.4`.

**Distancia entre el prototipo y el modelo de `PLAN_MODULO_OMS.md` §6.2.** El
mock aplana en `OmsOrder` lo que el plan reparte en 4-5 tablas
(`route_dispatch_schedule`, `order_priority_rules`, `order_priority_profiles`,
`order_priority_scores`, `order_priority_audit_log`). Campos del plan **ausentes
del prototipo**: `ready_to_prep_date` —el resultado central de la Regla 1—,
`route_id` o día de salida de la ruta, y `computed_at`. Campos del prototipo
**sin correspondencia en el plan**: `sla_at_risk` (derivable) y
`matched_rules: string[]`. El **submódulo 1** del plan, "Mantenimiento de Rutas y
Días de Despacho" en `/oms/rutas-despacho`, **no existe** ni en
`src/router/config.tsx`, ni en `Sidebar`, ni en el árbol de archivos, y es la
precondición declarada para que la Regla 1 tenga de dónde leer.

## Sources

- Recuento de archivos y líneas: barrido transversal sobre `src/` y
  `eslint-rules/`.
- `package.json`, `pnpm-workspace.yaml`, `vite.config.ts`, `tsconfig*.json`,
  `tailwind.config.ts`, `postcss.config.ts`, `eslint.config.ts`,
  `eslint-rules/route-element-jsx.js`, `index.html`, `vite-env.d.ts`.
- `src/router/config.tsx:4`, `src/router/index.ts:14,20-24`.
- `src/main.tsx:10`, `src/App.tsx:65`.
- `src/pages/oms/` (8 archivos, íntegros);
  `src/pages/oms/components/QueueSidePanel.tsx:104`;
  `src/pages/oms/panel/page.tsx:46`.
- `src/pages/devoluciones/page.tsx:69-73,168`;
  `src/pages/guias/page.tsx:45-49`;
  `src/pages/liquidaciones/page.tsx:201,204`;
  `src/pages/rutas/page.tsx:114-134`;
  `src/pages/vehiculos/page.tsx:196,198`.
- `Estandares_Desarrollo_AWS_Intelix.md` §11, §14;
  `PLAN_MODULO_OMS.md` §4, §6.1, §6.2.

## Assumptions & Open Questions

- Los conteos de líneas de los módulos solo revisados en superficie
  (`tiendas`, `paises`, `vehiculos`, `conductores`, `transportistas`,
  `configuracion`, `rutas`, `login`) proceden de inventario por búsqueda, no de
  lectura íntegra del JSX; los patrones internos de esos módulos pueden diferir
  de lo descrito.
- `PedidosDisponibles.tsx` se reporta sin importadores; no se leyó íntegro, así
  que su propósito original queda sin determinar.
