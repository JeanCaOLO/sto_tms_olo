# Guía de acceso cross-account en AWS

## Propósito y alcance

Esta guía explica patrones seguros, auditables y de mínimo privilegio para compartir y consumir recursos entre dos cuentas AWS. Cubre Lambda Layers, KMS, DynamoDB, Lambda, SQS, SNS, S3, Secrets Manager, SSM Parameter Store y EventBridge. Es documentación agnóstica del agente: la única copia generada vive en `docs/guides/guia-cross-account-aws.md`; no se crea una copia en `.cursor/`, `.kiro/`, `.claude/` ni otra carpeta de agente.

Todos los ejemplos son **configuraciones ilustrativas, no listas para producción**. Antes de desplegarlos hay que validar las identidades, los recursos, las regiones, los Account_ID, la organización, los límites de servicio y los controles de seguridad del entorno destino. La guía no crea recursos AWS ni sustituye una revisión de arquitectura, seguridad o cumplimiento.

### Trazabilidad editorial

El alcance se elaboró a partir del material adjunto **`buenas-practicas-cross-account-aws.md`**, que fue adaptado y reformulado para esta plantilla. El material adjunto es un antecedente de autoría y no una dependencia de ejecución, instalación o distribución: `intelix-cli` distribuye únicamente este archivo desde `templates/`. La redacción conserva los objetivos de seguridad, condiciones, restricciones y riesgos del material, y cada práctica se contrasta con referencias oficiales de AWS.

La guía es una fuente documental, no una skill ni un steering. No debe duplicarse en una integración de agente. Cualquier automatización futura debe ser opt-in y referenciar esta guía canónica sin convertirse en una segunda fuente.

### Placeholders seguros

Los ejemplos usan valores visiblemente no productivos y consistentes: `OWNER_ACCOUNT_ID` es la cuenta propietaria, `CONSUMER_ACCOUNT_ID` la consumidora, `example-region-1` la región, `example-role-name`, `example-function-name`, `example-table-name` y nombres equivalentes son recursos de ejemplo, `o-exampleorgid` es una organización de ejemplo, `key/example-key-id` identifica una CMK de ejemplo y `EXTERNAL_ID_EXAMPLE` es un ExternalId de ejemplo. No se incluyen credenciales, tokens, contraseñas, certificados, claves privadas ni identificadores reales.

## Modelo de autorización

### Acceso directo: la doble autorización

Cuando un servicio admite acceso directo cross-account, deben coincidir dos permisos:

1. La **Identity_Policy** del rol o usuario en `Consumer_Account` autoriza la acción sobre el ARN del recurso de `Owner_Account`.
2. La **Resource_Policy** del recurso en `Owner_Account` autoriza al principal consumidor.

Una política de identidad no puede conceder por sí sola acceso a un recurso externo. Si falta la política del recurso, falta la acción, el ARN no coincide o una condición no se satisface, AWS deniega la solicitud. En un recurso cifrado se suma la autorización KMS: la key policy y el permiso del consumidor sobre la CMK también deben coincidir.

> **Ejemplo ilustrativo — requiere validación previa.** Una autorización directa debe restringir principal, acción, ARN y condiciones; nunca se debe convertir este esquema en un permiso administrativo.

```text
Owner_Account: Resource_Policy -> permite la acción al principal de Consumer_Account
Consumer_Account: Identity_Policy -> permite la misma acción sobre el ARN exacto
Si hay cifrado: Key_Policy + kms:Decrypt/GenerateDataKey/etc. -> autorizan la CMK
```

### AssumeRole: credenciales temporales

Cuando el servicio no ofrece una política de recurso suficiente o se necesita un límite operativo claro, el principal de `Consumer_Account` solicita `sts:AssumeRole` sobre un rol de `Owner_Account`. La trust policy del rol debe confiar en el principal previsto; la Identity_Policy del consumidor debe permitir `sts:AssumeRole` sobre el ARN exacto del rol; un `ExternalId` acordado debe coincidir. La sesión debe usar credenciales temporales con duración acotada y expira al terminar la sesión.

Cross-account no usa access keys compartidas, access keys copiadas ni otras credenciales largas copiadas entre cuentas. El principal nunca debe recibir permisos distintos de los necesarios para el recurso y la operación demostrada.

### Condiciones de autorización

