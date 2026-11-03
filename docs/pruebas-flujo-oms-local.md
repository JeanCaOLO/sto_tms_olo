# Prueba del flujo OMS end-to-end en LOCAL

**Qué prueba:** el flujo real de punta a punta, con el **mismo código que producción** (sin mocks):

```
EFLOW (solo lectura) --ingest--> orders (bandeja)
   --> Planificación: planifica la ventana (hoy, hoy+3] por fecha de ENTREGA
   --> OMS barrido: PRIORIZA (dias_hasta_salida) + LIBERA (ventana por fecha de SALIDA)
```

Driver: **`scripts/prueba_flujo_oms.py`** (invoca los módulos reales, no scripts ad-hoc).
Documento hermano (lado Planificación): `pruebas-oms-planificacion.md`.

> Reparto de responsabilidades (confirmado 2026-10-26):
> - **Planificación** filtra por **fecha de entrega**, ventana **(hoy, hoy+3]** (excluye hoy;
>   `HORIZONTE_DIAS=3` en `backend/planning/src/replan.py`), arma viajes y calcula el
>   `lead_time` → escribe `dispatch_date` (= entrega − lead_time).
> - **OMS** trabaja sobre **fecha de salida** (`dispatch_date`): numera con `dias_hasta_salida`
>   (Cofersa) y libera cuando `hoy ≥ dispatch_date − dias_prep_picking`.

---

## Prerrequisitos

1. **Túnel a Aurora** en `localhost:15432` con `AWS_PROFILE=olo-tms`.
   - Memoria útil: el perfil `olo-tms` (SSO puede vencer → reautenticar). La base es `tms_olo`.
2. **Red/VPN hacia EFLOW** (prod CR, `Host_EFLOW = 10.17.224.20:1433`, **solo lectura** con
   `user_monitor_tms`). Sin VPN, el `ingest` falla en la conexión.
3. **`.env` / `.env.local`** en la raíz con:
   - Aurora: `TMS_DB_HOST=localhost`, `TMS_DB_PORT=15432`, `TMS_DB_NAME=tms_olo`,
     `TMS_DB_USER=tms_app` (+ `TMS_DB_PASSWORD`), y para DDL `TMS_DB_ADMIN_USER/PASSWORD`.
   - EFLOW: `Host_EFLOW`, `Port_EFLOW`, `BD_EFLOW` (=`EFLOW_OLO`), `User_EFLOW`, `Pass_EFLOW`.
     > El código real espera `EFLOW_CR_*`; el driver mapea `*_EFLOW → EFLOW_CR_*` solo, así
     > que funciona con cualquiera de los dos nombres. **Las creds van en `.env.local`
     > (gitignored); NUNCA se commitean.**
4. **Python** con `pytds` y `pg8000` instalados; **Node** con `pg` (para las consultas sueltas).

**EFLOW es SIEMPRE solo lectura.** La única base donde se escribe es Aurora `tms_olo` (compartida,
por el túnel). No tratar `tms_olo` como "local desechable": lo que se escribe lo ve el sandbox.

---

## Ejecutar

Desde la raíz del repo:

```bash
# 0) Ver el estado de la cola (NO escribe) — úsalo antes y después
python scripts/prueba_flujo_oms.py estado

# 1) Extracción EFLOW -> bandeja (orders). Dry-run primero (no escribe):
python scripts/prueba_flujo_oms.py ingest --dry-run
python scripts/prueba_flujo_oms.py ingest            # aplica el UPSERT

# 2) Planificar la ventana (hoy, hoy+3] (por fecha de entrega):
python scripts/prueba_flujo_oms.py plan

# 3) Barrido del OMS: prioriza (dias_hasta_salida) + libera (ventana por salida):
python scripts/prueba_flujo_oms.py barrido           # hoy = fecha real
python scripts/prueba_flujo_oms.py barrido --hoy 2026-11-05   # inyectar "hoy" para probar

# TODO de corrido (cada etapa en su propio proceso):
python scripts/prueba_flujo_oms.py todo
```

El driver usa, respectivamente:
`backend/planning/src/ingest_orders.py::ingest_cr`,
`backend/planning/src/replan.py::replanificar_todo`,
`backend/oms/src/app.py::correr`.

---

## Qué esperar / cómo leerlo

- **ingest**: `leidos` = pedidos DISP/DISP de EFLOW (hoy en adelante, todas las compañías);
  `upserted` = los que resolvieron FK (Cofersa `0109` + EPA `0029`); `saltados` = otras compañías
  sin fila en `customers` (p. ej. ANCORA NI/SV) — normal. `priority` de EFLOW < 1 (p. ej. EPA 0)
  entra como **NULL** (la tabla exige `priority ≥ 1`); `es_cliente_retira` se deriva de las
  observaciones.
- **plan**: solo planifica entregas en **(hoy, hoy+3]**. Entregas de **hoy o pasadas NO se
  planifican** ("hoy no se planifica"), y las de **> 3 días** quedan fuera hasta que avance el día.
  Cofersa y EPA se planifican por separado.
- **barrido**:
  - **Cofersa** (`priorizar=true`, estrategia `dias_hasta_salida`): número = días hasta el
    alistado (entrega − lead_time), piso de cola = 1. Mañana→1, pasado→2, etc. Cliente-retira = 1.
  - **EPA** (`priorizar=false`): el OMS **NO** recalcula; conserva la prioridad que trae.
  - **Liberación**: libera los que cruzan `hoy ≥ dispatch_date − dias_prep_picking` (si no hay
    `dispatch_date`, cae a `delivery_date`); los liberados pasan a `GENE` + `oms_processed_at`.

Verificar con `estado`: los **DISP/no-liberados** son la cola pendiente; los **GENE/liberados**
ya salieron al WMS (espejo `sim_expedicionescabecera`, **no** EFLOW real).

---

## Notas y troubleshooting

- **Git Bash mangla rutas** que empiezan con `/` (p. ej. nombres de log group de AWS): usar
  `MSYS_NO_PATHCONV=1` en esos comandos. (No afecta a este driver.)
- **Datos mock:** la cola debe mostrar solo data real. Si reaparecen pedidos `9900000xxx`
  ("mock-bandeja") o `DEMO-CR-…` ("demo-viajes"), son semilla a eliminar (ver los `backup-*.json`
  de la raíz como referencia de lo ya limpiado el 2026-11-02).
- **Pendientes de EPA conocidos** (no los resuelve este runbook):
  1. `orders` no admite `priority = 0` (`ck_order_priority ≥ 1`) → EPA pierde su 0 real; decidir
     si se relaja el CHECK.
  2. EPA llega sin coordenadas → sin `lead_time` → sin `dispatch_date`; definir regla de salida
     de EPA (lead por defecto, o `dispatch_date = delivery_date`).
- **Despliegue:** este runbook NO despliega nada. Los deploys (backend/frontend, migraciones) los
  hace Intelix. Las migraciones del OMS relacionadas: `sql/54` (escala) y `sql/55` (estrategia),
  en ese orden.
