# Checklist de accesibilidad — Módulo OMS (WCAG 2.1 AA)

> Nivel objetivo: **WCAG 2.1 AA** (Q3=A). Aplica a las 6 pantallas de
> `mockups.md` y a los componentes de `interaction-spec.md`. Estructurado por los
> cuatro principios POUR de `.kiro/knowledge/aidlc-design-agent/accessibility-wcag.md`.
>
> Nota de alcance: este checklist es la **especificación de accesibilidad** a
> cumplir en Construcción. La validación completa exige pruebas manuales con
> tecnología de asistencia (lectores de pantalla) y revisión experta; no puede
> certificarse solo desde este documento.

## Perceptible

- [ ] Contraste de texto ≥ 4.5:1 (normal) y ≥ 3:1 (grande). La paleta
  slate/teal del design system cumple; verificar el texto sobre badges de color.
- [ ] **El `priority_tier` NUNCA se transmite solo por color**: el PriorityBadge
  incluye siempre el **texto del nivel** además del color (crítico requisito, la
  cola entera se ordena por prioridad).
- [ ] Los marcadores de cambio del Simulador (Δposición, cambio de tier) usan
  **icono + texto**, no solo color (FR6.3).
- [ ] Los KPIs con umbral superado (Panel, FR4.3) se marcan con badge textual +
  icono, no solo color.
- [ ] Iconos Remix (`ri-*`) decorativos con `aria-hidden="true"`; iconos
  informativos con `aria-label`.

## Operable (teclado)

- [ ] Toda la funcionalidad accesible por teclado: tablas (fila a fila), filtros,
  formularios de rutas/reglas, override.
- [ ] Foco visible en todo elemento interactivo (`ring-2 ring-teal-500` ya
  existente; nunca `outline: none` sin reemplazo).
- [ ] Orden de tabulación lógico (izq→der, arriba→abajo) por pantalla.
- [ ] **OverrideModal y todo modal**: foco atrapado dentro, cierre con Escape,
  el foco vuelve al botón lanzador; foco inicial al primer control (selector de
  tier).
- [ ] **QueueSidePanel**: el foco entra al panel al seleccionar una fila y
  regresa a la fila al cerrarlo.
- [ ] Objetivos táctiles ≥ 44×44 px (relevante en tablet, Q4=A).
- [ ] Refrescos automáticos (Panel 60 s, Cola ≤5 s) **no roban el foco** ni
  reordenan bajo el cursor del usuario sin aviso; usar `aria-live="polite"`.

## Comprensible

- [ ] Idioma declarado en HTML (`lang="es"`).
- [ ] Todo input con `<label>` visible asociado (`for`/`id`), no solo
  placeholder — formularios de rutas (FR1), reglas (FR5), override (FR3).
- [ ] Errores identificados en texto específico, no solo borde rojo: "El motivo
  debe tener al menos 10 caracteres" (FR3.4), "La ruta ya existe para este país"
  (FR1.5), "Campo inexistente: `<campo>`" (FR5.6).
- [ ] Navegación y ubicación de acciones consistentes entre las 6 pantallas.
- [ ] Acciones sensibles (override, aplicar reglas) requieren acción explícita y
  confirmación (FR3.4, FR6.5); nunca auto-submit.

## Robusto

- [ ] HTML semántico: `<table>` con `<th scope>`, encabezados h1–h6 en orden,
  landmarks (`<nav>` sidebar, `<main>` contenido, `<header>`).
- [ ] ARIA solo donde el HTML nativo no basta; preferir `<button>`/`<select>`
  reales (RuleBuilder, override, filtros).
- [ ] `aria-sort` en columnas ordenables de la Cola/Auditoría.
- [ ] `aria-live="polite"` para: actualización de la cola (FR3.8), refresco del
  panel (FR4.6), resultado de simulación (FR6), estado de sincronización al lago
  (FR8).
- [ ] Estados vacío/carga/error anunciados a lector de pantalla, no solo
  visuales.

## Por componente (resumen)

| Componente | Rol ARIA | Teclado | Anuncio |
|---|---|---|---|
| CountrySelector | combobox | flechas + Enter | "Mostrando datos de <país>" |
| PriorityBadge | — (texto) | — | "Prioridad: <tier>" |
| DataTable | table | fila a fila, `aria-sort` | filas totales / página |
| QueueSidePanel | complementary | Tab dentro, retorno de foco | detalle del pedido |
| OverrideModal | dialog (modal) | Escape, foco atrapado | éxito/error del override |
| RuleBuilder | form | Tab, validación en blur | error de campo inválido |
| SimulationCompare | 2× table | Tab entre columnas | resumen al completar |

## Cómo se verifica (en Construcción)

1. Escaneo automático (axe / Lighthouse) — cubre ~30%.
2. Prueba solo con teclado (sin ratón) en las 6 pantallas.
3. Lector de pantalla (NVDA/VoiceOver) en los flujos de override y de reglas.
4. Zoom a 200% y 400%.
5. Simulación de daltonismo (verifica que el tier se entiende sin color).

## Sources

- `.kiro/knowledge/aidlc-design-agent/accessibility-wcag.md` — principios POUR,
  patrones de teclado por componente, fallos comunes.
- `.kiro/knowledge/aidlc-design-agent/ux-guide.md` — requisitos WCAG AA y patrones
  de formulario/tabla/feedback.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/refined-mockups/interaction-spec.md`
  — componentes y sus notas de accesibilidad.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md`
  — FR con estados de error/mensajes específicos y NFR de refresco que exigen
  `aria-live`.

## Assumptions & Open Questions

- La certificación WCAG AA completa requiere pruebas manuales con tecnología de
  asistencia y revisión experta en Construcción; este checklist es la
  especificación, no la certificación.
- El contraste exacto del texto sobre cada color de badge se valida con
  herramienta de contraste al implementar (los tokens base cumplen, falta el caso
  texto-sobre-badge).
