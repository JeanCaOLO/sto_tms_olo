# Evaluación de calidad de código — sto_tms_olo

> Base de conocimiento de ingeniería inversa. Registra el estado observado de
> pruebas, linting, CI/CD, documentación y deuda técnica del repositorio
> `sto_tms_olo` en el momento del escaneo. Es una foto del código tal como
> está, no una recomendación de qué construir.

## Cómo leer esta evaluación

Cada afirmación se sostiene en evidencia leída del repositorio (ficheros de
configuración, scripts de `package.json`, barridos sobre `src/`). Donde una
propiedad **no puede verificarse desde este repositorio** (por ejemplo, la
existencia de un pipeline en un servidor remoto), se marca como inverificable
en lugar de afirmarse. Los niveles de severidad son: **Crítico** (bloquea o
pone en riesgo el módulo OMS que sigue), **Alto**, **Medio**, **Bajo**.

## Resumen ejecutivo

`sto_tms_olo` es una SPA React 19 + TypeScript (Vite 7, pnpm) de aproximadamente
**17.900 líneas** repartidas en **74 ficheros `.tsx` y 5 `.ts`**. El proyecto
prioriza velocidad de entrega sobre red de seguridad: **no existe ninguna
prueba automatizada, el modo estricto de TypeScript está desactivado por
completo, ESLint tiene apagadas casi todas sus reglas y no hay pipeline de CI**.
El código compila y se linta, pero ninguna de las dos comprobaciones ejerce
presión real de calidad. Para un módulo OMS que introducirá cálculo de
prioridad automático sobre datos de pedidos, esta postura es el mayor riesgo
técnico del proyecto: cualquier regresión en la lógica de priorización pasaría
inadvertida.

| Dimensión | Estado | Severidad |
|---|---|---|
| Cobertura de pruebas | 0 pruebas; sin runner ni script de test | Crítico |
| Tipado (TypeScript strict) | `strict: false`, todos los flags estrictos apagados | Alto |
| Linting | Flat config presente, ~11 reglas desactivadas | Alto |
| CI/CD | Sin `.github/`, sin pipeline verificable en repo | Alto |
| Gestión de secretos | `.env` versionado (claves Supabase públicas) | Medio |
| Documentación | Sin `README.md`; docs de negocio ricas en la raíz | Medio |
| Formato | Sin Prettier ni configuración de formato | Bajo |
| Acoplamiento oculto (auto-import) | Globals mágicos vía `unplugin-auto-import` | Medio |

## Pruebas

- **Ficheros de prueba encontrados**: 0. Un barrido sobre `src/` con los
  patrones `*.test.{ts,tsx,js,jsx}` y `*.spec.{ts,tsx,js,jsx}` devuelve cero
  coincidencias.
- **Runner de pruebas**: ausente. No hay `vitest`, `jest`, `@testing-library`
  ni `playwright` en `devDependencies`, y no existe `vitest.config.ts`,
  `jest.config.js` ni `playwright.config.ts`.
- **Script de test**: ausente. `package.json` declara `build`, `dev`, `lint`,
  `preview` y `type-check`, pero **ningún** script `test`.
- **Configuración de cobertura**: ausente (no hay runner que la produzca).

**Severidad: Crítico.** La ausencia total de pruebas significa que el módulo OMS
—cuyo núcleo es un cálculo de prioridad automático de pedidos— nacería sin red
de regresión. Cualquier cambio en la fórmula de priorización, en las consultas
a Supabase o en el mapeo de estados de pedido podría romper el flujo sin señal
alguna. La etapa de construcción del OMS debería establecer una línea base de
pruebas (al menos unitarias sobre la lógica de priorización) antes de tocar el
código de producción.

## Tipado estático (TypeScript)

Evidencia en `tsconfig.app.json`:

- `"strict": false` y, además, **cada flag estricto individual está apagado
  explícitamente**: `noImplicitAny: false`, `strictNullChecks: false`,
  `strictFunctionTypes: false`, `strictBindCallApply: false`,
  `strictPropertyInitialization: false`, `noImplicitThis: false`,
  `useUnknownInCatchVariables: false`, `alwaysStrict: false`.
