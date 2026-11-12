# 2026-10-13 — Merge `github/main` → `planificacion-2`

## What changed
- Se integró `github/main` (45 commits: tarifas con 4 reglas, catálogo de transportistas con contrato PDF + vencimientos, forma de pago heredada en liquidación, medidas del contenedor, zonas como geocercas, teléfono del punto de entrega) en la rama `planificacion-2`.
- Merge commit `1c25bbe`. Sin conflictos.

## Why
- `planificacion-2` estaba 45 commits detrás de `github/main`. El trabajo de planificación tiene que partir de la base que ya trae tarifas/liquidación/contratos integrados, tras la presentación a Carlos del 2026-10-10.

## How
- `git merge github/main` sobre `planificacion-2` (auto-merge limpio, archivos en su mayoría disjuntos).
- `npm install` para alinear `node_modules` con el `package.json` mergeado (nuevas libs: `@turf/*`, leaflet-geoman).
- `npm run type-check` → pasa limpio (los errores previos eran solo deps no instaladas).
- Se descartó el cambio local de `package-lock.json` que introdujo el `npm install` (se conserva el lock del merge).

## Promoted knowledge
- Flujo reordenado (Carlos): planificación = Paso 2, prioridad = Paso 3. Registrado en memoria y en Notion (Daily 2026-10-13).

## Follow-ups
- [ ] Publicar: `git push github planificacion-2` + `git push origin planificacion-2`, y poner GitLab `main` al día con `github/main`. Bloqueado por falta de credenciales guardadas (GCM interactivo no deseado) → pendiente configurar PAT/SSH.
- [ ] El modelo de datos (tipo_cliente, sucursal, almacén) es de Eduardo, no de planificación.
- [ ] Rework de planificación como Paso 2 (lee IFLOW, recalcula en vivo).
