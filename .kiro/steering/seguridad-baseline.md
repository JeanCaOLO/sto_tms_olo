---
inclusion: always
---

# Seguridad baseline INTELIX (R1–R14)

Fuente canonica compartible: `docs/estandares/seguridad-baseline.md`.

- HARD-STOP: R1, R3, R5, R6, R11. No cerrar unidad ni desplegar con estos abiertos.
- Registrar cada control: cumplido | no-cumplido | N/A-justificado | diferido-piloto.
- No inventar integraciones ni secretos. Leer `Product-Definition/technical-environment.md`.
- Antes de Inception: Gate 0 (`python .intelix/scripts/validate_discovery_gate.py`).
- Trazabilidad R14: este steering + el estandar de desarrollo en `docs/estandares/`.
