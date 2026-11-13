# 2026-11-05 — Ficha del proyecto: requerimientos, historias y estimación de Planificación

## What changed

- **`docs/requirements/planificacion/documento-de-requerimientos-planificacion.md`**, reescrito al
  estado del 2026-11-05:
  - FR1–FR9 del módulo: ingesta, bandeja, cambio de fecha, armado automático, fecha de salida y número
    de viaje, replan, handoff al OMS, recolectas y calendario;
  - FR10 (login con Google) y FR11 (estándar de base de datos), las dos piezas transversales;
  - NFR, restricciones, supuestos, OQ-1 a OQ-8 y la tabla de trabajo técnico R001–R014.
- **`docs/stories/planificacion/historias-de-usuario-planificacion.md`**, reescrito: 14 historias con
  criterios Given/When/Then, casos borde, escenarios de prueba y validación. 12 entregadas y 2 en
  borrador (012, días de anticipo por zona; 013, bandeja solo con lo no planificado).
- **`docs/planificacion/estimacion-desarrollo.md`**, rehecho: estado por fase de AI-DLC, lo entregado
  desde el 7-oct, 4 Bolts pendientes (~9–15 dev-días en total, incluidos QA/PROD), alineado a las
  fechas de cierre (técnicas 16/19-nov, funcionales 23-nov, entrega 30-nov) y con un avance de ~85 %.

## Why

Ana (líder de proyecto) pidió generar la ficha del proyecto con los requerimientos, los criterios de
aceptación y las historias de usuario "con el update que tenemos". Los cambios posteriores se manejan
como gestión de cambios. Chus pidió hacerlo con el modo de pensar de AI-DLC pero sin correr su
workflow, e incluir la bandeja, el rehecho de la base de datos y el login.

## How

- Se tomó la estructura de AI-DLC (intención, actores, glosario, FR con BDD, NFR, OQ; historias
  Given/When/Then con escenarios) del intent `260825-route-planning-reqs` y de las historias del OMS.
- El contenido sale del código desplegado y de las bitácoras de `docs/work/2026-10` y `2026-11`, no de
  la versión del 21-oct, que describía el flujo manual retirado.
- Las cifras (560/1027 pruebas, ventanas, márgenes, horarios) están verificadas contra el repo y AWS.

## Follow-ups

- Que Ana decida OQ-1 (historia 013) y revise el documento.
- Subir los documentos a la carpeta del proyecto que indique Ana.
