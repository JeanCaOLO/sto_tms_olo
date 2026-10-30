# Audit

- `gate0-latest.md` — ultimo resultado de Gate 0 (puede regenerarse en CI).
- `inception-iterations.jsonl` — ledger append-only de vueltas de Inception y
  cambios de alcance que impactan Construction / `develop`. Lo crea el script
  `python .intelix/scripts/inception_iterations.py`. **No se pisa** en `sync --force`.
- `inception-report.md` / `inception-report.html` — reporte de gestion generado
  desde el ledger (`… report`). No versionar en la plantilla: se generan por proyecto.

Para una demo multi-dev local (no viaja en `init`/`sync`):

```bash
python .intelix/scripts/inception_iterations.py simulate
```

No volcar secretos.
