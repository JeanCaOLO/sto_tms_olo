# 🤝 Handoff de sesión — TMS OLO / Planificación de Rutas

**Para quien retome esto (yo mismo en una sesión nueva, u otro dev):** este documento resume TODA la sesión de trabajo de Jesús Araujo del **2026-08-11 al 2026-08-12** en la rama `jesus-planificacion`. Léelo de arriba a abajo antes de tocar nada — evita repetir investigación/errores ya resueltos aquí.

Documentos hermanos que también debes leer:
- **`MOCKING.md`** (raíz del repo) — qué está mockeado, por qué, y cómo quitarlo. Es la fuente de verdad del estado "no conectado a DB real".
- **`docs/decisions/0001-route-planning-safety-margin-and-optimization.md`** — investigación real (con fuentes) sobre márgenes de seguridad de carga y qué construir después. Backlog priorizado ahí.
- **`docs/work/2026-08/*.md`** — bitácora de cada cambio significativo (formato: qué/por qué/cómo).

---

## 1. Quién es el usuario y contexto de negocio

Jesús Araujo, desarrollador en el equipo de TMS OLO (Transportes OLO), un TMS para logística de última milla en **Costa Rica y Venezuela** (almacenes Cliro en CR, San Diego/Micheleana en VE). Proyecto liderado por Jean Carlo (Intelix), con Dylan (Liquidación/Tarifas), Eduardo (OMS) y Andrey (SRO) como otros devs, cada uno en su propia rama.

**A Jesús le asignaron el módulo de Planificación de Rutas** — construir un sistema que tome pedidos pendientes, los agrupe en rutas, asigne transportista/conductor/vehículo, y calcule el orden óptimo de entrega minimizando distancia/combustible. Es el módulo más complejo del proyecto según el propio equipo.

Toda la coordinación del equipo (reuniones, decisiones, estándares AWS de la organización) está documentada en **Notion**, bajo el workspace de Jesús, dentro de la página **INTELIX**:
- `TMS OLO — Documentación del Proyecto` (página principal del proyecto)
  - `Reunión 2026-06-25 — Kickoff...`
  - `Reunión 2026-07-20 — Arquitectura de base de datos y agentes IA`
  - `Reunión 2026-08-10 — Planificación de Rutas (detalle del módulo de Jesús)`
  - `Reunión 2026-08-11 — Organización del equipo, módulos y estrategia de agentes`
  - `Preguntas pendientes para iniciar desarrollo`
  - `Dudas para iniciar el prototipo de Planificación de Rutas` (con respuestas reales de Jean Carlo)
- `Conocimiento General / Estándares Intelix` (hub aparte, no específico de TMS OLO)
  - `Estándares de Arquitectura Intelix/AWS (AIDLC, IaC, Serverless) — 2026-07-22`
  - `Kiro — Visión/Roadmap, AIDLC v2 y AIDLC Colab — Sesión 2026-08-07`

**Bloqueo real de negocio, no resuelto todavía:** la base de datos Supabase de este proyecto es **compartida por todo el equipo** en modo desarrollo, y no hay login que funcione para Jesús (los accesos demo no son cuentas reales; crear una requiere que un Admin ya existente lo dé de alta, y no hay ninguno disponible). Por eso casi todo el trabajo de esta sesión corre en **modo mock** (ver sección 4).

---

## 2. Línea de tiempo de la sesión (con fechas/horas reales de los commits)

