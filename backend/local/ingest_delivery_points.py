"""Carga puntos de entrega de un cliente desde un CSV del WMS a Aurora.

Por cada fila: cliente final (final_customers, por código externo) + dirección
(addresses, con coordenadas solo si son válidas) + punto de entrega
(delivery_points, por defecto, con zona/ruta). Idempotente: una segunda
corrida actualiza en vez de duplicar. Los clientes finales que ya existían
conservan su nombre.

Trabaja EN BLOQUE (tabla temporal + unas pocas sentencias): fila por fila son
miles de viajes por el túnel SSM y tarda más de 10 minutos.

    python backend/local/ingest_delivery_points.py --csv <archivo> --customer COFERSA            (simulación)
    python backend/local/ingest_delivery_points.py --csv <archivo> --customer COFERSA --execute  (aplica)

Lee la conexión de .env.local y requiere el túnel a Aurora (scripts/tunel-aurora.ps1).
"""

import argparse
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND / "common-services" / "layers" / "tms_common"))

from serve import load_env_files  # noqa: E402

load_env_files()

from tms_common import audit, pg  # noqa: E402

from delivery_points_csv import DeliveryPointRow, read_rows  # noqa: E402
from ingest_delivery_points_sql import (CREATE_STAGE_SQL, CUSTOMER_SQL, INSERT_FINAL_CUSTOMERS_SQL,  # noqa: E402
                                        INSERT_POINTS_SQL, REPORT_SQL, STAGE_COLUMNS, UPDATE_ADDRESSES_SQL,
                                        UPDATE_POINTS_SQL)

BATCH_SIZE = 400


def _stage_values(row: DeliveryPointRow) -> list:
    return [row.code, row.name, row.wms_zone_code, row.route_code, row.zone_code,
            row.latitude, row.longitude, row.geocoding_status]


def load_stage(run: pg.Runner, rows: list[DeliveryPointRow]) -> None:
    run(CREATE_STAGE_SQL)
    placeholders = "(" + ",".join(["%s"] * len(STAGE_COLUMNS)) + ")"
    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start:start + BATCH_SIZE]
        values = ", ".join([placeholders] * len(batch))
        params = [value for row in batch for value in _stage_values(row)]
        run(f"INSERT INTO stage_points ({', '.join(STAGE_COLUMNS)}) VALUES {values}", params)


def ingest(run: pg.Runner, customer_code: str, rows: list[DeliveryPointRow]) -> dict:
    customer = run(CUSTOMER_SQL, [customer_code])
    if not customer:
        raise SystemExit(f'No existe el cliente "{customer_code}" en customers.')
    customer_id, country_id = str(customer[0]["id"]), str(customer[0]["country_id"])
    load_stage(run, rows)
    new_final_customers = len(run(INSERT_FINAL_CUSTOMERS_SQL, [customer_id]))
    updated_addresses = len(run(UPDATE_ADDRESSES_SQL, [customer_id]))
    updated_points = len(run(UPDATE_POINTS_SQL, [country_id, customer_id]))
    new_points = len(run(INSERT_POINTS_SQL, [customer_id, country_id, country_id]))
    report = {"filas del CSV": len(rows), "clientes finales nuevos": new_final_customers,
              "puntos nuevos": new_points, "puntos actualizados": updated_points,
              "direcciones actualizadas": updated_addresses}
    for item in run(REPORT_SQL, [country_id]):
        report[item["label"]] = item["total"]
    return report


class DryRun(Exception):
    """Fuerza el ROLLBACK de la transacción en modo simulación."""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--customer", required=True, help="customers.code, ej. COFERSA")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    rows = read_rows(args.csv)
    report: dict = {}
    # Acción automática: en audit.events queda como `system` con este origen (sql/16).
    pg.query(audit.SET_ACTOR_SQL, [json.dumps({"type": "system", "source": f"ingest_delivery_points {args.customer}"})])
    try:
        with pg.transaction() as run:
            report = ingest(run, args.customer, rows)
            if not args.execute:
                raise DryRun()
    except DryRun:
        print("SIMULACIÓN (ROLLBACK, sin cambios):")
    else:
        print("APLICADO:")
    for key, value in report.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
