<#
.SYNOPSIS
  Abre el túnel SSM a Aurora (db-tms-olo, us-east-2) en localhost:15432 y lo
  mantiene vivo.

.DESCRIPTION
  SSM cierra las sesiones de port forwarding por inactividad; el script las
  reabre solo (Ctrl+C para terminar). Usar -Once para abrir una sola vez.
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
    [string]$Region = "us-east-2",
    [switch]$Once
)

$RetryDelaySeconds = 3
$pluginDir = "C:\Program Files\Amazon\SessionManagerPlugin\bin"
if ((Test-Path $pluginDir) -and ($env:Path -notlike "*$pluginDir*")) { $env:Path += ";$pluginDir" }

$parameters = "host=$DbHost,portNumber=5432,localPortNumber=$LocalPort"
do {
    Write-Host ">>> $(Get-Date -Format HH:mm:ss) Túnel $DbHost -> localhost:$LocalPort vía $Bastion ($Region). Ctrl+C para cerrar." -ForegroundColor Cyan
    aws ssm start-session --region $Region --target $Bastion `
        --document-name AWS-StartPortForwardingSessionToRemoteHost `
        --parameters $parameters
    if (-not $Once) {
        Write-Host ">>> La sesión SSM terminó (inactividad o red). Reabriendo en $RetryDelaySeconds s..." -ForegroundColor Yellow
        Start-Sleep -Seconds $RetryDelaySeconds
    }
} while (-not $Once)
