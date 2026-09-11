<#
.SYNOPSIS
    Build + deploy del frontend TMS a AWS Amplify (deploy manual por zip).

.DESCRIPTION
    1. Build de Vite con VITE_API_BASE (URL del backend Lambda) y VITE_MOCK_AUTH.
    2. Empaqueta out/ en un zip con rutas FORWARD-SLASH (clave: si el zip usa
       backslashes, Amplify sirve los assets con 404).
    3. create-deployment -> sube el zip a la URL presignada (curl) -> start-deployment.
    4. Espera a que el job termine y valida la URL publicada.

.PARAMETER ApiBase
    URL base del API desplegado (API Gateway del backend). Sin barra final.
    Default: el stack dev actual.

.PARAMETER NoMock
    Si se pasa, buildea SIN mock auth (mostrará el login real de Supabase).
    Por defecto el mock está ON (VITE_MOCK_AUTH=true) -> entra como SuperUsuario
    sin login.

.PARAMETER AppId / Branch
    App y rama de Amplify (deploy manual). Default: la app de prueba dev.

.EXAMPLE
    ./deploy-frontend.ps1
    ./deploy-frontend.ps1 -ApiBase "https://xxxx.execute-api.us-east-1.amazonaws.com/qa"
    ./deploy-frontend.ps1 -NoMock
#>
param(
    [string]$ApiBase = "https://fm2mrqtsu1.execute-api.us-east-1.amazonaws.com/dev",
    [switch]$NoMock,
    [string]$AppId = "d200vkxzilg7v5",
    [string]$Branch = "planificacion",
    [string]$AwsProfile = "CP-Developers-IntMAY-484907500756",
    [string]$Region = "us-east-1"
)

Set-StrictMode -Version Latest
# Continue (no Stop): en PS 5.1 los comandos nativos (pnpm/aws/curl) escriben a
# stderr y con Stop eso aborta el script aunque el exit code sea 0. Validamos con
# $LASTEXITCODE en su lugar.
$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$env:AWS_PROFILE = $AwsProfile

# -----------------------------------------------------------------------------
# 1. Build
# -----------------------------------------------------------------------------
$env:VITE_API_BASE = $ApiBase.TrimEnd('/')
$env:VITE_MOCK_AUTH = if ($NoMock) { "false" } else { "true" }
Write-Host ">>> Build  (VITE_API_BASE=$($env:VITE_API_BASE), VITE_MOCK_AUTH=$($env:VITE_MOCK_AUTH))" -ForegroundColor Cyan
Push-Location $root
try {
    if (Test-Path "$root\out") { Remove-Item "$root\out" -Recurse -Force }
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build falló" }
} finally { Pop-Location }

# -----------------------------------------------------------------------------
# 2. Zip de out/ con rutas forward-slash (evita el 404 de assets en Amplify)
# -----------------------------------------------------------------------------
Add-Type -AssemblyName System.IO.Compression | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
$zip = Join-Path $env:TEMP "tms-out.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
$outDir = (Resolve-Path "$root\out").Path.TrimEnd('\')
$fs = [System.IO.File]::Open($zip, [System.IO.FileMode]::Create)
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    Get-ChildItem -Path $outDir -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($outDir.Length + 1).Replace('\', '/')  # forward slash
        $entry = $archive.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
        $es = $entry.Open()
        $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
        $es.Write($bytes, 0, $bytes.Length)
        $es.Dispose()
    }
} finally { $archive.Dispose(); $fs.Close() }
Write-Host ">>> Zip listo: $([math]::Round((Get-Item $zip).Length/1MB,2)) MB (rutas forward-slash)" -ForegroundColor Green

# -----------------------------------------------------------------------------
# 3. Deploy a Amplify (create -> upload -> start)
# -----------------------------------------------------------------------------
Write-Host ">>> Amplify create-deployment ($AppId / $Branch)" -ForegroundColor Cyan
$dep = aws amplify create-deployment --app-id $AppId --branch-name $Branch --region $Region | ConvertFrom-Json
Write-Host "    jobId: $($dep.jobId)"
curl.exe -s -S -X PUT -H "Content-Type: application/zip" --upload-file "$zip" "$($dep.zipUploadUrl)"
if ($LASTEXITCODE -ne 0) { throw "Subida del zip falló" }
aws amplify start-deployment --app-id $AppId --branch-name $Branch --job-id $dep.jobId --region $Region --query 'jobSummary.status' --output text | Out-Null

# -----------------------------------------------------------------------------
# 4. Esperar el job y validar
# -----------------------------------------------------------------------------
Write-Host ">>> Esperando el deploy..." -ForegroundColor Cyan
$status = "PENDING"
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 5
    $status = aws amplify get-job --app-id $AppId --branch-name $Branch --job-id $dep.jobId --region $Region --query 'job.summary.status' --output text 2>$null
    if ($status -in @('SUCCEED', 'FAILED', 'CANCELLED')) { break }
}
$domain = aws amplify get-branch --app-id $AppId --branch-name $Branch --region $Region --query 'branch.displayName' --output text 2>$null
$url = "https://$Branch.$AppId.amplifyapp.com"
Write-Host ""
if ($status -eq 'SUCCEED') {
    Write-Host "Deploy OK -> $url" -ForegroundColor Green
    try {
        $r = Invoke-WebRequest -Uri "$url/" -TimeoutSec 25 -UseBasicParsing
        Write-Host "  index.html: $($r.StatusCode)" -ForegroundColor Gray
    } catch { Write-Host "  WARN: no respondió aún (propagación): $($_.Exception.Message)" -ForegroundColor Yellow }
} else {
    Write-Host "Deploy $status. Revisa la consola de Amplify (app $AppId, rama $Branch)." -ForegroundColor Red
}
