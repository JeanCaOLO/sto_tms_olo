# 2026-11-13 — Motor de ruteo, fase 1: aislar la interfaz

Rama `motor-ruteo-fase1` (desde `main`). Sin cambio de comportamiento, sin migraciones, sin
deploy.

## Qué cambió
- Nuevo `backend/planning/src/motor_ruteo.py`: módulo puro (sin BD) con
  `asignar_y_ordenar(pedidos, flota) -> viajes`. Contiene la heurística que antes vivía en
  `plan_builder.py` (`clave`, `agrupar_por_zona`, `_empacar`, márgenes 85 %/95 %, tope de 16
  paradas) y arma cada viaje con sus paradas ya ordenadas y su `lead` (`cerrar_viaje`).
- `plan_builder.py`: solo lee pedidos y flota, llama al motor y persiste. `_persistir_viaje`
  ya no ordena ni calcula el lead: los toma del viaje. Cliente retira sigue fuera del motor.
- `ruta_geo.py`, `replan.py`, `recolectas.py` y las tablas: sin cambios.

## Por qué
Es la costura para poder cambiar de motor (OR-Tools/PyVRP, ADR-005) sin tocar la
persistencia, el replan ni el contrato con el OMS y eFlow. Análisis:
`analisis-motor-de-ruteo-tms.pdf`. Fases siguientes: `docs/planificacion/pendientes/06-motor-de-ruteo-fases.md`.

## Verificación
- Backend: 637 → 647 tests en verde. Nuevos: `tests/test_motor_ruteo.py` (10, fijan el
  comportamiento actual del motor) y `tests/test_plan_builder.py` reescrito (persistencia de
  lo que devuelve el motor; el test de agrupación se movió al del motor).
- Equivalencia contra `main`: 3.000 casos aleatorios (0–150 pedidos, 0–5 camiones, con y sin
  coordenadas, tiendas, cliente retira, pesos nulos y excedidos) pasados por el
  `plan_builder` de `main` y por el refactor con la BD simulada: 228.873 sentencias SQL
  idénticas en contenido y orden, 0 diferencias. La misma prueba con el tope de paradas
  cambiado a 15 sí detecta diferencias (el arnés discrimina). Fue una comprobación puntual;
  el script no quedó en el repo.
- No se probó contra Aurora ni se desplegó al sandbox.
