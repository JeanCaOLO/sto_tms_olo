# Especificación de interacción — Módulo OMS

> Especificaciones a nivel de componente para las pantallas de `mockups.md`,
> siguiendo el formato de `.kiro/knowledge/aidlc-design-agent/component-spec-template.md`.
> Consume `requirements.md` (FR1–FR10). Los componentes se construyen sobre el
> design system existente (ver `design-system-mapping.md`).

## Componentes transversales

### CountrySelector

| Campo | Valor |
|---|---|
| Componente | CountrySelector |
| Descripción | Selector de país (Costa Rica / Venezuela) obligatorio en el header del OMS |
| Categoría | navigation / input |

**Estados**: default (país del token preseleccionado, FR4.4), focus, disabled
(usuario restringido a un solo país, FR10.6 → selector fijo), error (sin país →
la vista de Cola se bloquea, FR9.3).

**Props**: `value` (string CR|VE, requerido), `allowedCountries` (array, del
token), `onChange` (handler). 

**Responsive**: desktop = dropdown en header; móvil = dropdown a ancho completo
bajo el título.

**Accesibilidad**: `role="combobox"`, `aria-label="País"`, navegación por flechas
+ Enter, foco visible; el cambio de país anuncia `aria-live="polite"` "Mostrando
datos de <país>".

---

### PriorityBadge

| Campo | Valor |
|---|---|
| Componente | PriorityBadge |
| Descripción | Badge de `priority_tier` que mapea nivel → color de estado del design system |
| Categoría | display |

**Estados**: uno por tier. Mapeo (ilustrativo hasta OQ-1): crítico→`danger`,
alto→`warning`, medio→`info`, bajo→`default`.

**Props**: `tier` (enum), `showLabel` (boolean, default true).

**Accesibilidad**: el nivel NO se transmite solo por color (FR + WCAG): el badge
incluye **texto del tier** siempre; contraste AA (≥4.5:1). `aria-label="Prioridad:
<tier>"`.

---

### DataTable (base de Cola, Auditoría, Rutas, Reglas)

| Campo | Valor |
|---|---|
| Componente | DataTable |
| Descripción | Tabla paginada con orden, filtros y estados; base de las tablas del OMS |
| Categoría | display |

**Estados**: default, loading (skeleton de filas), empty (mensaje + CTA cuando
aplica), error (banner + reintento), partial (filtro sin resultados).

**Props**: `columns`, `rows`, `pageSize` (default 50, FR3.1/FR7.3),
`sort` (columna+dirección), `onRowSelect`, `emptyMessage`.

**Responsive**: <768px cada fila colapsa a **tarjeta** apilada (label:valor).

**Accesibilidad**: `<table>` semántica con `<th scope="col">`; orden por columna
con `aria-sort`; navegación por teclado fila a fila; foco visible.

---

## Componentes por pantalla

### QueueSidePanel (Cola, FR3.6)

| Campo | Valor |
|---|---|
| Componente | QueueSidePanel |
| Descripción | Panel lateral de detalle de un pedido, sin abandonar la vista de cola |
| Categoría | layout / display |

**Estados**: empty ("Selecciona un pedido…"), populated (campos del pedido +
fecha de ingreso + reglas que contribuyeron al score + historial), loading
(skeleton del panel).

**Contenido**: identificador, cliente, ruta, tier, score, `ready_to_prep_date`,
estado; **desglose de reglas** (nombre + peso aportado, FR3.6); **historial** de
cambios de prioridad; botón **Alterar prioridad** (solo con permiso de operación,
FR3.7).

**Responsive**: desktop = panel lateral derecho fijo; <768px = **bottom sheet**.

**Accesibilidad**: `role="complementary"`, `aria-labelledby` al identificador del
pedido; el botón de override es un `<button>` real; foco entra al panel al
seleccionar fila y vuelve a la fila al cerrarlo.

---

### OverrideModal (override manual, FR3.4/FR3.5) — Q5=A

| Campo | Valor |
|---|---|
| Componente | OverrideModal |
| Descripción | Modal de confirmación para alterar la prioridad de un pedido puntual |
| Categoría | feedback / input |

**Estados**: default (formulario), validando (motivo <10 chars → submit
deshabilitado con explicación), submitting (spinner), success (confirmación
inline + cierre), error (mensaje accionable, sin aplicar cambio).

**Props**: `orderId`, `currentTier`, `onConfirm(newTier, reason)`, `onCancel`.

**Campos**: selector de nuevo `priority_tier`; **motivo obligatorio ≥10
caracteres** (FR3.4). Al confirmar: recalcula score, reordena la cola, registra
en auditoría (FR3.5) y sincroniza al lago (FR8.5).

**Accesibilidad (patrón modal, `interaction-design-patterns.md`)**: `role="dialog"`
`aria-modal="true"`, foco atrapado dentro, cierre con Escape, foco vuelve al
botón lanzador; el foco inicial va al selector de tier.

**Prevención de error**: es una acción sensible (FR10) → confirmación explícita;
el botón Confirmar se habilita solo con tier elegido + motivo válido.

