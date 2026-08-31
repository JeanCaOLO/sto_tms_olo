# Mockups refinados — Módulo OMS

> Intent: `260826-modulo-oms`. Etapa: Refined Mockups (Inception). Lead: diseño;
> apoyo: producto. Fuente: `requirements.md` (FR1–FR10) de Requirements
> Analysis, `PLAN_MODULO_OMS.md` §4–§5 y el design system extraído por la
> ingeniería inversa (`architecture.md`, `code-structure.md`).
>
> Fidelidad media-alta textual (Q1=A): por cada pantalla se describe layout por
> regiones, jerarquía y los 5 estados (vacío / carga / éxito / parcial / error).
> No hay wireframes de ideación (scope classic saltó rough-mockups) ni historias
> de usuario formales (User Stories saltada): los mockups se derivan
> directamente de los requerimientos, sin inventar artefactos ausentes.
>
> El detalle de componentes vive en `interaction-spec.md`; el mapeo a
> componentes reales del repo en `design-system-mapping.md`; la accesibilidad en
> `accessibility-checklist.md`.

## Convenciones de estas maquetas

- **Chrome de app compartido** (heredado del TMS, `code-structure.md`): sidebar
  `slate-900` a la izquierda con el grupo "OMS", header superior con título de
  página, avatar de usuario y **selector de país (Costa Rica / Venezuela)** —
  obligatorio en el OMS (FR9.3, FR9.1). El contenido usa fondo `slate-50`.
- **Prioridad visual** con los 5 badges existentes: `danger` (rojo) = crítico,
  `warning` (ámbar) = alto/atención, `info` (teal) = medio, `default` (slate) =
  bajo. Los nombres de tier son ilustrativos hasta cerrar OQ-1
  (`requirements.md`); solo el ordenamiento es normativo.
- **Los 5 estados** se anotan por pantalla; el detalle de cada estado (copy,
  ARIA, foco) está en `interaction-spec.md`.
- **Responsive desktop-first** (Q4=A): a <768px las tablas colapsan a tarjetas y
  los paneles laterales pasan a hoja inferior (bottom sheet).
- **Permisos** (FR10): las acciones de escritura se ocultan/deshabilitan según
  el nivel del usuario (visualización / operación / administración).

## Mapa de navegación (grupo OMS en el sidebar)

```
OMS
├── Panel                 /oms/panel          (FR4)   — landing del grupo
├── Cola de Priorización  /oms/cola           (FR2, FR3)
├── Motor de Reglas       /oms/reglas         (FR5)
├── Simulador             /oms/simulador      (FR6)
├── Rutas y Días          /oms/rutas-despacho (FR1)
└── Auditoría             /oms/auditoria      (FR7)
```

`/oms` redirige a `/oms/panel`. Ítem activo resaltado en teal (patrón del
sidebar existente).

---

## Pantalla 1 — Panel OMS (`/oms/panel`, FR4)

Dashboard de salud del motor. Landing del grupo.

### Layout (desktop)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: [Panel OMS]                     País: (Costa Rica ▾)  [avatar]│
├─────────────────────────────────────────────────────────────────────┤
│  StatCards (fila de KPIs, FR4.1):                                     │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐            │
│  │ Pendientes│ │ Vencidos  │ │ % override│ │ Sin ruta  │            │
│  │ por tier  │ │ (danger)  │ │ 24h       │ │ config.   │            │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘            │
│                                                                       │
│  Alertas activas (tabla, FR4.2)              [Actualizado hace 12 s]  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Sev.  │ Tipo de alerta      │ Pedido   │ Timestamp             │  │
│  │ 🔴    │ Pedido vencido      │ #10432   │ 2026-08-28 09:12      │  │
│  │ 🔴    │ Referencia WMS inv. │ #10461   │ 2026-08-28 09:10      │  │
│  │ 🟠    │ Sin ruta config.    │ #10440   │ 2026-08-28 09:05      │  │
│  │ 🟠    │ Sync al lago fallida│ #10458   │ 2026-08-28 09:03      │  │
│  │ 🟠    │ País no identificado│ #10462   │ 2026-08-28 09:01      │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Jerarquía

