# 2026-11-17 — Túnel Aurora e ingesta local de la bandeja

- Túnel Aurora levantado de nuevo (el del 16-nov lo cortó AWS: conexión cerrada por el host remoto).
- Ingesta manual 10:38: 156 leídos, 82 salidos de la cola de eFlow, 156 espejadas, 599 líneas.
- Loop local en segundo plano: ingesta cada 10 min y replan cada hora.
- Dylan avisó que su lado de devoluciones ya lee directo en Aurora (sin outbox), migraciones
  renumeradas 75-77 y contrato en `docs/devoluciones/ENTREGA_PLANIFICACION_BD_V2.md`, en el commit
  b2b09fbe de dylan-tarifas, aún no subido. El consumidor en `backend/planning` queda de nuestro lado.