- `noUnusedLocals: false`, `noUnusedParameters: false`,
  `noFallthroughCasesInSwitch: false` — se toleran variables sin uso y
  fall-through en `switch`.
- Existe el script `type-check` (`tsc --noEmit --project tsconfig.app.json`),
  de modo que el proyecto sí puede validar tipos; pero con el modo estricto
  apagado, esa validación deja pasar `any` implícitos y accesos a `null`/
  `undefined` no comprobados.

**Severidad: Alto.** Con `strictNullChecks` y `noImplicitAny` desactivados,
TypeScript no protege contra la clase de bugs más común en una app orientada a
datos (acceso a campos posiblemente nulos de un registro de pedido, respuestas
de Supabase tipadas como `any`). El cálculo de prioridad del OMS operará sobre
datos externos; sin `strictNullChecks`, un campo ausente se propaga como
`undefined` en silencio.

## Linting

Evidencia en `eslint.config.ts` (flat config, ESLint 9 + `typescript-eslint`):

- La base parte de `js.configs.recommended` y
  `tseslint.configs.recommended`, pero el bloque de reglas del proyecto
  **desactiva la mayoría**: `@typescript-eslint/no-explicit-any: off`,
  `@typescript-eslint/no-unused-vars: off`, `no-unused-vars: off`,
  `prefer-const: off`, `no-case-declarations: off`,
  `no-useless-escape: off`, `no-useless-catch: off`,
  `@typescript-eslint/no-unused-expressions: off`, entre otras.
- Reglas que **sí** están activas: `no-undef: error`,
  `react-refresh/only-export-components: warn`, las reglas recomendadas de
  `react-hooks`, y una **regla local propia** `local-route/route-element-jsx`
  (definida en `eslint-rules/route-element-jsx.js`) aplicada solo a
  `src/router/config.tsx`.
- El script `lint` usa `--max-warnings 0`, lo que es estricto en apariencia,
  pero con casi todas las reglas apagadas el conjunto real de comprobaciones es
  reducido.

**Severidad: Alto.** El linter, tal como está configurado, apenas ejerce
presión sobre la calidad: permite `any` explícito, variables muertas y `const`
mal usado. La regla local para el fichero de rutas es un punto positivo (indica
inversión deliberada en una invariante concreta), pero no compensa el apagado
generalizado.

## CI/CD

- **Pipeline en el repositorio**: ausente. No existe directorio `.github/`
  (por tanto, sin GitHub Actions), ni `.gitlab-ci.yml`, ni configuración de
  otro proveedor visible en la raíz.
- La documentación de la organización (`Estandares_Desarrollo_AWS_Intelix.md`)
  describe estándares de desarrollo sobre AWS, pero **no hay artefacto de
  pipeline versionado en este repositorio** que los materialice.

**Severidad: Alto (parcialmente inverificable).** No puede afirmarse que no
exista CI en absoluto —podría estar configurado fuera del repositorio (por
ejemplo, en la plataforma de despliegue)—, pero **desde este repositorio no es
verificable**. Sin CI que ejecute `type-check` y `lint` en cada cambio, las dos
comprobaciones existentes dependen de que cada desarrollador las lance a mano.

## Gestión de secretos y configuración

- El fichero **`.env` está versionado** en la raíz del repositorio y contiene
  `VITE_PUBLIC_SUPABASE_URL` y `VITE_PUBLIC_SUPABASE_ANON_KEY`.
- Por el prefijo `VITE_PUBLIC_*`, ambos valores están **pensados para
  exponerse en el bundle del navegador** (la anon key de Supabase es una clave
  pública cuya seguridad depende de las políticas RLS, no del secreto).
- No existe `.env.example` que documente las variables esperadas sin filtrar
  valores.

