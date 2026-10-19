# Componentes frontend — U1 `motor-reglas-oms`

> Intent: `260826-modulo-oms`. Functional Design (Construction), unidad U1.
> As-built (rama `oms`).

## Sin componentes frontend

U1 `motor-reglas-oms` es **backend puro** (`kind: service`, Lambda Python). No
aporta componentes de UI: su único consumidor es el handoff a `public.orders`
(escritura 1) y la costura `EscritorSituacion` (escritura 2). La activación es por
polling de columna (BR1.1), sin interacción humana.

Las pantallas del OMS (Cola de Priorización, Auditoría, Simulador, Motor de Reglas
como catálogo) pertenecen a unidades `ui` separadas y consumen los datos que este
motor deja en `public.orders`; no forman parte de la frontera de U1.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/` (U1 = `kind: service`).
- `aidlc/spaces/default/intents/260826-modulo-oms/construction/motor-reglas-oms/functional-design/functional-spec.md`.
