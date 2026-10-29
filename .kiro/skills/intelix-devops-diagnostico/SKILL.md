---
name: intelix-devops-diagnostico
description: >-
  Interprete de logs de CI/CD de SOLO LECTURA (Ally Deploy, recortado): toma un log
  que el usuario pega o pasa como archivo, clasifica el tipo de fallo (secreto
  expuesto, auth 401/403, despliegue rechazado, hallazgo SAST, pruebas, lint,
  dependencias, timeout, build) y propone un fix guiado alineado a los estandares
  INTELIX y al baseline de seguridad. No ejecuta despliegues, no se conecta a
  GitLab ni a AWS, no toca el pipeline y no automatiza la puerta Pre-Deploy (R11):
  la reparacion es guiada, la decide y la ejecuta el humano. Usar cuando el usuario
  pida: diagnosticar un error de pipeline, por que fallo el CI, leer un log de
  GitLab CI, analizar logs de despliegue, clasificar un fallo de build/test/deploy,
  que hago con este error de CI.
---

# Skill: DevOps Diagnostico (Ally Deploy, recortado)

Interprete de **solo lectura** que fortalece la fase **Pre-Deploy / Operacion** de
AI-DLC v2.8.2 acortando el diagnostico de fallos de CI/CD. Clasifica el log y
propone un **fix guiado**; nunca actua sobre la infraestructura.

> **Modelo (no lo rompas):**
> - **Solo lectura.** Lee un log que el usuario pega o pasa como archivo. No se
>   conecta a GitLab/AWS, no descarga jobs, no requiere credenciales ni red.
> - **No automatiza nada.** No despliega, no repara solo, no edita el pipeline.
>   La puerta **R11 (Pre-Deploy)** sigue siendo decision humana.
> - **No emite dictamen** de certificacion. Es un asistente de lectura de logs.

## Cuando se activa

- Cuando un job de CI/CD falla y el usuario trae el log.
- Cuando se pida clasificar un error de build/test/deploy o entender por que fallo.

## Motor (deterministico, solo lectura)

```bash
# Pegar el log por stdin (Ctrl-D para terminar) o por pipe
python .intelix/scripts/devops_diagnostico.py --stdin

# O pasar un archivo de log guardado
python .intelix/scripts/devops_diagnostico.py --archivo ruta/al/job.log

# Salida JSON (para encadenar)
python .intelix/scripts/devops_diagnostico.py --archivo job.log --json
```

Escribe el reporte en `.intelix/outputs/devops_diagnostico/` (versionado por
fecha/hora + alias estable `DIAGNOSTICO-CI.md`), junto a los demas artefactos
INTELIX (reporte de avance, roadmap, seguimiento). Esa carpeta esta gitignoreada:
es un artefacto por proyecto.

## Que clasifica

| ID | Fallo | Fix guiado (resumen) |
|----|-------|----------------------|
| `SECRET_LEAK` | Secreto expuesto en el log | Rotar y mover a Secrets Manager/SSM (R1) |
| `AUTH_DENIED` | 401/403/AccessDenied | Revisar token/rol IAM, minimo privilegio (R4) |
| `DEPLOY_REJECTED` | Rollback/CREATE_FAILED | Corregir template, no tocar consola; R11 humano |
| `SAST_FINDING` | SAST/dependencias/secret-scan | Atender hallazgo (R5); HARD-STOP bloquea cierre |
| `TEST_FAILURE` | Pruebas en rojo | Reproducir y corregir; no cerrar unidad con fallos |
| `LINT_FAILURE` | Lint/formato/typecheck | Correr linter/formatter local y re-stage |
| `DEP_INSTALL` | Dependencias | Lockfile + versiones pinneadas; instalacion limpia |
| `TIMEOUT` | Timeout/cancelacion | Medir p95 en QA; ajustar timeouts |
| `BUILD_FAILURE` | Compilacion/build | Leer el PRIMER error, no el ultimo |

El reporte **sanitiza** el log: enmascara AWS keys, tokens `Bearer` y asignaciones
de secretos antes de citar cualquier fragmento (R7/R10).

## Flujo tipico del agente

1. Pedir al usuario el log del job que fallo (pegado o archivo).
2. Ejecutar el diagnostico.
3. Explicar el hallazgo principal y el fix guiado segun el estandar
   (`docs/estandares/estandares-desarrollo-intelix.md`, `seguridad-baseline.md`).
4. Si es un hallazgo de seguridad HARD-STOP, remitir a `intelix-qa-gate` /
   `intelix-seguridad-linter` antes del merge.
5. Recordar que la autorizacion de despliegue (R11) la da un humano.

## Reglas

- **Nunca** proponer ejecutar un deploy, un rollback ni modificar el pipeline por
  el usuario; solo describir los pasos.
- No conectarse a servicios externos ni pedir credenciales.
- No sustituye la certificacion ni el sign-off humano del Pre-Deploy.
- No introduce dependencias nuevas (Python stdlib).
