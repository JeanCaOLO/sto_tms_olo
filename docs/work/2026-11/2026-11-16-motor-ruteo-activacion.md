# 2026-11-16 — Motor de ruteo: activación completa y mejoras técnicas

Rama `motor-ruteo-activacion` (desde `main` `e3396e8`). Pedido del usuario: encender T-n por
carretera (T-1 cercanas, T-2 o T-3 lejanas), costos por tipo de camión y transportistas con una
sola vuelta por jornada para los propios; terceros de prueba aceptados; todas las mejoras
técnicas; coordenadas de Michelena, San Diego y las tiendas de EPA.

## Encendido en el sandbox
`backend/planning/samconfig.toml` (dev): `TnModo=carretera`, `TnMaxDias=3`, `CostosModo=reales`,
`UsarTerceros=si`, `PropiosUnaVuelta=si` (más `MotorRuteo=ortools`, ya activo).

- **T-n:** `1 + minutos de manejo // 135`, con tope de 3 días: hasta 2 h 15 de manejo → T-1,
  hasta 4 h 30 → T-2, más → T-3.
- **Una vuelta por camión propio:** un propio con viaje ese día (incluidos congelados y otras
  compañías del almacén) no vuelve a salir. Lo que no cabe va en terceros; sin terceros, queda
  sin viaje y el replan de cada hora lo reintenta.
- **Flota propia primero:** el solver solo ve propios mientras quede uno libre; los terceros
  entran después, aunque su tarifa sea más barata (primer intento: la tarifa de prueba de un
  tercero, ₡25.500 por viaje, le ganaba al costo diario de un propio y el 19 salió con 2 viajes
  en terceros; corregido).
- **Costo de terceros con su tarifario:** la regla BASE de su transportista según `rate_type`
  (km, fija, por parada, por volumen o tabla zona × camión, con comodín `*`); sin `rate_type`,
  la fija. Sin tarifa, propio equivalente × 1,3.

## Mejoras técnicas
- **Jornada:** una vuelta por camión propio, y duración estimada de cada viaje (manejo + 15 min
  por parada) en el registro.
- **Tarifa real de terceros:** arriba.
- **Frontend con el OSRM propio:** ruta `GET /api/v1/planificacion/osrm/{proxy+}` (solo route y
  table, máximo 100 puntos, mapa por la región del primer punto, con authorizer) y `osrmFetch` en
  el frontend (con token; respaldo al público si el backend responde 503/404).
- **QA y producción:** `samconfig.toml` con parámetros por ambiente (QA igual que el sandbox salvo
  `OsrmUrl`; producción con el comportamiento anterior) y guía
  `docs/guides/motor-ruteo-qa-produccion.md`.
- **Retención del registro de corridas:** `retencion.purgar()` en el replan programado borra lo de
  más de 90 días (`sql/74` da DELETE a `tms_app`).
- **Checksum de migraciones:** `run-migration.mjs` registra el checksum con LF y acepta los
  anteriores con CRLF (`sql/67` ya no parece editada).
- **Paquete de la Lambda:** sin numpy, pandas, tzdata ni dateutil: 178 → 76 MB.

## Datos
- `sql/73` (aplicada): MICHELENA y SAN-DIEGO, y las tiendas 002–008 de EPA. "TIENDA 001 CD" sin
  coordenadas (pendiente de confirmar).

## Errores encontrados al probar en el sandbox
1. El registro de corridas fallaba al guardar costos con llaves UUID (`json.dumps`): el replan
   se revertía entero, sin dejar datos a medias. Corregido y con prueba.
2. Terceros antes que propios (arriba). Corregido y con prueba.

## Verificación
- Backend 916 → 952 tests; frontend: `tsc` limpio, 178 tests de Planificación/Tracking + 5 de
  `osrmFetch`, lint limpio en los archivos tocados.
- Sandbox: `estado_ruteo` con OR-Tools y OSRM de las dos regiones; puente OSRM por la Lambda
  (Costa Rica 213,6 km San José–Liberia; Venezuela Valencia–Caracas) y 401 sin token por API
  Gateway; frontend 200.
- Replan real: 2026-11-19, 15 pedidos → 5 viajes en camiones propios, 434,8 km, T-1, costo
  ₡213.863, 0 sin camión.
- Comparación de 34 días con todo encendido (`2026-11-16-comparacion-motores-activacion.json`):
  EPA ya se mide por carretera (0 pedidos sin coordenadas). Sin terceros, la regla de una vuelta
  dejaría 499 pedidos sin camión en los días grandes; con los 3 terceros de prueba no queda
  ninguno, pero hacen 64 viajes (varios por día cada uno). T-n: 19 de 216 viajes cambian de
  fecha de salida.
- El OSRM se encendió solo el lunes a las 04:45 (schedule verificado).
