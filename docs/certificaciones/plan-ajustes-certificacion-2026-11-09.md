# Plan de ajustes — Certificación INTELIX sto_tms_olo (2026-11-09)

Base: `certificacion-sto_tms_olo-2026-11-09.json` (exposición `publica`, alcance `estandares`).
Dictamen actual: **NO APTO PARA QA — 62 %** (Infra 100 %, Código 100 %, Seguridad 0 %, DevOps 70 %).

Cada hallazgo abierto se revisó contra el código citado en la evidencia. Este plan no altera el
dictamen del motor; solo clasifica y propone acciones.

## 1. Clasificación de los hallazgos

| Ref | Prioridad | Evidencia del motor | Revisión manual | Tipo |
|---|---|---|---|---|
| P2 | Crítico | `COOKIE_SECURE=false` | El único archivo que contiene ese texto es el propio motor (`scripts/verificacion/verificadores/seguridad.js`, mensaje del hallazgo). La app autentica con JWT en `Authorization: Bearer`, sin cookies. | Falso positivo del motor |
| R1 | Crítico | 5 líneas | `.claude/tools` y `.kiro/tools/aidlc-directive.ts`: fixture `continue_token: "opaque-token"` del tooling AI-DLC. `backend/tests/test_realtime.py:9,69` y `backend/mobile/tests/test_auth.py:119`: secretos ficticios de prueba (`"test-secret"`, `"otro-secreto…"`). | Falso positivo (tests y tooling) |
| R3 | Crítico | `AuthorizationType: NONE` en `backend/tarifas-mail/template.yaml` | Es solo `GET /api/tarifas-mail/google/callback` (línea 163). Es el redirect OAuth de Google: no puede traer el JWT. Ya está mitigado con `state` firmado y vencimiento de 10 min. Las otras 4 rutas usan `CUSTOM`. | Real, legítimo: requiere excepción documentada |
| R6 / P3 | Crítico | CORS `*` en `ws-local.mjs` | `ws-local.mjs:51` es un servidor WebSocket solo de desarrollo local. Mismo patrón en `backend/mobile/local/serve.py:76,84,93`. **Hallazgo que el motor no detecta:** `backend/common-services/samconfig.toml` fija `CorsAllowOrigin=*` en dev, qa y prod (líneas 15, 30, 45), y el `Default` del template también es `"*"`. Ese es el CORS real de la API pública. | Real (IaC) + scripts locales |
| R4 | Alto | Comodín IAM en `backend/alerts/template.yaml` | Línea 166: `ses:SendEmail` con `Resource: "*"`, ya acotado por `Condition ses:FromAddress`. | Real, mitigado |
| R5 / DEVOPS1 | Alto | Pipeline sin SAST ni escaneo de dependencias | `.gitlab-ci.yml` solo incluye `.gitlab/intelix-ci.yml` (Gate 0 + dashboard). No hay jobs de seguridad. El runner es tipo shell, sin Docker. | Real |
| R7 | Medio | Log sensible en `backend/common-services/src/authorizer/app.py` | Línea 33: `logger.info("Token rechazado: %s", err)`. Registra el mensaje de la excepción de PyJWT, no el token. El motor lo marca por la palabra "Token". | Riesgo bajo, ajuste trivial |
| DEP1 | Medio | Rangos `^`/`~` con lockfile | `package.json` raíz usa `^` en casi todas las dependencias. Hay `package-lock.json`. | Real, menor |
| P1 | Diferido | WAF delegado a Amplify | El frontend puede tener WAF desde Amplify. **Observación:** la API es API Gateway **HTTP API** (`ApiGatewayV2`), y AWS WAF no se asocia directamente a HTTP APIs (sí a REST APIs y CloudFront). | Pendiente de piloto |

## 2. Plan por fases

### Fase 1 — Cierre de críticos