- **`aws:SourceAccount`** restringe el Account_ID que origina una solicitud. Aplica especialmente a políticas de recursos invocadas por servicios AWS, cuando la cuenta de origen es una condición de confianza relevante.
- **`aws:SourceArn`** restringe el ARN concreto del recurso que origina la solicitud. Es apropiado para relaciones como SNS hacia SQS, S3 hacia Lambda o un servicio hacia una función, evitando el confused deputy.
- **`aws:PrincipalOrgID`** restringe el principal a cuentas pertenecientes a la organización indicada, por ejemplo `o-exampleorgid`. Aplica a políticas de recursos y key policies cuando el escenario permite confiar en toda una organización; no reemplaza la revisión de SCP ni debe ampliar acceso fuera del caso de uso.

Siempre que haya permisos a nivel de recurso se debe usar el ARN completo del recurso, no `Resource: "*"`. En una Resource_Policy se debe especificar el rol, cuenta o principal de servicio requerido; un principal global solo sería aceptable con una justificación explícita y condiciones restrictivas. La cuenta propietaria y la consumidora deben ser diferentes: verificar ambos Account_ID antes de llamar cross-account a un diseño.

## Lambda layer version sharing

### Patrón y responsabilidades

`Owner_Account` publica una versión inmutable de una Lambda Layer y concede sobre esa **versión concreta** el permiso `lambda:GetLayerVersion` al Account_ID o rol previsto. `Consumer_Account` referencia el ARN completo de la versión en la propiedad `Layers` de su función. El permiso de uso de una layer no es permiso de invocación: `lambda:InvokeFunction` es un permiso separado para una función, alias o versión.

La función y la versión de layer deben estar en la **misma AWS_Region**, incluso si pertenecen a cuentas diferentes. Para varias regiones se publica una versión equivalente en cada región y se otorgan permisos de forma independiente. Fijar el número de versión evita que una actualización accidental cambie el contrato del consumidor.

> **Ejemplo ilustrativo — requiere validación previa.** El propietario concede solo lectura de la versión 7 y el consumidor fija el ARN; los nombres y la cuenta son placeholders.

```bash
aws lambda add-layer-version-permission \
  --layer-name example-layer-name \
  --version-number 7 \
  --statement-id example-cross-account-consumer \
  --action lambda:GetLayerVersion \
  --principal CONSUMER_ACCOUNT_ID
```

```yaml
# Owner_Account; ejemplo ilustrativo, no listo para producción
Action: lambda:GetLayerVersion
Principal: CONSUMER_ACCOUNT_ID
LayerVersionArn: arn:aws:lambda:example-region-1:OWNER_ACCOUNT_ID:layer:example-layer-name:7
```

```yaml
# Consumer_Account; ARN específico y región coincidente
Layers:
  - arn:aws:lambda:example-region-1:OWNER_ACCOUNT_ID:layer:example-layer-name:7
```

La validación posterior debe comprobar que `GetLayerVersion` funciona para el principal consumidor, que el runtime y la arquitectura son compatibles y que no se concedió `lambda:InvokeFunction` por error. Si una función de la cuenta propietaria debe ser invocada, documentar otro permiso `lambda:InvokeFunction` con el ARN de función y el principal exactos.

## KMS cross-account key authorization

### Customer managed key y AWS managed key

Una **Customer_Managed_Key (CMK)** pertenece al cliente, tiene key policy controlable por el propietario y puede autorizar uso a otra cuenta cuando la política y la Identity_Policy del consumidor coinciden. Una **AWS_Managed_Key**, incluida una clave default `aws/<servicio>`, es administrada por AWS: su key policy no se puede ampliar libremente para autorizar a una cuenta externa. Por tanto, un recurso cifrado que se comparte cross-account requiere una CMK; la autorización del recurso por sí sola no basta.

`Owner_Account` administra la CMK y su Key_Policy. `Consumer_Account` limita sus permisos al ARN completo de esa CMK. Para una operación, mapear solo la acción necesaria: cifrar puede requerir `kms:Encrypt` y/o `kms:GenerateDataKey`, descifrar requiere `kms:Decrypt`, transformar cifrado puede requerir `kms:ReEncrypt`, y descubrir metadatos puede requerir `kms:DescribeKey`.

> **Ejemplo ilustrativo — requiere validación previa.** La key policy autoriza la cuenta consumidora dentro de una organización de ejemplo. `Resource: "*"` aparece en una key policy porque KMS usa ese valor para referirse a la propia clave; el alcance real lo limita la política de esa clave y el principal/condición.

