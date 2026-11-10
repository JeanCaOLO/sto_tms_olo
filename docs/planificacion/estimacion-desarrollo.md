# Plan y estimación — Módulo Planificación (marco AIDLC)

> **Actualizado 2026-11-05.** Enmarca el desarrollo del módulo en las fases de AI-DLC (Ideation →
> Inception → Construction → Operation) a partir de los artefactos vivos:
> [requerimientos](../requirements/planificacion/documento-de-requerimientos-planificacion.md) e
> [historias](../stories/planificacion/historias-de-usuario-planificacion.md). **No** es una corrida
> de la metodología, sino la estimación. Reemplaza la versión del 2026-10-07.

## Resumen: vamos bien ✅

**El núcleo del módulo está construido, desplegado en AWS (sandbox) y funcionando con datos reales de
eFlow.** Desde la estimación del 7 de octubre se entregó más de lo previsto y cambió el enfoque: la
planificación pasó a ser **automática**. Ya no se genera, edita ni confirma a mano: el sistema arma
los viajes cada hora y el OMS prioriza sobre ese resultado.

Lo que queda (~**9–15 dev-días**) entra con holgura antes del cierre del proyecto:

| Hito del proyecto | Fecha |
|---|---|
| Devoluciones / logística inversa | 12-nov |
| Pruebas técnicas integrales | 16/19-nov |
| Pruebas funcionales | 23-nov |
| Entrega con estabilización | 30-nov |

**Avance estimado del módulo: ~85 %** (12 de 14 historias entregadas; los pendientes son ajustes y
dependencias externas, no el núcleo).

## 1. Estado por fase AIDLC

| Fase AIDLC | Estado | Nota |
|---|---|---|
| Ideation | ✅ Hecho | intent `260825-route-planning-reqs` |
| Inception (requerimientos e historias) | ✅ Hecho | FR1–FR11, 14 historias con Given/When/Then (2026-11-05); 2 en borrador por decisión de negocio (012, 013) |
| Construction | 🟢 Núcleo entregado | 12 historias Delivered; quedan 4 Bolts chicos (abajo) |
| Operation (AWS) | 🟢 En sandbox | stacks `dev-tms-*` desplegados al mergear a `main`; replan programado activo; falta QA/PROD |

## 2. Lo entregado desde el 2026-10-07

| Entrega | Historia / FR | Fecha |
|---|---|---|
| Ingesta real de eFlow (DISP/DISP → Aurora), con líneas y espejo | 001 / FR1 | oct–nov |
| **Planificación automática** por capacidad (85 % peso, 95 % volumen, 16 paradas), flota propia | 004 / FR4 | oct |
| Cliente retira sin camión (detección por texto) | 006 / FR4.2 | 20-oct |
| Fecha de salida dinámica (T-n por distancia) y número de viaje escrito a eFlow (simulado) | 007 / FR5 | oct |
| Handoff al OMS por columnas, probado de punta a punta con el barrido del OMS | 008 / FR7 | 21-oct → 5-nov |
| **Replan cada hora** (05:00–16:00, lunes a viernes) sin tocar los viajes liberados | 009 / FR6 | 3-nov |
| **Bandeja de pedidos** con devoluciones y filtro Delivery/Pickup | 002 / FR2 | 3-nov |
| Cambio de fecha de entrega (solo admin, con registro y contador) | 003 / FR3 | 3-nov |
| Calendario de lunes a domingo | 011 / FR9 | 3-nov |
| **Estándar de BD OLTP Intelix**: renombrado de toda `tms_olo` y retiro de las vistas viejas | FR11 | 3/5-nov |
| **EPA en viaje directo por tienda** y número de viaje con la compañía | 005 / FR4.2, FR5 | 5-nov |
| **Recolectas**: las devoluciones van en viajes que ya pasan por el cliente | 010 / FR8 | 5-nov |
| **Login con Google** (solo `ologistics.com` e `intelix.biz`) | 014 / FR10 | 5-nov |

