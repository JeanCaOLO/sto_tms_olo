# Bitácora de trabajo — 2026-10-06 · Regenerar plan, alerta de pedidos nuevos y contexto en vivo

> **Autor:** Jesús Araujo
> Trabajo del día sobre Planificación 2, a partir del daily de hoy (Jean / Palencia) y
> de lo acordado en la reunión de ayer 4pm.

---

## 0. Resumen del día en tres líneas

1. Repoblé octubre **concentrando pedidos por zona** para que un viaje tenga 15-20 paradas (Jean lo pidió: COFERSA lleva 17-20 facturas por camión).
2. El botón ahora se llama **"Regenerar plan"** cuando ya hay plan, y muestra una **alerta (badge) cuando entran pedidos nuevos** para el día planificado (hoy por polling; el WebSocket real queda aislado detrás de un solo hook).
3. Arreglé que al cambiar **país/almacén/compañía en el headbar** los tabs se refiltren **en vivo** (antes había que recargar la página).

---

## 1. Más pedidos por zona/ruta (datos de demo)

**Problema (daily):** en un día había 1-2 pedidos por ruta → la distribución de paradas no se veía. Jean quería ver una ruta con **10-20 paradas**.

**Qué hice:** script de poblado (`scratchpad`, no va al repo) que inserta pedidos de octubre **concentrados por zona**, cada parada en un **punto de entrega real distinto con coordenadas**:
- **796 pedidos + 1575 order_items** (días 3-31), prefijo `SEEDC-` (idempotente, respeta pedidos ya referenciados por planes).
- Cada día: una **zona foco con 16-20 pedidos** (peso chico ~120-300 kg para que quepan en un camión) + 2 zonas secundarias de 4-6.
- Verificado generando un plan real del 9-oct: **viaje de zona "07 Carretera" con 16 paradas** (4.200 kg).

> Nota: el poblado es dato de demo contra Aurora; no es código del repo.

## 2. Botón "Regenerar plan"

`src/i18n/local/{es,en}/planning.ts` + `components/PlanEditor.tsx`:
- Sin plan → **"Generar plan"** (icono ruta). Con plan → **"Regenerar plan"** (icono refresh).
- Mismo flujo (`generar` → POST /planes); solo cambia la etiqueta/icono según haya plan.

## 3. Alerta de pedidos nuevos → regenerar (polling ahora, WebSocket después)

Lo que pidió Jean/Palencia: avisar en vivo cuando llega un pedido nuevo para el día que se está planificando.

- Nuevo hook **`src/pages/planificacion/use-nuevos-pedidos.ts`**: cada 15 s compara los pedidos del día contra los que usó el plan actual (paradas + sin-asignar); si hay más, devuelve cuántos nuevos.
- `PlanEditor.tsx`: cuando hay nuevos, el botón se pone **ámbar y pulsa**, con un **badge rojo con el número**.
- **Decisión (con Jesús):** el backend es Lambda/SAM y no sostiene WebSockets; un WS real necesita **API Gateway WebSocket** (infra + credenciales AWS pendientes). Por eso hoy es **polling**, pero toda la detección vive **detrás de este único hook**: el día que exista la infra, se reemplaza solo el cuerpo del hook por la suscripción y la UI no cambia.
- Helper de demo **`agregar_viajes_para_recalcular.js`** (raíz): `node agregar_viajes_para_recalcular.js 2026-10-09 3` agrega pedidos a un día → en ≤15 s aparece el badge → "Regenerar plan".

## 4. Headbar en vivo (país/almacén/compañía)

**Problema (daily):** cambiar país/almacén/compañía no refiltraba el tab de Planificaciones; había que recargar.

**Causa:** `usePlanesList` y `usePedidosDia` hacían fetch solo al montar. `listarPlanes()`/`fetchPedidosParaPlanificar()` mandan el contexto como headers, así que al cambiarlo no se re-consultaba.

**Fix:** ambos hooks ahora **dependen del contexto operativo** (`selectedCountryId/WarehouseId/CustomerId`) en su `useEffect` → re-consultan al cambiar. Afecta el tab de Planificaciones **y** el de Generar.

Archivos: `use-planes-list.ts`, `use-pedidos-dia.ts`.

## 5. Otros (fuera de este commit)

- Corrí el backend **desde el repo TMS-Backend propio** (su `src` es idéntico a `backend-planif/` del monorepo); túnel SSM a Aurora + frontend.
- Sincronicé **GitLab ← GitHub** (main, oms, dylan-tarifas) por fast-forward. Aclaración: no usé `--force`; el mirror GitLab→GitHub es el que propaga forzado. Sin pérdida de datos (verificado).
- Guardé en Notion las reuniones (28-sep, 5-oct 4pm, daily AIDLC) y revisé el doc de fuentes EFLOW/WMH.

---

## Dudas / pendientes

- **Regla 80% capacidad mínima** para que un viaje salga (hoy el motor valida el techo 85% peso, no el piso 80%). Falta.
- **Estatus de entrega/recepción** del viaje (ligado a IPRAC en la recepción de devoluciones). Falta.
- **WebSocket real** cuando llegue la infra AWS (reemplaza el cuerpo de `use-nuevos-pedidos.ts`).
- **Coordenadas de Venezuela** (~20 mil puntos) — bloqueante para simular rutas allá; el equipo lo gestiona con Toño.
- Errores de `type-check` preexistentes en tests/mocks (`planes-mock.ts` y `plan-edit.test.ts` sin `status`); ajenos a este cambio.
