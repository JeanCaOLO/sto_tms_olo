# Stack tecnológico — STO / TMS OLO

> Lenguajes, frameworks y librerías con las versiones **resueltas** en
> `pnpm-lock.yaml` (`lockfileVersion: '9.0'`, `autoInstallPeers: true`) al
> 2026-08-27. Cuando el `specifier` de `package.json` y la versión instalada
> difieren, se indican ambos.

## Lenguajes y runtime

| Elemento | Versión | Notas |
|---|---|---|
| TypeScript | `~5.8.3` → **5.8.3** | En modo `noEmit`: solo type-check; la transpilación la hace SWC |
| TSX / JSX | `jsx: react-jsx` | `target: ES2022`, `moduleResolution: bundler` |
| CSS | Tailwind CSS 3 vía PostCSS | Sin tokens propios |
| Gestor de paquetes | pnpm, lockfile **9.0** | `pnpm-workspace.yaml` sin `packages:` |
| Entorno de ejecución | Navegador | No hay runtime de servidor en el repositorio |

## Dependencias de producción

| Nombre | Specifier | Resuelta | Propósito | ¿Usada en `src/`? |
|---|---|---|---|---|
| `react` | `^19.1.0` | **19.2.8** | Framework UI | Sí |
| `react-dom` | `^19.1.0` | **19.2.8** | Renderer DOM | Sí (`src/main.tsx`) |
| `react-router-dom` | `^7.6.3` | **7.18.2** | Enrutado SPA | Sí (`src/router/`, `src/App.tsx`) |
| `@supabase/supabase-js` | `2.57.4` | **2.57.4** | BaaS: PostgREST más Auth | Sí — **única capa de datos** |
| `i18next` | `25.4.1` | **25.4.1** | Motor i18n | Solo en `src/i18n/index.ts` |
| `react-i18next` | `^15.6.0` | **15.7.4** | Binding React de i18n | Solo en `src/i18n/index.ts` |
| `i18next-browser-languagedetector` | `^8.2.0` | **8.2.1** | Detección de idioma | Solo en `src/i18n/index.ts` |
| `recharts` | `3.2.0` | **3.2.0** | Gráficos | **NO — cero imports** |
| `date-fns` | `^4.1.0` | **4.4.0** | Utilidades de fecha | **NO — cero imports** |
| `firebase` | `12.0.0` | **12.0.0** | SDK Firebase | **NO — cero imports** |
| `@stripe/react-stripe-js` | `4.0.2` | **4.0.2** (más `@stripe/stripe-js@7.9.0` transitiva) | Pagos | **NO — cero imports** |

**Cuatro dependencias de producción instaladas y jamás importadas**: `recharts`,
`date-fns`, `firebase` y `@stripe/react-stripe-js`. `firebase` además figura en
`onlyBuiltDependencies` de `pnpm-workspace.yaml`, así que ejecuta scripts de
build en cada instalación. El caso más llamativo es `recharts`: está instalado y
los 4 gráficos de Reportes están hechos a mano con elementos HTML y Tailwind.

## Dependencias de desarrollo

| Nombre | Specifier | Resuelta |
|---|---|---|
| `vite` | `^7.0.3` | **7.3.6** |
| `@vitejs/plugin-react-swc` | `^3.10.2` | **3.11.0** |
| `typescript` | `~5.8.3` | **5.8.3** |
| `typescript-eslint` | `^8.35.1` | **8.67.0** |
| `eslint` | `^9.30.1` | **9.39.5** |
| `@eslint/js` | `^9.30.1` | **9.39.5** |
| `eslint-plugin-react-hooks` | `^5.2.0` | **5.2.0** |
| `eslint-plugin-react-refresh` | `^0.4.20` | **0.4.26** |
| `globals` | `^16.3.0` | **16.5.0** |
| `jiti` | `^2.6.1` | **2.7.0** |
| `tailwindcss` | `^3.4.17` | **3.4.19** |
| `postcss` | `^8.5.6` | **8.5.26** |
| `autoprefixer` | `^10.4.21` | **10.5.4** |
| `unplugin-auto-import` | `^19.3.0` | — |
| `@types/react` | `^19.1.8` | **19.2.18** |
| `@types/react-dom` | `^19.1.6` | **19.2.4** |
| `source-map` | `^0.7.6` | **0.7.6** — sin uso aparente |