1. KPIs (StatCard) como primer bloque escaneable (patrón F).
2. Tabla de alertas activas, ordenada por severidad y luego timestamp desc
   (FR4.2). Fila clicable → navega a la Cola con filtro aplicado (FR4.5). Los
   tipos de alerta incluyen: pedido vencido (FR2.5), sin ruta configurada
   (FR2.6), sincronización al lago fallida tras agotar reintentos (FR8.3/FR8.4),
   referencia WMS inválida (FR8.6) y país no identificado (FR9.6).
3. Badge de "última actualización" (FR4.6, refresco cada 60 s → NFR5).

### Estados

- **Vacío**: sin alertas → tarjeta con icono + "Sin alertas activas. El motor
  opera con normalidad." KPIs en 0 siguen visibles.
- **Carga**: skeleton de las 4 StatCards y filas de tabla (patrón skeleton).
- **Éxito/poblado**: el de arriba. Cuando una alerta se resuelve (el pedido deja
  de cumplir la condición que la generó), desaparece de la tabla de alertas
  activas (FR4.8).
- **Parcial**: KPI supera umbral → StatCard con badge `danger`/`warning`
  (FR4.3). Muchas alertas → paginación/scroll con contador.
- **Error**: sin datos frescos del motor → muestra últimos datos disponibles +
  timestamp de la última actualización exitosa + banner `warning` de conexión
  (FR4.7).

---

## Pantalla 2 — Cola de Priorización (`/oms/cola`, FR2/FR3)

Vista operativa diaria. Requiere país seleccionado (FR9.3).

### Layout (desktop, master-detail)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: [Cola de Priorización]           País: (Costa Rica ▾) [avatar]│
├─────────────────────────────────────────────────────────────────────┤
│ Filtros: [Cliente ▾][Ruta ▾][ready_to_prep_date: __ a __] [Limpiar]  │
├──────────────────────────────────────────────┬──────────────────────┤
│ Tabla (orden por priority_score desc, FR3.1)  │  Panel lateral        │
│ ┌────┬────────┬───────┬──────┬──────┬───────┐ │  (FR3.6, al           │
│ │Tier│ Pedido │Cliente│ Ruta │ RTP  │ Score │ │  seleccionar fila)    │
│ │ 🔴 │ #10432 │ EPA   │ R-12 │ hoy  │  920  │ │  ─────────────────    │
│ │ 🟠 │ #10440 │Cofersa│ R-03 │ +1d  │  610  │ │  Pedido #10432        │
│ │ 🔵 │ #10455 │ EPA   │ R-12 │ +2d  │  300  │ │  Cliente: EPA         │
│ └────┴────────┴───────┴──────┴──────┴───────┘ │  Ingreso: 08:41       │
│ [◀ 1 2 3 ▶]  Mostrando 1–50 de 213            │  Reglas aplicadas:    │
│                                                │   · Vencimiento (+600)│
│                                                │   · Cliente EPA (+320)│
│                                                │  Historial de cambios │
│                                                │  [Alterar prioridad]  │
└────────────────────────────────────────────────┴──────────────────────┘
```

### Jerarquía

1. Selector de país (bloquea la vista hasta elegirlo, FR9.3).
2. Filtros con lógica AND (FR3.3).
3. Tabla ordenada por `priority_score` desc; columnas: tier (badge), pedido,
   cliente, ruta, `ready_to_prep_date`, score, estado (FR3.2). Paginación 50/pág
   (FR3.1).
4. Panel lateral de detalle (FR3.6): campos de la fila + fecha de ingreso +
   reglas que contribuyeron al score, mostrando el **peso aportado por cada
   regla y su suma = `priority_score`** (FR5.5); un pedido sin ninguna regla
   aplicable muestra "Sin reglas aplicables · score 0 · tier más bajo" (FR5.8).
   Además: historial + botón **Alterar prioridad** (override, FR3.4 — solo
   visible con permiso de operación, FR3.7/FR10).

### Estados

- **Vacío**: país elegido sin pedidos → "No hay pedidos pendientes para este
  país" + sugerencia de revisar filtros.
- **Carga**: skeleton de tabla; panel lateral vacío con hint "Selecciona un
  pedido para ver el detalle".
- **Éxito/poblado**: el de arriba; actualización de orden en ≤5 s sin recarga
  (FR3.8 → NFR2).
- **Parcial**: filtro sin resultados → "Ningún pedido cumple los filtros.
  [Limpiar filtros]". Pedido "sin ruta configurada" (FR2.6) → fila marcada con
  badge `warning` y sin score.
- **Error**: fallo al cargar → banner de error con reintento; el override se
  deshabilita si no hay conexión al motor.

### País obligatorio — estado "sin país"

Si el usuario no ha elegido país: pantalla con selector centrado y mensaje
"Selecciona un país para ver la cola" (FR9.3). Ningún pedido se muestra.

---

## Pantalla 3 — Motor de Reglas (`/oms/reglas`, FR5)

CRUD de reglas y perfiles (nivel administración, FR10.1).

### Layout (desktop)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: [Motor de Reglas]                País: (Costa Rica ▾) [avatar]│
├───────────────────────────┬───────────────────────────────────────────┤
│ Perfiles (lista, FR5.7)    │  Reglas del perfil seleccionado           │
│ ┌───────────────────────┐  │  [+ Nueva regla]                          │
│ │ ● Perfil EPA (CR)     │  │  ┌──────┬───────────┬──────┬──────┬─────┐ │
│ │ ○ Perfil Cofersa (CR) │  │  │Estado│ Nombre    │ Peso │ Cond.│ ⋯   │ │
│ │ ○ Perfil base (CR/VE) │  │  │ 🟢on │ Vencido   │ 600  │ ...  │     │ │
│ └───────────────────────┘  │  │ ⚪off│ Stock EPA │ 320  │ ...  │     │ │
│                            │  └──────┴───────────┴──────┴──────┴─────┘ │
└───────────────────────────┴───────────────────────────────────────────┘
```

