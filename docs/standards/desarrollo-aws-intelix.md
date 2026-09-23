# Estándares de Desarrollo AWS Intelix: Guía Técnica de Arquitectura y Metodología

> Fuente: presentación oficial **"Estándares de Desarrollo en AWS"** (Beconsult · Intelix, julio 2026) +
> transcripción de la sesión en vivo (~30 personas, dictada por **Javi/Javier**, del lado de arquitectura
> de Intelix). Sesión más amplia que TMS OLO — nace del proyecto interno **"Gestión de portafolio"** de
> Intelix, pero establece el estándar que aplica a todo desarrollo, incluido TMS OLO. No confundir a
> **Javier** (presenta estos estándares, equipo de arquitectura de Intelix) con **Jean Carlo** (líder del
> proyecto TMS OLO) — ver `CONTEXTO_PROYECTO_TMS.md`.

## 1. Visión General y Objetivo del Estándar

El presente documento constituye el marco normativo obligatorio para la construcción de servicios en Intelix. El objetivo fundamental es asegurar que cualquier solución nueva sea **reproducible, segura y eficiente** (optimizada en costos operativos — no es que sea "barata" a secas, es *eficiente*). Como líderes técnicos, nuestra misión es eliminar la "artesanía de consola" y sustituirla por procesos automatizados, auditables y escalables. Estas prácticas no vienen solo del área de arquitectura: se fueron adoptando de la interacción real con Mayoreo, EPA y otros clientes/negocios de Costa Rica.

**Regla de Oro:** Si un recurso no está definido en el template SAM (o en un parámetro/secreto referenciado en dicho template), no existe para efectos de despliegue. Los cambios manuales en la consola de AWS están estrictamente prohibidos; en caso de una emergencia operativa, cualquier modificación manual debe ser reconciliada con el template antes del cierre de la jornada laboral para evitar el *drift* (cuando lo desplegado en consola ya no coincide con lo que dice el template).

**Auditoría de deuda existente:** para detectar qué recursos ya desplegados NO cumplen el estándar (no forman parte de ningún stack), se puede dar a Kiro un usuario con permisos de solo lectura amplios sobre la cuenta AWS y pedirle que "inventaríe todos los recursos que no sean parte de un stack". Lo que sí es parte de un stack se puede cruzar contra este mismo estándar para medir cumplimiento.

---

## 2. Metodología AI/DLC (AI-assisted Development Life Cycle)

Ciclo de entrega **asistido por IA** para pasar de un problema de negocio a un diseño implementable — más rápido, trazable y alineado a un estándar técnico definido de antemano. Desarrollado por Amazon junto con organizaciones que trabajan con ellos.

| | |
|---|---|
| **Para qué** | Acortar discovery y diseño sin saltarse claridad de alcance, riesgos ni criterios de aceptación. |
| **Con qué** | IA + reglas del repo (SAM, React, seguridad) + **validación humana en cada puerta**. |
| **Resultado** | Backlog priorizado, historias listas y diseño listo para IaC/código — no slides ambiguos. |

### Insumos y forma de operar

- **La verdad cruda:** el insumo principal no son solo documentos — son las **transcripciones de sesiones con clientes** (vía AWS Transcribe u otra herramienta). "El 80% se dice y no se escribe." No todos necesitan licencia para grabar: basta con apoyarse en quien sí puede, o pedirle directamente al cliente/negocio que comparta la transcripción de sus propias reuniones (así se ha hecho ya con Mayoreo, vía contactos como José Luis).
- **Base de conocimiento (repositorio de prompts):** existe un repositorio con la base de conocimiento — reglas y prompts de la metodología. Todo desarrollador hace *checkout* de ese repo y le indica a la IA (Kiro/Claude/Cursor, la herramienta que sea) que se apegue a esos estándares antes de trabajar.
- **No es "hazme el sistema":** no se le puede pedir a la IA que arranque un proyecto nuevo sin pasar por discovery. Se empieza con una especificación de usuario y se le pide a la IA que haga el discovery para validar si está completa: identificar incongruencias, gaps, o qué se podría adecuar mejor. Pedirle que "trabaje" directamente sin este paso es un gasto innecesario de tokens.
- **Contexto adicional del equipo:** cada desarrollador con experiencia previa en cierto tipo de cliente/dominio (ej. alguien que ya trabajó apps móviles para Mayoreo, o alguien que ya hizo desarrollos web con un cliente) debe aportar ese conocimiento como input adicional a la IA — el cliente no siempre menciona todo lo que ya sabe que necesita.
- **Artefacto versionado por fase:** cada fase deja un artefacto versionado en Git (doc, backlog, ADR, boceto) — no historial suelto.
- **Validación humana obligatoria en cada etapa:** un líder de solución valida los requerimientos generados; un especialista técnico valida el modelo de datos y el código de las Lambdas; el propio equipo prueba el producto contra lo buscado.

### Las 5 etapas