**Severidad: Medio.** La anon key es pública por diseño, así que versionarla no
es un incidente de fuga de credenciales de servidor. Sin embargo, versionar
`.env` es un antipatrón: mezcla configuración de entorno con el código, dificulta
tener valores distintos por entorno y, si en el futuro alguien añade un secreto
real (por ejemplo, una `service_role` key o una clave de Stripe de servidor) al
mismo fichero, quedaría expuesto. La seguridad efectiva de los datos recae
íntegramente en las políticas RLS de Supabase, cuya existencia y contenido son
**inverificables desde este repositorio**.

## Documentación

- **`README.md`**: ausente. No hay documento de entrada que explique cómo
  arrancar, construir o desplegar el proyecto (aunque los scripts de
  `package.json` son autoexplicativos).
- **Documentación de negocio**: rica y presente en la raíz —
  `CONTEXTO_PROYECTO_TMS.md`, `PLAN_MODULO_OMS.md`, `AGENTS.md`,
  `AGENTES_IA_KIRO.md`, `Estandares_Desarrollo_AWS_Intelix.md`. Estos documentos
  describen el dominio TMS, el plan del OMS y los estándares de desarrollo.
- **Comentarios en código**: presencia moderada; el código de dominio es en
  buena medida autodescriptivo por nombres en español, pero sin JSDoc
  sistemático.
- **Advertencia de vigencia**: `CONTEXTO_PROYECTO_TMS.md` §2.4 y
  `PLAN_MODULO_OMS.md` §7.0 están **desactualizados** respecto a los roles del
  OMS: describen un paso de aprobación humana de la propuesta de priorización
  que **ya no existe**. La Adenda del 2026-08-26
  (`knowledge/documents/2026-08-26-reunion-oms-roles.md`) lo deja superado: el
  cálculo de prioridad es **100 % automático** y la única intervención humana
  permitida es alterar puntualmente la prioridad de un pedido concreto (rol
  Responsable del OMS). Quien lea esos documentos como fuente de requisitos
  debe tratar ese punto como obsoleto.

**Severidad: Medio.** La documentación de negocio es una fortaleza inusual; la
ausencia de README es menor. El riesgo real es la contradicción documental
señalada, que debe resolverse en Requirements Analysis y no propagarse a los
requisitos del OMS.

## Formato de código

- **Prettier**: ausente (sin `.prettierrc` ni configuración equivalente).
- No hay regla de formato automatizada; el estilo depende de la disciplina del
  editor y de las reglas de ESLint aún activas.

**Severidad: Bajo.** El formato inconsistente es cosmético y no bloquea el OMS.

## Deuda técnica observada

- **Acoplamiento oculto por auto-import**: `unplugin-auto-import` inyecta como
  globales los hooks de React, las utilidades de `react-router-dom` y las de
  `react-i18next` (ver `vite.config.ts` y la lista `autoImportGlobals` de
  `eslint.config.ts`, además del `auto-imports.d.ts` generado). El código usa
  `useState`, `useNavigate`, `useTranslation`, etc. **sin importarlos**. Esto
  reduce boilerplate pero crea dependencias implícitas: un fichero no declara de
  dónde vienen sus símbolos, lo que dificulta el análisis estático, el
  refactor y la portabilidad fuera de esta configuración de Vite.
- **Código muerto identificado**: el inventario de componentes marca
  `home-dead-code` (módulo de página `home`) como no alcanzable desde el router
  activo.
- **Ruta de datos de siembra en producción**: existe una página `seed`
  (`src/pages/seed/`) inventariada en profundidad; una utilidad de carga de
  datos accesible desde la app es un riesgo si no está protegida por rol/entorno.
- **`.tsx` dominante frente a lógica pura**: con 74 `.tsx` y solo 5 `.ts`, casi
  toda la lógica vive dentro de componentes de UI. La lógica de priorización del
  OMS debería extraerse a módulos `.ts` puros para poder probarla sin montar
  React.
- **Dependencia crítica no comprobada**: el acoplamiento con las políticas RLS
  de Supabase se declara crítico por inferencia (ver `dependencies.md`); no hay
  prueba ni verificación en el repositorio que confirme que el aislamiento por
  `organization_id` se aplica de forma consistente.

