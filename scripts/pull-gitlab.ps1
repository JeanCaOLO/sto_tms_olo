# pull-gitlab.ps1 — replica una rama de este repo a GitLab de Intelix.
#
#   git.intelix.biz vive en la red interna (10.57.9.222). Este comando SOLO
#   funciona desde una maquina con la VPN conectada. El token NO reemplaza a la
#   VPN — sin red hacia git.intelix.biz el push hace timeout, tengas token o no.
#   Para colaboradores que estan solo en GitHub y no tienen VPN: ellos no corren
#   esto; el mirror lo hace un runner/cron DENTRO de la red (ver README abajo).
#
# El token se toma, en orden: parametro -Token, variable $env:GITLAB_TOKEN, o la
# linea GITLAB_TOKEN=... de .env.local (gitignored — NUNCA en .env, que se commitea).
#
# Setup (una vez): en .env.local agrega
#   GITLAB_TOKEN=glpat-xxxxxxxx        # rol Developer+, scope write_repository
#
# Uso (con VPN):
#   pwsh scripts/pull-gitlab.ps1                       # rama actual -> misma rama
#   pwsh scripts/pull-gitlab.ps1 -Target master        # rama actual -> master en GitLab
#   pwsh scripts/pull-gitlab.ps1 -Branch qa -Target master
#
# Los commits llegan con su autor/fecha originales de GitHub — git los preserva,
# no hay que "firmar" nada.

param(
  [string]$Branch,                                   # origen (default: rama actual)
  [string]$Target,                                   # destino en GitLab (default: = $Branch)
  [string]$Token,
  [string]$GitlabRepo = "https://git.intelix.biz/JesusAraujoDEV/sto-tms-olo.git"
)

$ErrorActionPreference = "Stop"
Set-Location (git rev-parse --show-toplevel)

# token: -Token > $env:GITLAB_TOKEN > .env.local
if (-not $Token) { $Token = $env:GITLAB_TOKEN }
if (-not $Token -and (Test-Path ".env.local")) {
  $line = Select-String -Path ".env.local" -Pattern '^\s*GITLAB_TOKEN\s*=\s*(.+)$' | Select-Object -First 1
  if ($line) { $Token = $line.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'") }
}

if (-not $Branch) { $Branch = (git rev-parse --abbrev-ref HEAD).Trim() }
if (-not $Target) { $Target = $Branch }
if (-not $Token)  { throw "Falta el token: agrega 'GITLAB_TOKEN=glpat-...' en .env.local (o pasa -Token / `$env:GITLAB_TOKEN)." }

Write-Host "$Branch (local)  ->  $Target (GitLab Intelix)" -ForegroundColor Cyan

# URL autenticada con el token (no queda en 'git remote', se usa inline)
$authUrl = $GitlabRepo -replace "^https://", "https://oauth2:$Token@"

# 1. sincronizar con GitHub y no subir algo atrasado
git fetch origin --tags --prune
$behind = git rev-list --count "HEAD..origin/$Branch" 2>$null
if ($behind -and [int]$behind -gt 0) {
  throw "Tu $Branch local va $behind commit(s) detras de origin/$Branch. Haz 'git pull' y reintenta."
}
git push origin $Branch                             # GitHub primero (no-op si ya esta al dia)

# 2. empujar a GitLab. --force: GitLab es copia downstream de GitHub; si alguien
#    commitea directo alla se sobrescribe (esperado en un mirror de una via).
git push $authUrl "${Branch}:refs/heads/${Target}" --force
git push $authUrl "refs/tags/*:refs/tags/*" --force

Write-Host "OK -> $Target en GitLab de Intelix" -ForegroundColor Green