| Etapa | Qué hace | Entregable |
|---|---|---|
| **1. Levantamiento** | Problema, actores, dolores, KPIs, restricciones (legales, de datos, de plazos). | Brief de problema validado. |
| **2. Discovery** | Mapea flujos as-is/to-be, sistemas/APIs existentes, riesgos técnicos. | Mapa de contexto + preguntas abiertas cerradas. |
| **3. Historias** | Casos de uso → user stories "Como/quiero/para" + criterios de aceptación (Given/When/Then). | Backlog priorizado (MoSCoW o valor/esfuerzo) — es lo que el cliente firma como "su alcance"; lo que no está ahí es cambio de alcance. |
| **4. Planificación** | Slices verticales, dependencias, entornos, spikes técnicos. **Área gris:** AI/DLC estima tiempos como si fueran humanos desarrollando — el equipo debe ajustar ese estimado con criterio (una Lambda que solo envía un correo no toma 16h, aunque la IA lo estime así). | Plan de release / sprint goals. |
| **5. Diseño** | UX con el Design System existente + arquitectura (Lambda/ECS, Amplify, auth) — ya viene alineado a IaC/SAM. | Wireflows + ADR / esqueleto SAM. |

**Ejemplo de flujo completo:** "Portal de pedidos" → discovery detecta que ya existe una API → historias de CRUD + cola async → plan: MVP síncrono en QA → diseño: React + shadcn + API Gateway → Lambda + SQS según el estándar.

### Prompts de ejemplo por fase

- **Requisitos:** *"Lista actores, casos de uso y fuera de alcance a partir de esta entrevista…"*
- **Discovery:** *"Genera preguntas para validar integraciones, volúmenes y auth interna vs. pública."*
- **Historias:** *"Convierte estos casos en user stories con Given/When/Then."*
- **Plan:** *"Propón MVP de 2 sprints y dependencias técnicas (SAM, Cognito, DS)."*
- **Diseño:** *"Propón pantallas con componentes del DS y contrato API; justifica Lambda vs. ECS."*

### Puertas de calidad (humanas) antes de escribir código de feature o desplegar infra

- ¿El problema de negocio quedó medible?
- ¿Hay criterios de aceptación sin ambigüedad?
- ¿Se reutiliza el design system / las APIs existentes?
- ¿El diseño respeta IaC, entornos y seguridad del estándar?
- ¿Quedó claro qué va a dev/qa/prod y cómo se prueba?

### Comportamientos correcto vs. incorrecto

| Correcto | Incorrecto |
|---|---|
| La IA propone; el equipo valida alcance, datos sensibles y restricciones de AWS. | Pedirle a la IA "haz el sistema" y saltarse el discovery. |
| Cada fase deja un artefacto versionado en Git. | Historias sin criterio de aceptación ni definición de "done". |
| El repositorio de prompts oficial asegura consistencia entre desarrolladores. | Diseñar infraestructura/UI ignorando el design system o el estándar SAM. |

---

## 3. El problema a evitar

Sin estándar, cada equipo "arregla" en consola. El resultado no se puede repetir, auditar ni promocionar con confianza de un ambiente a otro.

| Antipatrón | En qué consiste |
|---|---|
| **Consola artesanal** | Colas, Lambdas y permisos creados a mano. Nadie sabe qué versión de infra está en prod. |
| **Hardcode** | IDs, ARNs, `subnet-xxx` y URLs de prod pegados en código o en un YAML distinto por ambiente. |
| **Roles amplios** | "Pon `AdministratorAccess` para que compile" — un bug o fuga de credencial compromete toda la cuenta. |
| **Sin medir** | Timeout 900s y 128 MB por defecto "porque así salió el wizard" — o pagas de más, o fallas por CPU/tiempo sin evidencia. |

**Consecuencia:** *drift* (lo documentado ≠ lo real), incidentes difíciles de reproducir, costo impredecible, onboarding lento y releases artesanales. Cada atajo acumula deuda que aparece en el peor momento.

---

## 4. Infraestructura como Código (IaC) con AWS SAM y CloudFormation

SAM y CloudFormation representan el **contrato del equipo**: el stack es la fuente de verdad operativa. Nada se despliega si no es a través de un stack versionado que garantice un estado conocido y recuperable (rollback). Prohibido crear a mano recursos que el stack deba poseer.

### Por qué SAM sobre CloudFormation

- Abstrae `Function`, `Api`, `Queue` y eventos — se traduce a CFN: mismo changeset, rollback y estado conocido del stack.
- Flujo único: `sam build` → `sam deploy --config-env qa`.
- Menos boilerplate de IAM, logs y permisos de evento.
- Misma auditoría de CloudFormation (changeset revisable antes de aplicar).

### Estructura Estándar de Proyecto

- `template.yaml`: definición de recursos (se genera junto con `samconfig.toml` al crear el proyecto con el estándar).
- `samconfig.toml`: configuraciones de despliegue por entorno.
- `src/`: código fuente de la lógica de negocio.
- `tests/`: pruebas unitarias e integración.

### Correcto vs. incorrecto (IaC y ambientes)

| Incorrecto | Por qué falla |
|---|---|
| Crear cola + Lambda en consola "para la demo" y luego "ya lo pasamos a código". | Aceptable como PoC, pero hay que borrar la PoC y desplegar por IaC antes de dejarlo — nunca quedarse en consola. |
| `template-dev.yaml`, `template-qa.yaml`, `template-prod.yaml` que divergen. | No puedes recrear qa/prod igual; un fix se olvida en un fork. |
| Hardcode: `TABLE="prod-orders"`, `subnet-0abc123` en el handler. | Un deploy de dev puede tocar prod por accidente. |
| Password/API key en Environment Variables o en `samconfig` versionado. | El secreto queda en git y en el historial del stack. |

