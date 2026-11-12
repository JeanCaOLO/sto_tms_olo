---
name: intelix-observador-tareas
description: >-
  Telemetria de patrones de SOLO LECTURA (Task Observer, recortado) para la mejora
  continua: agrega el avance del task-tracker AI-DLC (INDICE-PROGRESO.md, v1/v2) y
  el ledger de iteraciones de Inception / rework de alcance que el proyecto ya
  produce, y resume cuellos (unidades con mas pendientes), reaperturas, vueltas de
  Inception y HH de rework. No instala telemetria nueva, no crea persistencia
  nueva, no captura datos fuera de esas fuentes y no expone PII. Usar cuando el
  usuario pida: patrones de avance, metricas del proyecto, donde se traba el
  trabajo, cuellos de botella, cuanto rework hubo, telemetria de tareas,
  retroalimentacion para mejorar, observador de tareas.
---

# Skill: Observador de Tareas (Task Observer, recortado)

Capa de **lectura/agregacion** transversal que retroalimenta la mejora continua.
**Reutiliza** artefactos que el proyecto ya genera y versiona; no agrega una fuente
de datos nueva ni telemetria externa.

> **Modelo (no lo rompas):**
> - **Solo lectura, solo lo existente.** Lee el tracking AI-DLC activo y el ledger
>   de Inception (`.aidlc/audit/inception-iterations.jsonl`). Nada mas.
> - **Sin persistencia nueva ni PII.** No instala recolectores; sanitiza correos y
>   usa solo agregados (R7/R10).
> - **No es la fuente oficial de avance.** El % oficial sale de `develop`
>   (`intelix-consolidado-avance`); este observador es diagnostico.

## Cuando se activa

- En retrospectivas o revisiones: patrones de avance, cuellos, rework.
- Cuando se pida entender donde se traba el trabajo o cuanto costo el cambio de alcance.

## Motor (deterministico, solo lectura)

```bash
# Usa el layout AI-DLC activo (v1/v2) resuelto por el contrato canonico
python .intelix/scripts/observador_tareas.py

# Si hay varios intents v2, declarar cual
python .intelix/scripts/observador_tareas.py --space default --intent <slug>

# Salida JSON
python .intelix/scripts/observador_tareas.py --json
```

Reutiliza `.intelix/scripts/aidlc_paths.py` (`resolve_layout`) para localizar el
`INDICE-PROGRESO.md` correcto en v1 y v2, sin elegir "el mas reciente" cuando hay
ambiguedad (pide `--space/--intent`).

Escribe el reporte en `.intelix/outputs/observador_tareas/` (versionado por
fecha/hora + alias estable `OBSERVADOR-TAREAS.md`), junto a los demas artefactos
INTELIX. Esa carpeta esta gitignoreada: es un artefacto por proyecto.

## Que agrega

| Metrica | Fuente |
|---------|--------|
| Avance por estado (pendiente / en progreso / completada-verificada) | `INDICE-PROGRESO.md` |
| Unidades con mas pendientes (cuellos) | `INDICE-PROGRESO.md` |
| Tareas con ajuste registrado (reaperturas) | columna Ajustes del tracker |
| Vueltas de Inception y HH de rework | ledger `inception-iterations.jsonl` |
| Eventos por tipo (gate_rejected, po_scope_change, ...) | ledger |

## Flujo tipico del agente

1. Ejecutar el observador sobre el layout activo.
2. Leer el reporte y senalar los cuellos (unidades con mas pendientes/reaperturas).
3. Conectar los patrones con acciones: si hay muchas reaperturas, reforzar el ADR
   (`intelix-arquitectura-gate`) o la DoD (`intelix-qa-gate`); si hay HH de rework
   altas, cerrar alcance antes de Construction.
4. Recordar que el % oficial de avance lo da `intelix-consolidado-avance`.

## Reglas

- **Nunca** inventar metricas ni leer fuentes fuera del tracking y el ledger.
- No exponer PII: el reporte usa agregados; los correos se enmascaran.
- No sustituye al task-tracker, al consolidado ni a inception-iterations: los lee.
- No introduce dependencias nuevas (Python stdlib + resolvedor canonico).
