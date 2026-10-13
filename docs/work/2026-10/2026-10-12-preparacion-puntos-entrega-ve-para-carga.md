# 2026-10-12 — Preparación de puntos de entrega VE (Febeca/Sillaca/Beval) y handoff a Claude para carga a Aurora

> Es la ejecución del follow-up abierto en
> `2026-10-08-investigacion-eflow-y-contexto-dailies.md`
> ("VE-EPRAC (Febeca/Beval): cargar data real de Venezuela a Aurora cuando se
> decida"). Esta entrada cubre **mi parte** (preparación + limpieza de la data
> y el handoff); la **carga a Aurora la hace Claude** (dueño de backend/`sql/`),
> y queda pendiente de su RESULT en `.agents/CANAL.md`.

## What changed

- Convertí los tres archivos `Coordenadas_{Febeca,Sillaca,Beval}_2026.xlsx`
  (en `Downloads`, fuera del repo) a tres CSV limpios en `.tmp-claude/`
  (gitignored): `ve-puntos-{febeca,sillaca,beval}.csv` + `ve-puntos-RESUMEN.json`.
- Dejé un mensaje `De: Kiro → Claude` en `.agents/CANAL.md` con el contrato de
  ingesta, incluyendo el pedido explícito de **crear las compañías** Febeca,
  Sillaca y Beval en `customers` (país Venezuela) y ligar los puntos como se
  hizo con Cofersa.
- Anoté la fila en *En curso* del canal y agregué `.tmp-claude/` al `.gitignore`.
- No se tocó código de aplicación (`src/`, `backend/`, `sql/`). Los scripts de
  conversión eran temporales y se borraron tras generar los CSV.

## Why

El usuario pidió cargar a la BD los puntos de entrega con coordenadas de las
tres compañías de Venezuela. La ingesta a Aurora es terreno de Claude (reparto
backend); por indicación del usuario la coordinación se hace por el canal
`.agents/CANAL.md`, no por Orca. Mi parte es dejar la data limpia y trazable
para que Claude solo tenga que crear las compañías e insertar.

Por indicación del usuario se usaron **solo** los archivos `Coordenadas_*`
(se ignoraron los `DIRECCION EMBARQUE *.xlsx`).

## How — limpieza de coordenadas (trazada en la columna `geo_note`)

Encabezado de cada CSV:
`codigo,nombre,direccion,latitud,longitud,geocoding_status,geo_note,activo`.

- `codigo` = código de cliente/punto del WMS VE (formato `01-01-003`); único por
  archivo (0 duplicados, verificado).
- `lon-signo-corregido`: longitud venía positiva; VE es hemisferio oeste →
  `lon = -abs(lon)`.
- `lat-lon-intercambiados`: muchas filas traían las columnas lat/lon cruzadas
  (lat con valor de longitud ~-64..-71 y viceversa); se detectaron por bounding
  box de VE (lat 0.5–12.3, lon -73.5 a -59.5) y se intercambiaron. Recuperó
  ~190 puntos que de otro modo caían como FAILED.
- `geocoding_status`: `OK` (coordenada válida en VE) | `PENDING` (sin coords en
  el origen) | `FAILED` (escala rota irrecuperable, ej. `5.84148E+11`,
  `-6694653`). PENDING/FAILED se cargan **sin** coordenadas (no 0,0).
- El conversor llevaba un self-check con `assert` (casos: as-is, signo, swap,
  escala rota, sin coords) que corrió verde antes de generar los CSV.

### Conteos (de `ve-puntos-RESUMEN.json`)

| Compañía | Puntos únicos | OK | PENDING | FAILED |
|---|---|---|---|---|
| FEBECA | 6493 | 6483 | 0 | 10 |
| SILLACA | 1294 | 1288 | 2 | 4 |
| BEVAL | 936 | 931 | 3 | 2 |
| **Total** | **8723** | **8702** | **5** | **16** |

## Promoted knowledge

- Patrón de limpieza de coordenadas VE: longitud sin signo + columnas lat/lon
  intercambiadas son defectos frecuentes del origen; recuperables por bounding
  box antes de descartar como FAILED.
- Handoff de data Kiro→Claude: archivos de paso en `.tmp-claude/` (gitignored),
  contrato en `.agents/CANAL.md`, Claude responde con RESULT y Kiro borra la
  carpeta.

## Follow-ups

- [ ] Claude: crear compañías Febeca/Sillaca/Beval en `customers` (país VE) e
      ingerir los tres CSV al modelo `final_customers`/`delivery_points`/
      `addresses` (como Cofersa). Responder con RESULT en el canal.
- [ ] Kiro: al recibir el RESULT, borrar `.tmp-claude/` y su entrada del
      `.gitignore`; luego verificar la pantalla `/tiendas` filtrando por las
      tres compañías VE.
- [ ] Revisar los 16 FAILED + 5 PENDING (coordenada rota o ausente): quedan
      cargados sin coordenadas; geocodificar más adelante (ligado al follow-up
      de geocoding VE del HANDOFF).
