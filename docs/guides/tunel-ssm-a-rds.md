# Cómo conectarse a una base de datos privada en AWS vía túnel SSM

Guía genérica para conectar `psql`/DBeaver/una app a una base de datos RDS o Aurora
que está en una VPC privada (sin IP pública), usando **AWS Systems Manager Session
Manager** para hacer *port forwarding* a través de una instancia EC2 que ya tenga
red hacia esa base. No requiere abrir la base a internet ni usar llaves SSH.

Reemplaza cada `<...>` por los valores reales de tu proyecto.

## 0. Requisitos previos (que ya deben existir)

- Una base de datos RDS/Aurora en una VPC.
- Una instancia **EC2 dentro de esa misma VPC**, con:
  - El agente **SSM** activo y en estado `Online` (`aws ssm describe-instance-information`).
  - Un **security group** con salida hacia el puerto de la base de datos (o mejor:
    el security group de la base debe permitir entrada desde el security group de
    esta EC2).
- Un usuario o rol **IAM** propio (no el usuario de otro equipo) con el que vas a
  autenticarte desde tu máquina.

Si algo de esto no existe, pídele a quien administra la cuenta AWS que lo cree —
esta guía asume que la infraestructura ya está montada y solo falta el acceso.

## 1. Instalar herramientas locales

Necesitas dos cosas en tu máquina (una sola vez):

**AWS CLI v2**
```powershell
winget install -e --id Amazon.AWSCLI
```

**Session Manager Plugin** (sin esto, `aws ssm start-session` falla con
`SessionManagerPlugin is not found`)
```powershell
winget install -e --id Amazon.SessionManagerPlugin
```

En Mac/Linux, usa los instaladores oficiales de AWS en vez de winget.

## 2. Configurar tus credenciales AWS

Pide un **Access Key ID** y **Secret Access Key** de IAM (no la contraseña de la
consola — esa es para el login web, no sirve para el CLI).

```powershell
aws configure set aws_access_key_id <TU_ACCESS_KEY> --profile <tu-perfil>
aws configure set aws_secret_access_key <TU_SECRET_KEY> --profile <tu-perfil>
aws configure set region <region-aws> --profile <tu-perfil>
```

Verifica que quedó bien:
```powershell
aws sts get-caller-identity --profile <tu-perfil>
```

## 3. Ubicar la instancia EC2 que vas a usar de "puente" (bastión)

```powershell
aws ec2 describe-instances --profile <tu-perfil> --query "Reservations[].Instances[].{ID:InstanceId,Name:Tags[?Key=='Name']|[0].Value,State:State.Name}" --output table
```

Anota el `InstanceId` (ej. `i-0123456789abcdef0`). Confirma que SSM la ve activa:
```powershell
aws ssm describe-instance-information --profile <tu-perfil> --query "InstanceInformationList[].{ID:InstanceId,PingStatus:PingStatus}" --output table
```

## 4. Dar permisos IAM para abrir el túnel

Por defecto, la mayoría de los usuarios IAM **no** pueden ejecutar
`ssm:StartSession` aunque puedan *ver* recursos (permiso de solo lectura). Alguien
con acceso de administrador IAM debe agregarle esta política al usuario:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ssm:StartSession"],
      "Resource": [
        "arn:aws:ec2:<region>:<id-de-cuenta>:instance/<ID-DE-LA-EC2>",
        "arn:aws:ssm:<region>::document/AWS-StartPortForwardingSessionToRemoteHost"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["ssm:TerminateSession", "ssm:ResumeSession"],
      "Resource": ["arn:aws:ssm:<region>:<id-de-cuenta>:session/${aws:username}-*"]
    }
  ]
}
```

**Dos detalles que suelen fallar la primera vez:**
- El ARN del documento `AWS-StartPortForwardingSessionToRemoteHost` **no lleva ID
  de cuenta** (es un documento público de AWS) — va con doble `:` (`ssm:<region>::document/...`).
- Sin el segundo statement (`TerminateSession`/`ResumeSession`), el túnel abre pero
  falla al cerrarse con `AccessDeniedException`.

## 5. Abrir el túnel

```powershell
aws ssm start-session `
  --target <ID-DE-LA-EC2> `
  --document-name AWS-StartPortForwardingSessionToRemoteHost `
  --parameters '{\"host\":[\"<ENDPOINT-DE-LA-BASE>\"],\"portNumber\":[\"<PUERTO-BD>\"],\"localPortNumber\":[\"<PUERTO-LOCAL>\"]}' `
  --profile <tu-perfil> `
  --region <region-aws>
```

Ejemplo real (Postgres, puerto 5432 en ambos lados):
```powershell
aws ssm start-session --target i-0123456789abcdef0 --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters "{\"host\":[\"mi-cluster.cluster-xxxx.us-east-2.rds.amazonaws.com\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5432\"]}" --profile mi-perfil --region us-east-2
```

Déjalo corriendo en su propia terminal — es el túnel, no debe cerrarse mientras lo
uses. Se corta solo tras un rato de inactividad; si pasa, vuelve a correr el mismo
comando.

## 6. Conectarte a través del túnel

Con el túnel abierto, tu base "aparece" en `localhost:<PUERTO-LOCAL>`. Conecta
normal con las credenciales reales de la base:

- **DBeaver / psql / tu app**: host `localhost`, puerto `<PUERTO-LOCAL>`, usuario y
  contraseña de la base (no de AWS), SSL en `require`.

## Resumen del flujo

```
Tu máquina  --(SSM, con tus credenciales IAM)-->  EC2 bastión (en la VPC)  --(red interna)-->  RDS/Aurora
     |                                                                                              |
     └──────────────────────── localhost:<PUERTO-LOCAL> ───────────────────────────────────────────┘
```

Nada de esto expone la base a internet: todo el tráfico va por la API de AWS
(SSM), autenticado con tus credenciales IAM.
