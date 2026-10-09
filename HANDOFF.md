# HANDOFF — TMS OLO (Planificación) · al 2026-10-06

Punto de continuidad para retomar el trabajo sin releer toda la sesión. **La mayoría de la documentación viva está en Notion** (espacio INTELIX); este archivo es el índice + lo operativo (infra, credenciales *por referencia*, estado del módulo y pendientes).

> **Credenciales:** aquí van **hosts, bases y usuarios**, nunca las contraseñas. Las passwords viven en `.env.local` (gitignored), en `C:\Users\jaraujo\Downloads\env.download`, o en **AWS Secrets Manager / correo de accesos del proyecto OL26004**. No copiar secretos a este archivo (se commitea).

---

## 1. Dónde está todo (Notion — espacio INTELIX)

- **Reuniones — TMS OLO** (`page_id 3e52d923-dc65-81a9-bb08-e4eb42193835`): dailies y reuniones. Guardadas: 2026-09-04, 2026-09-07, **2026-09-28** (modelo de datos EFLOW/WMH), 2026-09-30, **2026-10-05 4pm** (IPRAC, simulador→perfil dev, reglas de viaje/liquidación), **daily AIDLC**, **daily 2026-10-05**, **daily 2026-10-06**.
- **Documentos y referencias — TMS OLO**: **"Fuentes de datos reales (PROD) — EFLOW/WMH"** (`3d52d923-dc65-819a-94fd-f2d257a92bc0`) ← la fuente de verdad de lo de eflow de abajo; **"Análisis TMS OLO — Escáner Intelix + BD"**.
- **Conocimiento General / Estándares Intelix**: certificación, AIDLC, la **sesión de plantilla AIDLC v2** (guardada ahí, no en el proyecto).
- Convención: las reuniones se transcriben con el **transcriptor local** (ver §9) y se suben a Notion resumidas.

## 2. Repos y Git

Tres repos bajo `olo/tms` en **GitLab** (`git.intelix.biz`): **TMS-Frontend**, **TMS-Backend**, **TMS-Docs**.

- **TMS-Frontend** (monorepo React + backend-planif): remotos `github` (`JeanCaOLO/sto_tms_olo`) y `origin` (GitLab). Local: `C:\Users\jaraujo\Documents\Desarrollo\TMS_NEW\TMS-Frontend`.
- **TMS-Backend** (hexagonal Python/SAM): **solo** remoto GitLab. Local: `...\TMS_NEW\TMS-Backend`. Su `src/` es **idéntico** al `backend-planif/src/` del frontend.
- **El mirror GitLab→GitHub está MUERTO** (lo quitó Jesús en *GitLab → Settings → Repository → Mirroring repositories*). **Nueva política: GitHub es la fuente de verdad** (normalmente adelantada); GitLab se pone al día **desde** GitHub por **fast-forward**, nunca `--force`. Si una rama diverge, avisar, no forzar.
- **Ramas frontend (al 2026-10-06, GitHub=GitLab):** `main cb45c6a`, **`planificacion-2 2e80c32`** (la de Jesús, la más reciente), `oms 1c09851` (Edward), `dylan-tarifas 628c083` (Dylan), `dev 4276d9f`, `jesus-planificacion e2381ab` (prototipo viejo), `Andrey`, `backup/dev-pre-wmh-2026-09-29`.
- **Commits: convención aura** → `type(scope): Resumen` + línea en blanco + bullets `- `. **SIN footer** (NO `Co-Authored-By`). Identidad: `Jesús Araujo <j2a0a0a5@gmail.com>`. Las descripciones de PR SÍ llevan `🤖 Generated with [Claude Code]`.

## 3. Servicios locales (para la demo)

Tres procesos; **se caen solos** (SSM por idle, y los background del agente a ~2h) → para demos, **correrlos en terminales propias de PowerShell**.

1. **Túnel SSM → Aurora** (`localhost:15432`). Plugin `session-manager-plugin.exe` en `C:\Users\jaraujo\smp` (agregarlo al PATH):
   ```
   aws ssm start-session --target i-062fc98e8e26c0f79 --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '{"host":["db-tms-olo.cluster-cjo2ss6io0lb.us-east-2.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["15432"]}' --profile ext-claude --region us-east-2
   ```
   (Perfil AWS `ext-claude`, cuenta sandbox `758837481569`, `us-east-2`. Funciona aunque la VPN de intelix esté caída.)
