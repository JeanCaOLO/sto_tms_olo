"""Edición de contenido de proforma bajo el mismo bloqueo que sus decisiones de fase."""
from decimal import Decimal, InvalidOperation

from tms_common.errors import HttpError

ITEMS = "tarifas_proforma_items"
PARENTS = "tarifas_proformas"
PHASES = "tarifas_proforma_phases"
PARENT_MUTABLE = frozenset({"total_amount", "email_sent_at", "notes", "updated_at"})
EDIT_CONFLICT = "La proforma ya tiene fases decididas: no se pueden cambiar sus liquidaciones."
LOCK_PARENT_SQL = "SELECT id, country_id, carrier_id, status FROM tbl_tarifas_proformas WHERE id = %s FOR UPDATE"
RECALCULATE_SQL = """UPDATE tbl_tarifas_proformas SET total_amount = (
    SELECT COALESCE(SUM(amount), 0) FROM tbl_tarifas_proforma_items
    WHERE proforma_id = %s AND state <> 'excluded'), updated_at = now()
WHERE id = %s RETURNING *"""
SYNC_SETTLEMENTS_SQL = """UPDATE tbl_tarifas_settlements SET status = %s, updated_at = now()
WHERE id = ANY(%s::text[]) AND status IN ('Borrador', 'En Revisión') AND superseded_by IS NULL RETURNING id"""


def validate_item(values: dict, *, creating: bool) -> None:
    if not creating:
        frozen = sorted(set(values) - {"id", "state", "exclusion_reason"})
        if frozen:
            raise HttpError(403, "Un ítem de proforma es inmutable: no se puede modificar " + ", ".join(frozen) + ".")
    if creating or "state" in values:
        if values.get("state") not in ("included", "excluded"):
            raise HttpError(400, "El estado del ítem debe ser included o excluded.")
    if "exclusion_reason" in values and values["exclusion_reason"] is not None and not isinstance(values["exclusion_reason"], str):
        raise HttpError(400, "El motivo de exclusión debe ser texto.")
    if values.get("state") == "excluded" and (creating or "exclusion_reason" in values):
        if not (values.get("exclusion_reason") or "").strip():
            raise HttpError(400, "Indica por qué se excluye la liquidación.")
    if creating and (not values.get("proforma_id") or not values.get("settlement_id")):
        raise HttpError(400, "El ítem requiere proforma y liquidación.")


def handles(table: str) -> bool:
    return table in (ITEMS, PARENTS, PHASES)


