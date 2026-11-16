# 2026-11-16 — PR #44 mergeado, main en planificacion-2 y ciclo local

- PR #44 mergeado a main el 2026-11-13 (AplicacionesOLO) hasta `aae37aa`. El badge "Vencido"
  (`03d8112`) quedó después del merge: NO está en main, va en el próximo PR.
- Merge de `github/main` en planificacion-2 (`a5b72fb`, sin conflictos; trae motor-ruteo-activacion).
  Subido a GitHub y GitLab (GitLab volvió a responder).
- Túnel Aurora arriba. Ingesta manual: 143 leídos, 41 salidos, 147 espejadas, 727 líneas.
- Replan programado (local): planificó 2026-11-17, 11-18 y 11-19 (dos clientes el 19).
  Quedan 119 planificados no liberados, todos con viaje, 102 con zona.
- Loop local en segundo plano: ingesta cada 10 min y replan cada hora (en AWS también siguen
  activos `dev-tms-planning-ingesta-bandeja` y `dev-tms-planning-replan-horario`, L-V 5-16 UTC).
- PR #47 (planificacion-2 → main) con el badge "Vencido". Revisado contra el PR #46 de Eduardo
  (`oms`): sin archivos en común y merge de prueba sin conflictos; su cambio (liberado solo por
  `oms_processed_at`, cola solo planificados) es coherente con la ingesta actual.
