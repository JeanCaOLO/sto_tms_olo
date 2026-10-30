# CLI de Reporte de Avance (INTELIX / AI-DLC)

Genera el reporte de avance del proyecto (Markdown + HTML) a partir del
**Índice de Progreso** del tracker AI-DLC.

- **Fuente de verdad:** `aidlc-docs/tracking/INDICE-PROGRESO.md` (v1) o
  `aidlc/spaces/<space>/intents/<intent>/tracking/INDICE-PROGRESO.md` (v2).
  El resolvedor compartido selecciona el space e intent activos y se detiene si
  hay varios intents sin un cursor inequívoco.
- **Salida:** `.intelix/outputs/reporte_avance/`
  - `REPORTE-AVANCE-<YYYYMMDDHHMM>.md` y `reporte-avance-<YYYYMMDDHHMM>.html` (versionados)
  - `REPORTE-AVANCE.md` y `reporte-avance.html` (alias estables)

El estado de las tareas se administra en el tracker AI-DLC (no en mensajes de
commit ni en JSON aparte). Estados: ✅ Verificada · 🟡 En progreso (realizada
por el agente, pendiente de verificación humana) · 🔄 En progreso · ⬜ Pendiente.
El reporte incluye **Fecha planificada**, obtenida de la columna `Fin` de la
fila `VER-*` del archivo `docs/PLAN-ESTIMACION-*-FINAL.xlsx`, y **Fecha fin**.
Esta última solo se completa cuando todas las tareas de la unidad están al 100%
(verificadas) en el Índice de Progreso.

## Estructura

```
.intelix/cli/reporte-avance/
├── bin/                     # Comandos de usuario (entrypoints)
│   ├── generar-reporte.js   # Regenera MD + HTML desde el índice
│   ├── inicializar-avance.js# Igual que generar, con resumen por unidad
│   └── install-hook.js      # Instala el hook post-commit
├── lib/                     # Motor (no se invoca directamente)
│   ├── project-root.js      # Resuelve la raíz del proyecto
│   ├── reporte-desde-indice.js # Parser del índice + generadores MD/HTML
│   ├── regenerar-reporte.js # Regenerador sin CLI (usado por el hook)
│   ├── auto-update-avance.js# Acción del hook post-commit
│   └── _generar-sin-cli.js  # Generación directa sin CLI
├── test/
│   └── reporte.test.js      # Pruebas del parser y los generadores
├── package.json
└── README.md
```

## Uso

Desde la raíz del proyecto:

```bash
# Generar el reporte (MD + HTML)
node .intelix/cli/reporte-avance/bin/generar-reporte.js

# Instalar el hook post-commit (regenera el reporte en cada commit)
node .intelix/cli/reporte-avance/bin/install-hook.js
```

O mediante los accesos directos `.bat` de la raíz del proyecto:

```bat
generar-reporte.bat
inicializar-avance.bat
install-hook-reporte.bat
```

## Pruebas

```bash
cd .intelix/cli/reporte-avance
npm test
```