### Jerarquía

1. Lista de perfiles reutilizables (FR5.7), asociables por país/cliente.
2. Reglas del perfil, ordenadas por peso desc (FR5.4). Toggle activar/desactivar
   (FR5.2/FR5.3). Botón "+ Nueva regla" abre el constructor (ver
   `interaction-spec.md`, componente RuleBuilder).
3. El constructor de regla captura: nombre (1–100), condición (campo + operador
   + valor), peso (1–1000), estado inicial (FR5.1).

### Estados

- **Vacío**: sin reglas en el perfil → "Este perfil no tiene reglas. [+ Crear la
  primera regla]" (patrón empty con CTA).
- **Carga**: skeleton de lista y tabla.
- **Éxito**: el de arriba.
- **Parcial**: perfil al límite de 50 reglas (FR5.7) → botón "Nueva regla"
  deshabilitado con tooltip explicativo.
- **Error**: activar regla con campo inexistente (FR5.6) → error inline en el
  constructor indicando el campo inválido, sin guardar.

---

## Pantalla 4 — Simulador de Reglas (`/oms/simulador`, FR6)

Vista previa "qué pasaría si" (nivel administración).

### Layout (desktop, split-screen)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: [Simulador de Reglas]            País: (Costa Rica ▾) [avatar]│
│ Selección de reglas a simular: [☑ Vencido][☐ Stock EPA] [Simular]     │
├───────────────────────────────┬───────────────────────────────────────┤
│ Cola ACTUAL                    │  Cola SIMULADA                        │
│ ┌────┬────────┬──────┬───────┐ │  ┌────┬────────┬──────┬───────┬────┐  │
│ │Tier│ Pedido │ Score│       │ │  │Tier│ Pedido │ Score│ Δpos  │ !  │  │
│ │ 🔴 │ #10432 │ 920  │       │ │  │ 🔴 │ #10432 │ 920  │  =    │    │  │
│ │ 🟠 │ #10440 │ 610  │       │ │  │ 🔵 │ #10440 │ 300  │  ▼2   │ ⚠  │  │
│ └────┴────────┴──────┴───────┘ │  └────┴────────┴──────┴───────┴────┘  │
│                                │  Resumen: 47 afectados · 12 cambian    │
│                                │  de tier · 22% cambia de posición      │
└───────────────────────────────┴───────────────────────────────────────┘
```

### Jerarquía

1. Selector de reglas a simular + botón Simular (FR6.1).
2. Comparación en dos columnas: actual vs. simulada (FR6.2), con marcador de
   cambio de posición/tier (FR6.3).
3. Resumen (FR6.7). Botón "Aplicar como reglas activas" (FR6.4), con confirmación
   de impacto alto si >30% cambia de tier (FR6.5).

### Estados

- **Vacío**: sin reglas seleccionadas → "Selecciona una o más reglas y pulsa
  Simular".
- **Carga**: barra de progreso de la simulación (hasta 30 s / 10.000 pedidos,
  FR6.1 → NFR4).
- **Éxito**: comparación + resumen.
- **Parcial/impacto alto**: >30% cambia de tier → modal de advertencia "Impacto
  alto" que exige confirmación explícita antes de aplicar (FR6.5).
- **Error/timeout**: falla o excede 30 s → cancela, descarta parciales y muestra
  la causa, sin tocar producción (FR6.6).

---

## Pantalla 5 — Rutas y Días de Despacho (`/oms/rutas-despacho`, FR1)

Mantenimiento del calendario de rutas (nivel administración acotada — Operador
de Despacho, FR10.1). Patrón catálogo, como el resto de catálogos del TMS.

> **Datos de muestra reales**: la tabla usa el calendario real de rutas de
> **Cofersa en Costa Rica** (34 zonas) del archivo `Rutas cofersa - costa
> rica.csv` de la raíz del repo. Mapeo de columnas: `Zona #` → identificador de
> ruta/zona; `Días de Carga` → días de salida (insumo de la Regla 1, FR2);
> `Días de entrega` → días de entrega al cliente. La segunda columna del CSV
> clasifica cada zona como **Rural** o **GAM** (Gran Área Metropolitana). Es
> data ILUSTRATIVA para la maqueta; el sembrado real se hace en Construcción.