| Correcto | Por qué funciona |
|---|---|
| Un solo `template.yaml` con `Queue` + `Function`, desplegado con SAM. | El repo es la verdad; cualquier ambiente se reproduce. |
| Misma plantilla + secciones `[dev]` / `[qa]` / `[prod]` en `samconfig.toml`. | El diseño se prueba en QA y se promociona igual a prod. |
| Referencias `!Ref OrdersTable`, parámetros SSM para subnets. | — |
| `SECRET_NAME=/qa/app/db` + `GetSecretValue` en runtime con cache. | Rotas el secreto sin redeploy del negocio. |

### Convenciones de nombramiento

- **Logical ID:** `FunctionalIdentifier + ResourceType` → `OrdersProcessorFunction`.
- **Nombre físico:** `!Sub ${AWS::StackName}-orders-processor` (nunca hardcodeado).
- **Stack:** `environment-project`, ej. `qa-orders-api`.
- **Descripción:** `PROJECT - FUNCION | detalle`, ej. `ORDERS - PROCESSOR | Consume SQS`.
- **Env vars Lambda:** `UPPER_SNAKE_CASE`. Correcto: `QUEUE_URL`, `TABLE_NAME`, `SECRET_NAME` (siempre referencias `!Ref`, nunca el secreto en sí). Incorrecto: `DB_PASSWORD`, IDs de prod pegados a mano.

```yaml
FunctionName: !Sub ${AWS::StackName}-orders-processor
# → qa-orders-api-orders-processor
Description: ORDERS - PROCESSOR | Consume SQS

Environment:
  Variables:
    ENVIRONMENT: !Ref Environment
    ORDERS_TABLE: !Ref OrdersTable
    QUEUE_URL: !Ref OrdersProcessorQueue
    SECRET_NAME: !Ref DbSecretName
    FEATURE_FLAG_X: "true"
```

### Correcto vs. incorrecto (nombres, roles y Lambda)

| Incorrecto | Correcto |
|---|---|
| Nombres: `MyFunction`, `lambda1`, `OrdersFnProd`, `test-queue-final-v2`. | Logical ID `OrdersProcessorFunction`; físico `${AWS::StackName}-orders-processor`. |
| IAM `Action: "*"` / `Resource: "*"` o "rol compartido admin". | Solo las acciones necesarias sobre la cola/tabla/secreto de ese stack. |
| Timeout 900s y Memory 128 MB "porque así salió el wizard". | Timeout/memoria medidos en QA (ej. 30s/512MB) con métricas Duration/Cost. |
| Cola sin DLQ; `VisibilityTimeout` = timeout de Lambda; falla el batch completo. | DLQ + `maxReceiveCount ≥ 5`; Visibility ≥ 6× timeout; `ReportBatchItemFailures`. |

*Por qué falla lo incorrecto:* imposible auditar o alarmar por patrón; blast radius enorme; costo/latencia ciegos; mensajes reaparecen o se pierden sin rastro útil.
*Por qué funciona lo correcto:* nombres predecibles; privilegio mínimo; performance con evidencia; fallos aislados y recuperables.

---

## 5. Ambientes: dev, qa y prod (obligatorios)

Tres stacks distintos, **misma plantilla**. El costo de un tercer ambiente es menor que un incidente por "probar en prod".

| Ambiente | Propósito | Config típica |
|---|---|---|
| **DEV** | Experimentar y fallar barato. Iteración rápida, datos no productivos. | Instancias pequeñas (T4g.micro, T3.nano); logs con retención corta (7 días). |
| **QA** | Validar integración y regresiones; probar el changeset que irá a prod; load test de timeout/memoria. | Misma forma de infra que prod — es en la práctica una copia de cómo está prod antes de desplegar. |
| **PROD** | Cambios controlados y revisados; solo recibe lo ya validado en QA. | Logs con retención 30 días; alarmas en errores y DLQ activas; nunca modificaciones manuales. |

**Regla práctica de naming:** `stack_name = dev-orders-api / qa-orders-api / prod-orders-api`. Parámetros con rutas `/dev/...`, `/qa/...`, `/prod/...`. Nunca mezclar valores de un ambiente en la sección de otro.

**Flujo normal de promoción:** merge a la rama de QA para validar (con el changeset se ve exactamente qué va a cambiar en prod antes de aplicarlo) → una vez validado, se promueve a prod. QA debería procurarse siempre como copia actualizada de prod (con excepciones cuando hay varios proyectos en paralelo).

### Qué parametrizar siempre (nunca duplicar el template)

- `Environment` (`dev | qa | prod`).
- VPC: Security Groups y Subnet IDs (vía SSM) — **nunca se crean VPCs nuevas en cada deploy**, se reutilizan las existentes.
- Nombres/paths de secretos y parámetros.
- IDs de APIs existentes, Layer ARNs, endpoints.
- Flags de feature y retención de logs (vía `Condition`).

### Dónde vive cada valor

| Vive en… | Para qué |
|---|---|
| `template.yaml` → `Parameters` | Contrato del stack. |
| `samconfig.toml` | Overrides por sección de ambiente (se genera junto al template al crear el proyecto). |
| SSM Parameter Store | Config no sensible (subnets, SG, flags, endpoints), fuera del código. |
| Secrets Manager | Credenciales — se crean vía un template aparte y se ajustan los valores en consola después; las Lambdas solo referencian el nombre/path, nunca el valor. |
| Env vars Lambda | Referencias (`!Ref`), nunca secretos en texto plano. |
| `Conditions` | Diferencias estructurales mínimas entre ambientes. |

