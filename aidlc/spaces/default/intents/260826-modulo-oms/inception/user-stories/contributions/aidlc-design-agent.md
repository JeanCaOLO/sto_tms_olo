**Collaborator:** aidlc-design-agent

> Revisión UX/diseño enfocada SOLO en lo que cambió o afecta UX con el pivote de
> reemplazo del WMH (D5 Calendario retirado, scope CUSTOMER→WAREHOUSE→COUNTRY→
> GLOBAL, D6 dos escrituras). No re-reviso historias no tocadas por el pivote.
> Veredicto global: las historias ya traen buen criterio UX base (US1 5 estados,
> US6 foco en modal, US14/US15 prevención de error, US23 confirmación). Aportes
> abajo son adiciones puntuales, no reescrituras.

---

## 1. Retirada del Calendario de rutas (E8) — ¿hueco de navegación?

**No deja hueco funcional, pero sí un hueco de orientación.** El Calendario era
una entrada de menú de primer nivel para el (ex) Operador de Despacho. Al
retirarla quedan dos riesgos UX concretos:

- **D-1 (navegación huérfana)** — Si la navegación tenía "Calendario de rutas"
  como ítem, retirarlo sin más deja a usuarios con el modelo mental viejo
  buscándolo. **Aporte**: en `refined-mockups` la nav debe quedar sin el ítem y,
  si hubiera deep-links/favoritos viejos, la ruta retirada debe resolver a un
  estado vacío explicativo ("El manejo de rutas se trasladó a Planificación"),
  no a un 404 mudo. Ya está citado como dependencia en la Nota de re-corrida de
  `mockups.md`; solo refuerzo que **incluya el redireccionamiento/estado, no solo
  el borrado de la pantalla**.
- **D-2 (expectativa de "¿dónde veo las rutas?")** — El Responsable del OMS (P4)
  antes razonaba sobre rutas al priorizar. Con ruteo dinámico ya no las ve, pero
  US7-fallback y US8 **siguen dependiendo de "regla de ruta" y "horas de corte
  de la ruta"**. **Aporte**: eso NO reintroduce una pantalla de calendario, pero
  el detalle de pedido (US6 modal) debería **mostrar de forma legible qué regla
  de ruta/corte se aplicó** (texto, no editable) para que el override (US14) sea
  una decisión informada. Esto es visibilidad del estado del sistema, no CRUD de
  rutas — se mantiene dentro de alcance.

---

## 2. Selector de scope país→almacén→cliente (US3 / US30) — UX

Aquí hay una **inconsistencia real que el pivote dejó a medias** y conviene
cerrarla antes de `refined-mockups`:

- **D-3 (US3 quedó con lenguaje viejo)** — US30/US31 ya hablan de scope
  jerárquico `CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL`, pero **US3 sigue diciendo
  "alternar compañía"** (modelo viejo del selector de compañía). UX: el usuario
  no "cambia de compañía", **acota su scope dentro del que tiene permitido**.
  **Aporte**: el selector de la Cola debería ser un **selector de scope
  jerárquico** (país → almacén → cliente), no un dropdown plano de compañías,
  coherente con US30. Lo señalo como tensión a reconciliar (no edito US3); el
  texto de US3 debería realinearse a "acotar scope" o dejar claro que "compañía"
  es un nivel del scope, no el eje.
- **D-4 (jerarquía legible, no cascada ciega)** — Con 4 niveles, el riesgo UX es
  el típico de los selectores en cascada: el usuario no sabe en qué nivel está
  parado ni qué hay por debajo. **Aporte para refined-mockups**:
  - Mostrar el scope activo como **breadcrumb/pills** siempre visibles (p. ej.
    `Costa Rica › Almacén Zapote › Cofersa`), no solo dentro del dropdown.
  - **Herencia implícita visible**: si el usuario elige solo país, dejar claro
    que incluye todos los almacenes/clientes debajo ("Todos los almacenes").
  - Un usuario con scope de un solo nivel (p. ej. CUSTOMER=EPA, caso de US30)
    **no debe ver un selector vacío ni editable**: scope fijo mostrado como pill
    de solo lectura. Enlaza con US32 (niveles de acceso) + US30 (fail-closed): el
    selector nunca ofrece scopes fuera del permiso (se ocultan, no se deshabilitan
    con rebote — mismo patrón que US15).
  - Accesibilidad: cada nivel navegable por teclado, con `aria-label` que anuncie
    el nivel ("Nivel país, 2 de 4") y combos con rol `combobox`/`listbox`.

---

## 3. Historias de 1ª entrega (Cola US1-US6, override US14-US15) — ¿UX/a11y suficiente?

Base sólida. Dos adiciones:

- **US1 — OK con una nota.** Los 5 estados están bien definidos. **Aporte**: el
  estado "sin conexión al motor" debería distinguir **"el motor no ha corrido
  hoy" vs "no hay pedidos"** — son dos vacíos distintos y confundirlos haría que
  el Responsable crea que no hay trabajo cuando en realidad el motor falló.
  Mensaje accionable en el primer caso ("El motor no ha corrido hoy", no tabla en
  blanco ni spinner infinito).
- **US6 — OK (foco atrapado + Esc + retorno de foco ya cubre WCAG 2.1.2/2.4.3).**
  Sin cambios.
- **US14 — OK y bien resuelto** (botón deshabilitado + requisito previo, no
  alerta posterior). **Aporte menor de a11y**: el motivo obligatorio debe tener
  `aria-required` y el mensaje de validación asociado por `aria-describedby`, y
  el estado deshabilitado del botón **no puede ser la única señal** (un botón
  gris no comunica *por qué*): acompañar con texto "Indica un motivo para
  aplicar". Esto evita el anti-patrón de "botón muerto sin explicación".
- **US15 — OK** (ocultar/deshabilitar con tooltip, no ofrecer para rebotar).
  Coherente con el patrón que pido en D-4 para el selector de scope.

**Falta transversal menor (D-5)**: ninguna historia de 1ª entrega fija **contraste
de color ni indicador no-dependiente-de-color** para la prioridad invertida
(menor = más urgente). Un número solo, o peor un color solo, no basta. **Aporte**:
la urgencia debe leerse sin depender del color (número + etiqueta/ícono), y el
color de refuerzo cumplir contraste AA. Lo dejo como criterio de a11y para
refined-mockups, no como historia nueva.

---

## 4. Estados vacíos/error nuevos por el modelo de dos escrituras (US9, D6)

El modelo de dos escrituras (tabla propia OMS = handoff + situación en WMS)
introduce un **estado de inconsistencia que la UX debe poder representar**, y hoy
ninguna historia lo cubre:

- **D-6 (divergencia entre las dos escrituras)** — US9 exige escritura 1 atómica
  (nunca `GENERADA` sin prioridad) pero las dos escrituras (tabla OMS vs
  situación WMS) **no son una sola transacción atómica entre sí**. Si la
  escritura 2 (WMS) falla tras la 1 (OMS), un pedido queda "generado en el OMS"
  pero sin disparar picking en el WMS. **Aporte UX**: la Cola (US1) y/o el detalle
  (US6) deberían poder mostrar un **badge de "handoff pendiente / desincronizado"**
  para esos pedidos, en lugar de mostrarlos como `GENERADA` normales (lo que haría
  creer al Responsable que el picking ya salió). No pido resolver la consistencia
  aquí (es dominio/arquitectura), pero **la UX necesita un estado para lo que el
  modelo de datos ya permite que ocurra**. Lo marco como estado a diseñar en
  refined-mockups + posible historia en construcción.
  `ponytail:` techo = badge de solo lectura derivado de comparar situación OMS vs
  WMS; upgrade = reconciliación/reintento automático con su propio estado.
- **D-7 (frontera con Planificación, US9)** — "Planificación lee de la tabla
  propia del OMS". Desde el OMS no se ve el viaje, pero el Responsable podría
  querer saber **si Planificación ya tomó el pedido**. **Aporte**: no agregar
  pantalla de viajes (fuera de alcance), pero sí dejar previsto en el detalle un
  campo de solo lectura "estado de handoff" (alistado / tomado por Planificación)
  si el dato está disponible por la tabla del OMS. Si no está disponible, estado
  vacío honesto ("sin información de Planificación"), nunca inventar un estado.

---

## Resumen de aportes (para quien integre)

| id | Tema | Historia(s) | Tipo |
|---|---|---|---|
| D-1 | Ruta retirada → estado/redirección, no 404 | E8/nav | refined-mockups |
| D-2 | Mostrar regla de ruta/corte aplicada en detalle | US6, US7, US8 | visibilidad |
| D-3 | US3 con lenguaje viejo "compañía" vs scope | US3 ↔ US30 | reconciliar texto |
| D-4 | Selector de scope jerárquico: breadcrumb, herencia, a11y | US3, US30, US32 | refined-mockups |
| D-5 | Prioridad no-dependiente-de-color + contraste AA | US1, US10 | a11y |
| D-6 | Estado "handoff desincronizado" entre las 2 escrituras | US9 | estado nuevo |
| D-7 | Estado de handoff hacia Planificación (solo lectura) | US9 | estado nuevo |

Ninguno exige editar `stories.md` para la 1ª entrega salvo la **reconciliación de
texto de US3 (D-3)**; el resto son criterios de a11y/estado que aterrizan en
`refined-mockups` y, para D-6, posiblemente una historia de construcción.