### Layout (desktop) — país: Costa Rica (filtro CR del CountrySelector)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Header: [Rutas y Días de Despacho]             País: (Costa Rica ▾) [avatar]│
│ [+ Nueva ruta]   Cliente: (Cofersa ▾)   Tipo: (Todos ▾)   [Buscar zona…]    │
├───────────────────────────────────────────────────────────────────────────┤
│ ┌──────┬───────────────────┬─────┬──────────────────────┬─────────────────┐│
│ │ Zona │ Nombre            │ Tipo│ Días de salida(carga)│ Días de entrega ││
│ │ 08   │ San Carlos        │Rural│ Lun · Mié · Vie      │ Mar · Jue · Sáb ││
│ │ 09   │ Limón             │Rural│ Lun · Mié · Vie      │ Mar · Jue · Sáb ││
│ │ 29   │ Talamanca         │Rural│ Jue                  │ Vie             ││
│ │ 39   │ Sarapiquí         │Rural│ Mié                  │ Jue             ││
│ │ 10   │ Guanacaste Altura │Rural│ Lun · Mié            │ Mar · Jue       ││
│ │ 11   │ Guanacaste Bajura │Rural│ Lun · Mié            │ Mar · Jue       ││
│ │ 12   │ Zona Sur          │Rural│ Lun · Jue            │ Mar·Mié·Vie·Sáb ││
│ │ 13   │ Puntarenas        │Rural│ Mar · Jue            │ Mié · Vie       ││
│ │ 15   │ Turrialba         │Rural│ Mié                  │ Jue             ││
│ │ 16   │ Corralillo        │Rural│ Jue                  │ Vie             ││
│ │ 18   │ Zona Sur          │Rural│ Lun · Jue            │ Mar·Mié·Vie·Sáb ││
│ │ 20   │ Puriscal          │Rural│ Mar · Jue            │ Mié · Vie       ││
│ │ 31   │ Upala             │Rural│ Jue                  │ Vie             ││
│ │ 32   │ Puerto Jiménez    │Rural│ Lun                  │ Mar             ││
│ │ 33   │ Cartago Epa       │ GAM │ Vie                  │ Lun             ││
│ │ 34   │ Escazú Epa        │ GAM │ Lun                  │ Mar             ││
│ │ 35   │ Desamparados Epa  │ GAM │ Mar                  │ Mié             ││
│ │ 36   │ Tibás Epa         │ GAM │ Jue                  │ Vie             ││
│ │ 37   │ Curridabat Epa    │ GAM │ Jue                  │ Vie             ││
│ │ 38   │ Belén Epa         │ GAM │ Mié                  │ Jue             ││
│ │ 01   │ Casco             │ GAM │ Lun a Vie            │ —               ││
│ │ 44   │ REY               │ GAM │ ⚠ Cita previa        │ —               ││
│ │ 02   │ Desamparados      │ GAM │ ⚠ Sin días definidos │ —               ││
│ │ …    │ (resto GAM casco) │ GAM │ ⚠ Sin días definidos │ —               ││
│ └──────┴───────────────────┴─────┴──────────────────────┴─────────────────┘│
│ [◀ 1 2 ▶]  34 zonas · Cofersa · Costa Rica  (muestra: 22 de 34)              │
└───────────────────────────────────────────────────────────────────────────┘
```

> Zonas GAM del casco sin días en el CSV (`2 Desamparados`, `3 Guadalupe`,
> `4 Alajuela`, `17 Grecia`, `5 Heredia`, `6 Cartago`, `7 Carretera`,
> `21 Casco`, `22 Desampa`, `23 Guadalupe`, `25 Heredia`, `26 Cartago`) se
> muestran con el marcador **"Sin días definidos"** — son el caso de borde real
> que la Regla 1 trata como ruta sin días registrados (FR2.6: pedido "sin ruta
> configurada" + alerta). La zona `44 REY` es **"Cita previa"** (sin calendario
> fijo), otro caso de borde real a modelar.

### Jerarquía

1. Tabla de rutas/zonas del país activo (Costa Rica) con días de salida (carga),
   días de entrega, tipo (Rural/GAM) y nº de excepciones (FR1.1, FR1.6). Filtro
   por cliente (Cofersa) y tipo.
2. Formulario de alta/edición (modal o página): identificador de zona, días de
   salida (al menos uno, FR1.2), país. Sub-sección de excepciones puntuales:
   fecha (≥hoy), cliente, motivo obligatorio ≤500 (FR1.3).

### Estados

- **Vacío**: país sin rutas → "No hay rutas registradas para este país. [+ Crear
  la primera ruta]".
- **Carga**: skeleton de tabla.
- **Éxito**: la tabla con las 34 zonas reales de Cofersa CR (paginada).
- **Parcial**: **zonas GAM del casco sin días de salida** ("Sin días
  definidos") y la zona `44 REY` "Cita previa" — datos reales que ilustran el
  caso FR2.6 (ruta sin días → pedido sin ruta configurada); ruta inactiva
  mostrada atenuada; desactivar ruta con excepciones futuras → confirma y alerta
  cuántas se desactivan (FR1.7).
- **Error**: identificador duplicado en el país (FR1.5) o excepción duplicada
  cliente+fecha+ruta (FR1.8) → error inline, sin guardar.

> **Nota de datos → Regla 1**: los `Días de Carga` son exactamente el insumo del
> `ready_to_prep_date` (FR2.2: alistar 1 día antes de la salida). Ejemplo con
> data real: zona `13 Puntarenas` sale Mar y Jue; un pedido para el jueves marca
> `ready_to_prep_date` = miércoles. Las zonas con varios días de carga
> (`08 San Carlos`: Lun·Mié·Vie) toman la primera salida futura con ≥1 día de
> antelación (FR2.1).

---

## Pantalla 6 — Auditoría de Priorización (`/oms/auditoria`, FR7)

Registro inmutable, solo lectura (FR7.4). Nivel operación para consulta.

### Layout (desktop)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: [Auditoría de Priorización]      País: (Costa Rica ▾) [avatar]│
│ Filtros: [Pedido][Usuario][Tipo: auto/manual ▾][Fechas: __ a __]      │
├─────────────────────────────────────────────────────────────────────┤
│ ┌──────────┬────────┬──────┬───────────┬────────┬──────────────────┐ │
│ │ Fecha    │ Pedido │ Tipo │ Tier ant→ │ Usuario│ Motivo           │ │
│ │ 09:12    │ #10432 │ auto │ —→crítico │ sistema│ Regla: vencido   │ │
│ │ 08:57    │ #10440 │manual│ alto→crít │ jperez │ Viaje extra pagado│ │
│ └──────────┴────────┴──────┴───────────┴────────┴──────────────────┘ │
│ [◀ 1 2 3 ▶]  Mostrando 1–50 de 1.204                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Jerarquía

1. Filtros por pedido, usuario, tipo de cambio, rango de fechas, país (FR7.3).
2. Tabla paginada 50/pág (FR7.3), inmutable (FR7.4). Distingue cambios
   automáticos (regla que lo causó) de manuales (usuario + motivo) (FR7.1/FR7.2).
   Al seleccionar una fila se abre un panel de detalle con el registro completo
   exigido por FR7.1/FR7.2: `priority_tier` anterior→nuevo y **`priority_score`
   anterior→nuevo** (las columnas de la tabla muestran el resumen; el score
   ant/nuevo vive en el detalle para no saturar la fila).

### Estados

- **Vacío**: sin registros para el filtro → "No hay registros de auditoría para
  estos criterios".
- **Carga**: skeleton de tabla.
- **Éxito**: el de arriba.
- **Parcial**: muchos registros → paginación; el más antiguo consultable dentro
  de la retención de 12 meses (FR7.5).
- **Error**: fallo de carga → banner con reintento. Nunca hay acciones de
  edición/borrado (solo lectura).

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md`
  — FR1–FR10, los 5 estados exigidos, multi-país (FR9), permisos (FR10) y NFR de
  refresco/latencia que rigen los estados de carga y actualización.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/refined-mockups/refined-mockups-questions.md`
  — decisiones de diseño Q1–Q5 = A (fidelidad, 6 pantallas, WCAG AA,
  desktop-first, override en modal).
- `PLAN_MODULO_OMS.md` §4 (design system a reutilizar), §5 (los 6 submódulos),
  §6.1 (estructura de carpetas y rutas del prototipo).
- `aidlc/spaces/default/codekb/sto_tms_olo/code-structure.md` y `architecture.md`
  — patrón de páginas, sidebar, tabla y StatCard existentes.
- `.kiro/knowledge/aidlc-design-agent/wireframing-guide.md` — los 5 estados de
  pantalla; `ux-guide.md` — patrones de tabla, panel lateral y feedback.
- `Rutas cofersa - costa rica.csv` (raíz del repo) — calendario real de 34 zonas
  de Cofersa Costa Rica; datos de muestra de la Pantalla 5 (columnas `Zona #`,
  `Días de Carga`, `Días de entrega`, y clasificación Rural/GAM).

