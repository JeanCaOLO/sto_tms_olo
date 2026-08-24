# Plan de Construcción — Módulo OMS (Order Management System)

> Documento de planificación (fase de **Levantamiento + Discovery**, metodología AI/DLC — ver
> `Estandares_Desarrollo_AWS_Intelix.md` §2). Sin código todavía: este archivo es el artefacto
> versionado a validar con el equipo antes de generar historias de usuario y empezar a construir.
> Dueño del módulo: **Eduardo** (ver `CONTEXTO_PROYECTO_TMS.md` §2 y §5.1).
> Última actualización: 2026-08-24 (incorpora la reunión de trabajo del OMS — ver
> `CONTEXTO_PROYECTO_TMS.md` §2.4).

---

## 1. Qué es (y qué no es) el OMS de este proyecto

El nombre "OMS" en el mercado normalmente describe un sistema que cubre *todo* el ciclo del
pedido: captura, verificación de inventario, orquestación de fulfillment multi-bodega y
devoluciones (ver [SPS Commerce — OMS Guide](https://www.spxcommerce.com/blog/order-management-system-oms-guide/),
[Kibo Commerce — Best OMS 2026](https://kibocommerce.com/blog/best-order-management-systems/)).
**Ese no es el alcance aquí.** Según el kickoff (`CONTEXTO_PROYECTO_TMS.md` §2), el OMS de OLO
tiene un trabajo mucho más acotado:

> "Prioriza pedidos por reglas de negocio (no FIFO)."

**Corrección importante (reunión de trabajo del OMS — ver `CONTEXTO_PROYECTO_TMS.md` §2.4):** el
OMS no se posiciona *después* del módulo Pedidos, como se había asumido al escribir la primera
versión de este documento — se posiciona **antes**, entre el WMS/Torre de Control y el lago de
datos. El WMS genera el pedido y el viaje; el OMS toma eso y, aplicando reglas, **inserta el
pedido en el lago de datos ya con su prioridad calculada**. El módulo Pedidos (el catálogo/
listado ya construido en `src/pages/pedidos/page.tsx`) muestra pedidos que, en el flujo
objetivo, ya pasaron por el OMS — no al revés.

Además, en esa misma reunión se definió que **el OMS no se va a considerar un módulo del TMS**:
se le llamó explícitamente **"satélite"** — interviene en el flujo de datos de origen y le
entrega insumos al TMS (la prioridad ya calculada), pero **el TMS no depende de él para
funcionar**: sin OMS, los pedidos y los viajes van a seguir existiendo igual, solo que sin la
priorización inteligente. Sigue siendo, como se dijo desde el kickoff, un **"mini-proyecto
dentro del proyecto"** — pero ahora con una definición más precisa de dónde vive.

El trabajo del OMS es decidir, con reglas de negocio concretas (no FIFO), **cuándo un pedido
debe mandarse a alistar** — ni antes de lo necesario (para no saturar el muelle de despacho con
mercancía que va a esperar ahí varios días) ni después (para no perder el viaje de su ruta).
Esto es una capa distinta de la que resuelve Planificación (secuencia física de entrega por
ruta/distancia) y no se deben mezclar:

| Capa | Módulo/pieza | Pregunta que responde | Entrada | Salida |
|---|---|---|---|---|
| Negocio / prioridad | **OMS** (este documento, satélite — no módulo TMS) | ¿Cuándo debe alistarse un pedido y con qué prioridad, según reglas de negocio (fecha de despacho + día de salida de su ruta, prioridad por línea, urgencias manuales, etc.)? | Pedido + viaje generados por el WMS/Torre de Control | Pedido insertado en el lago de datos, ya con `priority_score`/`priority_tier` y con la fecha en la que debe mandarse a alistar |
| Geográfica / logística | **Planificación** (Jesús — sí es módulo TMS) | Dado ya un pedido priorizado y asignado a ruta/transportista/vehículo/fecha, ¿en qué secuencia física se entregan para minimizar distancia/combustible? | Pedidos ya priorizados por el OMS, que viven en el lago de datos | Orden de parada por ruta (consumido por Tracking) |

### Fuera de alcance del OMS (para no duplicar otros módulos)

- **No** decide a qué ruta pertenece un pedido — eso ya viene dado por la relación cliente↔ruta
  existente (ver §2.4 del contexto). El OMS solo **usa** el día de salida ya conocido de esa
  ruta para decidir *cuándo* mandar a alistar el pedido; no decide la ruta en sí.
- **No** asigna transportista/vehículo/conductor, ni calcula la secuencia de paradas — eso es de
  **Planificación**.
- **No** genera la guía de despacho — la genera **EPRAC** (módulo Guías de Despacho).
- **No** hace inventario/disponibilidad de bodega en el sentido clásico de OMS de e-commerce —
  el pedido ya llega "picking-ready" desde WMS/EPRAC.
- **No** reemplaza al WMS/Torre de Control (que sigue generando el pedido y el viaje) — el OMS
  es la capa que se inserta justo después de eso y antes del lago de datos.
- **No** calcula tarifas/costos — eso es de **Liquidación** (Dylan), aunque el patrón de "motor
  de reglas configurable" que pide Ignacio/Mayoreo para tarifas (§2.3 del contexto) es
  conceptualmente el mismo patrón de UI que necesita el OMS para reglas de prioridad — vale la
  pena que Eduardo y Dylan comparen componentes para no construir dos rule builders distintos.

**Por confirmar con Eduardo/Jean Carlo (ver §7):** si el OMS también decide el *lote/agrupación*
de pedidos por camino o centro de distribución antes de pasarlo a Planificación, o si eso ya es
trabajo de Planificación. Documentado como pregunta abierta, no asumido.

---

## 2. Dónde vive el OMS en el flujo de datos del TMS

```
WMS / Torre de Control  (genera el pedido + el viaje)
          │
          │  ¿directo, o vía la tabla de "planificación de viajes"?
          │  [verificar — CONTEXTO_PROYECTO_TMS.md §2.4]
          ▼
    ┌────────────────┐
    │       OMS       │   ← satélite, NO es un módulo del TMS
    │  (priorización)  │      Regla 1: fecha de despacho + día de salida de la ruta
    └────────────────┘      Regla 2 (futura): prioridad por línea · + override manual
          │  inserta el pedido en el lago de datos, ya con prioridad
          │  y con la fecha en la que debe mandarse a alistar
          ▼
      Lago de datos / TMS
          │
          ├── Pedidos (catálogo/listado — ya construido)
          ├── Planificación (secuencia de entrega por ruta) — Jesús
          └── Tracking (ejecución en campo)
                    │
                    ▼
        Guías de Despacho (EPRAC) ──→ Liquidación (cobro/pago)
```

Esto confirma que el OMS es, como dice el kickoff, un **"mini-proyecto dentro del proyecto"**:
pequeño en superficie (una tabla de entrada, una de salida) pero con lógica de negocio densa
(el motor de reglas) — igual que Liquidación es denso en reglas de tarifas. La diferencia frente
a la primera versión de este documento es que ese "insumo de entrada" ya no es el módulo
Pedidos, sino el WMS directamente — el OMS queda **antes** de que el pedido sea visible como tal
en el TMS.

---

## 3. Inspiración de diseño — research

Búsqueda de referencias de mercado para UI de OMS y de motores de priorización/reglas
(no genéricas de e-commerce, sino específicas de *fulfillment priority rules* y dashboards
logísticos):

- **[UITOP — UX for Operational Accuracy: Designing Order Management and Inventory Systems](https://uitop.design/blog/designing-order-management-and-inventory-systems/)**
  — patrones aplicables directamente: paneles laterales (side-panel overlay) para ver detalle
  de un pedido sin salir de la cola; botones de acción condicionados (deshabilitados hasta que
  se cumplen prerequisitos, útil para acciones en lote); separación modular por capa funcional
  en vez de una vista única; notificaciones/alertas para discrepancias; log de auditoría de
  acciones. Prioriza precisión operativa sobre minimalismo estético — aplica a un módulo
  operativo como el OMS.
- **[item.com — Fulfillment Priority Rules](https://www.item.com/order-management-system/fulfillment-management-fulfillment-priority-rules)**
  — el patrón más cercano a lo que necesita OLO: jerarquía de reglas configurable
  (ej. `SLA deadline > Tier de cliente > Monto del pedido`), un **rule builder visual** tipo
  "si-entonces" sin código (`Si producto=perecedero Y cliente=VIP → Prioridad 1`), re-priorización
  automática cuando cambian condiciones (ej. un pedido a punto de incumplir SLA sube de nivel
  solo), y validación de que las reglas de alta prioridad no exceden la capacidad operativa.
- **[SupplyX — Real-time order prioritization](https://supplyx.info/en/order-prioritization-procurement/)**
  y **[Oracle WMS — Configure Rules for Order Prioritization](https://docs.oracle.com/en/cloud/saas/readiness/logistics/25a/wms25a/25A-wms-wn-f36174.htm)**
  — refuerzan el enfoque **híbrido**: el motor sugiere/calcula, pero el operador puede
  intervenir, definir excepciones y validar según prioridades de negocio — coherente con la
  regla del propio proyecto de que "una tarea no se cierra hasta la certificación humana"
  (`CONTEXTO_PROYECTO_TMS.md` §6.1) y con lo que ya hace Sección de Alertas en el Dashboard
  actual (`src/pages/dashboard/page.tsx`).
- **[AufaitUX — Dashboard UI/UX for Logistics & Supply Chain](https://www.aufaitux.com/blog/dashboard-design-logistics-supply-chain-ux/)**
  — jerarquía visual por tamaño/color para lo crítico, KPIs principales arriba y detalle
  "drill-down" abajo — mismo patrón que ya usa el Dashboard de STO con `StatCard`.
- Colecciones de referencia visual (sin patrón único a copiar, útiles para moodboard):
  [Dribbble — order management](https://dribbble.com/search/order-management),
  [Behance — order management system UI](https://www.behance.net/search/projects/order%20management%20system%20ui%20design).

**Conclusión para el diseño del OMS:** no hace falta inventar un lenguaje visual nuevo — el
patrón de mercado (cola priorizada + rule builder visual + panel lateral de detalle + modo
simulación + auditoría) encaja bien encima del design system que STO ya tiene. Se detalla en
§4 y §5.

---

## 4. Sistema de diseño a reutilizar (extraído del repo actual)

Tal como pide `Estandares_Desarrollo_AWS_Intelix.md` §11 ("Design system... si existe, es
obligatorio usarlo" y "nunca mezclar kits de UI en la misma pantalla"), el OMS **no introduce
nada nuevo** — reutiliza exactamente lo que ya está en `src/components/base/*` y
`src/components/feature/*`:

| Token / patrón | Valor actual en el repo | Dónde se ve |
|---|---|---|
| Color primario | `teal-600` (hover `teal-700`) | `Button` variant `primary`, sidebar activo, avatar de usuario, focus ring de inputs |
| Fondo de app | `slate-50` | `App.tsx` layout |
| Sidebar | `slate-900`, texto blanco/`slate-300` | `Sidebar.tsx` |
| Tarjetas | `bg-white`, `border-slate-200`, `rounded-lg`, `shadow-sm`, `p-6` | `Card.tsx` |
| Texto | Títulos `text-2xl font-bold text-slate-900`; subtítulos `text-sm text-slate-600`; encabezados de tabla `text-sm font-semibold text-slate-700`; texto muted `text-slate-400/500` | Todas las páginas existentes |
| Estados (badges) | `default`=slate · `success`=emerald · `warning`=amber · `danger`=red · `info`=teal | `Badge.tsx` — el OMS reutiliza estos 5 estados para `priority_tier` y estado de reglas |
| Iconografía | Remix Icon (`ri-*`), cargado global en `index.html` | Todo el repo |
| Botones | variantes `primary/secondary/danger/success/ghost`, tamaños `sm/md/lg` | `Button.tsx` |
| Formularios | `Input`, `Select` con foco `ring-2 ring-teal-500` | `Input.tsx`, `Select.tsx` |
| Tablas | `thead` con `border-b border-slate-200`; filas `border-b border-slate-100 hover:bg-slate-50` | `pedidos/page.tsx`, `dashboard/page.tsx` |
| KPIs | `StatCard` con icono a color + tendencia (`ri-arrow-up/down-line`) | `dashboard/page.tsx` |

**Regla para el OMS:** cualquier pantalla nueva (cola, reglas, simulador, auditoría) debe
componerse con `Card` + `Button` + `Badge` + `Input`/`Select` + el mismo patrón de tabla —
nunca un kit nuevo (nada de Ant Design/MUI) ni colores fuera de la paleta slate/teal + los 5
colores de estado ya definidos. Si hace falta un componente que no existe (ej. un rule builder
visual, un drag-handle para reordenar la cola), se construye como **wrapper en `shared/`** y se
documenta para proponerlo de vuelta al design system, tal como indica el estándar §11.

---

## 5. Propuesta de submódulos

**Sí, conviene dividir el OMS.** Es lo que el propio kickoff pide explícitamente
("cada desarrollador: definir y traer los submódulos de su módulo asignado", pendiente en
`CONTEXTO_PROYECTO_TMS.md` §9) y lo que separa limpiamente "motor" de "operación diaria" de
"gobernanza" — igual que Liquidación separa tarifario/ciclos de dinero/preliquidación en
conceptos distintos aunque viva en un solo módulo.

| # | Submódulo | Objetivo | Pantalla(s) principal(es) | Fase |
|---|---|---|---|---|
| 1 | **Mantenimiento de Rutas y Días de Despacho** *(nuevo, salió en la reunión de trabajo del OMS — ver `CONTEXTO_PROYECTO_TMS.md` §2.4)* | CRUD de qué día(s) de la semana sale cada ruta, más excepciones puntuales por cliente específico. Hoy esto vive en una tabla estática del lago de datos que **nadie mantiene de forma centralizada** — el OMS debería ser su dueño, para que un cambio de horario se propague automáticamente al resto del flujo. Es la base de la que depende la Regla 1 del Motor de Reglas — sin esto, la regla 1 no tiene de dónde leer el día de salida. | Pantalla de catálogo simple (ruta ↔ día(s) de salida ↔ excepciones), mismo patrón que Catálogos | MVP — es lo primero que hace falta, antes de que la Regla 1 pueda funcionar |
| 2 | **Panel OMS** (Dashboard) | Salud del motor de priorización: pedidos pendientes por nivel, SLA en riesgo, % re-priorizado manualmente vs. automático, antigüedad de pedidos sin atender | 1 página con `StatCard` + tabla de alertas (mismo patrón que Dashboard general) | MVP |
| 3 | **Cola de Priorización** | Vista operativa diaria: lista de pedidos `pending` ordenada por `priority_score`, con badge de nivel, filtros (cliente, país/bodega, fecha), y **override manual** (fijar arriba, mantener en espera, forzar prioridad con motivo obligatorio) — esto último confirma directamente la idea de Eduardo, validada en la reunión, de poder marcar "esto ocupa que se vaya hoy" | Tabla tipo `pedidos/page.tsx` + panel lateral de detalle (patrón UITOP) | MVP |
| 4 | **Motor de Reglas** | CRUD del árbol de reglas de negocio (`si condición → nivel/peso`). Las 2 reglas reales ya definidas: **(1)** fecha de despacho + día de salida de la ruta del cliente (no alistar antes de lo necesario) — la primera a construir; **(2)** prioridad por línea del pedido — futura. Más adelante: jerarquía ordenable y perfiles reutilizables por cliente (hoy conviven por separado EPA/Cofersa con 2 niveles y Mayoreo con un proceso 100% manual de hasta ~8 niveles informales — a homologar con Toño/Antonio) | Constructor visual de reglas (builder si/entonces) + lista de perfiles | MVP (regla 1, versión simple) → Fase 2 (regla 2, perfiles combinables n×n, alineado al mismo patrón que el tarifario de Liquidación) |
| 5 | **Simulador de Reglas** ("qué pasaría si") | Antes de activar un cambio de regla en producción, previsualizar cómo reordenaría la cola actual, sin aplicar el cambio | Vista de comparación lado a lado (cola actual vs. cola simulada) | Fase 2 — aunque en el corto plazo Eduardo ya va a probar la lógica de la Regla 1 con datos mock (acordado en la reunión), que es justo el mismo principio de este submódulo |
| 6 | **Auditoría de Priorización** | Historial de cada cambio de prioridad (automático por regla, o manual por operador) con motivo, usuario y timestamp — necesario para gobernanza y para que Reportería y RLS (Andrey) tengan de dónde tomar datos. También registra, en el día a día, que la operación (torre de control/almacén) dio el visto bueno a la propuesta del OMS antes de arrancar el alistamiento | Tabla de eventos, filtrable por pedido/usuario/fecha | Fase 2 |

**Por qué no más submódulos:** el propio kickoff advierte contra "generar de más, porque después
hay que estar modificándolos" (§6 del contexto, sobre agentes IA, pero aplica igual a
submódulos). 6 cubre el ciclo completo (mantener maestro de rutas → ver estado → decidir regla →
operar cola → simular cambios → auditar) sin fragmentar en exceso. Si en el uso real aparece
necesidad de "perfiles de prioridad" como cosa separada del builder de reglas, se puede promover
a submódulo propio más adelante — no se crea de entrada.

---

## 6. Boceto de arquitectura técnica (alineado a `Estandares_Desarrollo_AWS_Intelix.md`)

### 6.1 Frontend (React) — estructura de carpetas

El repo hoy usa `src/pages/<modulo>/page.tsx` plano (sin capa de `api`/`hooks` separada), lo
cual **no sigue todavía** el patrón obligatorio del estándar (§11: `Page → use<Modulo>Controller
→ <modulo>Api → axiosApiGateway`, con `src/views/<modulo>/{api,routes,pages,hooks,components}`).
Como el OMS es nuevo y "mini-proyecto", es la oportunidad de construirlo ya alineado al
estándar en vez de heredar la deuda — a validar con Jean Carlo si el resto del equipo migra
también o si el OMS queda como referencia adelantada:

```
src/pages/oms/
  panel/page.tsx
  cola/page.tsx
  reglas/page.tsx
  rutas-despacho/page.tsx  # submódulo 1 — CRUD ruta ↔ día(s) de salida ↔ excepciones (pendiente de construir)
  simulador/page.tsx
  auditoria/page.tsx
  api/omsApi.ts            # llamadas centralizadas (axiosApiGateway o supabase-js, según se defina)
  hooks/useOmsQueueController.ts
  hooks/useOmsRulesController.ts
  components/
    PriorityBadge.tsx      # wrapper de Badge con mapeo de priority_tier → color
    RuleBuilderRow.tsx      # una condición "si X entonces Y" del constructor de reglas
    QueueSidePanel.tsx      # panel lateral de detalle de pedido (patrón UITOP)
```

- Respetar límites de líneas del estándar §11: *atoms* 120 / *sections* 200 / *pages* 250.
- Un solo `load()` + `AbortController` por pantalla, estados `loading/error/empty` explícitos
  (nunca cascadas de `useEffect` sueltas) — el código actual de `pedidos/page.tsx` no sigue esto
  todavía (llama a Supabase directo en el componente); el OMS no debería repetir ese patrón.
- Rutas en `src/router/config.tsx`: `/oms` (ya redirige a `/oms/panel`), `/oms/panel`,
  `/oms/cola`, `/oms/reglas`, `/oms/simulador`, `/oms/auditoria` — ya existen en el prototipo
  (§9). Falta agregar `/oms/rutas-despacho` para el submódulo 1, identificado después de armar
  el prototipo inicial. Grupo "OMS" ya está en `Sidebar.tsx`, junto a "Pedidos".

### 6.2 Datos (PostgreSQL — nueva base transaccional, no el lago de datos)

Tablas nuevas propuestas (nombres a validar, en inglés como `orders`/`customers` ya existentes):

- `route_dispatch_schedule` *(nueva, submódulo 1)* — `route_id`, día(s) de la semana en que
  despacha esa ruta (o fecha puntual si es una excepción por cliente específico), notas.
  Reemplaza a la tabla estática que hoy se mantiene a mano en el lago de datos
  (`CONTEXTO_PROYECTO_TMS.md` §2.4) — el OMS pasa a ser el dueño/CRUD de esta tabla.
- `order_priority_rules` — condición, peso/nivel, activa/inactiva, perfil al que pertenece.
- `order_priority_profiles` — agrupación reutilizable de reglas (ej. por país/cliente).
- `order_priority_scores` — `order_id`, `priority_tier`, `priority_score`, `computed_at`,
  `ready_to_prep_date` *(nuevo)* — la fecha en la que el pedido debe mandarse a alistar,
  calculada a partir de `route_dispatch_schedule` (hoy el proceso legado la marca un día antes
  de la fecha de salida de la ruta), `overridden_by` (nullable), `override_reason` (nullable).
- `order_priority_audit_log` — `order_id`, `actor` (sistema o usuario), `change_type`
  (automático/manual), `previous_tier`, `new_tier`, `reason`, `created_at`.

Como marca el estándar §6 y el kickoff (§3), la creación de estas tablas se hace pidiéndole a un
agente Claude que genere el esquema, y todo pasa por PR — nada manual en consola.

### 6.3 Seguridad / RLS

El nivel de permisos "hasta por botón" que ya se identificó como necesario para Liquidación
(`CONTEXTO_PROYECTO_TMS.md` §4) aplica igual aquí: **forzar manualmente una prioridad** es una
acción sensible que probablemente necesite un permiso más fino que solo "ver la cola". Coordinar
con Andrey (RLS transversal) antes de construir el override manual del submódulo 3 (Cola de
Priorización).

---

## 7. Preguntas abiertas (agenda sugerida para la próxima reunión, con Eduardo / Jean Carlo / Palencia)

Organizadas por tema para que sirvan directamente de agenda. Las primeras 7 ya estaban en la
versión anterior de este documento; el resto se agregó para cerrar huecos de contexto antes de
construir.

### 7.0 Ya respondidas en la reunión de trabajo del OMS

Ver el detalle completo en `CONTEXTO_PROYECTO_TMS.md` §2.4.

- ✅ *¿Existe hoy un catálogo real de reglas de priorización?* — Parcialmente: para EPA y
  Cofersa **[verificar nombre]** se manejan 2 niveles de prioridad; para Mayoreo es 100%
  manual/criterio de una persona, con hasta ~8 niveles informales en la práctica. No hay un
  catálogo único todavía — hay que homologarlo con Toño/Antonio (sigue como pregunta abierta en
  §7.3, ahora con más contexto).
- ✅ *¿Quién certifica humanamente un cambio antes de producción?* — La operación (torre de
  control/almacén) revisa la propuesta de priorización/alistamiento del OMS y da el visto bueno
  antes de arrancar el proceso de alistamiento. Confirma el patrón de "recomendación con
  aprobación humana", no automatización ciega — igual que ya funciona el resto del proyecto
  (`CONTEXTO_PROYECTO_TMS.md` §6.1).
- ✅ *¿Por pedido individual o por lote?* — Al menos para la Regla 1 (fecha de despacho + día de
  la ruta), es evaluación por pedido individual contra el calendario de su ruta.
- ✅ *¿Las reglas difieren por país?* — Sí sabemos que el calendario de rutas difiere
  completamente entre Costa Rica y Venezuela (días de salida distintos por ruta), pero el
  mecanismo de la Regla 1 en sí (fecha despacho vs. día de ruta) es el mismo en ambos países.

### 7.1 Reglas de negocio y criterios de priorización

- [ ] ¿Existe hoy, aunque sea informal (Excel, criterio del despachador), un catálogo real de
      reglas de priorización? El campo `priority` (`high/normal/low`) ya existe en `orders` —
      ¿es manual hoy o alguien ya aplica alguna lógica no documentada?
- [ ] Más allá de lo ya mencionado para Liquidación (cliente VIP, SLA, monto), ¿cuál es el
      catálogo **completo** de criterios que debería poder usar una regla (tipo de producto/
      perecedero, capacidad del centro de distribución, antigüedad del pedido, etc.)?
- [ ] Cuando dos o más reglas compiten por el mismo pedido y dan resultados distintos, ¿cuál es
      el criterio de desempate (gana la de mayor peso, se suman puntajes, gana la más
      restrictiva)?
- [ ] ¿Cuántos niveles de prioridad hacen falta en la práctica? Hoy `priority` solo tiene 3
      valores (`high/normal/low`) — ¿alcanza, o se necesita un `priority_score` numérico más
      granular para desempatar dentro de un mismo nivel (ver §6.2)?
- [ ] ¿Con qué frecuencia cambian las reglas de negocio (a diario según demanda, por temporada,
      casi nunca)? Esto decide si el **Simulador de reglas** (submódulo 5, hoy en Fase 2) debe
      subir a MVP.
- [ ] ¿El OMS decide prioridad **por pedido individual** o **por lote/agrupación** (ej. todos
      los pedidos de una tienda o centro de distribución en un día)? *(parcialmente respondido
      en §7.0 para la Regla 1 — confirmar si aplica igual para reglas futuras)*
- [ ] En la reunión de trabajo se mencionaron inicialmente "3 reglas" pero solo se detallaron 2
      (fecha despacho + día de ruta; prioridad por línea) — ¿la tercera es el mecanismo de
      asignación manual de urgencias (submódulo 3), o hay una regla adicional todavía sin
      describir?

### 7.2 Volumen, tiempos y ejecución

- [ ] ¿Cuál es el volumen esperado de pedidos pendientes simultáneos en la cola (decenas,
      cientos, miles por día, por país)? Afecta si el submódulo 2 (Cola de Priorización)
      necesita paginación/virtualización desde el día uno.
- [ ] ¿La priorización debe recalcularse en tiempo real cada vez que entra un pedido nuevo, o en
      corridas programadas (ej. una vez antes de que Planificación arme las rutas del día)?
- [ ] ¿Existe una hora de corte (*cutoff*) diaria antes de la cual los pedidos deben quedar
      priorizados? ¿Qué pasa con los que llegan después — se re-priorizan automáticamente para
      el día siguiente?

### 7.3 Datos y catálogos

- [ ] Los atributos que necesitarían las reglas (cliente VIP, SLA prometido por cliente, tipo de
      producto/perecedero, centro de distribución de origen) — ¿ya existen en Catálogos
      (Clientes/Puntos de Entrega) o hay que agregarlos? Si hay que agregarlos, ¿quién es dueño
      de mantenerlos actualizados?
- [ ] ¿Los pedidos de Devoluciones/logística inversa entran al mismo motor de priorización del
      OMS, o tienen su propio proceso? (Hoy Devoluciones no tiene dueño ni proceso de negocio
      mapeado — `CONTEXTO_PROYECTO_TMS.md` §9 — así que conviene decidirlo antes de que el OMS
      asuma algo por su cuenta.)
- [ ] ¿El "motor de reglas configurable, incluso por cliente" que pide Ignacio/Mayoreo (hoy
      documentado para Liquidación, §2.3) debería compartir el mismo componente de rule builder
      que el OMS, para no construirlo dos veces?
- [ ] ¿Las reglas de prioridad difieren por país (Costa Rica vs. Venezuela), como sí ocurre en
      Liquidación? *(el calendario de rutas sí difiere — ver §7.0; confirmar si hace falta algo
      más específico por país en las reglas mismas)*
- [ ] Confirmar con el coordinador de transportes (y apoyo de Dylan) los días de despacho por
      ruta en Venezuela — en Costa Rica ya se tiene (Jean Carlo se lo comparte a Eduardo).
- [ ] Definir con Toño/Antonio cuántos niveles de prioridad va a manejar el OMS, homologando lo
      que hoy hacen WMS, EPA, Cofersa y Mayoreo por separado (ver §7.0).

### 7.4 Integración y experiencia de usuario

- [ ] Aclarar a qué se refiere exactamente "pasando por la planificación" como vía alterna de
      entrada de un pedido al OMS (ver diagrama de §2) — ¿la tabla estática de "planificación de
      viajes" que describe Ana, o el módulo de Planificación de Jesús?
- [ ] Definir a qué tablas/sistema exacto del lago de datos se va a conectar el OMS — pendiente
      que Ana/el equipo de datos lo precise para la siguiente sesión de OMS.
- [ ] ¿Cuál es el contrato exacto de salida hacia Planificación? ¿Un campo/estado en la misma
      tabla `orders` que Jesús consume, o un endpoint/tabla intermedia?
- [ ] ¿La prioridad de un pedido debe ser visible para el chofer en la app móvil de Tracking
      (Justin), o queda 100% interna al back-office?
- [ ] ¿El rol "Cliente" (`CONTEXTO_PROYECTO_TMS.md` §4) debería ver algún estado de priorización
      de su propio pedido, o es información puramente operativa/interna?

### 7.5 Gobernanza, KPIs y equipo

- [ ] ¿Hay ya datos históricos de pedidos para validar que una regla "tiene sentido" antes de
      activarla, o el motor arranca 100% basado en reglas explícitas sin aprendizaje de datos
      (como Planificación Fase 1 vs. Fase 2)?
- [ ] ¿Quién certifica humanamente un cambio de regla antes de que afecte producción — el propio
      Eduardo, o un rol de negocio (Palencia)?
- [ ] Si el motor prioriza mal y genera un incumplimiento real, ¿existe ya (o hay que definir)
      un proceso de reversión más allá del override manual del submódulo 3?
- [ ] ¿Cuál es el KPI de negocio con el que se va a medir si el OMS "funciona" (ej. % de pedidos
      VIP entregados a tiempo, reducción del tiempo de espera promedio)? Define qué mostrar
      primero en el Panel OMS (submódulo 2).
- [ ] ¿Eduardo define solo las reglas de negocio del OMS, o hay (o debería haber) un rol de
      negocio equivalente al que tienen Ricardo/Palencia para Liquidación, que aporte las reglas
      reales de priorización?

---

## 8. Próximos pasos

- [ ] Validar este documento completo con Eduardo (dueño) y Jean Carlo.
- [ ] Responder las preguntas abiertas de §7 con Palencia/Ricardo si aplica (mismo patrón que
      se usó para levantar reglas de Liquidación).
- [ ] Confirmar con Jesús el contrato de datos OMS → Planificación.
- [ ] Traer mockups de las 5 pantallas de §5 — siguiendo la metodología AI/DLC del proyecto, la
      matriz de requerimientos se arma por ingeniería inversa desde mockups, no al revés
      (`CONTEXTO_PROYECTO_TMS.md` §6.1).
- [ ] Priorizar los submódulos de §5 con MoSCoW junto con Jean Carlo, igual que el resto del
      proyecto.
- [ ] Solo después de lo anterior: construir un prototipo visual (sin lógica real de negocio
      todavía) de los submódulos MVP de este módulo (ver §5).
- [ ] Jean Carlo: compartir con Eduardo la tabla cliente↔ruta↔día de despacho de Costa Rica.
- [ ] Conseguir el equivalente para Venezuela (coordinador de transportes / apoyo de Dylan).
- [ ] Eduardo: mientras tanto, avanzar la lógica de la Regla 1 (fecha de despacho + día de ruta)
      con datos mock, simulando pedidos para validar la lógica antes de tener las tablas reales.
- [ ] Agendar la siguiente sesión de OMS con Jean Carlo/Ana, ya con las tablas y el sistema de
      origen concretos a los que el OMS se va a conectar.

## 9. Estado del prototipo (temporal, para la reunión)

Ya existe un prototipo navegable de 5 de los 6 submódulos de §5 (falta el submódulo 1,
Mantenimiento de Rutas y Días de Despacho, identificado después en la reunión de trabajo — ver
la nota al final de esta sección), dentro de este mismo repo, para mostrar en la próxima
reunión y recoger feedback:

- **Rutas:** `/oms/panel`, `/oms/cola`, `/oms/reglas`, `/oms/simulador`, `/oms/auditoria`
  (`/oms` redirige a `/oms/panel`). Entrada nueva en el Sidebar, junto a "Pedidos".
- **Código:** `src/pages/oms/` — reutiliza únicamente `Card`/`Button`/`Badge`/`Input`/`Select`/
  `StatCard` del design system existente (§4), sin ningún kit de UI nuevo.
- **Datos:** 100% mock (`src/pages/oms/mockData.ts`) — **no hay conexión a Supabase ni tablas
  nuevas creadas**. Es intencional: es un prototipo desechable/editable, y crear tablas reales
  sin las reglas de negocio validadas (§7) violaría el estándar de "todo pasa por PR" una vez
  que sí sepamos qué esquema real hace falta.
- **Siguiente paso:** después de la reunión, corregir/mejorar estas 5 pantallas con el feedback
  recibido, y usarlas como el insumo de mockups que la metodología AI/DLC necesita para generar
  la matriz de requerimientos (§6.1 de `CONTEXTO_PROYECTO_TMS.md`).
- **Nota tras la reunión de trabajo del OMS:** el submódulo 1 (Mantenimiento de Rutas y Días de
  Despacho, §5) salió de esa sesión y **todavía no está en el prototipo** — se identificó
  después de haber armado las 5 pantallas iniciales. Además, la idea planteada en la reunión de
  "hacer con datos mock la simulación de pedidos para probar la lógica de fechas" es
  exactamente el mismo enfoque que ya se usó para este prototipo (`src/pages/oms/mockData.ts`) —
  buena señal de que el camino tomado tiene sentido para el equipo.
