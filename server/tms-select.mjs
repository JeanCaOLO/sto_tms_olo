import { q, assertColumn, tableColumns, findForeignKey, HttpError } from "./tms-schema.mjs";

// Parser del mini-lenguaje de `select` estilo PostgREST/Supabase:
//   "*, role:roles(id, name)"  ->  [{name:'*', isStar:true}, {alias:'role', name:'roles', children:[...]}]
// Cada nodo con `children` es un embed (belongs-to, vía FK) y se resuelve
// recursivamente como subquery -> jsonb.
export function parseSelect(input) {
  const s = String(input || "*").replace(/\s+/g, "");
  let i = 0;

  function readIdent() {
    const start = i;
    while (i < s.length && /[A-Za-z0-9_*]/.test(s[i])) i++;
    if (start === i) throw new HttpError(400, `select mal formado cerca de la posición ${i}: "${s}"`);
    return s.slice(start, i);
  }

  function parseItem() {
    const ident = readIdent();
    let alias = null;
    let name = ident;
    if (s[i] === ":") {
      i++;
      alias = ident;
      name = readIdent();
    }
    let children = null;
    if (s[i] === "(") {
      i++;
      children = parseList();
      if (s[i] !== ")") throw new HttpError(400, `select mal formado: falta ")" en "${s}"`);
      i++;
    }
    return { alias: alias || name, name, isStar: name === "*", children };
  }

  function parseList() {
    const nodes = [parseItem()];
    while (s[i] === ",") {
      i++;
      nodes.push(parseItem());
    }
    return nodes;
  }

  const nodes = parseList();
  if (i !== s.length) throw new HttpError(400, `select mal formado, sobra "${s.slice(i)}"`);
  return nodes;
}

let embedCounter = 0;
function nextEmbedAlias() {
  return `e${embedCounter++}`;
}

const STAR_NODE = { alias: "*", name: "*", isStar: true, children: null };

// Construye la lista de columnas del SELECT para `table` (aliasado `alias`)
// a partir del AST de parseSelect. Los embeds se resuelven como subqueries
// jsonb correlacionadas por la FK real del esquema (server/tms-relations.mjs).
export function buildFieldList(table, nodes, alias) {
  const parts = [];
  for (const node of nodes) {
    if (node.isStar) {
      parts.push(`${alias}.*`);
      continue;
    }
    if (!node.children) {
      assertColumn(table, node.name);
      parts.push(`${alias}.${q(node.name)} AS ${q(node.alias)}`);
      continue;
    }
    // Embed: node.name es la tabla "padre"; `table` (hija) tiene la FK.
    const fkColumn = findForeignKey(table, node.name);
    tableColumns(node.name); // valida que la tabla embebida existe
    const subAlias = nextEmbedAlias();
    const childNodes = node.children.length ? node.children : [STAR_NODE];
    const innerFields = buildFieldList(node.name, childNodes, subAlias);
    parts.push(
      `(SELECT to_jsonb(${subAlias}) FROM (SELECT ${innerFields.join(", ")} ` +
        `FROM ${q(node.name)} ${subAlias} WHERE ${subAlias}.${q("id")} = ${alias}.${q(fkColumn)}) ${subAlias}) AS ${q(node.alias)}`
    );
  }
  return parts;
}

const FILTER_OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };

// filters: array de [columna, operador, valor]. operador en eq/neq/gt/gte/lt/lte/in/is.
export function buildWhereClause(table, alias, filters, startParamIndex = 1) {
  const prefix = alias ? `${alias}.` : "";
  const clauses = [];
  const params = [];
  let n = startParamIndex;
  for (const [column, op, value] of filters || []) {
    assertColumn(table, column);
    if (op === "is") {
      if (value !== null) throw new HttpError(400, `operador "is" sólo soporta null`);
      clauses.push(`${prefix}${q(column)} IS NULL`);
    } else if (op === "in") {
      if (!Array.isArray(value) || value.length === 0) {
        clauses.push("FALSE"); // .in([]) no matchea nada, como en PostgREST
      } else {
        const placeholders = value.map((v) => {
          params.push(v);
          return `$${n++}`;
        });
        clauses.push(`${prefix}${q(column)} IN (${placeholders.join(",")})`);
      }
    } else if (FILTER_OPS[op]) {
      params.push(value);
      clauses.push(`${prefix}${q(column)} ${FILTER_OPS[op]} $${n++}`);
    } else {
      throw new HttpError(400, `operador no soportado: "${op}"`);
    }
  }
  return { clause: clauses.join(" AND "), params };
}

export function buildListQuery({ table, select, filters, order, limit }) {
  embedCounter = 0;
  const alias = "t";
  const nodes = parseSelect(select);
  const fields = buildFieldList(table, nodes, alias);
  const { clause, params } = buildWhereClause(table, alias, filters, 1);

  let sql = `SELECT ${fields.join(", ")} FROM ${q(table)} ${alias}`;
  if (clause) sql += ` WHERE ${clause}`;
  if (order?.column) {
    assertColumn(table, order.column);
    sql += ` ORDER BY ${alias}.${q(order.column)} ${order.ascending === false ? "DESC" : "ASC"}`;
  }
  if (limit != null) {
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 0) throw new HttpError(400, "limit inválido");
    sql += ` LIMIT ${n}`;
  }
  return { sql, params };
}

export function buildCountQuery({ table, filters }) {
  const alias = "t";
  const { clause, params } = buildWhereClause(table, alias, filters, 1);
  let sql = `SELECT count(*)::int AS count FROM ${q(table)} ${alias}`;
  if (clause) sql += ` WHERE ${clause}`;
  return { sql, params };
}
