# repo-orchestrator — guia de uso para el equipo de sto_tms_olo

Este skill vive en `.claude/skills/repo-orchestrator/` y ya viaja con el repo: si
tienes Claude Code abierto en `sto_tms_olo`, el comando `/repo-orchestrator` esta
disponible automaticamente. No hay que instalar nada aparte.

Lo que hace, en una linea: lee el grafo de `/graphify`, el `git log` y los Issues
de GitHub para (1) decirte que codigo toca un requerimiento nuevo, (2) congelar y
avisar automaticamente cuando un Issue depende de otro que va retrasado, (3)
recomendarte a quien asignar una tarea segun quien ya trabajo ese modulo y quien
no esta saturado, y (4) publicar un "briefing" en el Issue cuando alguien lo pasa
a "In Progress".

## Antes de usarlo (una sola vez, cada desarrollador)

1. **Token de GitHub personal.** Cada quien necesita su propio
   `GITHUB_TOKEN` (Personal Access Token, scope `repo`) exportado en su shell:
   - PowerShell: `$env:GITHUB_TOKEN = "ghp_..."`
   - Bash/git-bash: `export GITHUB_TOKEN="ghp_..."`
   **Nunca** lo pongas en un archivo del repo ni lo commitees. Verifica que
   funciona con:
   ```
   /repo-orchestrator
   ```
   y pide que corra el preflight (`gh_api.py rate-limit`) si tienes dudas — te
   dira explicitamente si el token falta o es invalido.
2. **El grafo debe existir.** Si `graphify-out/graph.json` no esta o esta viejo,
   corre `/graphify --update` primero. `map`, `profile` y `briefing` lo necesitan;
   `deps` y `workload` no.
3. **Registrarte en el roster** (solo la primera vez que te unes al equipo, o si
   alguien nuevo entra):
   ```
   /repo-orchestrator roster refresh
   ```
   Esto lee `git log` + la lista de colaboradores del repo en GitHub. Si tu email
   de commit no se pudo enlazar automaticamente a tu usuario de GitHub, se te va
   a pedir que lo digas una vez y se guarda.

## Uso del dia a dia con Issues

### "Voy a crear un Issue nuevo, ¿que va a tocar?"
```
/repo-orchestrator map "Sincronizar stock con Shopify"
```
Te devuelve los archivos/funciones existentes mas relacionados, el modulo
(comunidad del grafo) al que pertenecen, y si no encuentra nada existente te lo
dice explicitamente (significa que es funcionalidad nueva). Util para escribir un
Issue mas preciso o para decidir a que modulo pertenece antes de asignarlo.

### "Este Issue depende de otro"
Dos formas, cualquiera funciona:
- **Escribelo en el cuerpo del Issue** en GitHub: `Depende de: #12` o
  `Depends on: #12`. Cuando alguien corra `/repo-orchestrator deps discover` (o el
  chequeo agendado lo haga por ti), se detecta solo.
- **Declaralo directo**:
  ```
  /repo-orchestrator deps link 34 depends-on 12 "espera la migracion de ordenes"
  ```

### "¿Hay algun Issue bloqueado que deberia saber?"
```
/repo-orchestrator deps check
```
Si un Issue upstream (del que depende otro) esta retrasado — tiene una etiqueta
como `retrasado`/`blocked`/`stale`, o no se le toca hace mas de N dias (config) —
el Issue dependiente se etiqueta `blocked-by-dependency` y se comenta
automaticamente explicando por que y a quien esta esperando. Cuando el upstream se
pone al dia, se descongela solo con otro comentario. Correr esto no duplica
comentarios si nada cambio desde la ultima vez.

> Nota: la etiqueta `blocked-by-dependency` debe existir en el repo de GitHub
> (Settings → Labels) antes del primer `deps check` — creala una vez si no esta.

### "¿A quien le asigno este Issue?"
```
/repo-orchestrator assign 41
```
Mira que modulo toca el Issue (`map` internamente), quien lo ha trabajado mas
recientemente (`git log` ponderado por antiguedad — no solo cuenta commits viejos
igual que recientes), y cuanta carga tiene cada quien ahora mismo en GitHub
(Issues abiertos asignados, ponderados por prioridad/tamano). Si el candidato
obvio esta saturado, te lo dice y sugiere a quien seguiria en la lista — nunca
asigna solo, siempre pide confirmacion antes de tocar GitHub.

### "Alguien acaba de pasar un Issue a In Progress"
```
/repo-orchestrator briefing 41
```
Genera y (con tu confirmacion) publica un comentario en el Issue con: los
archivos/funciones existentes relevantes con su ubicacion, documentacion interna
que coincide (README, migraciones SQL, etc.), y si alguna otra rama abierta ya
esta tocando los mismos archivos (posible conflicto de merge). Si esto se agenda
via `/repo-orchestrator schedule-setup`, se publica automaticamente sin pedir
confirmacion cada vez — es la automatizacion que se pidio para esta capacidad.

### "¿Quien deberia hacer las tareas del modulo de rutas?"
```
/repo-orchestrator profile --module "Route Planning Config"
/repo-orchestrator workload
```
`profile` te da el ranking de quien ha trabajado mas (y mas reciente) ese modulo.
`workload` te da cuantos Issues abiertos tiene cada quien ahora mismo, para no
sobrecargar a la misma persona.

## Vigilancia automatica (opcional)

```
/repo-orchestrator schedule-setup
```
Agenda `deps check` (y opcionalmente los briefings automaticos al pasar a
"in progress") cada cierto numero de horas sin que nadie tenga que acordarse de
correrlo a mano. Esto empieza a escribir en GitHub (labels + comentarios)
automaticamente en cuanto se agenda — confirma que el equipo quiere eso antes de
activarlo.

## Si algo no resuelve bien

- **"No se encontro GITHUB_TOKEN"** → exportalo en tu shell (arriba).
- **"401 Bad credentials"** → el token existe pero es invalido/expiro, genera uno
  nuevo con scope `repo`.
- **Alguien nuevo en el equipo no aparece en `assign`/`workload`** → corre
  `/repo-orchestrator roster refresh` (necesita que esa persona ya sea
  colaboradora del repo en GitHub, con o sin commits).
- Detalle tecnico completo: `SKILL.md` y `references/` en esta misma carpeta.
