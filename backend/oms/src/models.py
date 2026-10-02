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
from datetime import date, datetime


@dataclass(frozen=True)
class PedidoCandidato:
    """Proyección de LECTURA de un pedido de EFLOW/WMS (EXPEDICIONESCABECERA).

    Es lo que `ColaCandidatos` devuelve: la cola de pedidos elegibles para
    priorizar. Clave de negocio = la PK compuesta de EXPEDICIONESCABECERA, que
    es también la clave de idempotencia del handoff.

    Campos tomados del DDL real (docs/wms-eflow/EFLOW_OLO-ddl.sql):
    - id_almacen/id_compania/id_sucursal/id_expedicion: PK compuesta.
    - fecha_expedicion_planificada: datetime NOT NULL. Fecha de ENTREGA que manda
      el cliente. Insumo del T-1; el OMS NO la modifica.
    - observaciones: OBSERVACIONESEXPEDICION varchar(500), texto libre (nivel
      cabecera) que lee AnalizadorObservaciones.
    - peso_total/cubicaje_total: PESOPEDIDO_TOTAL/CUBICAJEPEDIDO_TOTAL float NULL
      (OQ-8: pueden venir null; null = desconocido, nunca 0).
    - country_id/warehouse_id/customer_id: la cadena de scope del pedido, para
      resolver qué reglas aplican. Pueden faltar hasta cablear el maestro de
      compañía (TODO catálogos CLIENTES/ALMACENCOMPANIA).
    """

    id_almacen: int
    id_compania: int
    id_sucursal: int
    id_expedicion: int
    fecha_expedicion_planificada: datetime
    observaciones: str | None = None
    peso_total: float | None = None
    cubicaje_total: float | None = None
    country_id: str | None = None
    warehouse_id: str | None = None
    customer_id: str | None = None

    @property
    def pk(self) -> "PedidoPK":
        return PedidoPK(self.id_almacen, self.id_compania, self.id_sucursal, self.id_expedicion)


@dataclass(frozen=True)
class PedidoPK:
    """PK compuesta de EXPEDICIONESCABECERA = clave de idempotencia del handoff."""

    id_almacen: int
    id_compania: int
    id_sucursal: int
    id_expedicion: int


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
    """Fila de la tabla PROPIA del OMS (U2: esquema PedidosOMS, Aurora).

    Superficie de handoff que lee Planificación (NO el WMS). Escritura 1 del
    HandoffPedidosOMS. Ver sql/oms_pedidos.sql para el DDL.

    - estado_handoff: estado de las DOS escrituras (D6). 'disparo_pendiente'
      cuando la escritura 1 (esta tabla) ya ocurrió pero la escritura 2 (WMS
      TPEXSI='GENE') aún no se confirmó — permite reconciliar sin 2PC.
    - situacion: 'generada' (lo que Planificación espera leer).
    """

    id_almacen: int
    id_compania: int
    id_sucursal: int
    id_expedicion: int
    prioridad: int
    status: str
    situacion: str
    estado_handoff: str
    corrida: str
    peso_total: float | None = None
    cubicaje_total: float | None = None


# --- Configuración por scope (parámetros del motor) ---------------------------

NIVELES_SCOPE: tuple[str, ...] = ("CUSTOMER", "WAREHOUSE", "COUNTRY", "GLOBAL")


@dataclass(frozen=True)
class ConfiguracionReglas:
    """Parámetros del motor resueltos por scope (CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL).

    En el esqueleto estos valores vienen de defaults/stub; en vivo saldrán de la
    config editable por compañía (CatalogoReglas, componente diferido).

    - pesos: peso de cada regla en el score ponderado (nombre_regla → peso).
    - duracion_ruta_dias: días estimados de ruta, para ajustar el T-1 por scope.
    - prioridad_cliente_retira: prioridad numérica a asignar al caso cliente-retira.
    - escribir_prioridad_al_wms: FLAG parametrizable (D6). Si la PRIORIDAD se
      escribe también en el WMS o solo en la tabla del OMS está POR CONFIRMAR.
    """

    pesos: dict[str, float]
    duracion_ruta_dias: int = 1
    prioridad_cliente_retira: int = 1
    escribir_prioridad_al_wms: bool = False  # TODO(confirmar negocio): ver HandoffPedidosOMS