Calidad al 2026-11-05: `pytest backend/tests` **560 en verde**, `vitest` **1027 en verde** y
`sam validate` OK.

## 3. Construcción pendiente — Bolts

Un *Bolt* es una pasada completa de diseño, código y pruebas que termina en algo que corre.

| Bolt | Trabajo | Base ya hecha | Esfuerzo (dev-días) | Dependencia externa |
|---|---|---|---|---|
| **B1** Días de anticipo por zona (historia 012) | columnas cercana/lejana y días en el catálogo de zonas; el planificador los usa en lugar del cálculo por km | lead time y `dispatch_date` ya existen | **2–3** | — (decidido el 5-nov) |
| **B2** Bandeja solo con lo no planificado (historia 013) | filtrar la bandeja y mover el cambio de fecha al detalle del viaje | bandeja y cambio de fecha existen | **1–2** | decisión de la líder |
| **B3** Write-back real a eFlow (número de viaje) | cambiar el destino del espejo por la API de EPRAC | write-back simulado funcionando | **1–2** | **API de EPRAC** (~semana del 9-nov) |
| **B4** Cierre de pedidos desde eFlow | traer `FECHACIERRE` y cerrar los pedidos viejos (limpia el panel del OMS) | ingesta existe | **2–3** | GET de EPRAC o la réplica |

**Subtotal de construcción: ~6–10 dev-días.**

## 4. Operation (AWS) — salida a QA y PROD

- Provisionar QA y PROD: los stacks ya son por ambiente (`samconfig.toml` dev/qa/prod) y faltan los
  parámetros SSM (`/qa|prod/tms/google-client-id`, red y capa).
- Smoke de las pruebas técnicas.

**~2–3 dev-días.**

## 5. Total

| Concepto | dev-días |
|---|---|
| Construcción (B1–B4) | 6–10 |
| Operation (QA/PROD) | 2–3 |
| QA + integración + buffer (~15 %) | 1–2 |
| **Total** | **~9–15 dev-días** |

**Calendario:** con 1 dev son ~2–3 semanas, así que **entra antes del 30-nov**. B1 y B2 no tienen
dependencias externas y se cierran antes de las pruebas técnicas; B3 y B4 dependen de que EPRAC
entregue las APIs.

## 6. Fuera de alcance de esta entrega (pasan a gestión de cambios)

- Piso de capacidad mínima (~80 %) para que salga el viaje.
- Partir un pedido en varias guías (por línea).
- Rutas solo de recolección y capacidad de las recolectas.
- Planificación de Venezuela (coordenadas de los ~20.000 puntos: lo gestiona Jean).
- Proveedor de mapas pago para el ruteo por calles.
- Transportista tercero (chofer y vehículo informados después).

> Ya no aplican de la estimación anterior:
> - el **WebSocket de alerta de pedidos nuevos**: ya no hace falta, porque la planificación es automática;
> - la **capacidad real de flota** como bloque aparte: se usa `tbl_vehicles` con su capacidad;
> - la **réplica de EFLOW** como bloqueante: se lee eFlow CR en solo lectura.

## 7. Riesgos y dependencias

1. **APIs de EPRAC** (B3, B4): aprobadas el 2-nov, con entrega estimada para la semana del 9-nov. Si se
   atrasan, el write-back sigue simulado en `sim_expedicionescabecera` y no bloquea las pruebas funcionales.
2. **Coordenadas de las tiendas EPA**: eFlow no las trae. El viaje sale bien (es directo), pero el
   tiempo de tránsito queda en el mínimo de 1 día.
3. **Decisión sobre la bandeja** (B2): está documentada en la historia 013.

> Rangos calibrados a la velocidad real del equipo en octubre y noviembre. El principal riesgo son las
> dependencias externas (EPRAC), no el código.
