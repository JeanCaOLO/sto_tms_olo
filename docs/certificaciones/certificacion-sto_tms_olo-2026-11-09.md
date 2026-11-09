# Informe ejecutivo de certificación

## 1. Encabezado y ficha técnica

| Campo | Valor |
|---|---|
| Proyecto | sto_tms_olo |
| Fecha de evaluación | 2026-11-09 |
| Estado del dictamen | 🛑 **NO APTO PARA QA** |
| Calificación global | 62 % / 100 % |

## 2. Resumen ejecutivo y dictamen de calidad

El dictamen es No apto para calidad. Este desarrollo no se promueve a calidad.

### Fortalezas del sistema evaluado

| Estándar evaluado | Ref | Evidencia |
|---|---|---|
| Infraestructura como codigo en SAM (template unico) | INFRA1 | Template SAM/CloudFormation en backend\admin\template.yaml |
| IAM de minimo privilegio | INFRA4 | No se detectan comodines Action:* ni Resource:* en el template. |
| Serverless-first (Lambda por defecto) | INFRA2 | Recursos Lambda detectados; sin ECS/Fargate. |
| Secretos en gestor de secretos (no en codigo ni variables planas) | INFRA6 | Se referencia Secrets Manager / SSM Parameter Store. |
| Ambientes parametrizados (samconfig.toml dev/qa/prod) | INFRA5 | samconfig.toml con secciones: dev, qa, prod. |
| Frontend React (framework oficial) | COD2 | Frontend usa React (react en dependencias). |
| Backend Python con arquitectura hexagonal | COD1 | Backend Python con estructura hexagonal (2 carpetas de capas). |
| Reuso del Design System | COD3 | Se detectan referencias a un Design System. |
| Validacion de entradas y consultas parametrizadas | R2 | Se usa query builder / consultas parametrizadas (knex/sequelize/orm/placeholders). |
| Identidad gestionada (Cognito/MFA) para acceso publico | P4 | IdP gestionado / MFA usado en codigo o IaC. |
| Despliegue parametrizado por ambiente | DEVOPS2 | samconfig.toml habilita despliegue parametrizado por ambiente. |
| Health check disponible | DEVOPS3 | Health check detectado en .claude/tools/aidlc-audit.ts. |

### Puntos clave de cierre

| Estándar evaluado | Ref | Prioridad | Evidencia |
|---|---|---|---|
| Gestion de secretos (sin secretos embebidos) | R1 | Crítico | Posibles secretos embebidos: .claude/tools/aidlc-directive.ts:1329; .kiro/tools/aidlc-directive.ts:1327; backend/mobile/tests/test_auth.py:119; backend/tests/test_realtime.py:9; backend/tests/test_realtime.py:69. |
| Autenticacion y autorizacion de endpoints | R3 | Crítico | AuthorizationType: NONE en endpoints (backend\tarifas-mail\template.yaml). |
| Perimetro: CORS estricto y headers de seguridad | R6 | Crítico | CORS abierto en ws-local.mjs [CRITICO por exposicion publica] |
| HTTPS/TLS forzado y cookies secure | P2 | Crítico | Cookies con secure=false (COOKIE_SECURE=false) en app que sera publica. |
| CORS estricto por lista de dominios | P3 | Crítico | CORS refleja cualquier origen (ws-local.mjs) en app publica. |
| IAM de minimo privilegio | R4 | Alto | Comodin IAM (Action/Resource: *) en backend/alerts/template.yaml. |
| SAST y escaneo de dependencias / CVE | R5 | Alto | El pipeline CI no incluye SAST ni escaneo de dependencias. |
| Pipeline CI/CD con etapas de seguridad | DEVOPS1 | Alto | Pipeline presente pero sin etapas de seguridad detectadas. |
| Evidencia y logs sin datos sensibles | R7 | Medio | Posible log de datos sensibles en backend/common-services/src/authorizer/app.py. |
| Dependencias pinneadas | DEP1 | Medio | Dependencias con rangos (^/~) pero con lockfile (builds reproducibles con install determinista). |

## 3. Evaluación por dominio técnico

| Dominio técnico | Peso ponderado | Cumplimiento (%) | Nivel de riesgo | Estado de la puerta |
|---|---:|---:|---|---|
| Infraestructura | 30 % | 100 % | Bajo | Abierta |
| Código | 25 % | 100 % | Bajo | Abierta |
| Seguridad | 35 % | 0 % | Crítico | Cerrada |
| DevOps | 10 % | 70 % | Medio | Condicionada |

