# Wireframes (baja fidelidad) — Devoluciones/Pickups (FR16)

Concepto visual para FR16.1–16.3 según `../scope-definition/scope-document.md`
y `../scope-definition/intent-backlog.md`. **No hay pantallas nuevas** — son
cambios sobre las vistas existentes de la página de Planificación descritas en
`../intent-capture/intent-statement.md`. Fidelidad baja; el color y el espaciado
exactos se afinan en refined-mockups.

## Convención visual

| Tipo de parada | Acento | Ícono | Etiqueta |
|----------------|--------|-------|----------|
| Entrega (delivery) | estilo actual (neutro / teal) | `ri-arrow-down-box-line` (dejar en cliente) | — (implícito) |
| Devolución (reverse pickup) | acento propio: **azul / índigo** (`indigo-600` tentativo) | `ri-arrow-go-back-line` (recoger hacia el CD) | `Devolución` |
| Fuera de ventana / excepción | amber (ya existente) | ya existente | ya existente |

Regla: la distinción **nunca** es solo color — siempre color + ícono + texto
(FR16.2, accesibilidad WCAG AA).

## Pantalla 1 — Lista de paradas de la ruta (panel derecho)

```
+---------------------------------------------------+
|  Paradas en ruta (6)              [Optimizar]     |
+---------------------------------------------------+
|  1  [E]  Supermercado Central        320 kg  8:15 |
|  2  [E]  Minimarket Las Condes       185 kg  8:40 |
|  3  [D]  Ferretería Grecia (Devol.)  150 kg  9:05 |   <- acento indigo, icono go-back
|  4  [E]  Almacén Maipú               450 kg  9:35 |
|  5  [D]  Bodega Santa Ana (Devol.)   210 kg  9:58 |
|  6  [E]  Distribuidora Norte  [fuera de ventana]  |   <- amber, sin cambios
+---------------------------------------------------+
```

<!-- Text fallback: lista numerada de paradas; cada fila muestra un badge de
tipo ([E]=entrega, [D]=devolución), nombre del cliente, peso y ETA. Las filas
de devolución llevan acento índigo, el ícono ri-arrow-go-back-line y el sufijo
"(Devol.)"; las de fuera de ventana conservan el amber actual. -->