### Ejemplo SAM: Parameters + Conditions

```yaml
Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, qa, prod]
  SubnetIds:
    Type: AWS::SSM::Parameter::Value<String>
  SecurityGroupId:
    Type: AWS::SSM::Parameter::Value<String>
  DbSecretName:
    Type: String   # solo el path/nombre — nunca la password

Conditions:
  IsProduction: !Equals [!Ref Environment, prod]

OrdersProcessorLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub /aws/lambda/${AWS::StackName}-orders-processor
    RetentionInDays: !If [IsProduction, 30, 7]
# Misma plantilla: prod → 30 días, dev/qa → 7 días. Sin clonar el recurso.
```

### Ejemplo `samconfig.toml` por ambiente

```toml
[dev.deploy.parameters]
stack_name = "dev-orders-api"
region = "us-east-1"
confirm_changeset = true
capabilities = "CAPABILITY_IAM"
parameter_overrides = [
  "Environment=dev",
  "SubnetIds=/dev/app/network/subnets",
  "SecurityGroupId=/dev/app/network/lambda-sg",
  "DbSecretName=/dev/app/db"
]
tags = ["Project=ORDERS", "Environment=DEV", "Name=dev-orders-api"]

[qa.deploy.parameters]
stack_name = "qa-orders-api"
parameter_overrides = [
  "Environment=qa",
  "SubnetIds=/qa/app/network/subnets",
  "SecurityGroupId=/qa/app/network/lambda-sg",
  "DbSecretName=/qa/app/db"
]
# prod: mismos ParameterKey, valores /prod/... y stack prod-orders-api
# Deploy: sam deploy --config-env qa
```

Revisar cada sección al escribirla: **no copiar rutas de otro ambiente por omisión** — es la forma más común de terminar con dev leyendo secretos de prod.

---

## 6. Estrategia Backend: Serverless First

Preferimos Lambda: pagas por ejecución, escalas sin *capacity planning* y reduces superficie operativa (con Lambda, el primer ~1 millón de ejecuciones al mes prácticamente no se paga). ECS/Fargate solo cuando el caso lo exige — nunca por preferencia de plataforma.

### Guía de decisión