## 4. Hallazgos críticos y bloqueadores (Prioridad 1 - Inmediata)

### 4.1. Gestion de secretos (sin secretos embebidos) [Ref: R1]

| Campo | Valor |
|---|---|
| Brecha / Evidencia | Posibles secretos embebidos: .claude/tools/aidlc-directive.ts:1329; .kiro/tools/aidlc-directive.ts:1327; backend/mobile/tests/test_auth.py:119; backend/tests/test_realtime.py:9; backend/tests/test_realtime.py:69. |
| Riesgo e impacto | Crítico |
| Solución recomendada | Mover secretos a Secrets Manager/SSM o variables de entorno; nunca en codigo. |

### 4.2. Autenticacion y autorizacion de endpoints [Ref: R3]

| Campo | Valor |
|---|---|
| Brecha / Evidencia | AuthorizationType: NONE en endpoints (backend\tarifas-mail\template.yaml). |
| Riesgo e impacto | Crítico |
| Solución recomendada | Prohibido AuthorizationType: NONE en endpoints protegidos. |

### 4.3. Perimetro: CORS estricto y headers de seguridad [Ref: R6]

| Campo | Valor |
|---|---|
| Brecha / Evidencia | CORS abierto en ws-local.mjs [CRITICO por exposicion publica] |
| Riesgo e impacto | Crítico |
| Solución recomendada | CORS estricto por lista de dominios (jamas reflejar cualquiera con credentials); habilitar CSP. |

### 4.4. HTTPS/TLS forzado y cookies secure [Ref: P2]

| Campo | Valor |
|---|---|
| Brecha / Evidencia | Cookies con secure=false (COOKIE_SECURE=false) en app que sera publica. |
| Riesgo e impacto | Crítico |
| Solución recomendada | App publica: forzar HTTPS/TLS (ALB+ACM) y cookies secure=true. |

### 4.5. CORS estricto por lista de dominios [Ref: P3]

| Campo | Valor |
|---|---|
| Brecha / Evidencia | CORS refleja cualquier origen (ws-local.mjs) en app publica. |
| Riesgo e impacto | Crítico |
| Solución recomendada | App publica: CORS por lista blanca de dominios; jamas reflejar cualquiera con credentials. |

## 5. Hallazgos de riesgo alto y medio (Prioridad 2 - Requerido antes de producción)

### Seguridad

| Estándar evaluado | Ref | Prioridad | Brecha / Evidencia | Solución recomendada |
|---|---|---|---|---|
| IAM de minimo privilegio | R4 | Alto | Comodin IAM (Action/Resource: *) en backend/alerts/template.yaml. | Usar acciones y ARNs concretos. |
| SAST y escaneo de dependencias / CVE | R5 | Alto | El pipeline CI no incluye SAST ni escaneo de dependencias. | Agregar SAST + escaneo de dependencias/CVE + secret-scan al pipeline. |
| Evidencia y logs sin datos sensibles | R7 | Medio | Posible log de datos sensibles en backend/common-services/src/authorizer/app.py. | No registrar secretos ni PII (costos/salarios/personal) en logs. |

### DevOps

| Estándar evaluado | Ref | Prioridad | Brecha / Evidencia | Solución recomendada |
|---|---|---|---|---|
| Pipeline CI/CD con etapas de seguridad | DEVOPS1 | Alto | Pipeline presente pero sin etapas de seguridad detectadas. | Agregar SAST + escaneo de dependencias + secret-scan. |
| Dependencias pinneadas | DEP1 | Medio | Dependencias con rangos (^/~) pero con lockfile (builds reproducibles con install determinista). | Considerar pinneo exacto; el lockfile mitiga parcialmente. |

## 6. Estado de controles validados y conformidad

### Controles cumplidos

| Ref | Estándar evaluado | Evidencia |
|---|---|---|
| INFRA1 | Infraestructura como codigo en SAM (template unico) | Template SAM/CloudFormation en backend\admin\template.yaml |
| INFRA4 | IAM de minimo privilegio | No se detectan comodines Action:* ni Resource:* en el template. |
| INFRA2 | Serverless-first (Lambda por defecto) | Recursos Lambda detectados; sin ECS/Fargate. |
| INFRA6 | Secretos en gestor de secretos (no en codigo ni variables planas) | Se referencia Secrets Manager / SSM Parameter Store. |
| INFRA5 | Ambientes parametrizados (samconfig.toml dev/qa/prod) | samconfig.toml con secciones: dev, qa, prod. |
| COD2 | Frontend React (framework oficial) | Frontend usa React (react en dependencias). |
| COD1 | Backend Python con arquitectura hexagonal | Backend Python con estructura hexagonal (2 carpetas de capas). |
| COD3 | Reuso del Design System | Se detectan referencias a un Design System. |
| R2 | Validacion de entradas y consultas parametrizadas | Se usa query builder / consultas parametrizadas (knex/sequelize/orm/placeholders). |
| P4 | Identidad gestionada (Cognito/MFA) para acceso publico | IdP gestionado / MFA usado en codigo o IaC. |
| DEVOPS2 | Despliegue parametrizado por ambiente | samconfig.toml habilita despliegue parametrizado por ambiente. |
| DEVOPS3 | Health check disponible | Health check detectado en .claude/tools/aidlc-audit.ts. |

