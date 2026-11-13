# 2026-11-13 — Motor de ruteo: fases 5, 6 y 7, y camiones de viajes congelados

Rama `motor-ruteo-fase5` (desde `main` `f53381c`, tras mergear las fases 1–4 y desplegar
todo). Planificación desplegada en el sandbox desde esta rama.

## Qué cambió
- **Camiones de viajes congelados (corrección):** `plan_builder.usos_del_dia` cuenta los
  viajes que cada camión ya tiene ese día en el almacén (congelados de la compañía y planes
  de las otras) y el motor toma primero los libres. Antes el 2026-11-16 salió con 10 viajes
  y 9 camiones.
- **Fase 7, registro de corridas:** `sql/72_routing_runs.sql` (aplicada) crea
  `tbl_routing_runs`; `plan_builder.registrar_corrida` escribe una fila por corrida (entrada,
  resultado, parámetros, motor solicitado y real, matriz, km, duración, error) en la misma
  transacción del plan. ADR-005 pasa a **Aceptado**; ADR-007 queda implementado en parte.
- **Fase 5, T-n por carretera** (`tiempo_salida.py`, apagado): con `TN_MODO=carretera`,
  `lead = 1 + minutos de manejo del depósito a la parada más lejana // TN_MIN_POR_DIA`.
  `matriz_distancias.desde` pide esa fila al OSRM por bloques; sin OSRM queda el T-n en
  línea recta.
- **Fase 6, costos y terceros** (`costos.py`, apagados): con `COSTOS_MODO=reales` (solo
  Costa Rica) el solver minimiza colones: km × (mantenimiento/km + diésel/km del tipo de
  camión) + costo fijo diario del camión la primera vez que sale. Con `USAR_TERCEROS=si`
  suma los camiones de transportistas terceros del país, a costo propio × 1,3, y los
  prefiere antes que repetir un camión propio; esos viajes se guardan con
  `is_owned = false`. La heurística nunca usa terceros.
- **Comparación de motores** ahora mide además: T-n por carretera en sombra, y en Costa Rica
  el costo en colones de cada plan y dos variantes del solver con costos (solo flota propia,
  y con terceros).
- **`samconfig.toml` (dev)** fija todos los interruptores: `MotorRuteo=ortools`,
  `TnModo=linea`, `TnMinPorDia=135`, `CostosModo=fijo`, `UsarTerceros=no`. (Sin fijarlos,
  `cloudformation deploy` reusa el valor anterior: por eso `TnMinPorDia` quedó en 120 en un
  despliegue intermedio.)

## Calibración del T-n por carretera
236 viajes reales de Cofersa con minutos de manejo por OSRM. T-n actual por viaje:

| T-n actual | Viajes | Minutos de manejo a la parada más lejana (mín / mediana / máx) |
|---|---|---|
| T-1 | 177 | 5 / 24 / 187 |
| T-2 | 23 | 116 / 182 / 277 |
| T-3 | 35 | 206 / 288 / 398 |
| T-4 | 1 | 268 |

El mejor valor es **135 min de manejo por día adicional**: coincide en 213 de 236 viajes
(90 %). Los 23 restantes son incoherencias de la regla en línea recta: viajes T-1 con hasta
3 h de manejo y T-2 con menos de 2 h. Otros valores: 100 → 36 cambian, 120 → 30, 150 → 30.

## Costos (32 días de Cofersa, misma tabla de costos para todos)
Costo por tipo (Costa Rica): t1 ₡114/km + ₡37.115/día; t3 ₡155/km + ₡40.818/día; t5
₡220/km + ₡47.763/día.

| Plan | Viajes | Km | Costo | Camión-día | Viajes de terceros |
|---|---|---|---|---|---|
| Heurística | 272 | 42.887 | ₡16,56 M | 210 | 0 |
| OR-Tools minimizando km (activo) | 272 | 38.844 | ₡14,63 M | 210 | 0 |
| OR-Tools minimizando colones, flota propia | 272 | 38.792 | ₡14,60 M | 210 | 0 |
| OR-Tools minimizando colones + terceros | 272 | 38.781 | ₡15,40 M | 228 | 32 |

El costo cuenta el día de cada camión una vez, así que una segunda vuelta del mismo camión
propio sale gratis en esta medida. Por eso el plan con terceros parece más caro: evita
segundas vueltas a cambio de 18 camión-día más. Si una segunda vuelta no es viable en la
jornada, el plan con terceros es el único realista. Reporte completo:
`2026-11-13-comparacion-motores-fases-5-6.json`.

## Verificación
- Backend: 877 → 915 tests en verde (`test_tiempo_salida.py`, `test_costos.py` nuevos;
  camiones de congelados, informe del motor, registro de corridas y comparación con costos).
- `sql/72` ensayada en seco y aplicada en Aurora.
- Sandbox: `dev-tms-planning` redesplegado; variables `MOTOR_RUTEO=ortools`, `TN_MODO=linea`,
  `TN_MIN_POR_DIA=135`, `COSTOS_MODO=fijo`, `USAR_TERCEROS=no`. Comparación de 45 días sin
  errores, con el mismo −9,4 % de km de antes.
- Replan real (invocado a mano, el mismo del Scheduler): quedó la fila en `tbl_routing_runs`
  (2026-11-16, `ortools`, matriz `osrm`, 62 pedidos, 9 viajes, 325,8 km, 205 ms) con los usos
  previos del camión del viaje congelado.
- **El arreglo de camiones congelados no funcionaba en el caso real:** los usos llegaban como
  texto y la flota trae los ids como UUID desde pg8000, así que nunca casaban (las pruebas usaban
  ids de texto). Corregido comparando como texto, con una prueba con UUID reales que falla con
  el código anterior. Tras redesplegar: 2026-11-16 con 10 viajes y 10 camiones (antes 9).