- Accesibilidad: `h2` "Paradas en ruta"; landmark `main` (panel de ruta);
  entrada de teclado = primer control accionable de la fila (botón "Excluir").
  El tipo de parada se expone también como texto (`aria-label` "Parada de
  devolución") para lectores de pantalla.

## Pantalla 2 — Card de parada de devolución (panel de pedidos / izquierda)

```
+-------------------------------------------+
| [Devolución]  Ferretería Grecia           |   <- badge indigo + icono
| Av. 2, contiguo al parque central, Grecia |
| Peso 150 kg   ·   Volumen 2.2 m3          |
| Recolección conocida — viene del viaje    |
|                          [Excluir de ruta]|
+-------------------------------------------+
```

<!-- Text fallback: tarjeta de una parada de devolución. Encabezado con badge
"Devolución" (acento índigo + icono go-back) y nombre del cliente; dirección;
peso y volumen; nota "Recolección conocida — viene del viaje"; botón "Excluir de
ruta". Misma estructura que la card de entrega, solo cambia el badge/acento. -->

- Accesibilidad: `h3` = nombre del cliente; la tarjeta es un `article`; botón
  "Excluir" alcanzable por teclado; contraste AA en el badge índigo sobre
  fondo claro.

## Pantalla 3 — Mapa

```
        (E) --- (E)
         \       \
          (D)     (E)          leyenda:
           \      /            (E) pin teal  = entrega
            (E)--(D)           (D) pin indigo = devolución
             \
             [CD] (inicio)
```

<!-- Text fallback: el mapa muestra el CD como punto de inicio y las paradas
como pines. Los pines de entrega usan el color teal actual; los de devolución
usan índigo y un glifo distinto (flecha de retorno). Una leyenda arriba a la
derecha explica ambos. -->

- Accesibilidad: el mapa mantiene la lista textual de Pantalla 1 como
  equivalente accesible; los pines tienen `title`/tooltip con el nombre y el
  tipo.

## Pantalla 4 — Barra de capacidad del vehículo (FR16.3)

```
Peso     [##########  75%  ] 2.550 / 3.400 kg
Volumen  [############ 92%  ] 16,5 / 18,0 m3
                             ^ incluye 360 kg / 3,4 m3 de 2 devoluciones

! 1 pedido de entrega excluido por capacidad (misma alerta que FR2)
```

<!-- Text fallback: dos barras de progreso (peso y volumen) que ya incluyen el
peso/volumen de las devoluciones conocidas. Debajo, una nota indica cuánto
aportan las devoluciones. Si algo se excluye por capacidad, aparece la misma
alerta que ya usa FR2 para cualquier exclusión. -->

- Accesibilidad: cada barra con `role="progressbar"` y `aria-valuenow`; la
  alerta de exclusión es un `role="status"` (no bloqueante).

## Assumptions & Open Questions

- [assumption] El color final para devoluciones (índigo) se valida contra el
  design system en refined-mockups; requirements.md sugiere "azul o rojo".
- Open question: si una devolución también puede estar "fuera de ventana",
  cómo se combinan los dos acentos (índigo + amber) — a resolver en
  refined-mockups.

## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-09-01T13:36:58Z
**Iteration:** 1
**Review class:** advisory (pase único; los hallazgos van al humano en el gate, sin ciclo de correcciones)

### Findings

| # | Severidad | Ubicación | Hallazgo | Recomendación |
|---|-----------|-----------|----------|---------------|
| 1 | Major | wireframes.md (global) / rough-mockups-questions.md | El paso 5 de la definición de stage pide explícitamente un "information architecture outline" y el paso 3 incluye la pregunta "¿cómo se ve la jerarquía de información?". No se hizo esa pregunta (Q1–Q6 no la cubren) y el artefacto no tiene una sección de arquitectura de información / jerarquía: solo hay 4 pantallas sueltas y la tabla de convención visual. Para un cambio brownfield acotado el impacto es bajo, pero queda un entregable del stage sin producir. | Añadir un breve outline de IA (dónde vive cada pantalla dentro de la página de Planificación, orden de lectura, prioridad visual entrega vs. devolución vs. excepción) aunque sea 5–6 líneas, o registrar explícitamente por qué se omite en un brownfield. |
| 2 | Major | wireframes.md — Pantalla 1, Pantalla 2, Pantalla 4 | No se muestran estados iniciales / vacíos: viaje sin seleccionar, viaje sin ninguna devolución conocida, `CapacityBar` sin devoluciones (¿desaparece la nota "incluye N kg de devoluciones"?). Solo se dibuja el caso poblado y el caso de exclusión por capacidad. QA no puede derivar el comportamiento del caso vacío desde estos wireframes. | Añadir una nota de una línea por pantalla para el caso "cero devoluciones" (comportamiento = idéntico a hoy) y para "viaje sin seleccionar". |
| 3 | Major | wireframes.md — Assumptions & Open Questions (combinación índigo + amber) | La combinación "devolución que además está fuera de ventana / es excepción" se registra como open question y se difiere a refined-mockups, pero es un estado real y frecuente (una devolución sin coordenadas ya es una "excepción" según user-flow.md). Difiriéndolo entero, refined-mockups entra sin una decisión de concepto que le corresponde a este stage. | Fijar al menos la regla de concepto ahora (p. ej. "el acento de tipo —índigo— manda en el borde/badge; el estado —amber— se muestra como chip aparte"), dejando solo el color exacto para refined-mockups. |
| 4 | Minor | user-flow.md — diagrama ASCII happy path | Acentos eliminados en el diagrama ("paradas mas", "exclusion", "recoleccion") mientras el resto del documento sí los lleva. Inconsistencia cosmética; el fallback de texto sí está presente. | Corregir los acentos en el bloque ASCII o dejar constancia de que es intencional por compatibilidad. |
| 5 | Minor | wireframes.md — notas de accesibilidad | Pantalla 1 declara landmark `main` para el panel derecho y Pantalla 2 un `article` dentro del panel izquierdo, pero no se aclara cuál es el `main` único de la página ni dónde está el `h1` (la página ya existe: h2/h3 propuestos deben colgar de un h1 existente). Riesgo de dos `main` o saltos de nivel de encabezado. | Añadir una línea que ancle las pantallas al landmark/h1 existente de la página de Planificación. |
| 6 | Minor | wireframes.md — Pantalla 3 (mapa) | El ícono de devolución en el mapa se describe como "glifo distinto (flecha de retorno)" pero no se nombra el token como sí se hace en la tabla de convención (`ri-arrow-go-back-line`). Trazabilidad menor. | Reusar el nombre del ícono de la tabla para el pin del mapa. |

### Summary

Concepto visual sólido y bien trazado a FR16.1–16.3: no inventa pantallas, reutiliza el design system, respeta la regla no-solo-color (color + ícono + etiqueta) y engancha correctamente el aviso de capacidad con el patrón existente de FR2. La distinción del acento índigo (en vez del "azul o rojo" de requirements.md) está justificada —el amber ya está tomado— y registrada como supuesto para refined-mockups. Lo que el humano debería sopesar antes de aprobar: falta el outline de arquitectura de información que pide el stage (y la pregunta de jerarquía no se hizo), no se dibujan los estados vacíos/iniciales, y la combinación tipo-devolución + estado-excepción se difiere entera cuando la regla de concepto cabe en este stage. Ninguno es bloqueante para un gate de Ideation advisory. Veredicto: READY.
