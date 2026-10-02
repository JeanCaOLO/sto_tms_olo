# Bitácora de trabajo — 2026-09-29 · Planificación 2 y análisis TMS

> **Autor:** Jesús Araujo
> Registro extenso del trabajo del día, con dudas y preguntas abiertas.

---

## 0. Resumen del día en tres líneas

1. Cerré el análisis TMS (código, escáner Intelix, base de datos) en dos documentos (simple + formal con branding).
2. Construí "Planificación 2": partí de `main` (un botón), le sumé mapa OSRM, día editable, persistencia con estados, capacidad real, y datos reales de Aurora vía puntos de entrega.
3. Verifiqué seguridad (no hay claves AWS en git — era falso), destrackeé el `.env`, y dejé todo commiteado (falta push a GitLab por VPN).

---

## 1. AWS sandbox, túnel y credenciales (la saga)

- **Cuenta sandbox:** 758837481569, `us-east-2`, perfil `ext-claude`.
- **Túnel SSM a Aurora:** bastión `i-062fc98e8e26c0f79`, Aurora `db-tms-olo` → `localhost:15432`.
  Comando: `aws ssm start-session --target i-062fc98e8e26c0f79 --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '{"host":["db-tms-olo.cluster-cjo2ss6io0lb.us-east-2.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["15432"]}' --profile ext-claude --region us-east-2`
- **El túnel se cae solo** por inactividad (SSM) y por horario: los servidores/bastión se apagan **L–V 17:00 CR**. Armé un **keepalive** (latido cada 120s con `SELECT 1`) para que no se duerma mientras trabajo.
- **Credenciales de la BD** (de `C:\Users\jaraujo\Downloads\env.download`):
  - App: usuario `tms_app` (permisos DML, NO crea tablas).
  - Admin: usuario `olo_db` (DDL + createrole) — lo usé para crear tablas y sembrar.
- **DBeaver:** Host `127.0.0.1`, Port `15432`, DB `tms_olo`, user `tms_app`, SSH desactivado.
- **El error del compañero** (`GetSecretValue` AccessDenied en `/dev/tms/db-app`): a él le falla porque su backend pide la clave a **Secrets Manager**, y `ext.claude` no tiene permiso de LEER secretos (solo crear/escribir/describir). A mí no me pasó porque leo la clave del `.env` local. Desbloqueo inmediato: pasarle la clave de `tms_app` por canal seguro. Fix real: que el admin de IAM agregue `secretsmanager:GetSecretValue` sobre `/dev/tms/*`.

### Dudas de esta parte
- ¿Vale la pena montar un OSRM propio (Docker) en vez del demo público `router.project-osrm.org` (sin SLA)? Para prod sí.
- ¿La clave `ext.claude` (AKIA3BLR5CBQXT4XXOMM) ya la rotó alguien? Se expuso en chat, no en git. Sigue pendiente que el admin la rote.

---

## 2. Análisis TMS (los documentos)