```json
{
  "Sid": "AllowExampleConsumerUse",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::CONSUMER_ACCOUNT_ID:root" },
  "Action": [
    "kms:Encrypt",
    "kms:Decrypt",
    "kms:GenerateDataKey",
    "kms:ReEncrypt",
    "kms:DescribeKey"
  ],
  "Resource": "*",
  "Condition": {
    "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
  }
}
```

> **Ejemplo ilustrativo — requiere validación previa.** La política consumidora referencia la CMK por su ARN completo, nunca por alias ni por una clave no especificada.

```json
{
  "Effect": "Allow",
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "arn:aws:kms:example-region-1:OWNER_ACCOUNT_ID:key/example-key-id"
}
```

Si el recurso usa una AWS_Managed_Key default, no se debe afirmar que `sqs:SendMessage`, `s3:GetObject`, `secretsmanager:GetSecretValue` u otra autorización del recurso sea suficiente. La alternativa es migrar o recrear el recurso con una CMK cuya key policy pueda revisarse. Confirmar en ambos lados la key policy, la Identity_Policy y la acción KMS antes de probar el recurso.

## DynamoDB cross-account access

DynamoDB no debe asumirse como un servicio de política de recurso directa equivalente a SQS o S3. El patrón portable recomendado es `AssumeRole`: `Owner_Account` crea el rol de acceso y conserva la tabla; `Consumer_Account` permite a su principal asumir ese rol. El rol asumido contiene únicamente las acciones y tablas/índices requeridos. Si la tabla usa una CMK, se agregan las acciones KMS de esa operación sobre el ARN exacto.

> **Ejemplo ilustrativo — requiere validación previa.** El rol de la cuenta propietaria confía en el rol exacto de la cuenta consumidora y exige `ExternalId`.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::CONSUMER_ACCOUNT_ID:role/example-consumer-role" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "sts:ExternalId": "EXTERNAL_ID_EXAMPLE" } }
  }]
}
```

> **Ejemplo ilustrativo — requiere validación previa.** Las acciones se limitan a una tabla y a sus índices solo porque el ejemplo usa `Query` sobre ellos.

```json
{
  "Effect": "Allow",
  "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"],
  "Resource": [
    "arn:aws:dynamodb:example-region-1:OWNER_ACCOUNT_ID:table/example-table-name",
    "arn:aws:dynamodb:example-region-1:OWNER_ACCOUNT_ID:table/example-table-name/index/*"
  ]
}
```

> **Ejemplo ilustrativo — requiere validación previa.** El principal consumidor solo puede asumir el rol de acceso de la cuenta propietaria.

```json
{
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": "arn:aws:iam::OWNER_ACCOUNT_ID:role/example-dynamodb-access-role"
}
```

La llamada debe suministrar `EXTERNAL_ID_EXAMPLE`, cuya igualdad con la trust policy se verifica antes de emitir credenciales temporales. No se comparten access keys. La región del ARN debe ser la región de la tabla; para otra región se debe confirmar la capacidad del cliente y del patrón, o replicar los datos. Validar después que el rol asumido puede ejecutar solo las operaciones previstas y que CloudTrail registra la cuenta solicitante y el rol asumido.

## Lambda cross-account invocation

Para invocación directa, `Owner_Account` publica una Resource_Policy en la función, alias o versión con `lambda:InvokeFunction`. `Consumer_Account` concede esa acción al rol invocador sobre el ARN de la función. Si el invocador es un servicio, restringir con `aws:SourceAccount` y/o `aws:SourceArn`; si es un rol de otra cuenta, especificar el ARN del rol. No confundir invocación con uso de Lambda Layers.

> **Ejemplo ilustrativo — requiere validación previa.** El propietario autoriza únicamente al rol invocador de ejemplo.

```bash
aws lambda add-permission \
  --function-name example-function-name \
  --statement-id example-cross-account-invoke \
  --action lambda:InvokeFunction \
  --principal arn:aws:iam::CONSUMER_ACCOUNT_ID:role/example-invoker-role
