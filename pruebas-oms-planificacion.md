## Las pruebas del OMS y de Planificación — qué son, qué hacen y su ciclo de vida

```
Panorama de cómo están probados el OMS (priorización + barrido) y Planificación
(bandeja → plan → handoff) en los dos repos del TMS. Escrito 2026-10-29. Fuentes:
TMS-Backend/tests/* , TMS-Frontend/src/pages/{oms,planificacion}/*.test.ts ,
TMS-Frontend/e2e/*.spec.ts
```

## 1. El panorama en una imagen

Hay tres capas de prueba, de la más rápida/barata a la más lenta/realista:

```
Texto sin formato
UNIT (dominio puro) → lógica sin dependencias: fechas, prioridad, lead time,
clustering
│ backend: pytest · frontend: vitest
INTEGRACIÓN (servicio+mock) → el servicio contra adaptadores DOBLES
(fakes/monkeypatch),
│ sin BD real: se verifica QUÉ SQL se emite y QUÉ se
escribe
E2E (app viva) → Playwright maneja la app real (:3000 + backend :4000 +
Aurora
por túnel): login → pantalla → acción → resultado
```

Regla de oro del proyecto, visible en todos los tests: la lógica de negocio vive en módulos puros ( .ts

fuera de los .tsx , dominio Python fuera de los handlers) para poder probarla sin montar React ni conectar a una BD. Por eso la mayoría de las pruebas no necesitan Aurora.

Volumen actual: backend ≈ 341 funciones de test (≈409 casos con los parametrizados); frontend, los

módulos de OMS/Planif suman ~70 casos unit + 2 suites e2e.

## 2. OMS — qué se prueba

El OMS tiene dos cerebros probados por separado:

## 2.1 El motor de prioridad (frontend, dominio puro)

```
src/pages/oms/engine/priorityEngine.test.ts (10 casos) prueba calcularPrioridad y
esClienteRetira :
```


- Cliente retira siempre gana → prioridad 1 / tier 1, sin importar la fecha, con regla aplicada { name: 'Cliente retira', weight: 1 } .

- Regla T-1 (listo = entrega − 1): entrega mañana → urgente (prioridad 3, tier 1); entrega vencida es aún más urgente (prioridad 2); entrega lejana cae al tier 4 y se capa en ≤49; sin fecha usable → 50 / tier 4 y ninguna regla aplicada.

- Fallback Cofersa: si no hay fechaPlanificada usa fechaExpedicion ; una fecha con formato inválido se ignora y también cae al fallback.

- Detección de "cliente retira" por texto en cualquier capitalización, sin falsos positivos, y tolerante a null .

Este mismo motor existe también en el backend ( domain/oms ), probado en Python — la detección de cliente-retira se valida en test_planif_delta.py con 10 variantes de texto.

## 2.2 El barrido v4 / ADR-013 (backend, servicio + adaptadores)

tests/test_oms_v4_barrido.py (14) y test_oms_v4_domain.py (14) prueban el sweep que corre el

cron 5×/día. Lo clave que afirman:

- La cola filtra planning_run_id IS NOT NULL AND oms_processed_at IS NULL (lo que Planificación ya estampó pero el OMS aún no liberó).

- Dos pasadas sobre orders :

- 1. PRIORIZAR — deja wms_situation = DISP , escribe priority/score , NO estampa oms_processed_at ni escribe GENE . Falla con PedidoNoIngerido si el pedido no está en orders .