## Review

**Reviewer:** aidlc-product-lead-agent · **Clase:** advisory · **Iteración:** 1 · **Veredicto:** READY

El revisor confirmó la alineación de negocio (ninguna maqueta reintroduce una
pantalla o acción de aprobación de lote; el override por pedido es la única
intervención humana), la cobertura de las 6 pantallas → FR1–FR7, los
transversales FR8/FR9/FR10, los 5 estados por pantalla, la consistencia con el
design system y la accesibilidad WCAG AA. Sin hallazgos bloqueantes.

Refinamientos aplicados tras la revisión advisory (5 hallazgos Menores):
- Panel: la tabla de alertas incluye ahora los tipos derivados de FR8
  (sync al lago fallida, referencia WMS inválida) y FR9.6 (país no identificado).
- Panel: se anotó FR4.8 (una alerta se remueve al resolverse) en el estado éxito.
- Auditoría: se añadió el panel de detalle con `priority_score` anterior→nuevo
  (FR7.1/FR7.2).
- Cola (panel lateral): el desglose de reglas muestra la suma de pesos =
  `priority_score` (FR5.5) y el caso "sin reglas aplicables → score 0 / tier más
  bajo" (FR5.8).

Revisión del usuario tras el gate (Request Changes, 2026-08-28): se sustituyeron
los datos de relleno de la Pantalla 5 (Rutas y Días) por el calendario real de
Cofersa Costa Rica (34 zonas) del CSV de la raíz del repo, mapeando `Zona #`,
`Días de Carga` (→ días de salida) y `Días de entrega`. Los casos de borde
reales (zonas GAM del casco sin días, zona `44 REY` "Cita previa") quedan
ilustrados como el caso FR2.6. Sin cambios en las decisiones de diseño Q1–Q5.

## Assumptions & Open Questions

- Los nombres de `priority_tier` (crítico/alto/medio/bajo) usados en las
  maquetas son ilustrativos hasta cerrar OQ-1 de `requirements.md` (nº de niveles
  a homologar); el color del badge se remapea cuando se fije.
- El origen del "país del usuario" que preselecciona el selector proviene del
  token RLS (FR4.4 → FR10.3); la maqueta lo asume, no lo diseña.
- La maqueta de móvil (<768px) se describe por reglas de adaptación
  (tablas→tarjetas, panel→bottom sheet) en `interaction-spec.md`, no como
  pantallas aparte, por ser desktop-first (Q4=A).
