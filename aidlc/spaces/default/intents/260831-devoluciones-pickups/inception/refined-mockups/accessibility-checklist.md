# Accessibility Checklist — Devoluciones/Pickups (FR16)

WCAG 2.1 AA. Cubre los cambios de `mockups.md` / `interaction-spec.md`;
respeta `../requirements-analysis/requirements.md` NFR-3.

## Distinción no-solo-color (WCAG 1.4.1)

- [ ] El tipo devolución se comunica por **ícono + texto** ("Devolución"),
      además del color indigo. Verificable: quitar el color y seguir
      distinguiendo entrega de devolución.
- [ ] En el mapa, los legs de recolección usan una línea **discontinua** (`dashArray:"6 6"`) además del color indigo — decisión firme, no condicional.
- [ ] Cada parada expone `aria-label` con su tipo para lectores de pantalla.

## Contraste (WCAG 1.4.3)

- [ ] `indigo-700` (#4338ca) sobre `white` (#ffffff): ratio ≈ 8.6:1 → **AAA** para texto normal.
- [ ] `indigo-700` (#4338ca) sobre `indigo-100` (#e0e7ff): ratio ≈ 7:1 → **AA** incluso para texto pequeño.
- [ ] El chip amber de estado mantiene su contraste actual (sin cambios).

## Teclado (WCAG 2.1.1)

- [ ] El badge de tipo NO es focusable (es informativo, no interactivo).
- [ ] "Excluir de ruta" sigue alcanzable por Tab, sin cambios.
- [ ] La leyenda del mapa no atrapa el foco.

## Estructura / landmarks (WCAG 1.3.1) — resuelve rough-mockups Minor #5

- [ ] La página conserva un único `<main>` y un único `<h1>`; los paneles de
      pedidos y de ruta son `<section>` con `<h2>`; las cards son `<article>`
      con `<h3>` = nombre del cliente. FR16 no agrega headings ni landmarks.

## Estados (WCAG 4.1.3)

- [ ] La nota "incluye N kg de devoluciones" de `CapacityBar` se anuncia
      cuando aparece (`aria-live="polite"` o parte del `role="status"` de FR2).
- [ ] La alerta de exclusión por capacidad usa `role="status"` (no
      `alert`, no bloqueante) — patrón FR2, sin cambios.

## Verificación

- [ ] La suite e2e (`e2e/planificacion-flujo.spec.ts`) se extiende con una
      aserción de que cada parada resuelve su tipo vía texto accesible, no solo
      color (se define en build-and-test).

## Assumptions & Open Questions

- [assumption] Los ratios de contraste anotados son estimados de la paleta
  Tailwind; se confirman con herramienta en la implementación.
