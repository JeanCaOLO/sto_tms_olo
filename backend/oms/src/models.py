"""Modelos de dominio del motor de reglas del OMS (esqueleto de 1a entrega).

Contrato de datos de la rebanada delgada. Dataclasses frozen (convención del
backend: NO pydantic/TypedDict). Las filas crudas de EFLOW/Aurora se manejan
como `dict` y se envuelven aquí solo donde hay lógica de dominio encima.

Decisiones de dominio ancladas (ver project.md `## Decided` y domain-design):
- Prioridad NUMÉRICA invertida: menor número = mayor prioridad (match con el WMS).
- El OMS NO escribe fechas: `FECHAEXPEDICIONPLANIFICADA` es insumo, no se modifica.
- Multi-compañía por SCOPE (CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL), no por Lambda.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class PedidoCandidato:
    """Proyección de LECTURA de un pedido de la cola del OMS (public.orders, Aurora).

    Es lo que `ColaCandidatos` devuelve: la cola de pedidos elegibles para
    priorizar. La cola se resuelve HOY por POLLING de columna sobre public.orders
    (contrato v4, confirmado con negocio): un pedido está listo para que el OMS lo
    procese cuando `planning_run_id IS NOT NULL AND oms_processed_at IS NULL`. Esa
    columna es la ÚNICA fuente de verdad de activación (EventBridge = futuro no
    bloqueante). El OMS ya NO lee de EXPEDICIONESCABECERA con TPEXES/TPEXSI='DISP'
    ni filtra por NUMEROVIAJEWMH.

    Clave de negocio = la llave EFLOW (uq_order_eflow_key, sql/43), que es también
    la clave de idempotencia del handoff.

    Campos (de public.orders, ver sql/43 y docs/reference/mapeo-pedidos-eflow-orders.md):
    - id_almacen/id_compania/id_sucursal/id_expedicion: llave EFLOW (orders.eflow_id_*).
      Son varchar en EFLOW (ceros a la izquierda: '0029'; expediciones con letras:
      'P0002002260922'), por eso `str` y no `int`.
    - fecha_expedicion_planificada: orders.delivery_date. Fecha de ENTREGA que manda
      el cliente. Insumo del T-1; el OMS NO la modifica.
    - lead_time_days: orders.lead_time_days. Duración logística DINÁMICA (la calcula
      Planificación por distancia haversine: GAM T-1, La Fortuna T-2, Guanacaste T-3).
      Puede venir NULL → la regla de fecha aplica su default (1 día, Cofersa).
    - numero_viaje: orders.numero_viaje (formato 'YYYYMMDD-NNN'). Reemplaza al viejo
      wms_trip_number (eliminado del contrato, ADR-0004 de Planificación). Puede ser NULL.
    - planning_run_id: orders.planning_run_id. Correlación de la corrida de
      Planificación; su presencia (NOT NULL) activa la cola del OMS.
    - oms_processed_at: orders.oms_processed_at. NULL mientras el OMS no LIBERA el
      pedido a eFlow; el OMS la estampa now() en la PASADA DE LIBERACIÓN (no al
      priorizar, ADR-013), que lo saca de la cola. Semántica: LIBERADO, no priorizado.
    - dispatch_date: orders.dispatch_date. Fecha (date) de salida del viaje que
      estampa Planificación (= delivery_date − lead_time_days), IGUAL para todos los
      pedidos de un mismo numero_viaje. Insumo de la pasada de liberación de ADR-013
      (`now() >= dispatch_date − dias_prep_picking`); el OMS solo la LEE. Puede ser NULL
      (pedido sin plan todavía) → no se libera.
    - observaciones: orders.observaciones, texto libre que lee AnalizadorObservaciones.
    - delivery_zone: orders.delivery_zone (EFLOW RUTA). Parte del scope de reglas.
    - customer_type: final_customers.customer_type ('TIENDA' | 'MAYOREO').
    - peso_total/cubicaje_total: orders.total_weight/total_volume float NULL
      (OQ-8: pueden venir null; null = desconocido, nunca 0).
    - country_id/warehouse_id/customer_id: la cadena de scope del pedido, para
      resolver qué reglas aplican.
    """

    id_almacen: str
    id_compania: str
    id_sucursal: str
    id_expedicion: str
    fecha_expedicion_planificada: datetime
    lead_time_days: int | None = None
    numero_viaje: str | None = None
    planning_run_id: str | None = None
    oms_processed_at: datetime | None = None
    dispatch_date: datetime | None = None
    observaciones: str | None = None
    delivery_zone: str | None = None
    customer_type: str | None = None
    peso_total: float | None = None
    cubicaje_total: float | None = None
    country_id: str | None = None
    warehouse_id: str | None = None
    customer_id: str | None = None
    # Prioridad numérica DE ORIGEN (orders.priority, la que trae el pedido de EFLOW
    # o la que escribió una corrida previa). La usan las compañías que NO se priorizan
    # en el OMS (p. ej. EPA: `priorizar=false`): el OMS conserva esta prioridad y solo
    # hace la liberación por fecha, sin recalcularla. None = aún sin prioridad.
    priority: int | None = None

    @property
    def pk(self) -> "PedidoPK":
        return PedidoPK(self.id_almacen, self.id_compania, self.id_sucursal, self.id_expedicion)


@dataclass(frozen=True)
class PedidoPK:
    """PK compuesta de EXPEDICIONESCABECERA = clave de idempotencia del handoff."""

    id_almacen: str
    id_compania: str
    id_sucursal: str
    id_expedicion: str


@dataclass(frozen=True)
class ResultadoRegla:
    """Salida de una regla individual del motor.

    - puntos: contribución (sin ponderar) de la regla al score. Convención del
      esqueleto: MÁS puntos = MÁS urgente. El MotorReglasOMS pondera por el peso
      configurado de la regla y luego invierte a prioridad numérica.
    - cliente_retira: señal booleana (la pone AnalizadorObservaciones); dispara el
      efecto de prioridad máxima + viaje/cliente dummy (US12/US13), fuera del score.
    - detalle: motivo legible, para auditoría (por qué la regla puntuó así).
    """

    regla: str
    puntos: float
    cliente_retira: bool = False
    detalle: str = ""


@dataclass(frozen=True)
class RegistroPrioridad:
    """Resultado del motor para UN pedido: score, prioridad numérica y trazas.

    - prioridad: entero numérico invertido (menor = más urgente) que se escribe al
      WMS y a la tabla del OMS.
    - score: puntaje ponderado agregado (mayor score → menor número de prioridad).
    - resultados: las trazas de cada regla, para auditoría.
    """

    pk: PedidoPK
    prioridad: int
    score: float
    cliente_retira: bool
    resultados: tuple[ResultadoRegla, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class PedidoOMS:
    """Resultado del OMS para un pedido de public.orders (escritura 1 del handoff).

    Superficie de handoff que lee Planificación (NO el WMS). Ya no es una tabla
    propia (`oms.pedidos` quedó descartada el 2026-10-16): son columnas de
    orders, ubicada por la llave EFLOW (uq_order_eflow_key, sql/43).

    - estado_handoff: estado de las DOS escrituras (D6). 'disparo_pendiente'
      cuando la escritura 1 (esta tabla) ya ocurrió pero la escritura 2 (WMS
      TPEXSI='GENE') aún no se confirmó — permite reconciliar sin 2PC.
    - situacion: 'GENE' (orders.wms_situation; lo que Planificación espera leer).
    """

    id_almacen: str
    id_compania: str
    id_sucursal: str
    id_expedicion: str
    prioridad: int
    status: str
    situacion: str
    estado_handoff: str
    corrida: str
    peso_total: float | None = None
    cubicaje_total: float | None = None


# --- Configuración por scope (parámetros del motor) ---------------------------

NIVELES_SCOPE: tuple[str, ...] = ("CUSTOMER", "WAREHOUSE", "COUNTRY", "GLOBAL")


# Default de duración logística (días) cuando orders.lead_time_days viene NULL.
# Caso Cofersa (contrato v4): el pedido no trae lead time → el OMS asume 1 día (T-1).
LEAD_TIME_DEFAULT_DIAS = 1

# Frecuencia del barrido de priorización/liberación (ADR-013, v1). El negocio pidió
# 5 corridas/día; la hora de corte y la frecuencia por compañía son parámetro A FUTURO.
# Es documentación de intención: el schedule (EventBridge) se cablea en
# infrastructure-design (DIFERIDA); aquí NO hay scheduler.
BARRIDO_VECES_POR_DIA = 5


@dataclass(frozen=True)
class ConfiguracionReglas:
    """Parámetros del motor resueltos por scope (CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL).

    En el esqueleto estos valores vienen de defaults/stub; en vivo saldrán de la
    config editable por compañía (CatalogoReglas, componente diferido).

    - pesos: peso de cada regla en el score ponderado (nombre_regla → peso).
    - prioridad_cliente_retira: prioridad numérica a asignar al caso cliente-retira.
    - dias_prep_picking: días de prep de picking que la pasada de liberación de
      ADR-013 resta a `dispatch_date` para abrir la ventana de liberación
      (`now() >= dispatch_date − dias_prep_picking`). Default 1 (política del OMS);
      parametrizable por compañía a futuro.
    - priorizar: si la compañía se prioriza en el OMS. False = el pedido YA viene
      priorizado (p. ej. EPA trae su propia prioridad de EFLOW): el barrido NO
      recalcula ni sobrescribe `orders.priority`, solo hace la liberación por fecha.
    - escala_prioridad: tope de la escala de prioridad numérica de la compañía
      (menor = más urgente). Cofersa = 5 → prioridades 1..5. El submódulo `score`
      mapea el score ponderado a [1, escala_prioridad]. Default 100 (escala amplia,
      retrocompatible con el esqueleto). Parámetro editable por compañía (scope).

    NOTA (contrato v4): la duración logística del T-1 ya NO es un parámetro estático
    de config — ahora se lee de `orders.lead_time_days` por pedido (dinámico, lo
    calcula Planificación). La regla de fecha aplica LEAD_TIME_DEFAULT_DIAS cuando
    viene NULL. El viejo flag `escribir_prioridad_al_wms` también desapareció: la
    escritura 2 del handoff ahora va detrás de una interface/costura intercambiable
    (ver EscritorSituacion en handoff_pedidos), no detrás de un flag.
    """

    pesos: dict[str, float]
    prioridad_cliente_retira: int = 1
    dias_prep_picking: int = 1
    priorizar: bool = True
    escala_prioridad: int = 100
