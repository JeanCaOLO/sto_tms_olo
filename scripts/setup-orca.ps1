<#
.SYNOPSIS
  Deja listo Orca en esta máquina para que Kiro y Claude Code se coordinen en este repo.

.DESCRIPTION
  Idempotente: se puede correr las veces que sea; solo hace lo que falte.
    1. Instala Orca (winget StablyAI.Orca) si no está.
    2. Agrega el CLI `orca` al PATH del usuario.
    3. Arranca la app de Orca (el CLI necesita el runtime corriendo).
    4. Registra este repo en Orca.
    5. Instala las skills `orca-cli` y `orchestration` en el proyecto
       (.agents/skills + enlace en .claude/skills para Claude Code).
  Guía completa: docs/guides/coordinacion-claude-kiro.md

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/setup-orca.ps1
#>
$ErrorActionPreference = 'Stop'

$RepoRoot   = Split-Path -Parent $PSScriptRoot
$OrcaDir    = Join-Path $env:LOCALAPPDATA 'Programs\orca'
$OrcaExe    = Join-Path $OrcaDir 'Orca.exe'
$OrcaBin    = Join-Path $OrcaDir 'resources\bin'
$OrcaCli    = Join-Path $OrcaBin 'orca.cmd'
$WaitSteps  = 40   # x 3 s = 2 min máximo esperando el runtime

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

function Invoke-OrcaJson([string[]]$OrcaArgs) {
  $raw = & $OrcaCli @OrcaArgs --json 2>$null
  return ($raw | Out-String | ConvertFrom-Json)
}

# 1. Instalar
Write-Step 'Orca instalado'
if (-not (Test-Path $OrcaCli)) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'winget no disponible. Instalá Orca a mano: https://github.com/stablyai/orca/releases/latest/download/orca-windows-setup.exe'
  }
  winget install --id StablyAI.Orca -e --silent --accept-source-agreements --accept-package-agreements
  if (-not (Test-Path $OrcaCli)) { throw "Orca se instaló pero no aparece $OrcaCli" }
}

# 2. PATH
Write-Step 'CLI orca en el PATH'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$OrcaBin*") {
  [Environment]::SetEnvironmentVariable('Path', "$userPath;$OrcaBin", 'User')
  Write-Host '    Agregado al PATH del usuario (abrí una terminal nueva para usarlo).'
}
if ($env:Path -notlike "*$OrcaBin*") { $env:Path += ";$OrcaBin" }

# 3. Runtime
Write-Step 'App de Orca corriendo'
$status = Invoke-OrcaJson @('status')
if ($status.result.runtime.state -ne 'ready') {
  # Start-Process deja la app viva aunque esta terminal se cierre (a diferencia de `orca open`).
  if (-not $status.result.app.running) { Start-Process $OrcaExe }
  for ($i = 0; $i -lt $WaitSteps -and $status.result.runtime.state -ne 'ready'; $i++) {
    Start-Sleep -Seconds 3
    $status = Invoke-OrcaJson @('status')
  }
  if ($status.result.runtime.state -ne 'ready') {
    throw "El runtime de Orca no quedó listo (estado: $($status.result.runtime.state)). Abrí Orca a mano y reintentá."
  }
}

# 4. Registrar el repo
Write-Step 'Repo registrado en Orca'
$repos = (Invoke-OrcaJson @('repo', 'list')).result.repos
$normalized = { param($p) (($p -replace '/', '\').TrimEnd('\')).ToLowerInvariant() }
$already = $repos | Where-Object { (& $normalized $_.path) -eq (& $normalized $RepoRoot) }
if (-not $already) {
  $added = Invoke-OrcaJson @('repo', 'add', '--path', $RepoRoot)
  if (-not $added.ok) { throw "No se pudo registrar el repo: $($added.error.message)" }
}

# 5. Skills del proyecto
Write-Step 'Skills orca-cli y orchestration'
Push-Location $RepoRoot
try {
  & $OrcaCli skills install --skill orca-cli --skill orchestration --local
  if ($LASTEXITCODE -ne 0) { throw "Falló la instalación de skills (exit $LASTEXITCODE)" }
} finally { Pop-Location }

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Warning 'No se encontró `claude` en el PATH. Instalá Claude Code (npm i -g @anthropic-ai/claude-code) para que Orca pueda lanzarlo.'
}

Write-Host "`nListo. Verificá con: orca status --json" -ForegroundColor Green