| Cuándo | Qué pasó |
|---|---|
| **2026-08-11 (temprano)** | `git fetch`. Se instaló **Graphify** y se construyó un grafo de conocimiento del repo (`graphify-out/`, no relevante para el trabajo diario). |
| **2026-08-11** | Se documentaron en Notion 3 reuniones previas (transcripciones de audio pegadas por Jesús) + la sesión de estándares AWS de Javier + la sesión de Kiro/AIDLC v2 de Andrés. Se creó el hub `Conocimiento General / Estándares Intelix` para separar contenido transversal de contenido específico de TMS OLO. |
| **2026-08-11 10:44** | Se creó la rama `jesus-planificacion`. Se instaló el framework de subagentes **crew-kiro** (17 agentes, hooks de calidad de código, `crew.json`) desde un clon local en `crew-kiro`, más el steering `ponytail.md` (modo "lazy senior dev"). |
| **2026-08-11 10:48** | Se investigó y se decidió instalar 4 plugins de **wshobson/agents** (marketplace de Claude Code): `javascript-typescript`, `database-design`, `backend-api-security`, `cloud-infrastructure` — no el marketplace completo (94 plugins era demasiado). |
| **2026-08-11 12:08** | **Primer prototipo de planificación de rutas** (`src/lib/routePlanning/`): motor standalone con distancia driving (Google Maps API, con fallback haversine), ventanas horarias 8am-7pm, validación de capacidad. Basado en respuestas reales de Jean Carlo a preguntas de investigación (documentadas en Notion). Se cambió el gestor de paquetes de npm a **pnpm**. |
| **2026-08-11 12:40** | **Bug de login resuelto con mock**: se intentó crear un usuario real (`jaraujo@intelix.biz`) vía signUp + confirmación de correo, pero el insert en `app_users` sigue bloqueado por RLS (necesita ya ser Admin para crear usuarios — círculo vicioso). Se implementó **`VITE_MOCK_AUTH`** para saltar el login en desarrollo. Se descubrió que `route_types` tiene RLS más estricto que el resto de catálogos → se agregó fallback. |
| **2026-08-12 09:27** | **Rediseño visual completo** delegado a un subagente (`crew:frontend-architect`) investigando Onfleet/Routific/Circuit para inspiración. Se creó el generador de rutas mock (`generar-ruta-mock.ts` + `localStorage`) y la pestaña "Rutas Generadas". Se escribió `MOCKING.md`. |
| **2026-08-12 09:47** | El usuario reportó: scroll feo del sidebar, "no veo cambios grandes", falta mostrar capacidad del vehículo. Se encontraron **bugs reales** (no solo estéticos): columnas `capacity_weight`/`capacity_volume` de la BD no coincidían con lo que asumía el código (`capacity_kg`/`capacity_m3`) — la barra de capacidad nunca funcionó con datos reales. Se arregló + se dividió `Sidebar.tsx` (excedía el límite de líneas). |
| **2026-08-12 10:10** | Se implementó el algoritmo de **capacidad (bin-packing)** (`capacity-fit.ts`) con un margen de seguridad **inventado por el usuario** (93%) más la función de **"pedidos ancla"** (pin pedidos que sí o sí deben ir en el viaje). |
| **2026-08-12 10:33** | El usuario pidió investigación real (no más números inventados) + repasar qué hacen otros TMS. Se lanzó un subagente investigador (`crew:researcher`) con web search real → **`docs/decisions/0001-...md`**. Hallazgo clave: 93% no tiene respaldo; el margen real debe ser **85% peso / 95% volumen** (peso es restricción legal/seguridad, volumen es solo espacio). Se aplicó el cambio. |
| **2026-08-12 10:56** | Usuario reportó 3 cosas más: bug de anclas que persisten entre rutas, pidió eliminar TODAS las alertas nativas del navegador (`alert()`), y pidió seguir con el ítem #1 del backlog de la investigación (**reparto multi-vehículo**). Se arregló el bug, se construyó un sistema de **toast propio** (`useToast`), se agregó validación de capacidad al momento de anclar (no solo al optimizar), y se implementó la pestaña **"Reparto de Flota"** — reparte un pool de pedidos entre varios vehículos a la vez. Todo probado en vivo en el navegador con casos reales. |

**Todos los commits anteriores a este punto ya están hechos** (ver `git log`) — el usuario o un hook los fue confirmando en el camino. Verificar `git status` al retomar por si hay cambios sin commitear de la última interacción.

---

## 3. Cómo funciona el repo (arquitectura)

- **Stack:** React 19 + TypeScript + Vite 7 + Tailwind CSS 3 + react-router-dom 7. Backend: Supabase (Postgres + Auth + RLS). Gestor de paquetes: **pnpm** (no npm — hay `pnpm-lock.yaml` y `pnpm-workspace.yaml`, borrar cualquier `package-lock.json` si reaparece).
- **Arrancar:** `pnpm install` luego `pnpm dev` (sirve en `:3000`, ver `vite.config.ts`). `pnpm lint`, `pnpm type-check` para verificar.
- **Env:** `.env` (committeado, con credenciales reales de Supabase — preexistente, no tocado) + `.env.local` (NO committeado, tiene `VITE_MOCK_AUTH="true"` — ver sección 4).
- **Router:** páginas en `src/pages/<modulo>/page.tsx`, definidas en `src/router.tsx` (o similar, no modificado esta sesión).
- **Layout global:** `src/App.tsx` (shell + providers), `src/components/feature/Sidebar.tsx` + `Header.tsx`. Contextos globales en `src/hooks/`: `useAuth.tsx` (sesión), `useSidebar.tsx` (colapso/drawer del sidebar, nuevo esta sesión), `useToast.tsx` (notificaciones, nuevo esta sesión).
- **Componentes base reutilizables:** `src/components/base/` (`Card`, `Button`, `Badge`, `Input`, `Select`, `ToastStack` nuevo).

### Estándar de calidad de código (crew, hooks automáticos)

Instalado en `.kiro/`, `hooks/`, `crew.json`, documentado en `standards/code-quality.md`. **Se hace cumplir automáticamente al escribir archivos** (bloquea el `Write`/`Edit` si se viola):

