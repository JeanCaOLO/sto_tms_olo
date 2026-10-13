// Ids generados en el cliente.
//
// Dentro de `db().transaction` el driver HTTP no hace la llamada: acumula la operación y devuelve lo
// ENVIADO, no la fila que guarda el servidor. Quien necesite el id de una fila recién insertada en una
// transacción tiene que generarlo antes de insertar (si no, queda `undefined`).

/** Mismo formato que el id del backend (`tarifas_sql.new_id`): `<prefijo>_<ms en base 36>_<6 hex>`. */
export function newId(prefix: string): string {
  const random = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}
