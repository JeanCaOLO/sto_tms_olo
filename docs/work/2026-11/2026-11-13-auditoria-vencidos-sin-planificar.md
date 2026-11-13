# 2026-11-13 — Auditoría: pedidos vencidos sin planificar (pregunta de la IA del OMS)

## Contexto
La IA del OMS reportó pedidos vencidos no liberados con `planning_run_id IS NULL`:
67 EPA, 251 Cofersa y 718 "sin customer_id mapeado". Se levantó el túnel a Aurora y
el loop local de ingesta (`backend/local/ingesta_bandeja.py`).

## Hallazgos (Aurora, solo lectura)
- **718 "sin cliente"**: tienen cliente, pero son clientes `MOCK-*` (DCR-COFERSA 234,
  DCR-EPA 206, DVE-BEVAL 102, DVE-FEBECA 100, DCR-COMERCIALIZADORA 76). Sin
  `eflow_id_expedicion`, creados el 2026-09-26, fechas 08-24 a 10-13. Data de prueba.
- **251 Cofersa / 67 EPA**: pedidos reales de eFlow; ninguno estuvo en un plan. La mayoría
  ya no está DISP/DISP en eFlow (GENE 118, CHEQ/CERR 51, DESP/CERR 44, TERM, EXPA, PREP…):
  eFlow los avanzó por fuera del TMS y salieron de la bandeja. El planificador solo toma
  DISP/DISP, así que no son planificables.
- Solo **16 Cofersa + 28 EPA** siguen DISP/DISP con fecha de entrega pasada (11-10 a 11-12).
  El replan programado solo cubre `(hoy, hoy+3]` (`replan._PENDIENTES`): un pedido cuya
  fecha ya pasó nunca entra al replan automático. Los 28 EPA llegaron el 11-12 con entrega
  el 11-12 (mismo día, también fuera de ventana).

## Estado de la ingesta
- Túnel Aurora: arriba (puerto 15432).
- Loop de ingesta: corriendo, pero la primera vuelta falló con `TimeoutError` al conectar a
  eFlow (SQL Server). Sin acceso de red a eFlow desde esta PC en este momento.