class ContentChanges:
    def __init__(self, run, caller):
        self.run, self.caller = run, caller
        self.touched = set()
        # Los locks viven hasta COMMIT. La API no permite cambiar identidad/estado del padre
        # ni decidir fases dentro de estas operaciones; las nuevas fases solo son pendientes.
        self.parents = {}
        self.editable = set()
        self.settlement_states = {}

    def _parent(self, parent_id, *, editable):
        if parent_id not in self.parents:
            rows = self.run(LOCK_PARENT_SQL, [parent_id])
            allowed = self.caller.country_filter
            if not rows or (allowed is not None and str(rows[0]["country_id"]) not in allowed):
                raise HttpError(404, "Proforma no encontrada.")
            self.parents[parent_id] = rows[0]
        parent = self.parents[parent_id]
        if editable and parent_id not in self.editable:
            phases = self.run("SELECT state FROM tbl_tarifas_proforma_phases WHERE proforma_id = %s", [parent_id])
            if parent["status"] not in ("Borrador", "En Revisión") or any(
                    phase["state"] not in ("pendiente", "omitida") for phase in phases):
                raise HttpError(409, EDIT_CONFLICT)
            self.editable.add(parent_id)
        return parent

    def _item(self, kind, values, row_id, settlements=None):
        if kind == "insert":
            current = values
        else:
            rows = self.run("SELECT * FROM tbl_tarifas_proforma_items WHERE id = %s", [row_id])
            if not rows:
                raise HttpError(404, "Liquidación de proforma no encontrada.")
            current = {**rows[0], **{k: v for k, v in values.items() if k != "id"}}
        parent_id = current["proforma_id"]
        parent = self._parent(parent_id, editable=True)
        if kind != "insert":
            # La lectura anterior solo localiza el padre inmutable. Otra edición pudo terminar
            # mientras se esperaba su lock: validar el estado efectivo con una sentencia nueva.
            rows = self.run("SELECT * FROM tbl_tarifas_proforma_items WHERE id = %s", [row_id])
            if not rows:
                raise HttpError(404, "Liquidación de proforma no encontrada.")
            current = {**rows[0], **{k: v for k, v in values.items() if k != "id"}}
        if current["state"] not in ("included", "excluded"):
            raise HttpError(400, "El estado del ítem debe ser included o excluded.")
        if current["state"] == "excluded" and not (current.get("exclusion_reason") or "").strip():
            raise HttpError(400, "Indica por qué se excluye la liquidación.")
        if kind == "insert":
            if settlements is None:
                rows = self.run("SELECT id, total_amount, country_id, carrier_id FROM tbl_tarifas_settlements WHERE id = %s",
                                [current["settlement_id"]])
            else:
                rows = [settlements[current["settlement_id"]]] if current["settlement_id"] in settlements else []
            try:
                amount = Decimal(str(current.get("amount")))
                matches = rows and amount.is_finite() and amount == Decimal(str(rows[0]["total_amount"]))
            except (InvalidOperation, ValueError):
                matches = False
            if not matches or str(rows[0]["country_id"]) != str(parent["country_id"]) or str(rows[0]["carrier_id"]) != str(parent["carrier_id"]):
                raise HttpError(409, "El importe, país y transportista del ítem deben coincidir con su liquidación y proforma.")
        self.touched.add(parent_id)
        self.settlement_states[current["settlement_id"]] = "En Revisión" if current["state"] == "included" else "Borrador"

    def before(self, op):
        table, kind = op["table"], op["op"]
        if not handles(table):
            return
        values = op.get("values") or {}
        if table == ITEMS:
            settlements = None
            if kind == "insert_many":
                ids = list(dict.fromkeys(row["settlement_id"] for row in op["rows"]))
                found = self.run("SELECT id, total_amount, country_id, carrier_id FROM tbl_tarifas_settlements "
                                 "WHERE id = ANY(%s::text[])", [ids])
                settlements = {str(row["id"]): row for row in found}
            for row in op["rows"] if kind == "insert_many" else [values]:
                self._item("insert" if kind == "insert_many" else kind, row, op.get("id"), settlements)
        elif table == PARENTS and kind == "update":
            self._parent(op["id"], editable=False)
        elif table == PHASES and kind in ("insert", "insert_many"):
            for row in op["rows"] if kind == "insert_many" else [values]:
                if row.get("state", "pendiente") != "pendiente":
                    raise HttpError(405, "Las fases se crean pendientes; se deciden con la decisión de la proforma.")
                self._parent(row.get("proforma_id"), editable=True)

    def finish(self):
        for parent_id in sorted(self.touched):
            rows = self.run("SELECT COUNT(*)::int AS included_count FROM tbl_tarifas_proforma_items "
                            "WHERE proforma_id = %s AND state = 'included'", [parent_id])
            if not rows or rows[0]["included_count"] == 0:
                raise HttpError(409, "La proforma debe conservar al menos una liquidación. Para descartarla, anúlala.")
        for state in ("Borrador", "En Revisión"):
            ids = sorted(row_id for row_id, target in self.settlement_states.items() if target == state)
            if ids and len(self.run(SYNC_SETTLEMENTS_SQL, [state, ids])) != len(ids):
                raise HttpError(409, "Una liquidación cambió de estado o fue reemplazada; actualiza la proforma.")
        for parent_id in sorted(self.touched):
            self.run(RECALCULATE_SQL, [parent_id, parent_id])