| Tipo de archivo | Límite de líneas |
|---|---|
| Página (`pages/**`) | 200 |
| Hook (`use-*.ts`/`useX.tsx`) | 80 |
| Componente (`.tsx` con mayúscula inicial) | 150 |
| Módulo genérico | 200 |

**Regla aprendida esta sesión, importante:** cuando el hook bloquea por exceso de línea, **la instrucción explícita del usuario es dividir el archivo en más piezas, NUNCA escribir una excepción en `docs/DEVIATIONS.md`**. Ya pasó 3 veces (Sidebar.tsx, planificacion/page.tsx, use-pedidos-ruta.ts) y siempre se resolvió extrayendo lógica a archivos nuevos (hooks más chicos, componentes más chicos, módulos de datos separados de hooks de estado).

También activo: **Ponytail** (`.kiro/steering/ponytail.md`) — modo "lazy senior dev": no sobre-construir, reusar antes que escribir, YAGNI, comentarios `ponytail:` marcando simplificaciones deliberadas con su techo/upgrade path (usados varias veces en esta sesión, ej. en `capacity-fit.ts`, `optimize-stops.ts`, `fleet-split.ts`).

---

## 4. Estado MOCK — leer `MOCKING.md` para el detalle completo

Resumen rápido:

1. **Login:** `VITE_MOCK_AUTH="true"` en `.env.local` (tuyo, local, no compartido) hace que `useAuth.tsx` inyecte una sesión falsa (SuperUsuario, organización real "Transportes OLO" `11111111-1111-1111-1111-111111111111`) sin tocar Supabase Auth. Ver `src/lib/mock-auth.ts`.
2. **Catálogo de rutas (`route_types`):** RLS bloquea lectura anónima → `src/pages/planificacion/fallback-rutas.ts` tiene 5 rutas con nombres reales (2 con IDs reales que alguna vez tuvieron pedidos, 3 sintéticas).
3. **Pedidos por ruta:** la tabla `orders` real está en **0 pedidos `pending`** en todo el proyecto (se agotaron por uso del equipo) → `src/pages/planificacion/fallback-pedidos.ts` genera 8 pedidos sintéticos con direcciones reales del GAM (Costa Rica), siempre los mismos, para cualquier ruta.
4. **Generación de rutas (escritura):** Supabase RLS bloquea cualquier `insert` sin sesión real → `src/pages/planificacion/generar-ruta-mock.ts` + `src/lib/mock-store.ts` (localStorage) simulan la escritura. Ver pestaña "Rutas Generadas" en la UI.

**Todo lo mock está diseñado para desactivarse solo** cuando la condición real cambie (ej. `pedidos-api.ts` usa el fallback solo si la query real devuelve 0 filas) — no hace falta "apagar" nada a mano salvo `VITE_MOCK_AUTH`.

---

## 5. Mapa completo del módulo de Planificación (`src/pages/planificacion/`)

### Lógica de datos / algoritmos (sin JSX)
- `types.ts` — tipos compartidos (`Pedido`, `PedidoSeleccionado`, `Vehiculo`, `Conductor`, `Transportista`, `RutaTipo`). **Ojo:** `Vehiculo.capacity_weight`/`capacity_volume` son los nombres reales de columna (no `capacity_kg`/`capacity_m3`).
- `catalogos-api.ts` / `use-catalogos.ts` — carga rutas/vehículos/transportistas/conductores.
- `pedidos-api.ts` / `use-pedidos-ruta.ts` — carga pedidos de una ruta, maneja selección/inclusión/exclusión manual, `pedidosAnclados` NO vive aquí (ver abajo).
- `use-pedidos-anclados.ts` — set de IDs de pedidos "anclados" (pin, sí o sí van en el viaje).
- `optimize-stops.ts` — algoritmo nearest-neighbor de orden de paradas (distancia euclidiana simple; el prototipo más avanzado con distancia real está en `src/lib/routePlanning/`, sin fusionar todavía).
- `capacity-fit.ts` — **bin-packing greedy** (first-fit-decreasing) que decide qué pedidos caben en un vehículo. Márgenes de seguridad: `WEIGHT_SAFETY_MARGIN = 0.85`, `VOLUME_SAFETY_MARGIN = 0.95` (investigados, con fuentes en el ADR 0001). Soporta pedidos anclados (van primero) y expone `excedeCapacidadAlAnclar` para bloquear el pin si no cabe.
- `fleet-split.ts` — reparte un pool de pedidos entre **varios vehículos a la vez** (llena el de mayor capacidad primero, reutiliza `capacity-fit.ts` por vehículo). Nuevo 2026-08-12.
- `use-flota-split.ts` / `use-generar-flota.ts` — estado y generación de rutas para el reparto de flota.
- `generar-ruta-api.ts` (escritura real a Supabase, no usado mientras `VITE_MOCK_AUTH=true`) / `generar-ruta-mock.ts` (escritura mock) / `use-generar-ruta.ts` (decide cuál usar).
- `use-rutas-generadas.ts` — lee las rutas generadas (mock, de localStorage) para la pestaña "Rutas Generadas".
- `fallback-rutas.ts`, `fallback-pedidos.ts` — datos sintéticos (ver sección 4).
- `route-status.ts` — badge visual "Hoy/Programada/Completada" derivado de la fecha (no persistido).