Tres análisis consolidados en `C:\Users\jaraujo\Downloads\`:
- **Simple:** `2026-09-29-consolidado-analisis-tms.md` (palabras llanas).
- **Formal (branding Intelix):** `2026-09-29-analisis-tms-vs-estandares-intelix.md` (portada con logo, "Objetivo/Resumen ejecutivo", secciones numeradas).
- Subido a Notion (📄 Documentos TMS OLO): "🔎 Análisis TMS OLO — Escáner Intelix + Base de datos".

### 2.1 Escáner `intelix-cli`
- Lee archivos, NO toca la BD. 4 ejes: infra, código, seguridad, devops.
- Notas: `main` 60% · frontend propio 22% · backend propio 57%. Ninguno aprueba.
- Clave: `main` es **monorepo**; el estándar pide **repos separados** (como los nuestros). Comparar "main completo" vs "solo nuestro backend" es injusto → sumar front+back.
- Seguridad: backend de main **0%** (endpoint sin auth `AuthorizationType: NONE` + IAM con comodines). Nuestro backend **60%** → más seguro.
- Nos falta **arquitectura hexagonal** (COD1) — reorganizar en domain/ports/adapters, no rehacer.

### 2.2 Base de datos vs estándar OLTP Intelix
- 43 tablas, 2 vistas, 77 FKs, 248 índices.
- Cumple 5 / falla 8 reglas. Cumple formato (minúsculas, snake_case, sin acentos, integridad, app sin admin). Falla nomenclatura (sin prefijos `tbl_`/`pk_`/`fk_`/`idx_`, sin los 4 roles ro/rw/ddl/admin, mezcla idioma).
- No se creó con el kit Intelix. Recomendación: aplicar estándar de aquí en adelante (renombrar es riesgoso con la app viva).

### Correcciones que me hicieron notar (importantes)
- **"Planificación intacto" era FALSO:** se conservaron solo los *documentos* (requisitos/diseño); el **código** se voló de multi-pestaña (~96 archivos) a **un botón** (~30). Corregido en ambos docs.
- **C1 (backend Python) ya está resuelto** → lo saqué de la tabla de "decisiones pendientes" (quedan solo C2 motor de reglas, C3 segmentación por compañía).

---

## 3. Planificación 2 (el build grande)

**Estrategia:** partir de `main` (ya era el "épico" de un botón) y sumarle lo que falta, en vez de mergear sobre las 96 pestañas.

**Delegación a kiro (3 worktrees Orca):**
- WT-1 `planif2-schema` (TMS-Backend): DDL `route_plans`/`plan_trips`/`plan_stops` + seed `order_items` + validación.
- WT-2 `planif2-backend`: backend hexagonal (domain/ports/adapters/app) + motor (zona+capacidad+2-opt) + 8 endpoints.
- WT-3 `planificacion-2` (TMS-Frontend, base main): botón único + día + editable + confirmar + pestaña de estados.

**Kiro crasheó dos veces** por `The model 'auto' is not available` (bug de infra de kiro; el `--model claude-sonnet-5` no siempre lo respetó). El seed sintético lo terminé yo.

### 3.1 Modelo de datos (lo importante que aprendí hoy)
- **pedido → punto de entrega → zona.** Un pedido tiene un `delivery_point_id` (FK a `delivery_points`); el punto tiene coords geocodificadas y pertenece a una zona. Se **agrupa por la zona del punto**.
- Hay **1581 puntos de entrega**, 1544 geocodificados (CR/Cofersa). Re-apunté los 108 pedidos a coords reales de puntos.
- Sembré 40 pedidos nuevos en días útiles (29-sep..2-oct) + order_items con peso/volumen.
- El cruce Aurora↔EFLOW para el seed real dio solo **2.9% (2/68)** — `order_number` es un fragmento truncado del `IDEXPEDICION`; por eso se optó por sintético.

### 3.2 Backend (hexagonal)
- Corregí el SQL a columnas reales (main asumió columnas inexistentes: `customer_name`, `warehouse_id`, `is_owned`, status `alistado`).
- Enriquecí la respuesta: viajes con capacidad/placa/flota propia, paradas con coords/cliente.
- `PlanificacionService.a_dict` arma lookups de vehículos y pedidos.
- Hidraté viajes+paradas al **listar** (venían vacíos → tarjetas de la pestaña salían vacías). LIMIT 30.
- Runner local `scratchpad/local_api.py` sirve los 8 endpoints en :4000 contra Aurora (Vite proxya `/api`). Single-thread (pg8000 no es thread-safe).

### 3.3 Frontend
- Mapa OSRM por ruta (`TripMapa.tsx`, leaflet). Rescaté `route-geometry`/`osrm-config`.
- Selector de día; aviso "no hay pedidos"; no caer a mock en día vacío.
- Rediseño de la pestaña Planificaciones + tarjeta de ruta → **delegado a un crew:frontend-architect** (tarjetas desplegables con mapa, "Viaje N" → "Ruta N", barras de capacidad).
- Tests Playwright (`e2e/planificacion.spec.ts`), en serie; corren headed (`--headed`) o UI (`--ui`).

### Bugs que cacé y arreglé
- `unassigned_order_ids` (backend) vs `unassigned_order_numbers` (frontend) → crash de PlanEditor.
- `listarPlanes` caía a mock en lista vacía → "Completar" no refrescaba.
- pg8000 `NoneType append` en día vacío → runner a single-thread.
- `_viaje_to_dict` sin capacidad → barras no se llenaban.
- `listar` sin hidratar viajes → tarjetas vacías + 17 planes de prueba ralentizaban.

---

## 4. Seguridad (verificado hoy)

- **NO hay credenciales AWS en el historial de git** (pickaxe `AKIA[0-9A-Z]{16}` en todas las ramas → vacío). El "AKIA" de los docs AIDLC es una **regla que tacha secretos**, no una clave. La afirmación del informe del compañero era falsa/sin verificar.
- `.env` estaba trackeado en `main` con **anon keys públicas de Supabase** (no secretas). Lo **destrackeé** (commit `696f655`), sigue en disco.
- Pendiente real (no de git): rotar `ext.claude` (expuesta en chat) — lo hace el admin de IAM.

---

## 5. Estado de commits / push

| Rama | Repo | Último commit | Push |
|---|---|---|---|
| `planif2-schema` | TMS-Backend | `93e4057` seed | ⏳ GitLab (VPN caída) |
| `planif2-backend` | TMS-Backend | `b60bcfe` fix adaptadores | ⏳ GitLab (VPN caída) |
| `planificacion-2` | TMS-Frontend | `5df4740` mapa+tests | ✅ GitHub · ⏳ GitLab |

- TMS-Backend **solo tiene remoto GitLab** → sus dos ramas no se pueden pushear hasta que vuelva la VPN.
- Reintentar cuando `git.intelix.biz` responda.

---

## 6. DUDAS Y PREGUNTAS ABIERTAS (para resolver)

1. **Motor de vehículos:** hoy asigna la **misma placa** a todas las rutas (no rota los 12 vehículos). ¿Ajustar para que cada ruta use un camión distinto y respete disponibilidad?
2. **order_items reales:** ¿vale conseguir la clave real Aurora↔EFLOW (guardar `IDEXPEDICION` completo al importar) para sembrar líneas reales, o seguimos sintético?
3. **Mapa en pestaña Planificaciones:** ya trae coords embebidas; validar visualmente que se ve bien con muchos planes.
4. **Backend real vs runner local:** el `local_api.py` es solo para probar. ¿Cuándo desplegamos el hexagonal al sandbox con SAM (falta `sam` instalado + Docker corriendo)?
5. **Hexagonal en TMS-Backend:** el repo tenía un prototipo viejo (EFLOW, `?pais=cr|ve`). ¿Jubilamos ese código del todo?
6. **Decisiones C2/C3** (motor de reglas único vs propio; segmentación por compañía) — siguen pendientes para reunión.
7. **Estándar de nomenclatura de BD:** ¿empezamos a aplicar prefijos Intelix a las tablas NUEVAS (route_plans, etc.) o mantenemos la convención actual del repo (inglés sin prefijos) por consistencia?
8. **Purga del `.env` del historial:** no la hice (son claves públicas). ¿Alguien quiere historial limpio igual? Requiere coordinar `filter-repo` con todo el equipo.

---

## 7. Cosas útiles / rutas

- Runner backend local: `scratchpad/local_api.py` (:4000).
- Keepalive túnel: `scratchpad/keepalive.py` (log en `scratchpad/keepalive.log`).
- Contrato de Planificación 2: `scratchpad/CONTRATO-planificacion-2.md`.
- Frontend dev: `npm run dev` en el worktree → :3000 (login mock: cualquier email/clave).
- Tests: `npx playwright test --headed` (o `--ui`).
- Día con datos para demo: **2026-09-30** (10 pedidos → 4 rutas).