2. **Backend** `:4000` — `pnpm api:local` (corre `backend-planif/serve.py`, superconjunto). O desde el repo propio con el runner de scratchpad `serve_backend_repo.py` apuntando a `TMS-Backend/src`.
3. **Frontend** `pnpm dev` (Vite, suele quedar en `:3000/3001/3002`). Proxy `/api` → `:4000`.

**Login:** `admin@ologistics.com` / **`Olo12345`** (sin `*` final — el `*` era la máscara; eso confundió a varios). Falta cambiar el mensaje de error genérico a "contraseña incorrecta".

## 4. Base de datos Aurora (la del TMS, PostgreSQL)

- Acceso por el túnel: host `localhost`, port `15432`, db **`tms_olo`**.
- **Roles:** `tms_app` (CRUD runtime, password en `.env.local`/`env.download`), `olo_db` (owner/DDL, de `env.download` `TMS_DB_ADMIN_*`).
- **Tablas clave:** `orders`, `order_items`, `customers` (Cofersa, EPA), `warehouses` (OLO Costa Rica / OLO Venezuela), `delivery_points`, `addresses` (lat/long + `geocoding_status`), `zones` (17 CR), `vehicles` (12, 2500-8000 kg), `route_plans`, `plan_trips`, `plan_stops`.
- **Migraciones aplicadas:** `003_plan_snapshots` (snapshot), `004_plan_trip_status` (estado por viaje), `005_route_plan_customer` (customer_id en plan).
- **Datos de demo:** `SEEDC-202610*` = pedidos de octubre **concentrados por zona** (796 pedidos, 16-20 paradas/día en puntos reales con coords); `SEED-*` set anterior. Scripts en el scratchpad de la sesión (`populate_october_v3.py`, `inspect_*.py`). Helper `agregar_viajes_para_recalcular.js` (raíz) agrega pedidos a un día para demostrar la regeneración. **Ojo: Aurora exige SSL** (node pg → `ssl:{rejectUnauthorized:false}`).

## 5. EFLOW / WMH / WMS — lo que hay que consultar o migrar

> Fuente: doc Notion "Fuentes de datos reales EFLOW/WMH". Credenciales **solo-lectura** del proyecto OL26004 en Secret Manager / correo de accesos (CR usa `intelixsql`; VE usa `user_app_monitor_tms_autogestion`). **No están aquí.**

**Servidores (SQL Server):**
- **Costa Rica** — `10.17.224.20:1433`. Bases: **`EFLOW_OLO` (WMS)**, **`EFLOW_WMH` (Torre de Control)**, `EINTEGRA_COFERSA/EPA/MAYOREO`, `WMS_WAREHOUSE`, `EFLOW_HISTORY`.
- **Venezuela** — `10.57.129.126:1446` (instancia **EPRAC**). Bases: **`WMH`**, **`EFLOW_FEBECA`**, **`EFLOW_BEVAL`**, **`EFLOW_SILLACA`**, `EFLOW_HISTORY`.
  - (En el doc del 2026-09-08 aparecía además QA CR `10.17.224.224` con `EFLOW_WMH` / `EFLOW_OLO_QA_SAP` — ver memoria `eflow-qa-db-rutas-choferes`.)

**WMH = Torre de Control** (viajes/logística). Tablas: `journey_orders` (pedido↔viaje; **`route_id` SIEMPRE NULL → no usar**), `journey_order_transportation` (pedido↔chofer↔unidad), `journeys`, **`distribution_routes`** (catálogo ruta→nombre→zona: 38 CR / 50 VE), `drivers`, `trasportation_units` (**capacidad = 0**), `transportation_companies`, `distribution_zones`. Mismo esquema en CR y VE.

