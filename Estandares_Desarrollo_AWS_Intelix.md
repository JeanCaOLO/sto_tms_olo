# Estándares de Desarrollo AWS Intelix: Guía Técnica de Arquitectura y Metodología

## 1. Visión General y Objetivo del Estándar

El presente documento constituye el marco normativo obligatorio para la construcción de servicios en Intelix. El objetivo fundamental es asegurar que cualquier solución nueva sea **reproducible, segura y eficiente** (optimizada en costos operativos). Como líderes técnicos, nuestra misión es eliminar la "artesanía de consola" y sustituirla por procesos automatizados, auditables y escalables.

**Regla de Oro:** Si un recurso no está definido en el template SAM (o en un parámetro/secreto referenciado en dicho template), no existe para efectos de despliegue. Los cambios manuales en la consola de AWS están estrictamente prohibidos; en caso de una emergencia operativa, cualquier modificación manual debe ser reconciliada con el template antes del cierre de la jornada laboral para evitar el *drift*.

---

## 2. Metodología AI/DLC (AI-assisted Development Life Cycle)

La metodología **AI/DLC** es el estándar de Intelix para transformar problemas de negocio en diseños técnicos implementables mediante el uso de Inteligencia Artificial. No se trata simplemente de generar código, sino de un proceso estructurado para reducir la brecha entre el requerimiento y la ejecución.

### Insumos y Agentes de IA

- **La Verdad Cruda:** El insumo principal para el inicio del ciclo no son solo documentos, sino las **transcripciones de sesiones con clientes** generadas mediante **AWS Transcribe**. El 80% de los requisitos se dicen y no se escriben; la IA debe procesar estas transcripciones como fuente primaria.
- **Arquitectura de Agentes:** Se establece el uso obligatorio de **dos agentes Claude** en entorno empresarial: uno especializado en **Code Review** y otro encargado de mantener el **Contexto Global** del proyecto.
- **Repositorio de Prompts:** Todo desarrollador debe hacer *checkout* del **Knowledge Base (Prompt Repository)** en Git para alinear su IA local (Kiro, Cursor o Quick) con los estándares de Intelix antes de iniciar.

### Etapas del Ciclo AI/DLC

1. **Levantamiento:**
   - **Objetivo Clave:** Identificar actores, dolores, KPIs y restricciones (legales, plazos, datos).
   - **Entregable:** Brief de problema validado.

2. **Discovery:**
   - **Objetivo Clave:** Mapear flujos as-is/to-be, APIs existentes y riesgos técnicos.
   - **Entregable:** Mapa de contexto y cuestionario de validación técnica.

3. **Historias:**
   - **Objetivo Clave:** Traducir casos de uso a historias de usuario con criterios de aceptación (Given/When/Then).
   - **Entregable:** Backlog priorizado (MoSCoW).

4. **Planificación:**
   - **Objetivo Clave:** Definir slices verticales, dependencias y entornos.
   - **Entregable:** Plan de release y Sprint Goals.

5. **Diseño:**
   - **Objetivo Clave:** Definir arquitectura IaC y UX basada en el Design System.
   - **Entregable:** Esqueleto SAM y Architectural Decision Records (ADR).

### Comportamientos en el uso de IA

| Comportamiento Correcto | Comportamiento Incorrecto |
|---|---|
| Usar la IA para proponer; el humano valida restricciones de AWS y datos sensibles. | Pedir a la IA "haz el sistema" saltándose la fase de discovery. |
| Generar artefactos versionados en Git en cada fase del ciclo. | Generar historias de usuario sin definición de "Hecho" (Done). |
| Utilizar el repositorio de prompts oficial para asegurar consistencia. | Diseñar infraestructura ignorando el estándar SAM de la organización. |

---

## 3. Infraestructura como Código (IaC) con AWS SAM y CloudFormation

SAM y CloudFormation representan el **contrato del equipo**. Nada se despliega si no es a través de un stack versionado que garantice un estado conocido y recuperable (rollback).

### Estructura Estándar de Proyecto

Todo repositorio de backend debe seguir estrictamente esta organización de archivos:

- `template.yaml`: Definición de recursos.
- `samconfig.toml`: Configuraciones de despliegue por entorno.
- `src/`: Código fuente de la lógica de negocio.
- `tests/`: Pruebas unitarias e integración.

### Convenciones de Nombramiento

Es obligatorio el uso de **Logical IDs** descriptivos siguiendo el patrón: `FunctionalIdentifier + ResourceType` (ejemplo: `OrdersProcessorFunction`, `PaymentsTable`). Los nombres físicos de los recursos deben basarse siempre en la variable `${AWS::StackName}` para evitar colisiones entre ambientes.

### Plantilla Única para N Ambientes

Se prohíbe crear archivos YAML separados por entorno. La consistencia se logra mediante:

- **Parameters:** Para definir el contrato del stack (ej. `EnvironmentType`).
- **Conditions:** Para diferencias estructurales (ej. crear un recurso solo en prod).
- **samconfig.toml:** Almacena los `parameter_overrides` específicos para cada config-env (dev, qa, prod).

---

## 4. Estrategia Backend: Serverless First y Persistencia

Intelix prioriza soluciones que escalen sin administración de servidores y cobren por uso real.

### Guía de Decisión de Cómputo

- **AWS Lambda (Mandatorio por defecto):** Para APIs HTTP, procesamiento de eventos (SQS/S3) y tareas menores a 15 minutos. Es la opción prioritaria para reducir la superficie operativa.
- **AWS ECS / Fargate:** Solo con justificación técnica documentada (procesos > 15 min, streaming, sockets persistentes o librerías nativas pesadas).

