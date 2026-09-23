<#
.SYNOPSIS
  Abre el túnel SSM a Aurora (db-tms-olo, us-east-2) en localhost:15432.

.DESCRIPTION
  Deja la terminal ocupada mientras el túnel está abierto (Ctrl+C para cerrar).
  Requisitos: AWS CLI v2, Session Manager Plugin y un usuario IAM con permiso
  ssm:StartSession sobre la EC2 puente. Guía: docs/guides/tunel-ssm-a-rds.md

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/tunel-aurora.ps1
#>
param(
    [string]$Bastion = "i-062fc98e8e26c0f79",
    [string]$DbHost = "db-tms-olo.cluster-cjo2ss6io0lb.us-east-2.rds.amazonaws.com",
    # 15432 y no 5432: evita chocar con un PostgreSQL local instalado en la máquina.
    [int]$LocalPort = 15432,
    [string]$Region = "us-east-2"
)

$parameters = "host=$DbHost,portNumber=5432,localPortNumber=$LocalPort"
Write-Host ">>> Túnel $DbHost -> localhost:$LocalPort vía $Bastion ($Region). Ctrl+C para cerrar." -ForegroundColor Cyan
aws ssm start-session --region $Region --target $Bastion `
    --document-name AWS-StartPortForwardingSessionToRemoteHost `
    --parameters $parameters