---

### RuleBuilder (Motor de Reglas, FR5.1)

| Campo | Valor |
|---|---|
| Componente | RuleBuilder |
| Descripción | Constructor visual "si condición → peso" de una regla de priorización |
| Categoría | input |

**Estados**: default, editando, error (campo inexistente → error inline
indicando el campo, FR5.6), disabled (perfil al límite de 50 reglas, FR5.7).

**Campos**: nombre (1–100), condición = campo del pedido + operador (igual /
distinto / mayor / menor / mayor-igual / menor-igual / contiene) + valor
esperado; peso (entero 1–1000); estado inicial (activa/inactiva) (FR5.1).

**Accesibilidad**: cada control es un input etiquetado (`<label for>`); validación
inline en blur; el error se anuncia con `aria-describedby`.

---

### SimulationCompare (Simulador, FR6.2/FR6.3)

| Campo | Valor |
|---|---|
| Componente | SimulationCompare |
| Descripción | Comparación en dos columnas cola actual vs. simulada |
| Categoría | display |

**Estados**: empty (sin reglas seleccionadas), loading (barra de progreso ≤30 s,
FR6.1), populated (dos columnas + marcadores de cambio), high-impact (>30% cambia
de tier → modal de confirmación, FR6.5), error/timeout (cancelado, sin tocar
producción, FR6.6).

**Accesibilidad**: las dos columnas son tablas semánticas paralelas; los cambios
de posición/tier se marcan con **icono + texto** (Δpos, ⚠), no solo color; el
resumen se anuncia `aria-live="polite"` al completar.

---

### KpiStatCard (Panel, FR4.1/FR4.3)

| Campo | Valor |
|---|---|
| Componente | KpiStatCard |
| Descripción | Tarjeta de KPI con umbral y badge de estado |
| Categoría | display |

**Estados**: normal, warning (umbral de atención → badge `warning`), danger
(umbral crítico → badge `danger`) (FR4.3), loading (skeleton).

**Accesibilidad**: el estado de umbral se expresa con badge textual + icono, no
solo color; valor y etiqueta legibles con contraste AA.

---

## Flujos de interacción clave

```
Flujo: Alterar prioridad de un pedido puntual (única intervención humana, FR3)
Persona: Responsable del OMS (permiso de operación)
Disparador: detecta en la Cola un pedido urgente que debe romper el orden
Pasos:
  1. Cola → clic en la fila del pedido → se abre QueueSidePanel (detalle)
  2. QueueSidePanel → clic en "Alterar prioridad" → se abre OverrideModal
  3. OverrideModal → elige nuevo tier + escribe motivo (≥10) → Confirmar
  4. Sistema → recalcula score, reordena cola (≤5 s), registra en auditoría,
     sincroniza al lago (≤5 s)
Éxito: la fila cambia de posición/tier con confirmación inline; auditoría lo
  registra como cambio manual con usuario + motivo
Rutas de error:
  - motivo <10 chars → Confirmar deshabilitado con explicación
  - sin permiso de operación → botón "Alterar prioridad" no visible (FR3.7)
  - fallo de sincronización al lago → pedido "pendiente de sincronización" +
    alerta en Panel (FR8.4); el override local ya quedó registrado
```

```
Flujo: Publicar un cambio de reglas con vista previa (FR5/FR6)
Persona: Administrador de Módulo (permiso de administración)
Pasos:
  1. Motor de Reglas → crea/edita regla en RuleBuilder → guarda (inactiva)
  2. Simulador → selecciona la(s) regla(s) → Simular
  3. SimulationCompare → revisa cola actual vs. simulada + resumen
  4. Si >30% cambia de tier → confirma "impacto alto" (FR6.5)
  5. Aplica como reglas activas (preserva overrides vigentes, FR6.4)
Éxito: las reglas quedan activas; el motor recalcula la cola
Rutas de error: timeout de simulación → cancelado sin tocar producción (FR6.6)
```

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md`
  — FR3 (override, panel lateral), FR5 (constructor de reglas), FR6 (simulador),
  FR4 (KPIs con umbral), FR9 (país), FR10 (permisos que ocultan acciones).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/refined-mockups/mockups.md`
  — pantallas y estados que estos componentes materializan.
- `.kiro/knowledge/aidlc-design-agent/component-spec-template.md` — formato de
  las fichas de componente.
- `.kiro/knowledge/aidlc-design-agent/interaction-design-patterns.md` — patrón de
  modal (foco atrapado, Escape, retorno de foco), validación inline, split-screen.

## Assumptions & Open Questions

- Los componentes nuevos (RuleBuilder, QueueSidePanel, OverrideModal,
  SimulationCompare) se construyen como wrappers en `shared/` sobre el design
  system existente y se proponen de vuelta al sistema, según `PLAN_MODULO_OMS.md`
  §4; su implementación real es trabajo de Construcción, no de esta etapa.
- El mapeo tier→color del PriorityBadge se recalibra cuando se cierre OQ-1
  (número de niveles de prioridad).
