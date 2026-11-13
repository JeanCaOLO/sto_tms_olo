"""Validaciones de negocio que también deben cumplir las escrituras genéricas del tarifador."""
from tms_common.errors import HttpError

MARKS_TABLE = "tarifas_trip_order_marks"
MARKS = ("ANULADO", "DIFERIDO")
MARK_CONFLICT = "El pedido no existe, está fuera de tu alcance o su marca requiere un motivo válido."


def validate_mark(values: dict, *, creating: bool) -> dict:
    """Normaliza el motivo y valida lo conocido; el UPDATE verifica el estado final en SQL."""
    result = dict(values)
    if creating or "mark" in result:
        if result.get("mark") not in MARKS:
            raise HttpError(400, "La marca debe ser ANULADO o DIFERIDO.")
    if "reason" in result:
        reason = result["reason"]
        if reason is not None and not isinstance(reason, str):
            raise HttpError(400, "El motivo de la marca debe ser texto.")
        result["reason"] = reason.strip() or None if reason is not None else None
    if creating and result.get("mark") == "ANULADO" and not result.get("reason"):
        raise HttpError(400, "Indica por qué se anula el pedido.")
    return result


def mark_guard(fields: dict) -> tuple[str, list]:
    """Comprueba marca/motivo efectivos dentro del UPDATE, incluso en un PATCH de solo motivo."""
    params = []

    def effective(column):
        if column in fields:
            params.append(fields[column])
            return "%s::text"
        return f'"{column}"'

    mark, reason = effective("mark"), effective("reason")
    params.extend([list(MARKS), "ANULADO"])
    return (f"EXISTS (SELECT 1 FROM (VALUES ({mark}, {reason})) AS proposed(mark, reason) "
            "WHERE proposed.mark = ANY(%s::text[]) AND (proposed.mark <> %s::text "
            "OR length(btrim(COALESCE(proposed.reason, ''))) > 0))", params)
