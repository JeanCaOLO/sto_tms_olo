# Refined Mockups — Preguntas de clarificación (Módulo OMS)

> Las pantallas del OMS y el design system ya están bien acotados por
> `requirements.md` (FR1–FR10), `PLAN_MODULO_OMS.md` §4–§5 y la ingeniería
> inversa del codekb (paleta teal/slate, `Card/Button/Badge/Input/Select/
> StatCard`, Remix Icon). Estas preguntas fijan solo las decisiones de diseño
> reales de este ciclo. Todas tienen valor por defecto; puedes decir "acepta
> los valores por defecto".
>
> El scope classic saltó rough-mockups y se saltó User Stories: los mockups se
> diseñan directamente desde los requerimientos, sin inventar wireframes
> previos.

---

## Q1. Fidelidad y formato de los mockups

¿Con qué fidelidad describo las pantallas en `mockups.md`?

- A. **(por defecto)** Media-alta fidelidad textual: por cada pantalla, layout
  por regiones (ASCII/estructura), jerarquía de contenido, los 5 estados
  (vacío/carga/éxito/error/parcial) y anotaciones de componentes del design
  system. Sin imágenes (es un artefacto markdown).
- B. Solo estructura (media fidelidad): layout y jerarquía, sin detallar los 5
  estados por pantalla.
- X. Other (please specify)

[Answer]: A

## Q2. Cobertura de pantallas

¿Qué pantallas del OMS incluyo?

- A. **(por defecto)** Las 6 del `PLAN_MODULO_OMS.md` §5: Mantenimiento de
  Rutas y Días de Despacho (FR1), Panel OMS (FR4), Cola de Priorización + panel
  lateral y override (FR2/FR3), Motor de Reglas (FR5), Simulador (FR6),
  Auditoría (FR7).
- B. Solo las MVP (rutas-despacho, panel, cola, motor de reglas); simulador y
  auditoría se describen a nivel de esqueleto.
- X. Other (please specify)

[Answer]: A

## Q3. Nivel de accesibilidad objetivo

- A. **(por defecto)** WCAG 2.1 AA como línea base (contraste, navegación por
  teclado, focus visible, roles ARIA), con checklist por pantalla.
- B. WCAG 2.1 A (mínimo legal), sin exigir AA.
- X. Other (please specify)

[Answer]: A

## Q4. Estrategia responsive

- A. **(por defecto)** Desktop-first (back-office operativo), con adaptación a
  tablet; tablas colapsan a tarjetas en <768px. Móvil es secundario.
- B. Mobile-first completo (móvil como ciudadano de primera clase).
- X. Other (please specify)

[Answer]: A

## Q5. Override manual (FR3.4) — patrón de interacción

- A. **(por defecto)** Modal de confirmación con selector de nuevo
  `priority_tier` + motivo obligatorio (≥10 caracteres), lanzado desde el panel
  lateral del pedido en la Cola.
- B. Edición inline en la fila de la Cola, sin modal.
- X. Other (please specify)

[Answer]: A

---

## Consolidated Summary Confirmation

Resumen de las decisiones de diseño de los mockups refinados del OMS:

- **Fidelidad (Q1=A)**: media-alta textual, con los 5 estados por pantalla.
- **Cobertura (Q2=A)**: las 6 pantallas (Panel, Cola, Motor de Reglas,
  Simulador, Rutas y Días, Auditoría), trazadas a FR1–FR7; transversales FR8
  (lago), FR9 (multipaís/selector de país) y FR10 (permisos) reflejados.
- **Accesibilidad (Q3=A)**: WCAG 2.1 AA.
- **Responsive (Q4=A)**: desktop-first con adaptación a tablet.
- **Override (Q5=A)**: modal desde el panel lateral con nuevo tier + motivo
  obligatorio (≥10) y registro en auditoría.

Hecho de negocio respetado: flujo 100 % automático, sin pantalla ni paso de
aprobación de lote; el override por pedido es la única intervención humana.
Revisión advisory del product-lead: READY (5 mejoras menores aplicadas).

Does this all look correct before I generate the requirements artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