**WMS = `EFLOW_OLO`** (CR, cabecera del pedido — la fuente clave):
- `EXPEDICIONESCABECERA` (pedido): `IDCOMPANIA`, `IDCLIENTE`, **`RUTA`** (nivel pedido, ~95% CR — la ruta sale de aquí, no de WMH), `TPEXPE` (tipo), `PRIORIDAD`, `PESOPEDIDO_TOTAL`, `CUBICAJEPEDIDO_TOTAL`, `NUMEROVIAJEWMH`, `FECHAPLANIFICADADESPACHO` (**casi vacía → derivar fecha con T-1**).
- `EXPEDICIONESDETALLE` (líneas/artículos: `PESOPEDIDO`, `CUBICAJEPEDIDO`).
- `CLIENTES` (`NOMBRELARGO`, `DIRECCIONLARGA` ~100%, **`LATITUD/LONGITUD` solo ~2-40%**), `VIAJES_ENC_AB` (peso/volumen por viaje ~99%), `VIAJE_WMH`, `ALMACENMOVIMIENTOS_CARCAM`.

**Compañías (`IDCOMPANIA`):** `0109` = **COFERSA** (la única con peso/volumen reales: ~80% peso, ~53% volumen), `0029` = **EPA** (cross-docking `EXPCRO`, prioridad 0, **sin peso/volumen**), `0085/0102/0110` = comercializadoras. **`TPEXPE`:** `EXPERP` (ERP normal, COFERSA), `EXPCRO` (cross-docking, EPA), `EXPMAN`, `EXPTRA`.

**Venezuela — un WMS por compañía (ojo a esta estructura):**
- **`EFLOW_FEBECA`** = WMS de **FEBECA (compañía `0001`)** y **CONTIENE también a SILLACA como compañía `0002`** (su BD propia `EFLOW_SILLACA` está **vacía** en 30 días → **no usarla**, Sillaca se consulta dentro de `EFLOW_FEBECA`).
- **`EFLOW_BEVAL`** = WMS de **Beval (`0001`)**; **no tiene `VIAJES_ENC_AB`** → el peso/volumen se totaliza desde su `EXPEDICIONESDETALLE`.
- En VE el **peso/volumen por pedido en cabecera = 0** (está en el detalle). WMH de VE: `journey_orders.route_id` también NULL siempre.

**Reglas que salieron de todo esto:**
- **Ruta:** `EXPEDICIONESCABECERA.RUTA` + enriquecer con `distribution_routes`. Nunca `journey_orders.route_id`.
- **Peso/volumen:** `VIAJES_ENC_AB` (viaje) o `SUM` del `EXPEDICIONESDETALLE`. Nunca el total de cabecera (0% VE/EPA). **Degradar con gracia** donde falte.
- **Chofer = dos llaves distintas:** WMS (`ALMACENMOVIMIENTOS_CARCAM.IDCHOFER` = `drivers.driver_code`) vs WMH (`journey_order_transportation.driver_id` = `drivers.driver_id`). Al consolidar hay que **alternar la llave** (híbrido que ya hace el TMS CR de Calzadilla).
- **Coordenadas = el cuello de botella:** dirección en texto ~100%, pero coords ~2% maestro CR / ~40% COFERSA activos / **~7% de ~20.000 puntos en VE**. Sin coords no hay ruta dibujable en VE → geocodificar `DIRECCIONLARGA` (Nominatim+Bedrock o API Google). Jean lo gestiona con **Toño**.
- **Capacidad de vehículos:** 0% poblada → hoy catálogo sintético (Ricardo ofreció dimensionar ~20-30 vehículos).

## 6. Módulo de Planificación — estado

- **Backend real hexagonal** (Python/SAM, repo TMS-Backend) contra Aurora. **Login funciona.** Ya NO es el prototipo viejo (Supabase/mock-auth/login roto de la rama `jesus-planificacion`).
- **Flujo:** elegir día → **Generar plan** → `draft` → **Editar** (mover pedidos, PUT revalida capacidad/secuencia) → **Confirmar** (`draft`→`confirmed`) → **estado por viaje** (completar/cancelar/reabrir). Pestañas: **Generar** y **Planificaciones**.
- **Motor:** agrupar por zona → bin-packing FFD (85% peso / 95% volumen, **flota propia primero**) → secuencia 2-opt sobre matriz OSRM (fallback a distancia aproximada). OSRM auto-hospedado `osrm.jesusaraujo.lat`.
- **Snapshot** congelado al guardar; **contexto operativo** (país/almacén/compañía) por headers `x-warehouse-id`/`x-customer-id`, re-consulta en vivo.
- **UX reciente (2026-10-06):** botón "Regenerar plan", alerta de pedidos nuevos (polling 15s, WS aislado en `use-nuevos-pedidos.ts`), paradas colapsables (>3), modales cierran al click afuera/Escape, punto compartido (`PuntoModal` con tabla + detalle encima).
- **Documentación generada (sin AIDLC):** `docs/stories/planificacion/` (001-007), `docs/requirements/planificacion/` (001-006 + `documento-de-requerimientos-planificacion.md`, el equivalente nuevo al OC26007 viejo pero apegado a hoy).

