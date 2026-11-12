## Tipo

- [ ] Iteracion de Inception (gate rechazado / ajustes de diseno o historias)
- [ ] Cambio de alcance post Gate 0 / post Inception (impacto en Construction)

## Identificador

- ID propuesto: `INC-ITER-XX` o `SCOPE-RW-XX`
- Fecha apertura:
- Fecha cierre (si aplica):

## Disparador

- [ ] `gate_rejected` — Arquitectura / Seguridad pidio ajustes
- [ ] `po_scope_change` — PO/negocio cambio alcance
- [ ] `tech_discovery` — hallazgo tecnico en Inception o Construction
- [ ] `reclassification` — cambio Menor / Intermedio / Mayor
- [ ] otro:

## Resumen

(1–3 oraciones: que cambio y por que)

## Artefactos tocados

- [ ] `Product-Definition/` (vision / tech-env / open-questions)
- [ ] Story map / historias
- [ ] Diseno de aplicacion
- [ ] Estimacion / plan
- [ ] Matriz de requerimientos
- Otros:

## Impacto en Construction / develop

- Afecta Construction: Si / No
- Desarrolladores impactados:
- Ramas `feature/*` afectadas:
- Efecto en `develop` (rebase, stories reabiertas, MR bloqueados):
- Tareas reabiertas (IDs tracker):
- Tareas nuevas:
- Tareas omitidas (`skip`):

## Evidencia

- Issue / MR:
- Commit / enlace:

## Registro en plantilla

Tras aprobar este issue, registrar en el ledger:

```bash
python .intelix/scripts/inception_iterations.py add --from-issue
# o con flags explicitos; ver docs/guides/inception-iterations.md
python .intelix/scripts/inception_iterations.py report
python .intelix/scripts/inception_iterations.py sync-state
```
