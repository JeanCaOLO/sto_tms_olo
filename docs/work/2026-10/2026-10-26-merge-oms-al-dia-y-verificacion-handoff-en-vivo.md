# 2026-10-26 — Merge de `oms` al día en `planificacion-2` + verificación del handoff en vivo contra la nube

Rama `planificacion-2`. Puesta al día con el módulo OMS tras su redespliegue del
22-oct (migración `sql/53`, interno del OMS) y verificación de que el contrato
Planif→OMS (ADR-013) sigue intacto, probado contra el **OMS de la nube ya
desplegado**, sin levantar barrido local.

## Hecho

1. **Prueba e2e headed commiteada** (`c69b72e`): `e2e/oms-handoff.spec.ts` + su
   entrada de trabajo del 22-oct, que estaban sin commitear.
2. **Merge de `github/oms` en `planificacion-2`** (`264e267`, 35 commits, 0 conflictos).
   Trae del OMS: `1da315b` (ajuste `oms_logs` + contexto jsonb), `015759d`
   (**EPA sin priorización** — solo se libera — y carga de config de reglas dinámica),
   `b52e807` (contexto operativo en la Cola + UUIDs reales de Aurora para CR),
   `6906d04` (consolidar observaciones). Arrastra también tarifas/proformas/
   tracking/tendering que venían de `main`.
3. **`sql/53_oms_logs_slim.sql` NO se ejecutó**: ya está aplicada en el sandbox
   (heads-up del equipo OMS pidió no correr su migración sobre la misma BD).

## Por qué

El equipo OMS redesplegó `dev-tms-data` y `dev-tms-oms` el 22-oct y pidió re-probar.
El contrato sobre `public.orders` no cambió (lo suyo fue interno: adelgazar `oms_logs`),
pero `planificacion-2` quedaba atrás de `oms` (1↔35). El usuario pidió explícitamente
hacer el merge para mantener la rama al día — coherente con la memoria
`mantener-planif2-al-dia-con-main`.

## Cómo / Verificación

- **Novedad de infra**: el OMS de la nube ahora corre un barrido **cada 15 min sobre
  la misma Aurora del sandbox**. Eso permite verificar el handoff en vivo sin levantar
  el barrido local (más ligero: solo túnel SSM + consulta a Aurora).
- **Staging** (rol de Planificación): el 23-oct se estamparon 4 pedidos EPA de prueba
  (`2000018874`–`877`) con `dispatch_date = 2026-10-22`, `lead_time_days = 3`,
  `oms_processed_at` NULL → en ventana (`ancla=dispatch_date`, apertura 21-oct).
- **Resultado** (consultado el 26-oct): la nube los **liberó sola el 23-oct 13:57 UTC**
  → `wms_situation` DISP→GENE, `priority=20`, `oms_score=80.00`, `oms_processed_at`
  estampado. A hoy, todo procesado: Cofersa 372/372 y EPA 30/30 en GENE. Barrido de la
  nube activo (último 26-oct 10:57 UTC). Contrato Planif→OMS en `public.orders` intacto
  tras el redespliegue.

## Conocimiento promovido

- **La ventana de liberación de EPA se ancla en `delivery_date`** (no hay `dispatch_date`
  ni `dias_prep_picking` especial): `apertura = delivery_date − 1`. Pedidos EPA con
  entrega a +2 días quedan fuera de ventana hasta la víspera. Para forzar un pedido a
  ventana en pruebas, estampar `dispatch_date` pasado (lo hace Planificación de todos
  modos: `dispatch_date = delivery_date − lead_time_days`).
- **EPA (0029) no trae `delivery_zone`**: en eFlow su campo `RUTA` viene NULL (vs Cofersa
  0109 que sí rutea). La zona nuestra = `e.ruta` del WMS; EPA no la llena. La geografía
  de EPA vive en el texto de `delivery_address` (cantones CR), no estructurada.
- El barrido de la nube corre sobre Aurora compartida: escribir pedidos de prueba ahí
  los expone a ese barrido cada 15 min. Tenerlo en cuenta al observar estados intermedios.

## Follow-ups

- **Push / PR de `planificacion-2`**: el merge está solo local; pendiente confirmación
  del usuario para subirlo.
- **Typecheck/tests tras el merge**: no corridos (la máquina tuvo presión de memoria /
  OOM hoy al levantar vite+backend+navegador). Correr cuando haya margen.
- Zonificar EPA (derivar zona del texto de dirección o geocodificar) sigue abierto —
  ver hallazgo de `delivery_zone` NULL.