```

> **Ejemplo ilustrativo — requiere validación previa.** El consumidor usa solo el ARN de la función de destino.

```json
{
  "Effect": "Allow",
  "Action": "lambda:InvokeFunction",
  "Resource": "arn:aws:lambda:example-region-1:OWNER_ACCOUNT_ID:function:example-function-name"
}
```

El patrón directo normalmente es regional: el ARN de función contiene la región y se debe validar la capacidad del cliente para una invocación en otra región. La validación posterior comprueba la policy de función, la policy de identidad, el alias/versión seleccionado, el ARN exacto y los registros de invocación en ambas cuentas.

## SQS cross-account messaging

`Owner_Account` administra la cola y su queue policy. `Consumer_Account` administra la Identity_Policy del productor o consumidor. Para enviar se requieren `sqs:SendMessage`; para leer y eliminar se requieren solo las acciones de lectura necesarias, como `sqs:ReceiveMessage` y `sqs:DeleteMessage`. La queue policy debe nombrar el rol o cuenta previsto y el ARN completo de la cola.

> **Ejemplo ilustrativo — requiere validación previa.** La cuenta propietaria permite enviar al rol exacto y restringe la cuenta de origen.

```yaml
# Owner_Account; queue policy ilustrativa
Effect: Allow
Principal:
  AWS: arn:aws:iam::CONSUMER_ACCOUNT_ID:role/example-producer-role
Action: sqs:SendMessage
Resource: arn:aws:sqs:example-region-1:OWNER_ACCOUNT_ID:example-queue-name
Condition:
  StringEquals:
    aws:SourceAccount: CONSUMER_ACCOUNT_ID
```

> **Ejemplo ilustrativo — requiere validación previa.** La Identity_Policy del consumidor apunta a la misma cola, no a todas las colas.

```json
{
  "Effect": "Allow",
  "Action": "sqs:SendMessage",
  "Resource": "arn:aws:sqs:example-region-1:OWNER_ACCOUNT_ID:example-queue-name"
}
```

Si la cola está cifrada, su CMK debe autorizar al principal que realiza la operación y las acciones KMS necesarias, normalmente `kms:GenerateDataKey` y `kms:Decrypt`, además de `sqs:SendMessage` o las acciones de consumo. Una AWS_Managed_Key default no habilita este patrón externo. SQS es regional: el productor debe usar el ARN de la región de la cola; para múltiples regiones se requieren colas y políticas por región. Validar envío, recepción, eliminación, DLQ y eventos de CloudTrail.

## SNS cross-account publishing/subscription

Se contemplan dos escenarios distintos:

1. **Publicación:** `Owner_Account` posee el topic y su topic policy autoriza `sns:Publish` al rol de `Consumer_Account`; el consumidor concede la misma acción sobre el ARN exacto del topic.
2. **Suscripción topic-to-queue:** el topic de `Owner_Account` entrega a una cola SQS de `Consumer_Account`. La topic policy permite la suscripción prevista, y la queue policy del consumidor permite `sqs:SendMessage` al principal de servicio SNS con `aws:SourceArn` igual al ARN del topic. La suscripción debe quedar confirmada.

> **Ejemplo ilustrativo — requiere validación previa.** Publicación limitada a un topic y rol concretos.

```yaml
# Owner_Account; topic policy ilustrativa
Effect: Allow
Principal:
  AWS: arn:aws:iam::CONSUMER_ACCOUNT_ID:role/example-publisher-role