### Controles no verificables, N/A o diferidos

| Ref | Estándar evaluado | Estado actual | Evidencia |
|---|---|---|---|
| INFRA3 | SQS con los 4 controles de resiliencia | N/A justificado | El proyecto no usa colas SQS. |
| COD6 | Pruebas unitarias con cobertura >= 80% | N/A justificado | Fuera de alcance: certificacion de estandares (desarrollo/arquitectura/BD/seguridad). Las pruebas se exigen con --alcance completo (puerta a produccion). |
| P1 | WAF activo (OWASP Managed Rules + rate limiting) | Diferido al piloto | App publica sin WAF en IaC, pero se detecta AWS Amplify (amplify.yml). El WAF del frontend se integra desde Amplify. |

## 7. Plan recomendado de remediación

[ Fase 1: Remediación crítica ] ──► [ Fase 2: Robustecimiento ] ──► [ Fase 3: Re-certificación ]

| Fase | Alcance | Controles |
|---|---|---|
| 1. Remediación crítica | Inmediata. Cierra los bloqueadores de la puerta de calidad. | R1, R3, R6, P2, P3 |
| 2. Robustecimiento | Requerido antes de producción. | R4, R5, R7, DEVOPS1, DEP1 |
| 3. Re-certificación | Volver a certificar este desarrollo cuando las fases anteriores queden cerradas. | — |

## 8. Anexo: leyenda y matriz de trazabilidad técnica

| Código de control | Dominio técnico | Descripción del estándar evaluado | Estado actual |
|---|---|---|---|
| INFRA1 | Infraestructura | Infraestructura como codigo en SAM (template unico) | Cumplido |
| INFRA3 | Infraestructura | SQS con los 4 controles de resiliencia | N/A justificado |
| INFRA4 | Infraestructura | IAM de minimo privilegio | Cumplido |
| INFRA2 | Infraestructura | Serverless-first (Lambda por defecto) | Cumplido |
| INFRA6 | Infraestructura | Secretos en gestor de secretos (no en codigo ni variables planas) | Cumplido |
| INFRA5 | Infraestructura | Ambientes parametrizados (samconfig.toml dev/qa/prod) | Cumplido |
| COD2 | Código | Frontend React (framework oficial) | Cumplido |
| COD1 | Código | Backend Python con arquitectura hexagonal | Cumplido |
| COD3 | Código | Reuso del Design System | Cumplido |
| COD6 | Código | Pruebas unitarias con cobertura >= 80% | N/A justificado |
| R1 | Seguridad | Gestion de secretos (sin secretos embebidos) | No cumplido |
| R3 | Seguridad | Autenticacion y autorizacion de endpoints | No cumplido |
| R6 | Seguridad | Perimetro: CORS estricto y headers de seguridad | No cumplido |
| P2 | Seguridad | HTTPS/TLS forzado y cookies secure | No cumplido |
| P3 | Seguridad | CORS estricto por lista de dominios | No cumplido |
| R2 | Seguridad | Validacion de entradas y consultas parametrizadas | Cumplido |
| R4 | Seguridad | IAM de minimo privilegio | No cumplido |
| R5 | Seguridad | SAST y escaneo de dependencias / CVE | No cumplido |
| P1 | Seguridad | WAF activo (OWASP Managed Rules + rate limiting) | Diferido al piloto |
| P4 | Seguridad | Identidad gestionada (Cognito/MFA) para acceso publico | Cumplido |
| R7 | Seguridad | Evidencia y logs sin datos sensibles | No cumplido |
| DEVOPS1 | DevOps | Pipeline CI/CD con etapas de seguridad | Parcial |
| DEVOPS2 | DevOps | Despliegue parametrizado por ambiente | Cumplido |
| DEVOPS3 | DevOps | Health check disponible | Cumplido |
| DEP1 | DevOps | Dependencias pinneadas | Parcial |
