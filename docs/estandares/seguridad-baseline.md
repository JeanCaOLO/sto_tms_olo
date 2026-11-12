# Baseline de seguridad INTELIX (R1–R14)

Documento compartible del equipo. Cada unidad de trabajo cierra estos controles como
**cumplido**, **no-cumplido**, **N/A-justificado** o **diferido-piloto**.

Los marcados HARD-STOP bloquean el cierre de la unidad o el despliegue.

| ID | Control | Fase | Stop |
|----|---------|------|------|
| R1 | Gestion de secretos (sin secretos embebidos) | Construccion | HARD |
| R2 | Validacion de entradas y consultas parametrizadas | Construccion | — |
| R3 | Autenticacion y autorizacion de endpoints | Construccion | HARD |
| R4 | IAM de minimo privilegio | Construccion | — |
| R5 | SAST y escaneo de dependencias / CVE | Construccion | HARD |
| R6 | Revision de seguridad en la Definicion de Terminado | Construccion | HARD |
| R7 | Evidencia sanitizada (sin datos sensibles) | Construccion | — |
| R8 | Threat modeling STRIDE al inicio de Construccion | Construccion | — |
| R9 | Cifrado en transito y en reposo (zero-trust) | Operacion | — |
| R10 | Logs y auditoria sin datos sensibles | Operacion | — |
| R11 | Puerta de calidad Pre-Deploy | Operacion | HARD |
| R12 | Lista explicita de controles diferidos al piloto | Operacion | — |
| R13 | Escalamiento a DevSecOps | Transversal | — |
| R14 | Trazabilidad con el estandar y el steering | Transversal | — |

## Como se usa

1. **Cierre de unidad:** registrar R1–R8 (nucleo Construccion) antes de dar la unidad por terminada.
2. **Pre-Deploy:** checklist que consolida DoD y decide **AUTORIZADO** o **BLOQUEADO** (R11). Un HARD-STOP abierto bloquea.
3. **Piloto:** R12 lista lo diferido con dueno y fecha.

## Relacion con otros artefactos

- Estandar de desarrollo: `docs/estandares/estandares-desarrollo-intelix.md`
- Steering Kiro (copia operativa): `.kiro/steering/seguridad-baseline.md`
- Entorno del producto: `Product-Definition/technical-environment.md`
- Gate 0 (antes de Inception): `.intelix/scripts/validate_discovery_gate.py`

## Registro por unidad (plantilla)

| Control | Estado | Evidencia | Notas |
|---------|--------|-----------|-------|
| R1 | | | |
| R2 | | | |
| R3 | | | |
| R4 | | | |
| R5 | | | |
| R6 | | | |
| R7 | | | |
| R8 | | | |
| R9 | | | |
| R10 | | | |
| R11 | | | |
| R12 | | | |
| R13 | | | |
| R14 | | | |