Action: sns:Publish
Resource: arn:aws:sns:example-region-1:OWNER_ACCOUNT_ID:example-topic-name
```

> **Ejemplo ilustrativo — requiere validación previa.** La cola de la cuenta consumidora solo acepta entregas del topic específico.

```json
{
  "Effect": "Allow",
  "Principal": { "Service": "sns.amazonaws.com" },
  "Action": "sqs:SendMessage",
  "Resource": "arn:aws:sqs:example-region-1:CONSUMER_ACCOUNT_ID:example-queue-name",
  "Condition": {
    "ArnEquals": {
      "aws:SourceArn": "arn:aws:sns:example-region-1:OWNER_ACCOUNT_ID:example-topic-name"
    }
  }
}
```

El topic y la cola son regionales; deben coincidir en la entrega directa y cada región requiere configuración propia. Si el topic o la cola están cifrados, usar CMK: el publisher necesita las acciones KMS que correspondan y SNS debe poder usar la CMK de la cola para entregar. Validar policy del topic, policy de la cola, confirmación de la suscripción, `aws:SourceArn`, acciones mínimas y eventos de entrega. No usar la clave default `aws/sns` o `aws/sqs` para autorizar el uso externo.

## S3 cross-account object access

`Owner_Account` posee el bucket y define la bucket policy. `Consumer_Account` concede IAM al rol que lee o escribe. Las acciones y el ARN se acotan a un prefijo, por ejemplo `example-prefix/*`; las acciones de bucket y de objeto se separan cuando ambas son necesarias. Compartir un bucket no equivale a hacerlo público.

> **Ejemplo ilustrativo — requiere validación previa.** El bucket permite únicamente lectura/escritura sobre un prefijo y un rol concretos.

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::CONSUMER_ACCOUNT_ID:role/example-s3-role" },
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::example-bucket-name/example-prefix/*",
  "Condition": {
    "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
  }
}
```

> **Ejemplo ilustrativo — requiere validación previa.** La identidad consumidora usa el mismo prefijo y no recibe `s3:*`.

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::example-bucket-name/example-prefix/*"
}
```

Evaluar **S3 Object Ownership**: `Bucket owner enforced` desactiva ACLs y hace que la cuenta propietaria del bucket sea dueña de los objetos cargados, simplificando el control. Sin esa configuración, un objeto escrito por otra cuenta puede quedar bajo propiedad del escritor y el dueño del bucket puede no controlar su acceso. Si el bucket usa SSE-KMS, la CMK debe autorizar `kms:GenerateDataKey` y `kms:Decrypt` según la operación, además de S3; una clave AWS managed default no es suficiente. S3 debe operar en la región del bucket, y los ARNs de bucket/objeto deben validarse. Comprobar ownership, prefijo, bloqueo público, cifrado, lectura y escritura posterior.

## Secrets Manager cross-account secret access

`Owner_Account` posee el secreto, configura su resource policy y administra la CMK. `Consumer_Account` concede `secretsmanager:GetSecretValue` sobre el ARN completo del secreto y `kms:Decrypt` sobre la CMK. La rotación y actualización del secreto permanecen en la cuenta propietaria. El secreto debe usar una CMK; `aws/secretsmanager` no se puede ampliar para autorizar este acceso externo.

> **Ejemplo ilustrativo — requiere validación previa.** La policy del secreto permite solo lectura al rol consumidor y usa el ARN específico.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::CONSUMER_ACCOUNT_ID:role/example-secret-reader-role" },
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "arn:aws:secretsmanager:example-region-1:OWNER_ACCOUNT_ID:secret:example-secret-name-example-id"
  }]
}
```

> **Ejemplo ilustrativo — requiere validación previa.** El consumidor obtiene el valor solo del secreto propietario y descifra solo con la CMK correspondiente.

```json
[
  {
    "Effect": "Allow",
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "arn:aws:secretsmanager:example-region-1:OWNER_ACCOUNT_ID:secret:example-secret-name-example-id"
  },
  {
    "Effect": "Allow",
    "Action": "kms:Decrypt",
    "Resource": "arn:aws:kms:example-region-1:OWNER_ACCOUNT_ID:key/example-key-id"
  }
]
```

Secrets Manager es regional: usar el ARN y CMK de la región del secreto; replicar y autorizar por región cuando el diseño lo requiera. Validar resource policy, IAM, key policy, `kms:Decrypt`, rotación, retención del valor en memoria y eventos de lectura en CloudTrail. No incluir el valor del secreto en documentación, logs o ejemplos.

## SSM Parameter Store cross-account parameters

El patrón documentado usa AWS RAM y exige el tier **Advanced**. Un parámetro Standard no puede usarse con este patrón: convertirlo a Advanced o elegir una alternativa como replicación controlada o un rol asumible. `Owner_Account` crea y comparte el parámetro; `Consumer_Account` obtiene `ssm:GetParameter` usando el ARN completo que incluye la cuenta propietaria.

> **Ejemplo ilustrativo — requiere validación previa.** Solo se muestra un parámetro Advanced de ejemplo; el valor no es un secreto operativo.

```bash
aws ssm put-parameter \
  --name /example/shared/endpoint \
  --value https://example.invalid/endpoint \
  --type String \
  --tier Advanced
```

> **Ejemplo ilustrativo — requiere validación previa.** El consumidor usa el ARN completo, no solo `/example/shared/endpoint`.

```bash
aws ssm get-parameter \
  --name arn:aws:ssm:example-region-1:OWNER_ACCOUNT_ID:parameter/example/shared/endpoint
```

Para `SecureString`, la CMK debe ser Customer_Managed_Key y la key policy debe permitir al consumidor `kms:Decrypt`; la clave default `aws/ssm` no es suficiente. Parameter Store es regional y el ARN debe apuntar a la región del parámetro. Validar tier Advanced, aceptación de RAM, ARN completo, `ssm:GetParameter`, CMK/`kms:Decrypt` si corresponde y lectura posterior. No documentar valores reales.

## EventBridge cross-account event delivery

`Owner_Account` o cuenta de origen publica al bus destino de `Consumer_Account`. El bus destino tiene una resource policy que permite `events:PutEvents` al origen, y la regla de origen usa un rol de reenvío con esa acción sobre el ARN exacto del bus. El contrato del evento debe versionarse y el destino debe validar el esquema.

> **Ejemplo ilustrativo — requiere validación previa.** La policy del bus solo confía en la cuenta de origen dentro de la organización de ejemplo.

```json
{
  "Sid": "AllowExampleSourceEvents",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::OWNER_ACCOUNT_ID:root" },
  "Action": "events:PutEvents",
  "Resource": "arn:aws:events:example-region-1:CONSUMER_ACCOUNT_ID:event-bus/example-bus-name",
  "Condition": {
    "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
  }
}
```

> **Ejemplo ilustrativo — requiere validación previa.** El rol de la regla solo publica en el bus destino.

```json
{
  "Effect": "Allow",
  "Action": "events:PutEvents",
  "Resource": "arn:aws:events:example-region-1:CONSUMER_ACCOUNT_ID:event-bus/example-bus-name"
}
```

EventBridge es regional para este envío: origen, regla y bus deben configurarse en la región correspondiente; para varias regiones se requieren buses/reglas y contratos por región o una estrategia explícita de replicación. Si el bus está cifrado, revisar CMK además de las policies. Validar la regla, el rol de target, la policy del bus, el patrón de evento, `aws:PrincipalOrgID`, entregas y eventos de CloudTrail.

## Matriz de regiones y limitaciones

| Servicio | Condición regional del patrón | Responsabilidad de validación |
|---|---|---|
| Lambda layer version sharing | Misma región entre función y layer; no cross-region directo | Publicar y autorizar una versión por región |
| KMS | La clave es regional; el consumidor debe usar el ARN de la región de la CMK | Confirmar región de recurso y clave |
| DynamoDB | Tabla e interacción se validan por región; cross-region requiere confirmar cliente, endpoint o replicación | No asumir que un ARN de otra región es equivalente |
| Lambda invocation | La función tiene ARN regional; validar endpoint y región del invocador | Autorizar cada función/alias regional |
| SQS | Cola y ARN son regionales | Crear policy por cola/región |
| SNS | Topic y suscripción/entrega son regionales | Configurar topic y endpoint por región |
| S3 | Bucket tiene región; el acceso usa ARN y endpoint del bucket | Validar región, prefijo y ownership |
| Secrets Manager | Secreto y CMK son regionales | Replicar y autorizar por región si hace falta |
| SSM Parameter Store | Parámetro Advanced y RAM son regionales | Compartir y consumir el ARN completo regional |
| EventBridge | Bus, regla y target deben configurarse por región | Replicar configuración y contrato por región |

Otras limitaciones duras: un SCP aplicable puede denegar una acción aunque IAM y Resource_Policy permitan; `Owner_Account_ID` y `Consumer_Account_ID` deben ser distintos; S3 Object Ownership debe decidirse antes de cargar objetos; y una AWS_Managed_Key default no se convierte en CMK mediante una policy adicional.

## Autorización de cifrado por servicio

Cuando el recurso esté cifrado, la CMK es parte del contrato cross-account y no un detalle posterior:

- **SQS cifrado:** `Owner_Account` autoriza la CMK y la queue policy; `Consumer_Account` recibe `kms:GenerateDataKey`/`kms:Decrypt` solo si las operaciones lo requieren.
- **SNS cifrado:** autorizar la CMK al publisher y, para entregas a una cola cifrada, al servicio SNS según la integración; además del topic/queue policy.
- **S3 SSE-KMS:** autorizar `kms:GenerateDataKey` y `kms:Decrypt` según `PutObject`/`GetObject`, junto con bucket e IAM.
- **DynamoDB cifrado:** el rol asumido necesita las acciones KMS que requiera la operación de la tabla y la key policy debe confiar en ese uso.
- **Secrets Manager:** `GetSecretValue` necesita `kms:Decrypt` sobre la CMK del secreto y su key policy, además de la resource policy.
- **SSM SecureString:** `GetParameter --with-decryption` necesita `kms:Decrypt` sobre una CMK; el tier sigue siendo Advanced.

Para cualquier operación revisar también `kms:Encrypt`, `kms:ReEncrypt` o `kms:DescribeKey` cuando el flujo concreto las ejecute. El ARN de la CMK debe aparecer completo en el permiso consumidor.

## Auditoría, evidencia e infraestructura

Habilitar CloudTrail en `Owner_Account` y `Consumer_Account` para solicitudes API cross-account, `AssumeRole`, cambios de Resource_Policy, trust policy, IAM policy, key policy y configuración de recursos. Cuando haya roles, los eventos `AssumeRole` son `Audit_Evidence`: conservar la cuenta solicitante, el ARN del principal y el rol asumido, además del resultado y la sesión.

Representar la configuración de ambos lados como IaC (CloudFormation, SAM o Terraform) y revisar cambios mediante control de versiones. Adoptar la convención `xac-<servicio>-<owner>-<consumer>-<entorno>` para nombres y tags; aplicar la misma convención a recursos compartidos, roles, CMK, reglas, topics y colas en ambas cuentas. Las etiquetas deben incluir al menos `CrossAccount=true`, `OwnerAccount=OWNER_ACCOUNT_ID`, `ConsumerAccount=CONSUMER_ACCOUNT_ID` y `DataClassification=example`.

Evidencias separadas a conservar:

- principal previsto: ARN del rol, cuenta o principal de servicio;
- resource ARN: ARN completo del recurso y región;
- acción solicitada: acción IAM exacta y API invocada;
- condición: `aws:SourceAccount`, `aws:SourceArn`, `aws:PrincipalOrgID` o `sts:ExternalId` aplicada;
- `Owner_Account_ID`: Account_ID que posee el recurso, policy y CMK;
- `Consumer_Account_ID`: Account_ID que ejecuta o asume el acceso;
- resultado: evento CloudTrail, denegación y evidencia de la policy evaluada.

## Troubleshooting de accesos denegados

| Síntoma | Causa de autorización a revisar | Evidencia y comprobación aplicable |
|---|---|---|
| `AssumeRole` denegado | Trust policy no confía en el principal; falta `sts:AssumeRole`; `ExternalId` no coincide; SCP bloquea STS | Revisar trust policy de `Owner_Account`, Identity_Policy de `Consumer_Account`, valor de `ExternalId`, Account_ID y CloudTrail de `AssumeRole`; comprobar organización/SCP |
| Acción sobre recurso compartido denegada | Falta Resource_Policy o Identity_Policy, acción/ARN no coincide, condición no satisfecha | Revisar Resource_Policy del propietario, Identity_Policy del consumidor, ARN/región, principal y condiciones; revisar SCP si ambos permisos parecen correctos |
| Operación KMS denegada | CMK ausente, AWS_Managed_Key default, key policy sin consumidor o falta la acción KMS | Revisar key policy de `Owner_Account`, `kms:Decrypt`/`GenerateDataKey`/acción concreta en `Consumer_Account`, ARN de CMK y CloudTrail KMS |
| Solicitud bloqueada por política organizacional | SCP de una o ambas cuentas deniega aunque IAM y Resource_Policy concedan | Revisar SCP y OU de cada cuenta, CloudTrail y acción exacta; conservar Resource_Policy, Identity_Policy y KMS como comprobaciones secundarias |

No se debe “resolver” un `AccessDenied` añadiendo `AdministratorAccess`, comodines globales o credenciales copiadas. Corregir el lado que falta, repetir la validación con el ARN concreto y conservar el resultado como evidencia. Si el rol o recurso ya fue configurado y la operación sigue sin éxito, reportar la operación como fallida hasta completar las cuatro comprobaciones de la tabla.

## Checklist cross-account por servicio

Cada ítem debe marcarse solo después de revisar propietario, consumidor, autorización, región y prueba posterior:

- [ ] **Lambda Layer:** propietario publicó versión fija y `GetLayerVersion`; consumidor fijó ARN completo; misma región; probó carga de la layer.
- [ ] **KMS:** propietario usa CMK y key policy; consumidor tiene solo acciones necesarias sobre ARN de CMK; región coincide; probó la operación criptográfica.
- [ ] **DynamoDB:** propietario creó rol asumible y trust con `ExternalId`; consumidor tiene `sts:AssumeRole`; tabla/índices son específicos; región y consulta fueron validadas.
- [ ] **Lambda:** propietario autorizó `InvokeFunction` al rol/servicio exacto; consumidor tiene IAM sobre función/alias; `SourceArn`/`SourceAccount` aplican; probó invocación.
- [ ] **SQS:** queue policy e IAM permiten solo enviar o consumir lo necesario; cola y CMK son correctas; región coincide; probó mensaje y DLQ.
- [ ] **SNS:** se eligió publicación o suscripción; topic/queue policies y `SourceArn` están configuradas; CMK aplica; región y confirmación/entrega fueron probadas.
- [ ] **S3:** bucket policy e IAM limitan acciones y prefijo; Object Ownership fue decidido; CMK si usa SSE-KMS; región, lectura y escritura fueron probadas.
- [ ] **Secrets Manager:** resource policy e IAM limitan `GetSecretValue`; CMK y `kms:Decrypt` están autorizados; región coincide; se validó lectura sin exponer el valor.
- [ ] **SSM Parameter Store:** parámetro es Advanced y compartido por RAM; consumidor usa ARN completo; SecureString usa CMK y `kms:Decrypt`; región y lectura fueron probadas.
- [ ] **EventBridge:** bus destino autoriza `PutEvents`; regla/rol de origen usa ARN exacto; condición de organización aplica; región, contrato y entrega fueron probados.

## Referencias oficiales AWS

Las siguientes referencias son el punto de verificación vigente para cada práctica; el material adjunto fue adaptado y reformulado y no sustituye estas fuentes:

- [IAM: acceso a recursos entre cuentas](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies-cross-account-resource-access.html)
- [Lambda: políticas basadas en recurso y permisos](https://docs.aws.amazon.com/lambda/latest/dg/security_iam_service-with-iam.html)
- [Lambda Layers: compartir versiones](https://docs.aws.amazon.com/lambda/latest/dg/adding-layers.html)
- [KMS: acceso desde cuentas externas](https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-modifying-external-accounts.html)
- [DynamoDB: IAM y acceso](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/security-iam.html)
- [SQS: políticas de acceso](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-basic-examples-of-iam-policies.html)
- [SNS: control de acceso](https://docs.aws.amazon.com/sns/latest/dg/sns-access-policy-language-api-permissions-reference.html)
- [S3: Object Ownership](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html)
- [S3: acceso entre cuentas](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-walkthroughs-managing-access-example1.html)
- [Secrets Manager: acceso entre cuentas](https://docs.aws.amazon.com/secretsmanager/latest/userguide/auth-and-access_examples_cross.html)
- [SSM Parameter Store: parámetros compartidos](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-shared-parameters.html)
- [EventBridge: eventos entre cuentas](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-cross-account.html)
- [CloudTrail: registro de eventos](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html)
- [AWS Organizations: SCP](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html)

## Checklist pre-deployment

- [ ] **Permisos:** existen Identity_Policy y Resource_Policy/trust policy en las cuentas correctas, con principal, acción y ARN específicos; `AssumeRole` incluye trust, `sts:AssumeRole`, `ExternalId` y duración temporal acotada.
- [ ] **Cifrado:** cada recurso cifrado cross-account usa Customer_Managed_Key; key policy y permiso consumidor cubren la operación KMS exacta; no se usa una AWS_Managed_Key default; el ARN de CMK es completo.
- [ ] **Condiciones:** se revisaron `aws:SourceAccount`, `aws:SourceArn`, `aws:PrincipalOrgID` y `sts:ExternalId` cuando aplican; no hay principal global ni recurso wildcard sin justificación documentada.
- [ ] **Auditoría:** CloudTrail registra solicitudes, `AssumeRole`, cambios de policies y KMS en `Owner_Account` y `Consumer_Account`; IaC, naming, tags y evidencias de IDs quedaron versionados.
- [ ] **Limitaciones:** los Account_ID son distintos; región y replicación fueron confirmadas; SSM es Advanced; Lambda Layer y función comparten región; S3 Object Ownership fue evaluado; SCP y límites de servicio no bloquean el diseño.
- [ ] **Validación posterior:** se ejecutó una prueba mínima por servicio sin exponer secretos, se revisaron denegaciones y se conservó evidencia del principal, ARN, acción, condición y ambas cuentas.