## Sistema de build

**Cadena efectiva**: `pnpm install` → `vite build`. SWC transpila el TSX;
PostCSS con Tailwind procesa `src/index.css`; la salida va a `out/` con
sourcemaps.

`type-check` y `lint` son pasos **separados y no encadenados a `build`**:
`vite build` **no falla** ante errores de tipo ni de lint. Como tampoco hay CI,
nada obliga a ejecutarlos.

Scripts de `package.json`:

| Script | Comando |
|---|---|
| `dev` | `vite` |
| `build` | `vite build` |
| `lint` | `eslint src --ext ts,tsx --report-unused-disable-directives --max-warnings 0` |
| `preview` | `vite preview` |
| `type-check` | `tsc --noEmit --project tsconfig.app.json` |

**No existe script `test`.**

## Configuración de build

| Archivo | Contenido relevante |
|---|---|
| `vite.config.ts` | `base` desde `BASE_PATH`; `build.outDir: "out"`, `build.sourcemap: true`; `server.port: 3000`, `server.host: "0.0.0.0"`; alias `@` → `./src`; `unplugin-auto-import` con 24 símbolos de `react`, 8 de `react-router-dom` y 2 de `react-i18next`, `dts: true`; 5 constantes `define` |
| `tsconfig.json` | Raíz con `files: []` y `references` a los dos proyectos hijos |
| `tsconfig.app.json` | `target: ES2022`, `moduleResolution: bundler`, `jsx: react-jsx`, `paths: {"@/*": ["./src/*"]}`; **`strict: false`** y 10 flags de rigor apagados |
| `tsconfig.node.json` | **`strict: true`**; cubre solo `vite.config.ts` — asimetría deliberada |
| `tailwind.config.ts` | `content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]`; `theme.extend: {}` vacío; `plugins: []` — **cero tokens propios**, paleta 100 % Tailwind por defecto |
| `postcss.config.ts` | `tailwindcss` más `autoprefixer` |
| `eslint.config.ts` | Flat config, ejecutado vía `jiti` |
| `eslint-rules/route-element-jsx.js` | Plugin ESM local |
| `auto-imports.d.ts` | **Generado** por `unplugin-auto-import`; presente en el árbol pero listado en `.gitignore` |
| `index.html` | `lang="es"`, título `STO - Sistema de Transportes OLO`, `<link>` externo a `remixicon@4.1.0` desde `cdn.jsdelivr.net` |
| `vite-env.d.ts` | Declara las 5 constantes `define` |
| `pnpm-workspace.yaml` | Sin `packages:`; solo `allowBuilds` / `onlyBuiltDependencies` (`@firebase/util`, `@swc/core`, `esbuild`, `protobufjs`) |
| `.mcp.json` | 5 servidores MCP (`context7` por HTTP más `aws-mcp`, `aws-pricing`, `aws-iac`, `aws-serverless` vía `uvx`) — andamiaje de tooling, **no** dependencia de la aplicación |

**Los 10 flags de rigor apagados** en `tsconfig.app.json`: `noImplicitAny`,
`strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`,
`strictPropertyInitialization`, `noImplicitThis`, `useUnknownInCatchVariables`,
`alwaysStrict`, `noUnusedLocals`, `noUnusedParameters`.

**Las 5 constantes `define`**: `__BASE_PATH__`, `__IS_PREVIEW__`,
`__READDY_PROJECT_ID__`, `__READDY_VERSION_ID__`, `__READDY_AI_DOMAIN__`. Las
tres `__READDY_*` son provenance del generador que produjo el andamiaje inicial.

## Variables de entorno