## Implicaciones para el módulo OMS

1. **Establecer red de pruebas antes de tocar la priorización.** El cálculo de
   prioridad automático es lógica de negocio con consecuencias operativas
   directas; no debe entrar sin pruebas unitarias.
2. **Extraer la lógica de priorización a `.ts` puro**, fuera de los componentes
   de página, para hacerla testeable y auditable.
3. **Endurecer el tipado al menos en el subárbol del OMS**: activar
   `strictNullChecks` localmente evitaría que un campo de pedido ausente rompa
   el cálculo en silencio.
4. **Documentar y verificar el contrato RLS** del que depende el aislamiento de
   datos por organización antes de exponer nuevas consultas del OMS.

## Sources

- `package.json` — scripts (`build`, `dev`, `lint`, `preview`, `type-check`;
  ausencia de `test`), dependencias y devDependencies (ausencia de runner de
  pruebas).
- `tsconfig.app.json` — `strict: false` y flags estrictos individuales
  desactivados; `noUnusedLocals`/`noUnusedParameters` en `false`.
- `eslint.config.ts` — reglas desactivadas, reglas activas (`no-undef`,
  `react-hooks`, `react-refresh`), regla local `local-route/route-element-jsx`;
  lista `autoImportGlobals`.
- `eslint-rules/route-element-jsx.js` — regla de lint propia (existencia
  inferida del import en `eslint.config.ts`).
- `vite.config.ts` — `unplugin-auto-import` con imports de React, router e
  i18n; `sourcemap: true`, `outDir: "out"`.
- Barrido sobre `src/`: 0 ficheros `*.test.*`/`*.spec.*`; 74 `.tsx` + 5 `.ts`;
  ~17.900 líneas.
- Listado de la raíz — ausencia de `README.md`, ausencia de `.github/`,
  presencia de `.env` versionado; ausencia de `.prettierrc`,
  `vitest.config.ts`, `jest.config.js`, `playwright.config.ts`.
- `.env` — nombres de clave `VITE_PUBLIC_SUPABASE_URL`,
  `VITE_PUBLIC_SUPABASE_ANON_KEY` (valores no reproducidos).
- `aidlc/spaces/default/codekb/sto_tms_olo/component-inventory.md` —
  `home-dead-code`, `seed`, y el resto del inventario de componentes.
- `aidlc/spaces/default/codekb/sto_tms_olo/dependencies.md` — acoplamiento
  crítico con RLS de Supabase declarado por inferencia.
- `CONTEXTO_PROYECTO_TMS.md` §2.4 y `PLAN_MODULO_OMS.md` §7.0 — punto
  documental desactualizado; `knowledge/documents/2026-08-26-reunion-oms-roles.md`
  (Adenda del 2026-08-26) — cálculo 100 % automático, sin aprobación humana.
- `aidlc/spaces/default/memory/org.md` (`## Testing Posture`, `## Code Style`) y
  `aidlc/spaces/default/memory/phases/inception.md` — reglas activas de
  calidad y estilo.

## Assumptions & Open Questions

- **CI inverificable**: no se puede afirmar que no exista ningún pipeline; solo
  que **no hay artefacto de CI versionado en este repositorio**. Un pipeline
  configurado en la plataforma de despliegue quedaría fuera del alcance de este
  escaneo.
- **Políticas RLS de Supabase inverificables**: la seguridad efectiva de los
  datos depende de RLS, cuya existencia y contenido no son legibles desde este
  repositorio. El riesgo de aislamiento por `organization_id` se declara por
  inferencia.
- **Sin auditoría de vulnerabilidades**: no se ejecutó `pnpm audit` ni
  equivalente, por lo que no hay lectura sobre CVE conocidos en el árbol de
  dependencias instalado.
- **Comentarios en código evaluados de forma cualitativa**: la valoración de la
  calidad de los comentarios es una impresión de barrido, no una métrica.