- 2. LIBERAR — solo los que cruzan la ventana ( now() >= dispatch_date − dias_prep ): estampa cabecera real de eFlow). Si la 2ª escritura falla, el pedido queda PENDIENTE y un reconciliador lo completa después. oms_processed_at = now() y escribe por la costura a sim_expedicionescabecera (nunca la

- Cliente-retira y los que entran en ventana se liberan aunque no sea su día.

- Permisos y API: procesar_viaje exige permiso oms:edit (403 si no); las corridas HTTP y el evento programado ( aws.events ) disparan el mismo barrido.

Lo elegante: el doble FakeOrders registra qué se priorizó/liberó, y en modo live un monkeypatch

reemplaza pg.query por un espía que captura el SQL — así se verifica el comportamiento exacto sin tocar Aurora.


## 3. Planificación — qué se prueba

Planificación va de bandeja de pedidos → plan de viajes → handoff al OMS. Se prueba casi todo como dominio puro (frontend) + el servicio con mocks (backend).

## 3.1 Dominio puro (frontend, src/pages/planificacion/*.test.ts )

- plan-automatico.test.ts (11) — agrupa pedidos por delivery_zone , un viaje por destino, flota propia primero, deja "sin asignar" lo que no tiene vehículo. Hoy corre con capacidad DESACTIVADA ( USAR_CAPACIDAD=false ): no parte grupos por peso/volumen; el test fija ese flag y además cubre la rama de capacidad (invariante: un vehículo no se usa en dos destinos el mismo día).

- capacity-fit.test.ts (8) — encaje por capacidad cuando el flag se active.

- fleet-split.test.ts (3) — reparto flota propia vs tercerizada.

- ruta con coordenadas del GAM. optimize-stops.test.ts (2) y route-geometry.test.ts (4) — orden de paradas y geometría de

- tiempo-cluster.test.ts (5) — tiempos/clusters por coordenadas (insumo del T-1 dinámico).

- calendario.test.ts (5) y plan-edit.test.ts (2) — vista calendario y edición del plan.

- eflow-api.test.ts (17) — los mappers que traducen eFlow → modelos de la app (viaje, ruta, transportista, conductor, vehículo, pedido) y los fetch* .

## 3.2 Servicio + handoff (backend)

- test_planif_handoff.py (7) — el corazón del contrato con el OMS (ADR-013):

- lead time puro: sin coordenadas → None ; en el depósito → 1 día; manda la parada más lejana (1 + floor(km/70)).

- formato AAAAMMDD-NNN (sigue el sequence_order ), cubriendo todos los order_id . crear_plan estampa el handoff en orders : una estampa por viaje, numero_viaje con

- limpieza al re-planificar: excluye exactamente los pedidos que quedaron en el plan y usa el mismo planning_run_id (los que se caen del plan se liberan).

- handoff opcional: sin él, crear_plan no rompe.

- scope (org/almacén/cliente); si no hay tabla orders devuelve vacío; detección de cliente-retira (16 variantes); la ruta HTTP usa el contexto operativo. test_planif_delta.py (6) — la bandeja filtra wms_status='DISP' AND wms_situation='DISP' por

Patrón: adaptadores AuroraPedidoRepo/PlanRepo/... en modo mock + un FakeHandoff que captura estampar() / limpiar_sobrantes() , y monkeypatch sobre pg.query para espiar el SQL.


## 4. Los e2e — el ciclo de vida de punta a punta

Dos specs de Playwright corren contra la app real (frontend :3000 , backend :4000 , Aurora por túnel).

La data es viva y compartida, así que afirman el comportamiento (hubo cola, el barrido liberó >0, el conteo bajó), no números fijos — para no ser frágiles.

- e2e/oms-handoff.spec.ts — el handoff Planif→OMS completo:

- 1. Planificación ya estampó los pedidos ( numero_viaje , dispatch_date ) → cola OMS.

- 2. La Cola de Priorización los lista en situación DISP (priorizados, sin liberar).

- 3. Se dispara el barrido ( POST /api/v1/oms/corridas ) — el mismo cron 5×/día (por diseño no hay botón en la UI; es programado, ADR-013).

- 4. La Cola recarga: los liberados pasan a GENE y salen de DISP ; los que aún no entran en ventana siguen en DISP .

- (draft con viajes+paradas) → confirmar → la pestaña "Planificaciones" lista el plan. Usa días con pedidos reales del brief (22-sep=7, 23-sep=4) pero afirma comportamiento. e2e/planificacion.spec.ts — el flujo automático de Planificación 2: elegir día → generar plan

## 5. Cómo correrlas (ciclo de vida de ejecución)

Backend (Python / pytest 9.1.1): desde TMS-Backend/

## Texto sin formato

```
pip install -r requirements-dev.txt
pytest # conftest.py agrega src/ al path (como en runtime Lambda)
```

En CI la cadena es: pytest → security (bandit SAST + gitleaks) → validate. Casi todo corre sin red ni

BD: lo "live" se simula con monkeypatch sobre pg.query .

```
Frontend (Vitest + Playwright): desde TMS-Frontend/
```

## Texto sin formato

```
npm test # "vitest run" — los *.test.ts unit (OMS/Planif dominio puro)
npx playwright test # e2e (necesita la app viva en :3000 + backend :4000 + túnel)
npx playwright test e2e/oms-handoff.spec.ts --headed # verlo en pantalla
```

Resumen del ciclo de vida de un cambio: tocas dominio → corre unit (ms, sin deps) → tocas el

servicio/adaptador → corre integración con mocks (verifica el SQL exacto) → antes de mergear/entregar → corren los e2e contra la app viva para confirmar el flujo real Planif→OMS de punta a punta.


## 6. Qué NO cubren (honesto)

- Los unit/integración no validan el esquema real de Aurora (eso es por diseño: usan mocks). El riesgo de que una tabla cambie de nombre y el schema_probe caiga a mock sin error se ataja solo en los e2e (data viva) — es justo uno de los riesgos del renombrado de tablas.

- Los e2e dependen de data viva compartida: afirman comportamiento, no cantidades, y necesitan el túnel a Aurora arriba.

- La rama de capacidad de Planificación está tras un flag apagado ( USAR_CAPACIDAD=false ): probada, pero no activa en producción todavía.