| Variable | Consumidor | Notas |
|---|---|---|
| `VITE_PUBLIC_SUPABASE_URL` | `src/lib/supabase.ts` | Obligatoria; `throw` a nivel de módulo si falta |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase.ts` | Obligatoria; `throw` a nivel de módulo si falta |
| `BASE_PATH` | `vite.config.ts` | Prefijo de despliegue |

`.env` está **versionado en git** (`.gitignore` solo excluye `.env.local` y
`.env.*.local`) y **no existe `.env.example`**. La clave *anon* de Supabase es
publicable por diseño, pero el detalle se trata como riesgo en
`code-quality-assessment.md`.

## Assets externos no versionados

**Remix Icon 4.1.0** por CDN de `cdn.jsdelivr.net`, cargado con un `<link>` en
`index.html`. Es la **única iconografía del proyecto** —las clases `ri-*`
aparecen en las 26 páginas— y **no está en `package.json`**. Una caída del CDN
deja la aplicación sin iconos.

**Google Maps** se usa solo como enlace profundo (`href` a
`maps.google.com/maps?q=...`), no como SDK ni como API.

## Ausencias notables

| Ausencia | Contra qué contrasta |
|---|---|
| **Sin Prettier** instalado, sin `.prettierrc`, sin `.editorconfig` | `org.md` → `## Code Style` y `Estandares_Desarrollo_AWS_Intelix.md` §11 y §14 lo declaran obligatorio |
| **Sin `axios`** ni gateway HTTP centralizado | El `axiosApiGateway` del estándar §11 no existe en el repositorio |
| **Sin librería de mapas** (Leaflet, Mapbox, SDK de Google Maps) | Hay un módulo Tracking con un componente llamado `MapView` |
| **Sin gestión de estado ni data-fetching** (React Query, SWR, Zustand, Redux) | 26 páginas gestionan estado servidor a mano con `useState` y `useEffect` |
| **Sin validación de esquemas** (`zod`, `yup`) | La validación de CSV está escrita a mano en `CsvImportModal` |
| **Sin framework de pruebas** (Vitest, Jest, Testing Library, Playwright, Cypress) | `org.md` → `## Testing Posture` exige un piso del 80 % de cobertura de línea y ejecución en CI para el scope `classic` |
| **Sin infraestructura como código** (SAM, CDK, CloudFormation, Amplify) | El estándar §11 exige justificar Amplify frente a ECS y §14 exige changeset revisado |
| **Sin CI/CD** (`.github/`, `.gitlab-ci.yml`, `buildspec.yml`, `Jenkinsfile`, `azure-pipelines.yml`, `.husky/`) | `org.md` → `## Deployment` describe deploy on merge a staging |

## Divergencia con la plataforma objetivo

Tres destinos tecnológicos distintos conviven en la documentación y en el
código, y **ninguno está conciliado en un artefacto del repositorio**:

| Fuente | Plataforma prescrita |
|---|---|
| Código actual | **Supabase gestionado** — PostgREST más Auth, acceso desde el navegador |
| `CONTEXTO_PROYECTO_TMS.md` §3 | **PostgreSQL propio sobre Docker en servidor propio**, esquema generado por agente, todo por PR |
| `Estandares_Desarrollo_AWS_Intelix.md` §11-§15 | **Serverless-first sobre AWS con SAM**, `axiosApiGateway`, arquitectura hexagonal, pruebas contra puertos con fakes |

La distancia entre el repositorio y cualquiera de los dos destinos es grande y
no está planificada.

## Sources

- `package.json` — specifiers y scripts.
- `pnpm-lock.yaml`, bloque `importers:` completo — versiones resueltas.
- `pnpm-workspace.yaml` — ausencia de `packages:`, `allowBuilds`,
  `onlyBuiltDependencies`.
- `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`,
  `tailwind.config.ts`, `postcss.config.ts`, `eslint.config.ts`,
  `eslint-rules/route-element-jsx.js`, `index.html`, `vite-env.d.ts`,
  `auto-imports.d.ts`, `.gitignore`, `.mcp.json`.
- `src/lib/supabase.ts` — variables de entorno obligatorias.
- Barrido transversal: usos reales de `recharts`, `date-fns`, `firebase` y
  `stripe` en `src/`.
- `CONTEXTO_PROYECTO_TMS.md` §3;
  `Estandares_Desarrollo_AWS_Intelix.md` §11-§15;
  `aidlc/spaces/default/memory/org.md` → `## Code Style`, `## Testing Posture`,
  `## Deployment`.

## Assumptions & Open Questions

- La versión resuelta de `unplugin-auto-import` no se registró desde el bloque
  `importers:`; solo consta el specifier `^19.3.0`.
- `source-map@0.7.6` figura como dependencia de desarrollo sin uso aparente; no
  se determinó si alguna herramienta la consume de forma indirecta.
- El bloque de `pnpm-lock.yaml` fuera de `importers:` (133 KB) no se revisó, así
  que el árbol transitivo completo no está inventariado.