### UI (`components/`)
- `page.tsx` — orquestador de 3 pestañas: **Nueva Ruta**, **Reparto de Flota**, **Rutas Generadas**.
- `NuevaRutaTab.tsx` — flujo de 1 vehículo a la vez (el original).
- `FlotaSplitTab.tsx` + `FlotaSlotPicker.tsx` + `FlotaResultadoPreview.tsx` — flujo de reparto multi-vehículo (nuevo).
- `ConfiguracionRuta.tsx` + `RouteConfigForm.tsx` + `CapacityBar.tsx` — formulario de config + barra de capacidad peso/volumen.
- `PedidosRuta.tsx` + `PedidoCard.tsx` + `StopBadge.tsx` — lista de pedidos disponibles/excluidos/anclados.
- `RutaEnConstruccion.tsx` + `ParadaCard.tsx` — timeline de paradas de la ruta en construcción (drag & drop para reordenar).
- `RutasGeneradas.tsx` + `RutaGeneradaCard.tsx` + `StopMiniPreview.tsx` — listado de rutas ya generadas (mock).
- `PedidosDisponibles.tsx` — **código muerto, no se usa en ningún lado** (detectado, dejado tal cual, fuera de alcance tocarlo).

### Fuera del módulo pero relacionado
- `src/lib/routePlanning/` — prototipo más avanzado (distancia real por Google Maps, ventanas horarias) que **todavía no está conectado a la UI activa**. Es el ítem #2 y #5 del backlog del ADR.
- `src/hooks/useSidebar.tsx`, `useToast.tsx` — contextos globales nuevos, usados por toda la app, no solo Planificación.
- `src/components/feature/Sidebar.tsx` + `SidebarNavGroup.tsx` + `SidebarNavLink.tsx` + `sidebar-nav-items.ts` — sidebar dividido para respetar el límite de líneas, ahora responsive (drawer en móvil, colapsable en desktop, scrollbar oscuro).

---

## 6. Backlog abierto (priorizado, con fuentes — ver ADR 0001 para el detalle)

- [x] ~~1. Reparto multi-vehículo~~ — hecho 2026-08-12.
- [ ] 2. Ventanas horarias por parada — **ya prototipado** en `src/lib/routePlanning/`, falta fusionar a la UI activa.
- [ ] 3. Límites de horas de turno del conductor.
- [ ] 4. Clustering geográfico como paso previo al reparto multi-vehículo.
- [ ] 5. Distancia real por carretera (Google Maps) — **ya prototipado**, falta fusionar.
- [ ] 6. Match de tipo de vehículo (moto vs. camión, frágil, refrigerado).
- [ ] 7. Trade-off costo/combustible vs. tiempo.

Otros pendientes sueltos:
- Fleet split no exige transportista por vehículo (solo conductor opcional) — simplificación conocida.
- Coordenadas de clientes de Venezuela en IPRAC — pendiente de confirmación de Toño (dato de negocio, no técnico).
- Catálogo real de capacidad de vehículos — Jean Carlo iba a conseguirlo (puede que ya no haga falta, `capacity_weight`/`capacity_volume` sí existen y tienen datos reales).

---

## 7. Cómo seguir trabajando (checklist para la próxima sesión)

1. Lee este archivo completo, `MOCKING.md`, y el ADR 0001.
2. `git status` y `git log --oneline -5` para confirmar que no hay nada pendiente de la sesión anterior.
3. `pnpm install` si es una máquina nueva o pasó tiempo; confirma que tu `.env.local` tiene `VITE_MOCK_AUTH="true"`.
4. `pnpm dev`, abre `/planificacion`, prueba las 3 pestañas para confirmar que todo sigue funcionando antes de agregar nada nuevo.
5. Si vas a tocar un archivo que ya está cerca de su límite de líneas, divide primero — no pidas excepción en DEVIATIONS.md salvo que el usuario lo pida explícitamente.
6. Cualquier alerta al usuario debe ser un toast (`useToast`), nunca `alert()`/`confirm()` nativos.
7. Si agregas más datos mock, documéntalo en `MOCKING.md` (agrega una fila a la tabla).
8. Cambios significativos → una entrada nueva en `docs/work/YYYY-MM/YYYY-MM-DD-slug.md` (qué/por qué/cómo/conocimiento promovido/pendientes).