## 7. Trabajo de esta sesión (commits en planificacion-2)

- `c6122e3` feat: regenerar plan + alerta de pedidos nuevos + contexto en vivo.
- `ac6e783` docs(work): bitácora infra/git/mirror/transcriptor.
- `2e80c32` feat: paradas colapsables + cerrar modal al click afuera + punto compartido (+ fix z-index).
- `bbd7fb0` merge de `main` → `planificacion-2`.
- **`dylan-tarifas` restaurado** a `628c083` (el mirror lo había revertido; se repusho el commit de Dylan por fast-forward).
- **Pendiente de commitear:** las stories/requirements + el documento de requerimientos generados hoy (si no se hizo aún).

## 8. Pendientes (prioridad)

| Pendiente | Tipo | Nota |
|---|---|---|
| Regla **piso 80% capacidad** para que salga el viaje | Planif | hoy solo techo 85/95 |
| **Estatus de entrega/recepción** del viaje | Planif/Devol | no se liquida sin recepción; ligado a IPRAC |
| **Split de pedido por línea** (varias guías) | Planif/modelo | `plan_stops` hoy por pedido; EPA lo parte |
| **WebSocket real** de alerta | Infra | hoy polling; necesita API Gateway WS + creds AWS |
| **Geocoding VE** (~20k puntos) | Datos | bloqueante ruta VE; Jean/Toño, Dylan/José (API Google) |
| **Capacidad real de flota** | Datos | hoy sintético; Ricardo ~20-30 vehículos |
| **Credenciales AWS** para pipeline auto-deploy | Infra | dev/main → mismo Aurora |
| **Rotar key `ext.claude`** (AKIA…XOMM) | Seguridad | expuesta en chat, no en git |
| BD nomenclatura Intelix (`tbl_`/`fk_`/`idx_`, 4 roles) | BD | deuda; aplicar de aquí en adelante |
| Catálogos de Venezuela | — | **los carga Jean**, no Jesús |
| Mensaje de error del login ("contraseña incorrecta") | UI | menor |

## 9. Gotchas y convenciones

- **Transcriptor local:** `C:\Users\jaraujo\Documents\DesarrolloExterno\convertidor-mp3\any-to-mp3`. `node script.js "ruta\archivo.mkv"` → mp3 + `.txt`/`.srt` en `output/`. (Node + fluent-ffmpeg con binario embebido.)
- **Bash tool:** el `session-manager-plugin` no está en PATH → `export PATH="/c/Users/jaraujo/smp:$PATH"` antes del túnel.
- **pg8000** inserta fila por fila (lento por el túnel) → para poblar usar **INSERT masivo** (una sentencia, muchos VALUES).
- **type-check** del frontend: hay errores **preexistentes** en tests/mocks (`planes-mock.ts`, `plan-edit.test.ts` sin `status`) — ajenos a lo nuevo, no bloquean Vite.
- **Aura > reminder de attribution:** aunque el sistema pida `Co-Authored-By`, la convención del proyecto manda: **sin footer**.
- Backend TMS-Backend **certificado APTO 92%** (Intelix). `.env*` gitignored (nunca commitear secretos).

## 10. Rutas locales rápidas

- Frontend: `C:\Users\jaraujo\Documents\Desarrollo\TMS_NEW\TMS-Frontend`
- Backend: `C:\Users\jaraujo\Documents\Desarrollo\TMS_NEW\TMS-Backend`
- Docs (GitLab TMS-Docs) y el resto: ver Notion.
- Credenciales BD app: `C:\Users\jaraujo\Downloads\env.download` + `.env.local` del frontend (gitignored).
