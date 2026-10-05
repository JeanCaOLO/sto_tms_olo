"""Genera el JSON de DEMO de la Cola de Priorización del OMS.

Corre el MOTOR REAL del OMS (backend/oms/src, modo mock) sobre un set de pedidos
de ejemplo y escribe `src/pages/oms/demo/oms_corrida_demo.json`, que el frontend
carga en la tabla de la Cola de Priorización (con VITE_OMS_DEMO=1).

Honesto: prioridades = salida REAL del motor; entrada = pedidos mock (no WMS en vivo).

Nombres de campo:
- Bloque "wms": nombres REALES de columnas de EXPEDICIONESCABECERA (DDL real,
  docs/wms-eflow/EFLOW_OLO-ddl.sql).
- Bloque "oms": nombres del modelo del motor (RegistroPrioridad) + el código real
  de situación resultante (TPEXSI='GENE').

Uso:  python backend/oms/demo_export.py
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime

# El motor usa imports planos (import regla_fecha, etc.): poner src/ en el path.
_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
sys.path.insert(0, _SRC)

import handoff_pedidos  # noqa: E402
import motor_reglas  # noqa: E402
from models import PedidoCandidato  # noqa: E402

HOY = date(2026, 10, 1)
CORRIDA = "oms-2026-10-01-demo"

# Pedidos de ejemplo con nombres REALES de columnas del WMS (EXPEDICIONESCABECERA).
# IDs como string (varchar en el DDL real). Fechas relativas a HOY=2026-10-01 para
# que la regla T-1 (duracion_ruta_dias=1) produzca prioridades variadas.
#
# Convenciones (corregidas 2026-10-02):
# - IDCOMPANIA: 0109 = Cofersa, 0029 = EPA (EPA/Cofersa son COMPANIAS, no clientes).
# - IDCLIENTE/NOMBRECLIENTE: cliente real del pedido (ferreteria/comercio), NO la compania.
# - RUTA: solo la ZONA (p. ej. "Zona 3"); la UI muestra esta columna como "Zona".
# - FECHAEXPEDICIONPLANIFICADA: datetime NOT NULL -> SIEMPRE con fecha+hora (nunca
#   centinela 1900 ni null; el cliente/WMS siempre la envia).
# - FECHACREACION: datetime de creacion del registro en el WMS (columna real del DDL).
WMS_DEMO: list[dict] = [
    {"IDALMACEN": "0001", "IDCOMPANIA": "0109", "IDSUCURSAL": "001", "IDEXPEDICION": "EXP-1001",
     "IDCLIENTE": "CLI-00231", "NOMBRECLIENTE": "Ferreteria El Mango", "RUTA": "Zona 3", "TPEXPE": "VTA",
     "TPEXES": "DISP", "TPEXSI": "DISP", "FECHAEXPEDICIONPLANIFICADA": "2026-10-02T14:30:00",
     "FECHACREACION": "2026-09-28T09:15:00",
     "FECHACIERRE": None, "NUMEROVIAJEWMH": None, "OBSERVACIONESEXPEDICION": "Entregar en recepcion",
     "PESOPEDIDO_TOTAL": 120.5, "CUBICAJEPEDIDO_TOTAL": 1.2, "COSTO_TOTAL": 48000.0, "PAIS": "CR"},

    {"IDALMACEN": "0001", "IDCOMPANIA": "0029", "IDSUCURSAL": "001", "IDEXPEDICION": "EXP-1002",
     "IDCLIENTE": "CLI-00488", "NOMBRECLIENTE": "Construcciones Vega", "RUTA": "Zona 12", "TPEXPE": "VTA",
     "TPEXES": "DISP", "TPEXSI": "DISP", "FECHAEXPEDICIONPLANIFICADA": "2026-10-03T10:00:00",
     "FECHACREACION": "2026-09-29T08:40:00",
     "FECHACIERRE": None, "NUMEROVIAJEWMH": None, "OBSERVACIONESEXPEDICION": "",
     "PESOPEDIDO_TOTAL": 80.0, "CUBICAJEPEDIDO_TOTAL": 0.8, "COSTO_TOTAL": 15200.0, "PAIS": "CR"},

    {"IDALMACEN": "0002", "IDCOMPANIA": "0109", "IDSUCURSAL": "001", "IDEXPEDICION": "EXP-1003",
     "IDCLIENTE": "CLI-00102", "NOMBRECLIENTE": "Deposito Los Andes", "RUTA": "Zona 7", "TPEXPE": "VTA",
     "TPEXES": "DISP", "TPEXSI": "DISP", "FECHAEXPEDICIONPLANIFICADA": "2026-10-05T16:00:00",
     "FECHACREACION": "2026-09-27T11:20:00",
     "FECHACIERRE": None, "NUMEROVIAJEWMH": None, "OBSERVACIONESEXPEDICION": "Revisar direccion",
     "PESOPEDIDO_TOTAL": None, "CUBICAJEPEDIDO_TOTAL": None, "COSTO_TOTAL": 9800.0, "PAIS": "CR"},

    {"IDALMACEN": "0001", "IDCOMPANIA": "0029", "IDSUCURSAL": "001", "IDEXPEDICION": "EXP-1004",
     "IDCLIENTE": "CLI-00517", "NOMBRECLIENTE": "Ferreteria Santa Ana", "RUTA": "Zona 20", "TPEXPE": "VTA",
     "TPEXES": "DISP", "TPEXSI": "DISP", "FECHAEXPEDICIONPLANIFICADA": "2026-10-08T09:30:00",
     "FECHACREACION": "2026-09-30T14:05:00",
     "FECHACIERRE": None, "NUMEROVIAJEWMH": None, "OBSERVACIONESEXPEDICION": "",
     "PESOPEDIDO_TOTAL": 210.0, "CUBICAJEPEDIDO_TOTAL": 2.4, "COSTO_TOTAL": 30500.0, "PAIS": "CR"},

    {"IDALMACEN": "0002", "IDCOMPANIA": "0109", "IDSUCURSAL": "001", "IDEXPEDICION": "EXP-1005",
     "IDCLIENTE": "CLI-00076", "NOMBRECLIENTE": "Materiales Perez", "RUTA": "Zona 3", "TPEXPE": "VTA",
     "TPEXES": "DISP", "TPEXSI": "DISP", "FECHAEXPEDICIONPLANIFICADA": "2026-10-12T13:15:00",
     "FECHACREACION": "2026-09-26T10:50:00",
     "FECHACIERRE": None, "NUMEROVIAJEWMH": None, "OBSERVACIONESEXPEDICION": "",
     "PESOPEDIDO_TOTAL": 45.0, "CUBICAJEPEDIDO_TOTAL": 0.5, "COSTO_TOTAL": 5400.0, "PAIS": "CR"},

    {"IDALMACEN": "0001", "IDCOMPANIA": "0109", "IDSUCURSAL": "001", "IDEXPEDICION": "EXP-1006",
     "IDCLIENTE": "CLI-00345", "NOMBRECLIENTE": "Ferreteria La Union", "RUTA": "Zona 9", "TPEXPE": "VTA",
     "TPEXES": "DISP", "TPEXSI": "DISP", "FECHAEXPEDICIONPLANIFICADA": "2026-10-10T08:30:00",
     "FECHACREACION": "2026-09-28T07:55:00",
     "FECHACIERRE": None, "NUMEROVIAJEWMH": None, "OBSERVACIONESEXPEDICION": "",
     "PESOPEDIDO_TOTAL": 95.0, "CUBICAJEPEDIDO_TOTAL": 0.9, "COSTO_TOTAL": 12750.0, "PAIS": "CR"},

    # CLIENTE RETIRA (observacion): prioridad maxima por el analizador.
    {"IDALMACEN": "0001", "IDCOMPANIA": "0029", "IDSUCURSAL": "001", "IDEXPEDICION": "EXP-1007",
     "IDCLIENTE": "CLI-00609", "NOMBRECLIENTE": "Constructora Heredia", "RUTA": "Zona 12", "TPEXPE": "VTA",
     "TPEXES": "DISP", "TPEXSI": "DISP", "FECHAEXPEDICIONPLANIFICADA": "2026-10-06T11:00:00",
     "FECHACREACION": "2026-09-29T15:30:00",
     "FECHACIERRE": None, "NUMEROVIAJEWMH": None, "OBSERVACIONESEXPEDICION": "El cliente retira en bodega el viernes",
     "PESOPEDIDO_TOTAL": 50.0, "CUBICAJEPEDIDO_TOTAL": 0.4, "COSTO_TOTAL": 7100.0, "PAIS": "CR"},

    {"IDALMACEN": "0002", "IDCOMPANIA": "0109", "IDSUCURSAL": "001", "IDEXPEDICION": "EXP-1008",
     "IDCLIENTE": "CLI-00158", "NOMBRECLIENTE": "Almacen El Roble", "RUTA": "Zona 7", "TPEXPE": "VTA",
     "TPEXES": "DISP", "TPEXSI": "DISP", "FECHAEXPEDICIONPLANIFICADA": "2026-10-04T07:45:00",
     "FECHACREACION": "2026-09-25T09:10:00",
     "FECHACIERRE": None, "NUMEROVIAJEWMH": None, "OBSERVACIONESEXPEDICION": "",
     "PESOPEDIDO_TOTAL": 340.0, "CUBICAJEPEDIDO_TOTAL": 3.1, "COSTO_TOTAL": 52900.0, "PAIS": "CR"},

    # CLIENTE RETIRA (otra variante de texto).
    {"IDALMACEN": "0001", "IDCOMPANIA": "0029", "IDSUCURSAL": "001", "IDEXPEDICION": "EXP-1009",
     "IDCLIENTE": "CLI-00422", "NOMBRECLIENTE": "Ferreteria Cartago", "RUTA": "Zona 20", "TPEXPE": "VTA",
     "TPEXES": "DISP", "TPEXSI": "DISP", "FECHAEXPEDICIONPLANIFICADA": "2026-10-02T09:00:00",
     "FECHACREACION": "2026-09-30T08:20:00",
     "FECHACIERRE": None, "NUMEROVIAJEWMH": None, "OBSERVACIONESEXPEDICION": "Pasa a buscar el cliente manana",
     "PESOPEDIDO_TOTAL": 60.0, "CUBICAJEPEDIDO_TOTAL": 0.6, "COSTO_TOTAL": 8300.0, "PAIS": "CR"},

    {"IDALMACEN": "0002", "IDCOMPANIA": "0109", "IDSUCURSAL": "001", "IDEXPEDICION": "EXP-1010",
     "IDCLIENTE": "CLI-00291", "NOMBRECLIENTE": "Distribuidora Guanacaste", "RUTA": "Zona 9", "TPEXPE": "VTA",
     "TPEXES": "DISP", "TPEXSI": "DISP", "FECHAEXPEDICIONPLANIFICADA": "2026-10-09T15:00:00",
     "FECHACREACION": "2026-09-27T13:40:00",
     "FECHACIERRE": None, "NUMEROVIAJEWMH": None, "OBSERVACIONESEXPEDICION": "",
     "PESOPEDIDO_TOTAL": 180.0, "CUBICAJEPEDIDO_TOTAL": 1.8, "COSTO_TOTAL": 24100.0, "PAIS": "CR"},

    {"IDALMACEN": "0001", "IDCOMPANIA": "0029", "IDSUCURSAL": "001", "IDEXPEDICION": "EXP-1011",
     "IDCLIENTE": "CLI-00533", "NOMBRECLIENTE": "Ferreteria San Carlos", "RUTA": "Zona 12", "TPEXPE": "VTA",
     "TPEXES": "DISP", "TPEXSI": "DISP", "FECHAEXPEDICIONPLANIFICADA": "2026-10-04T10:30:00",
     "FECHACREACION": "2026-09-29T09:50:00",
     "FECHACIERRE": None, "NUMEROVIAJEWMH": None, "OBSERVACIONESEXPEDICION": "Urgente, cita 9am",
     "PESOPEDIDO_TOTAL": 70.0, "CUBICAJEPEDIDO_TOTAL": 0.7, "COSTO_TOTAL": 9900.0, "PAIS": "CR"},

    {"IDALMACEN": "0002", "IDCOMPANIA": "0109", "IDSUCURSAL": "001", "IDEXPEDICION": "EXP-1012",
     "IDCLIENTE": "CLI-00187", "NOMBRECLIENTE": "Deposito Pavas", "RUTA": "Zona 3", "TPEXPE": "VTA",
     "TPEXES": "DISP", "TPEXSI": "DISP", "FECHAEXPEDICIONPLANIFICADA": "2026-10-07T12:00:00",
     "FECHACREACION": "2026-09-28T16:25:00",
     "FECHACIERRE": None, "NUMEROVIAJEWMH": None, "OBSERVACIONESEXPEDICION": "",
     "PESOPEDIDO_TOTAL": 130.0, "CUBICAJEPEDIDO_TOTAL": 1.3, "COSTO_TOTAL": 18600.0, "PAIS": "CR"},
]


def _to_candidato(w: dict) -> PedidoCandidato:
    return PedidoCandidato(
        id_almacen=w["IDALMACEN"], id_compania=w["IDCOMPANIA"], id_sucursal=w["IDSUCURSAL"],
        id_expedicion=w["IDEXPEDICION"],
        fecha_expedicion_planificada=datetime.fromisoformat(w["FECHAEXPEDICIONPLANIFICADA"]),
        observaciones=w.get("OBSERVACIONESEXPEDICION"),
        peso_total=w.get("PESOPEDIDO_TOTAL"), cubicaje_total=w.get("CUBICAJEPEDIDO_TOTAL"),
        country_id=w.get("PAIS"), warehouse_id=w["IDALMACEN"], customer_id=w.get("IDCLIENTE"),
    )


def build() -> dict:
    pedidos = [_to_candidato(w) for w in WMS_DEMO]
    registros = motor_reglas.priorizar(pedidos, motor_reglas.config_por_defecto, hoy=HOY)

    out = []
    for w, ped, reg in zip(WMS_DEMO, pedidos, registros):
        config = motor_reglas.config_por_defecto(ped)
        estado = handoff_pedidos.ejecutar(ped, reg, config, CORRIDA)
        completado = estado == handoff_pedidos.ESTADO_COMPLETADO
        out.append({
            "wms": w,
            "oms": {
                "prioridad": reg.prioridad,            # numerica invertida (menor = mas urgente)
                "score": reg.score,
                "cliente_retira": reg.cliente_retira,
                "estado_handoff": estado,
                "TPEXES_resultante": "DISP",           # el estado NO cambia
                "TPEXSI_resultante": "GENE" if completado else "DISP",  # situacion -> generada
                "situacion": "generada" if completado else "disponible",
                "reglas": [
                    {"regla": r.regla, "puntos": r.puntos, "detalle": r.detalle}
                    for r in reg.resultados
                ],
            },
        })

    return {
        "generado_por": "backend/oms/demo_export.py (motor real del OMS, modo mock)",
        "corrida": CORRIDA,
        "hoy": HOY.isoformat(),
        "nota": "Prioridades = salida real del motor; entrada = pedidos de ejemplo (no WMS en vivo).",
        "total": len(out),
        "pedidos": out,
    }


def main() -> None:
    doc = build()
    dest = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "..",
        "src", "pages", "oms", "demo", "oms_corrida_demo.json",
    )
    dest = os.path.normpath(dest)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
    print(f"OK: {doc['total']} pedidos priorizados -> {dest}")


if __name__ == "__main__":
    main()