| Usar **Lambda** cuando… | Usar **ECS/Fargate** cuando… |
|---|---|
| APIs HTTP (API Gateway) con respuesta en segundos — **máximo ~30s** antes de que la conexión vía CloudFront se caiga. | Procesos > 15 minutos, streaming o sockets persistentes (ej. chat bidireccional, transmisión de video — necesitas que la conexión nunca se caiga). |
| Eventos: SQS, S3, EventBridge, Streams. | Imagen Docker custom, GPU o runtime no soportado. |
| Jobs cortos (minutos o menos), duración predecible, carga irregular/*bursty*. | Carga estable 24/7 donde Lambda sale más caro al mes. |
| Integraciones con reintentos y DLQ nativos. | Monolito containerizado o workers de larga duración. |
| Equipo pequeño: menos ops de contenedores/clusters. | — |

**Ejemplos:** API de pedidos + worker SQS de 20–40s → Lambda, costo casi cero fuera de pico. ETL nocturno de 2 horas con librerías nativas pesadas → ECS/contenedor (una Lambda no da el tiempo). Para ETL programado sin librerías pesadas, **AWS Glue** cumple igual de bien; si se busca algo más barato que Glue pero más complejo de configurar, **Step Functions** (una máquina de estados de Lambdas que itera hasta cumplir una condición) es la alternativa.

**Regla de decisión:** si dudas, empieza en Lambda. Migra a ECS solo con métricas (timeout, memoria, $/mes) — nunca por preferencia de plataforma.

### Patrones Lambda recomendados en SAM

**API síncrona** (el cliente espera la respuesta — ideal para lecturas/escrituras cortas; auth en API Gateway, la Lambda no debería hacer trabajo largo):

```yaml
Events:
  CreateOrder:
    Type: Api
    Properties:
      Path: /orders
      Method: post
# SAM crea integración + permiso invoke
```

**Async con SQS** (la API responde 202 y encola; SQS persiste, reintenta y aísla fallos — sin los 4 controles de resiliencia de la §7, el patrón es frágil):

```yaml
Events:
  SqsEvent:
    Type: SQS
    Properties:
      Queue: !GetAtt OrdersQueue.Arn
      BatchSize: 10
      FunctionResponseTypes:
        - ReportBatchItemFailures
```

### Estándar de Base de Datos

Serverless-first no excluye PostgreSQL: cuando se requiere integridad referencial estricta o la creación de un **Lago de Datos**, el estándar es **PostgreSQL sobre servidores administrados (RDS)**.

- **Configuración con IA:** es obligatorio usar agentes de IA (Claude) para generar el esquema de base de datos y las asociaciones de tablas, emulando la agilidad de Supabase pero sobre infraestructura RDS propia y controlada.

### Runtime

Estándar oficial para todo nuevo desarrollo backend: **Python 3.13** (alternativa: Node 22.x LTS solo si un requerimiento no permite Python). Nunca PHP, Laravel o Express salvo excepción justificada.

---

## 7. Resiliencia y Procesamiento Asíncrono (SQS y DLQ)

Para patrones asíncronos (API responde 202 y encola), son obligatorios **cuatro controles de resiliencia**. SQS estándar garantiza *al-menos-una* entrega, no *exactamente-una* — por eso hacen falta los cuatro juntos, no solo el que parezca más relevante.

### 7.1 Dead Letter Queue (DLQ) — obligatoria

Cola de destino cuando un mensaje agota los reintentos (sufijo `-dlq` en `RedrivePolicy`). Es otra cola SQS referenciada en `deadLetterTargetArn`; al superar `maxReceiveCount`, SQS mueve el mensaje ahí, conservando el payload para análisis/replay. Retención ≥ 14 días (igual o mayor que la cola principal).

- **Sin DLQ:** mensajes "venenosos" reintentan sin fin o se pierden sin rastro — te enteras del problema (ej. un precio mal cargado) cuando ya vendiste con el precio equivocado.
- **Con DLQ:** fallo aislado y visible; alarma por mensajes en la DLQ; separa el reintento automático de la intervención humana/bugfix.
- **Incorrecto:** cola sin `RedrivePolicy` "porque casi nunca falla"; borrar la DLQ sin investigar el payload; usar la misma cola como su propia DLQ (crea un loop recursivo infinito).
- **Correcto:** `OrdersProcessorQueue` + `...-dlq` en el mismo stack; alarma CloudWatch si `DLQ > 0`; replay documentado solo después del fix.

### 7.2 maxReceiveCount ≥ 5

Define cuántas veces SQS puede entregar el mismo mensaje antes de mandarlo a la DLQ (va dentro de `RedrivePolicy`, junto al ARN de la DLQ). Estándar del equipo: **mínimo 5**.

- 1–2 intentos: un cold start o un 503 puntual manda trabajo válido a la DLQ → falsos positivos y ruido operativo.
- ≥ 5: equilibra "dar otra oportunidad" vs. "no castigar al sistema con un mensaje tóxico eterno". SQS ya aplica backoff entre intentos — no hace falta reintentar "a mano" en la Lambda.

```yaml
RedrivePolicy:
  deadLetterTargetArn: !GetAtt OrdersProcessorQueueDLQ.Arn
  maxReceiveCount: 5
# intento 1..5 → la Lambda puede fallar (red, DB, bug intermitente)
# intento 6     → mensaje a DLQ + alarma/análisis
```

Complemento: con `ReportBatchItemFailures` solo cuentan como fallo los mensajes que se marcan explícitamente — los exitosos del mismo batch no consumen reintentos innecesarios.

### 7.3 VisibilityTimeout ≥ 6 × Lambda Timeout

SQS oculta el mensaje mientras se procesa. Si esa ventana termina antes que la Lambda termine, otro worker puede tomar el mismo mensaje → duplicados (ej. dos Lambdas procesando el mismo pedido de venta a la vez). Regla: `Visibility ≥ 6 × Timeout` (ej. 30s → 180s).

- **Incorrecto:** Timeout 30s y Visibility 30s (mismo valor); subir Timeout a 900s "para no tocar Visibility"; asumir que "casi nunca" habrá cold start o *jitter*. Un timeout enorme solo oculta el problema de diseño real.
- **Correcto:** medir el p95 de duración en QA y fijar un Timeout realista; `VisibilityTimeout = 6 × ese Timeout`; si el trabajo necesita minutos, evaluar *chunking* o ECS; complementar siempre con idempotencia.
- **Excepción:** colas **FIFO** procesan un mensaje a la vez con concurrencia de uno — ahí no aplica el mismo riesgo de solape porque nadie más va a tomar el mensaje mientras se procesa (útil para casos donde el orden importa, ej. cambios de precio/inventario secuenciales).

### 7.4 Idempotencia (DynamoDB + TTL)

Aunque el Visibility esté bien calibrado, el mismo `messageId` puede procesarse más de una vez (SQS no es *exactly-once* en colas estándar).

- Tabla DynamoDB con PK `messageId` y atributo `expires_at` (TTL ~24h, limpia el registro sin jobs de mantenimiento).
- Antes de procesar: si el id ya existe → *skip* (ya procesado).
- Al iniciar/al éxito: `PutItem` con `attribute_not_exists(messageId)` (atómico).
- Si falla el negocio: borrar el registro para permitir un reintento limpio.
- Colas **FIFO** ya dan *exactly-once* de grupo — no necesitan esta tabla para el mismo fin.
- Se activa cuando hay riesgo real de recibir el mismo evento duplicado desde un sistema externo (ej. ventas recibidas de forma repetitiva) y no interesa procesarlo dos veces.

```python
# Handler (idea)
batch_item_failures = []
for record in event["Records"]:
    mid = record["messageId"]
    try:
        if already_processed(mid):
            continue
        insert_claim(mid)      # ConditionExpression
        process(record)
    except Exception:
        delete_claim(mid)      # permitir retry
        batch_item_failures.append({"itemIdentifier": mid})
return {"batchItemFailures": batch_item_failures}
```

### 7.5 ReportBatchItemFailures

En un batch de 10, si fallan 2, **solo esos 2** vuelven a la cola. Sin esto, un solo fallo reintenta los 10 → trabajo duplicado y costo desperdiciado.

### Ejemplo SAM completo: cola + DLQ + los cuatro controles

```yaml
OrdersProcessorQueue:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: !Sub ${AWS::StackName}-orders-processor
    VisibilityTimeout: 180        # 6 × Lambda Timeout de 30s
    ReceiveMessageWaitTimeSeconds: 20
    MessageRetentionPeriod: 1209600
    RedrivePolicy:
      deadLetterTargetArn: !GetAtt OrdersProcessorQueueDLQ.Arn
      maxReceiveCount: 5

OrdersProcessorQueueDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: !Sub ${AWS::StackName}-orders-processor-dlq
    MessageRetentionPeriod: 1209600
```

**Checklist del patrón async:** DLQ (recurso separado + RedrivePolicy) · `maxReceiveCount ≥ 5` · `Visibility ≥ 6× timeout` · `ReportBatchItemFailures` en el evento SQS · idempotencia (DynamoDB + TTL) · alarma de profundidad de DLQ > 0. Si se omite uno, el sistema "funciona en demo" y falla bajo carga real, timeouts o reentregas — justo cuando más duele.

---

## 8. Optimización de roles IAM

Mínimo privilegio siempre — y una cuenta AWS tiene **cuota máxima de roles IAM**, así que no se crea un rol por función "por inercia" si varias Lambdas comparten el mismo patrón de acceso (ej. si la Lambda de precios, la de inventario y la de clientes todas necesitan leer el mismo RDS, se crea **un solo rol** de acceso a ese RDS y se asocia a las tres).

**Principios:**
- `Action` y `Resource` concretos (ARN de la cola/tabla/secreto de ese stack) — evitar wildcards (`*`) salvo excepción documentada en el PR.
- Analizar roles comunes antes de crear uno nuevo: si 2+ Lambdas necesitan el mismo conjunto de permisos, un rol compartido puede bastar.
- Al combinar permisos: sumar solo lo necesario, listando ARNs uno a uno — nunca abrir `Resource: "*"` "para cubrir todos".
- Preferir *policies* SAM tipadas (`TableName`, `QueueName`) ancladas al stack, en vez de política JSON manual.

```yaml
Policies:
  - Statement:
      - Effect: Allow
        Action:
          - secretsmanager:GetSecretValue
        Resource: !Sub arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:${DbSecretName}*
  - SQSPollerPolicy:
      QueueName: !GetAtt OrdersProcessorQueue.QueueName
  - DynamoDBCrudPolicy:
      TableName: !Ref OrdersTable
# Si otra Lambda usa la misma cola+tabla+secreto, reutiliza este rol; no copies uno "casi igual".
```

| Incorrecto | Correcto |
|---|---|
| Rol "admin" compartido con wildcards. | Rol compartido solo si el acceso es realmente el mismo. |
| Un rol nuevo idéntico por cada Lambda, sin revisar cuota. | Permisos unidos con ARNs explícitos. |

---

## 9. Optimización de Lambdas

- **MemorySize:** más RAM = más CPU. Medir *Duration* vs. costo en QA — a menudo 512–1024 MB sale más barato que 128 MB lento.
- **Timeout:** realista al p95 medido del caso real. Nunca 900s "por si acaso": oculta bugs y alarga bloqueos en SQS.
- **Cache warm start:** secretos/config en variables globales (con TTL si aplica), para no ir a Secrets Manager en cada invocación.
- **Dependencias:** *pin* exacto en `requirements`/`package.json`. Layers solo para librerías compartidas (máx. 5).
- **Runtime:** Python 3.13 (o Node 22.x LTS). *Architectures* explícitas (`x86_64` / `arm64`).
- **Logs:** Log Group explícito como recurso del template (no auto-creado por Lambda); formato JSON; retención según ambiente (7 días dev/qa, 30 días prod).

```yaml
OrdersProcessorFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionName: !Sub ${AWS::StackName}-orders-processor
    Runtime: python3.13
    Timeout: 30
    MemorySize: 512
    Architectures: [x86_64]
    # Valores medidos en qa
```

```python
# Cache de secreto (warm start)
_cached = None
def get_secret():
    global _cached
    if _cached is None:
        _cached = load_secret()
    return _cached
```

## 10. Secretos, configuración y observabilidad

| | Para qué | Cómo |
|---|---|---|
| **Secrets Manager** | Passwords, tokens, certificados. | Pasar solo el nombre/path a la Lambda; cachear en warm start; rotación sin redeploy del negocio. |
| **Parameter Store** | Subnets, SG, flags, endpoints. | Rutas `/dev/app/...`, `/qa/...`, `/prod/...`; resolver en deploy (`SSM::Parameter::Value`) o en runtime. |
| **Logs y alarmas** | Observabilidad. | dev/qa: 7 días; prod: 30 días. Formato JSON. Alarma en errores y en profundidad de DLQ. Log Group explícito en el template. |

**Flujo de deploy:** `build` → `deploy --config-env <env>` → revisar el *changeset* → confirmar. **Tags obligatorios** en cada sección de `samconfig`: `Project`, `Environment`, `Name`.

---

## 11. Estándares de Frontend: React

**React** es el único framework oficial para apps web — no se introduce Vue, Angular ni Svelte sin una decisión explícita de arquitectura, ni se reescribe un módulo en otro framework "porque el dev lo prefiere".

**Por qué React:** documentación/ecosistema maduro (menos tiempo inventando), alta cuota de mercado y talento (facilita contratación/onboarding/transferencia entre proyectos), y versatilidad (SPA, paneles ERP, portales internos, sitios estáticos — misma base para apps con auth, tablas y formularios complejos).

**En la práctica:** React + tooling moderno (Vite/CRA según el repo existente); componentes, hooks y composición como unidad de diseño; HTTP centralizado (`axiosApiGateway`), nunca `fetch`/`axios` suelto en cada página; estructura por módulos de negocio en `src/views/`.

**Se evita:** mezclar paradigmas sin una capa compartida de estado/errores/UI; elegir React Native o SSR solo por moda, sin justificar el caso.

### Jerarquía de reutilización de componentes/UI

Antes de crear desde cero: **reutilizar**, en este orden:

1. **Design system** del producto (tokens, `Button`, `Table`, `Sheet` — ej. shadcn + ui + shared). Si existe, es obligatorio usarlo.
2. **Kits aprobados** (NextUI y/o shadcn) — **nunca mezclar kits de UI en la misma pantalla** (ej. MUI + Ant Design).
3. **Extender** vía *wrappers* en `shared/` si 2+ módulos necesitan lo mismo.
4. **Crear nuevo** solo si no existe patrón — y entonces documentarlo y proponerlo de vuelta al Design System.

| Correcto | Incorrecto |
|---|---|
| Usar `Button`, `Input`, `Sheet` del kit del repo; tokens tipográficos (`text-body`, `text-caption`); breakpoints `erp-*` en módulos ERP. | Instalar MUI/Ant "solo para esta pantalla"; botones con CSS ad-hoc que rompen el look del ERP; duplicar un `Modal` que ya existe en `shared`. |

### Arquitectura de pantalla

**Flujo obligatorio:** `Page → use<Modulo>Controller → <modulo>Api → axiosApiGateway`.

- Un kit de UI por pantalla; en ERP, tokens + `shared`.
- `errorMessage` normalizado en el control; *toast* reservado para errores de red/mutaciones (no para "campo obligatorio", que debe validarse inline).
- Un solo `load()` + `AbortController` por pantalla, con estados `loading` / `error` / `empty` explícitos — nunca cascadas de `useEffect` sin controller (generan condiciones de carrera).
- Errores normalizados con forma `{ title, message, severity }`.

**Incorrecto:** `axios.get`/`fetch` directo en el `Page`; mezclar MUI + shadcn en la misma vista; *toast* para validación de campo; cascadas de `useEffect` sin controller — cada pantalla termina inventando su propia arquitectura, con validación inconsistente y condiciones de carrera.

**Convenciones de módulo:**
- Ruta: `src/views/<modulo>/` (con `api`, `routes`, `pages`, `hooks`, `components`).
- Naming: `kebab-case`; `*Page`, `use*Controller`, `*Api`.
- **Límites de líneas (mandatorio):** *atoms* 120 / *sections* 200 / *pages* 250.
- **Prettier obligatorio.**

### Despliegue Frontend: Amplify vs. ECS

| Usar **Amplify** (o estático + CDN) cuando… | Usar **ECS/Fargate** cuando… |
|---|---|
| SPA/sitio estático (build Vite/CRA → HTML/JS/CSS). | SSR/SSG con servidor Node (Next.js server, BFF). |
| CI/CD simple: push a rama → build → publish; *preview environments* por PR. | Necesitas proceso/proceso en el mismo contenedor del front. |
| Tráfico variable; CDN y HTTPS gestionados. | Requisitos de VPC privada, SG estrictos, sin salida pública. |
| Poco *ops*: no administras contenedores ni ALB. | Imagen custom, reverse proxy o multi-servicio en el task; integración con service mesh. |

**Ejemplos:** portal interno ERP o landing con API Gateway detrás → build estático + Amplify Hosting / S3+CloudFront. Front con SSR + BFF que llama RDS/servicios solo vía VPC → ECS Fargate (documentar por qué Amplify no alcanza).

**Regla:** SPA pura → Amplify/estático primero. SSR, BFF o red privada dura → ECS. Parametrizar el entorno (URLs de API, Cognito, feature flags) en ambos casos.

| Incorrecto | Correcto |
|---|---|
| Meter una SPA estática en ECS "porque el backend también es ECS" (ops de más). | ERP SPA + API Gateway → Amplify Hosting o S3+CloudFront. |
| Usar Amplify para un BFF que necesita VPC/SG/secretos de BD. | Next.js SSR/BFF → ECS Fargate (justificado). |
| Hardcodear `VITE_API_URL` de prod dentro del build de qa/dev. | Solo VPN/VPC → ECS + ALB interno. |
| Un solo pipeline sin distinguir ambiente ni exposición interna/pública. | Build por ambiente (`VITE_API_*`, Cognito) vía CI; hosting en IaC; promoción dev→qa→prod. |

---

## 12. Seguridad y Perímetros de Confianza

Declarar **desde el día 1** si una app es interna o externa — el perímetro define auth, exposición de red y controles.

- **Interna:** usuarios empleados/partners con VPN o red corporativa (solo se ve dentro de la VPN). Auth vía SSO/Cognito/IdP corporativo, sesiones cortas. API privada o con *authorizer* — nunca `AuthorizationType: NONE`. Hosting preferiblemente no público (IP allowlist, VPN, ALB interno). Minimizar PII en logs del browser; sin secretos en el bundle.
- **Externa (pública):** usuarios/clientes en Internet — mayor superficie de ataque (ej. un e-commerce, donde entran cientos de miles de personas). Auth Cognito/OAuth, MFA cuando el riesgo lo exija. WAF en CloudFront/API + *rate limiting* + headers de seguridad. HTTPS obligatorio; cookies `Secure`/`HttpOnly` si aplica. CORS estricto — nunca `*` con credenciales. Secretos solo en backend; el front solo ve tokens de corta vida.

**Ejemplos:** ERP interno → SPA + API Gateway privada + JWT/*authorizer*. Portal de clientes → Amplify/CloudFront + WAF + Cognito Hosted UI.

**Controles frontend (aplican a ambos tipos):**

| Correcto | Incorrecto |
|---|---|
| Rutas protegidas + *authorizer* en la API (no solo en la UI — el backend valida igual que el menú). | Creer que "si no está en el menú, está seguro". |
| CSP/headers de seguridad en CloudFront o Amplify. | API pública sin auth "porque el front es interno". |
| Token con limpieza en 401; dependencias *pinneadas* + *scan* en CI. | Passwords/keys/connection strings dentro del build; commit de `.env` con secretos al repo. |
| Env por ambiente: `VITE_API_BASE_URL`, `VITE_COGNITO_CLIENT_ID`, `VITE_APP_EXPOSURE=internal\|public`. | Misma URL de API/prod hardcodeada en builds de qa/dev. |

*Por qué:* ocultar algo del menú no es lo mismo que autorizarlo — la autorización real vive siempre en el backend; el browser nunca es un perímetro de confianza.

---

## 13. Principios de Clean Code y Calidad (Python)

Se adopta la **Arquitectura Hexagonal (Ports & Adapters)** para desacoplar el negocio de AWS. El *handler* debe ser delgado: solo traduce el evento AWS (parsear → caso de uso → respuesta) — el negocio nunca debe "saber" que está hablando con DynamoDB, SQS o una API concreta.

- **Domain:** reglas de negocio puras.
- **Application:** casos de uso + *ports* (interfaces) — lo que el negocio necesita.
- **Infrastructure:** *adapters* (boto3, DynamoDB, SQS, HTTP) — implementaciones concretas.
- **Handler:** solo traduce el evento AWS.

*Por qué:* se puede cambiar DynamoDB por RDS sin reescribir la lógica de negocio.

**SOLID (resumen práctico):** una razón de cambio por módulo/función (S) · extender sin romper lo existente (O) · contratos claros, sin APIs enormes (L/I) · depender de *ports*, no de `boto3` directamente en el dominio (D).

**DRY:** una sola fuente de verdad — validaciones y mapeos compartidos en un solo lugar. Ejemplo típico: `get_secret` debe ser un componente compartido, nunca copiado en 5 handlers distintos — un fix se aplica una vez, no en cinco sitios.

### Tests unitarios contra "puertos" (fakes)

- El caso de uso recibe un *port* (ej. `OrderRepository`), no un cliente AWS real.
- En el unit test se inyecta un *fake* en memoria: sin red ni credenciales — pruebas de reglas (validación, errores, idempotencia) rápidas y deterministas.
- Los *adapters* reales (boto3) se prueban aparte, como pocos tests de integración.
- **Incorrecto:** unit test que llama a DynamoDB/SQS reales. **Correcto:** fake del port + asserts del dominio.

---

## 14. Checklist de Paso a Producción

Antes de desplegar, el Líder de Solución debe validar:

- [ ] **Infraestructura:** template SAM único, con *overrides* de prod revisados; Log Groups creados como recursos explícitos (no auto-creados por Lambda).
- [ ] **Roles:** privilegio mínimo (sin wildcards); secretos fuera de git y de env vars planas.
- [ ] **Frontend:** React + Design System; Amplify vs. ECS justificado con evidencia, no por costumbre.
- [ ] **Exposición:** app interna/externa declarada explícitamente; auth/WAF aplicados según el caso.
- [ ] **Resiliencia:** DLQ activa (`-dlq`), `maxReceiveCount ≥ 5`, `VisibilityTimeout ≥ 6× timeout`, `ReportBatchItemFailures`.
- [ ] **Logs:** retención 30 días en prod, formato JSON, alarmas activas (errores + profundidad de DLQ).
- [ ] **Optimización:** memoria y timeout ajustados según métricas reales obtenidas en QA.
- [ ] **Etiquetado (Tags):** `Project`, `Environment`, `Name` presentes en cada recurso.
- [ ] **Changeset:** revisado antes de aplicar; sin recursos huérfanos creados a mano en consola.
- [ ] **Código:** alineado al stack SAM en `src/`, con *type hints*; Prettier verificado en frontend.

---

## 15. Mensajes para llevarse

1. **AI/DLC primero** — discovery, historias y diseño mínimos antes de escribir código; la IA propone, el equipo valida.
2. **Código primero (IaC)** — SAM/CloudFormation es la verdad; misma plantilla en dev → qa → prod.
3. **Serverless + React** — Lambda/Amplify por defecto; ECS solo con evidencia; Design System existente, nunca kits inventados sobre la marcha.
4. **Seguridad según exposición** — interna ≠ pública; auth siempre en el backend; secretos fuera del bundle; roles sin wildcards.

El estándar existe para que el siguiente servicio sea predecible: más velocidad de entrega, menos riesgo, costo controlado.