| # | Acción | Control | Archivos | Dueño |
|---|---|---|---|---|
| 1.1 | Fijar `CorsAllowOrigin` por ambiente al dominio de Amplify de cada uno (dev puede incluir `http://localhost:5173`). Cambiar el `Default` del template de `"*"` a un valor no abierto. | R6, P3 | `backend/common-services/samconfig.toml`, `backend/common-services/template.yaml` | Backend (Claude) + despliegue Intelix |
| 1.2 | Restringir CORS de los servidores locales a `http://localhost:5173` (o a una variable de entorno). | R6, P3 | `ws-local.mjs`, `backend/mobile/local/serve.py` | Backend (Claude) |
| 1.3 | Documentar la excepción del callback OAuth en un ADR: motivo, mitigaciones (`state` firmado, TTL 10 min) y el test que lo prueba. Verificar que existe un test que rechaza un `state` inválido o vencido. | R3 | `docs/decisions/`, `backend/tarifas-mail/` | Backend (Claude), aprueba Arquitectura |
| 1.4 | Reportar al equipo de `template_base` los defectos del motor (ver sección 3). Mientras no se corrijan, anotar P2 y R1 como falsos positivos en el acta. | P2, R1 | — | Humano (Intelix) |

### Fase 2 — Robustecimiento

| # | Acción | Control | Archivos | Dueño |
|---|---|---|---|---|
| 2.1 | Agregar jobs de seguridad al `.gitlab-ci.yml` raíz (no al fragmento administrado): `npm audit --audit-level=high`, `pip-audit` y `bandit` sobre `backend/`, y un secret-scan (`gitleaks`). El runner es shell: las herramientas deben estar instaladas en el servidor, porque las plantillas SAST de GitLab requieren Docker. | R5, DEVOPS1 | `.gitlab-ci.yml` | Plataforma |
| 2.2 | Acotar `ses:SendEmail` al ARN de la identidad SES (`arn:${AWS::Partition}:ses:${AWS::Region}:${AWS::AccountId}:identity/<dominio>`) y conservar la `Condition`. | R4 | `backend/alerts/template.yaml` | Backend (Claude) |
| 2.3 | Registrar solo el tipo de error: `logger.info("Token rechazado: %s", type(err).__name__)`. | R7 | `backend/common-services/src/authorizer/app.py` | Backend (Claude) |
| 2.4 | Decidir si se pinnean versiones exactas (`npm config set save-exact true` + reescritura de `package.json`) o si se acepta el estado parcial con lockfile. | DEP1 | `package.json` | Frontend (Kiro), decide el equipo |
| 2.5 | Para el piloto: definir el WAF de la API (CloudFront delante del HTTP API, o migración a REST API) y verificar el WAF de Amplify en consola. | P1 | IaC de `common-services` | Plataforma / Arquitectura |

### Fase 3 — Re-certificación

Volver a correr el motor en la rama, con la misma configuración:

```
node scripts/verificacion/analizador.js --proyecto . --exposicion publica --alcance estandares --idioma es
```

## 3. Defectos del motor para reportar a `template_base`

| Defecto | Efecto en este repo | Estado |
|---|---|---|
| `codigo.js` y `devops.js` leían solo el primer `package.json` | COD2 marcado "no declara React"; DEP1 no veía los rangos | Parche local aplicado (se pierde en `intelix-cli sync`) |
| El motor escanea su propio código (`scripts/verificacion/`) | P2 crítico falso por el texto de su propio mensaje | Pendiente |
| R1 no excluye tests ni el tooling AI-DLC (`.claude/`, `.kiro/`) | 5 secretos falsos en R1 | Pendiente |
| No existe mecanismo de excepción aprobada (N/A justificado por ADR) | R3 no puede cerrarse aunque la ruta sin auth sea legítima | Pendiente |
| R6/P3 no revisan CORS en IaC (`CorsConfiguration`/`AllowOrigins`) | No detecta `CorsAllowOrigin=*` en `samconfig.toml` | Pendiente |

## 4. Resultado esperado y decisión pendiente

- Las fases 1 y 2 cierran en el código todos los hallazgos reales.
- **El dictamen seguirá en NO APTO mientras el motor no cambie.** R3 seguirá marcado (el callback debe quedar sin auth), y P2/R1 seguirán marcados por los falsos positivos. Cualquier crítico abierto fuerza Seguridad a 0 %.
- Decisión necesaria: aplicar parches locales al motor (exclusiones y excepción por ADR) para obtener un dictamen representativo, o esperar la corrección de `template_base`.
