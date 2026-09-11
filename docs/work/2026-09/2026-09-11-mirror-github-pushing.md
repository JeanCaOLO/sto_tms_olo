# 2026-09-11 — Script `pushing` (GitLab → GitHub)

## What changed

`scripts/mirror-github.mjs` + npm script `pushing`: inverso de `pulling`. Espeja
ramas y tags de **GitLab `olo/tms/TMS-Frontend`** hacia **GitHub
`JeanCaOLO/sto_tms_olo`**, en bucle hasta Ctrl+C.

## Why

El desarrollo ahora vive en GitLab (fuente de verdad). Este job, corriendo en un
equipo con VPN, mantiene el espejo de GitHub al día.

## How

Clon `--mirror` bare de GitLab en `.mirror-github/` (gitignored) → fetch de GitLab
→ push a GitHub. Auth GitLab por `$GITLAB_TOKEN` (PAT) o OAuth con
`GITLAB_USER`/`GITLAB_PASSWORD` (regenerado cada pasada, caduca ~2h). GitHub por
SSH o `$GITHUB_TOKEN`.

```
pnpm pushing                # bucle cada 5 min
pnpm pushing -- --once      # una pasada (cron)
pnpm pushing -- --every 10  # cada 10 min
pnpm pushing -- --prune     # además borra en GitHub las ramas ausentes en GitLab
```

Verificado con `--once`: sincronizó dylan-tarifas, jesus-planificacion, main, oms.

## Follow-ups

- El `pulling` (mirror-gitlab.mjs) aún apunta al repo personal viejo
  (`JesusAraujoDEV/sto-tms-olo`); si se sigue usando, repuntarlo a `olo/tms`.
