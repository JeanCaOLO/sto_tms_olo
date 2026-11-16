# 2026-11-13 — Motor de ruteo, fase 4: comparación en sombra con pedidos reales

Rama `motor-ruteo-fase4` (desde `motor-ruteo-fase3`). Sin migraciones. El interruptor sigue
**apagado** (`MOTOR_RUTEO=heuristico`): nada de esto cambia los planes.

## Qué cambió
- **`backend/planning/src/comparacion_motores.py`** (nuevo, solo lectura): arma los viajes de
  cada (compañía, día) con los dos motores sobre los mismos pedidos y la misma flota, y los
  mide con la misma matriz (OSRM). No persiste nada. Se invoca a mano en la Lambda:
  `{"accion": "comparar_motores"}` (días de la ventana del replan) o
  `{"accion": "comparar_motores", "dias_atras": N}` (suma los días ya planificados de las
  últimas N fechas, con los pedidos de entrega que quedaron en esos planes).
- **Dos defectos del solver que la comparación destapó, corregidos en `motor_ortools.py`:**
  1. **Concentraba viajes en pocos camiones.** Cuando un pedido no cabía en los camiones
     libres, reiniciaba la flota y volvía a usar camiones ya usados aunque hubiera otros
     parados (p. ej. 12 viajes con 7 camiones, donde la heurística usaba 12). Ahora toda la
     flota está disponible siempre y cada viaje previo del camión en el día suma
     `COSTO_REUSO_KM = 5000` km equivalentes: repetir camión es el último recurso.
  2. **Un día salía 0,1 % peor que la heurística.** Al numerar las paradas desde el extremo
     más cercano al depósito invertía la ruta, sin contar que la matriz de carretera no es
     simétrica. Ahora solo invierte si el recorrido no se alarga.
  Las dos pruebas nuevas fallan con el código anterior y pasan con el corregido.

## Resultado (sandbox, 2026-11-13, matriz OSRM)
Ventana del replan (lunes 16) más los planes de los últimos 45 días. Reporte completo:
`2026-11-13-comparacion-motores-ruteo.json`.

| | Heurística | OR-Tools |
|---|---|---|
| Días de Cofersa medidos | 23 | 23 |
| Pedidos | 1.646 | 1.646 |
| Viajes | 272 | 272 |
| Km de carretera | 42.887 | 38.844 (**−9,4 %**) |
| Viajes fuera de capacidad o tope | 0 | 0 |
| Días peores que la heurística | — | 0 |
| Errores del solver | — | 0 |
| Tiempo máximo por día | < 0,01 s | 1,8 s |

- **Mismos viajes y mismos camiones distintos** que la heurística todos los días: el ahorro
  sale de qué pedidos comparten camión dentro de cada zona y del orden de visita.
- **El ahorro crece con el volumen:** días con 50 pedidos o más (10 días) −12,3 %; días con
  menos de 50 (13 días) −1,3 %. Los mayores: 2026-10-21 (140 pedidos) −23,6 %, 2026-11-12
  (332) −22,7 %, 2026-11-13 (275) −14,0 %, 2026-11-09 (99) −12,5 %.
- **Sobre los km:** son km de un recorrido depósito → paradas → depósito medidos con OSRM, el
  mismo criterio para los dos motores. No son los km que manejaron los camiones (no hay ese
  dato), y la heurística ordena en línea recta, así que parte de la ventaja es esa.

## Lo que la comparación mostró de los datos (no del motor)
- **EPA no se puede rutear:** sus 41 pedidos de 9 días no tienen coordenadas. Ambos motores
  arman los mismos viajes y miden 0 km. Mientras las tiendas no tengan coordenadas, ningún
  motor las ordena.
- **Peso y volumen incompletos:** de 1.646 pedidos de Cofersa, 330 (20 %) sin peso y 839
  (51 %) sin volumen. La ocupación promedio de peso por viaje es 3 % (máximo 7 %): la
  capacidad nunca limita y los viajes se cortan por zona y por el tope de 16 paradas. Con
  datos completos el solver podría además ahorrar viajes; hoy no hay cómo comprobarlo.
- **Más viajes que camiones:** 6 de los 23 días tienen más viajes que camiones (hasta 32
  viajes con 12 camiones, 2,7 por camión). Pasa igual con la heurística. Sin jornada del
  chofer en el modelo, nadie verifica que esas vueltas quepan en un día.

## Verificación
- Backend: 674 → 680 tests en verde (`tests/test_comparacion_motores.py`: métricas, los dos
  motores sobre los mismos pedidos, fallo del solver, solo lectura y modo histórico; y dos
  pruebas nuevas del solver por los defectos de arriba).
- Sandbox: `dev-tms-planning` redesplegado tres veces (comparación, modo histórico,
  correcciones). La corrida de 45 días tardó 14 s y usó 155 MB.

## Decisión pendiente
Activar el solver en el sandbox (`MotorRuteo=ortools` en `backend/planning/samconfig.toml`
y redesplegar `planning`). Ver `docs/planificacion/pendientes/06-motor-de-ruteo-fases.md`.