### Estándar de Base de Datos

Si bien somos **Serverless First**, cuando se requiere integridad referencial estricta o la creación de un **Lago de Datos (Data Lake)**, el estándar es **PostgreSQL sobre servidores administrados (RDS)**.

- **Configuración AI:** Es obligatorio utilizar agentes de IA (Claude) para generar el esquema de base de datos y las asociaciones de tablas, emulando la agilidad de Supabase pero sobre nuestra infraestructura RDS controlada.

### Runtime

El estándar oficial para todo nuevo desarrollo es **Python 3.13**.

---

## 5. Resiliencia y Procesamiento Asíncrono (SQS y DLQ)

Para patrones asíncronos (API responde 202 y encola), es obligatorio implementar los siguientes cuatro controles de resiliencia:

1. **Dead Letter Queue (DLQ):** Toda cola debe tener una cola de destino para mensajes fallidos con el sufijo `-dlq`.
2. **maxReceiveCount:** Valor mínimo de **5 reintentos**. Configurar menos de 5 es insuficiente para absorber fallos transitorios (cold starts o blips de red).
3. **VisibilityTimeout:** Debe ser **≥ 6 × el timeout de la Lambda**. Omitir esta regla genera "mensajes venenosos" que reaparecen en la cola mientras la Lambda aún se ejecuta, provocando doble facturación y escrituras conflictivas.
4. **Idempotencia:** Uso obligatorio de **DynamoDB + TTL** (~24h) para registrar `messageId`. Las colas estándar no garantizan *exactly-once delivery*; la idempotencia es la única defensa real contra procesamientos duplicados.

> **Nota sobre eficiencia:** Activar siempre `ReportBatchItemFailures`. Sin esto, un solo fallo en un lote de 10 mensajes obligará a reintentar los 10, desperdiciando recursos y aumentando costos.

---

## 6. Estándares de Frontend: React y Design Systems

**React** es el único framework oficial. No se permiten alternativas (Vue, Angular) sin una excepción aprobada por arquitectura.

### Jerarquía de Componentes y Estilo

- **Uso de Librerías:** Prioridad: Design System del producto → Kits aprobados (shadcn/ui o NextUI) → Shared components.
- **Prohibición:** No mezclar kits de UI (ej. MUI + Ant Design) en una misma pantalla.
- **Calidad:** El uso de **Prettier** es obligatorio para garantizar la legibilidad del código.

### Arquitectura y Límites

- **Flujo:** Page (Vista) → Controller (Hooks/Lógica) → API (Servicios).
- **Límites de líneas (Mandatorio):** Atoms: 120 / Sections: 200 / Pages: 250.

### Matriz de Decisión de Despliegue

| Servicio | Caso de Uso |
|---|---|
| AWS Amplify | SPAs puras, sitios estáticos y CI/CD simple con *preview* por PR. |
| AWS ECS | Aplicaciones con SSR (Next.js), BFF o requerimiento de VPC privada sin salida pública. |

---

## 7. Seguridad y Perímetros de Confianza

### Clasificación de Aplicaciones

- **Internas:** Acceso exclusivo vía VPN o red corporativa. Auth obligatorio mediante **SSO Corporativo o Cognito**.
- **Externas:** Uso mandatorio de **AWS WAF**, CloudFront, HTTPS y **Cognito Hosted UI** para la gestión de identidad.

### Prácticas Prohibidas

- Subir archivos `.env` o secretos al repositorio.
- Incluir secretos o *connection strings* en el bundle del frontend.
- Uso de `AllowOrigin: "*"` cuando se manejen credenciales o cookies.
- **Wildcards en IAM:** Los roles deben apuntar a ARNs específicos. El uso de `Resource: "*"` está prohibido.

---

## 8. Principios de Clean Code y Calidad

Se adopta la **Arquitectura Hexagonal** para desacoplar el negocio de AWS:

- **Dominio:** Lógica de negocio pura.
- **Aplicación (Ports):** Interfaces que definen qué necesita el negocio.
- **Infraestructura (Adapters):** Implementaciones concretas (Boto3, DynamoDB, SQS).

### Reglas Fundamentales

- **Inyección de Dependencias:** El desarrollador debe *inyectar el puerto* en el Caso de Uso. La lógica de negocio nunca debe "saber" que está hablando con DynamoDB.
- **DRY:** No duplicar lógica técnica. Ejemplo: la función `get_secret` debe ser un componente compartido y no repetirse en cada handler.
- **Pruebas:** Los tests unitarios se ejecutan contra "fakes" de los puertos en memoria. No se permiten llamadas reales a servicios de AWS en pruebas unitarias.

---

## 9. Checklist de Paso a Producción

Antes de desplegar, el Líder de Solución debe validar:

- [ ] **Infraestructura:** Template SAM único con Log Groups creados como recursos explícitos (no auto-creados por Lambda).
- [ ] **Logs:** Retención configurada a **30 días** en producción y formato JSON.
- [ ] **Resiliencia:** DLQ activa (`-dlq`), maxReceiveCount ≥ 5 y Visibility ajustado a 6 × timeout.
- [ ] **Seguridad:** Roles con mínimo privilegio (sin wildcards) y secretos gestionados en Secrets Manager.
- [ ] **Etiquetado (Tags):** Tags obligatorios presentes en cada recurso: `Project`, `Environment` y `Name`.
- [ ] **Optimización:** Memoria y timeout ajustados según métricas reales obtenidas en QA.
- [ ] **Frontend:** Uso de Prettier verificado y arquitectura de Controller implementada.
