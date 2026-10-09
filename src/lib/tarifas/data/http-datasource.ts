// Barrel que re-exporta desde los módulos de la carpeta data/http/.
//
// Driver HTTP: la misma interfaz `DataSource`, contra la API del tarifador sobre Aurora
// (`backend/tarifas/`, Lambda Python).
//
// Contrato (lo implementa `backend/tarifas/src/app.py`):
//
//   GET    {base}/tarifas/{table}?q={json}   -> Row[]      q = { where, orderBy, limit, offset, columns, after }
//   POST   {base}/tarifas/{table}/find       -> Row[]      body = q (consultas largas que no caben en la URL)
//   POST   {base}/tarifas/batch              -> Row[][]    body = { queries: [{ table, q }] }, varias lecturas en una
//   GET    {base}/tarifas/{table}/{id}       -> Row | 404
//   POST   {base}/tarifas/{table}            -> Row        body = la fila
//   PATCH  {base}/tarifas/{table}/{id}       -> Row        body = campos a mezclar
//   DELETE {base}/tarifas/{table}/{id}       -> 204
//   POST   {base}/tarifas/tx                 -> unknown[]  body = { ops: [...] }, todo o nada
//
// Errores: 404 = no existe · 405 = escritura sobre una entidad externa (solo lectura) ·
// 409 = integridad, con `code` '23503' (FK) o '23505' (unicidad) en el cuerpo.
//
// Robustez del cliente: cada llamada tiene un tiempo máximo (`timeoutMs`) y las LECTURAS se reintentan
// ante un corte de red, un timeout o un 502/503/504 (el arranque en frío de un Lambda o un cluster que
// recién despierta lo provocan). Las escrituras NO se reintentan: repetirlas podría duplicarlas.
//
// `/batch` y `/find` los agregó esta versión; si el backend desplegado todavía no los tiene (404), el
// cliente lo recuerda y vuelve a las lecturas sueltas, así el frontend puede salir antes que la API.
//
// `{table}` es `EntityDef.table` del registro de esquema, y el backend lo valida contra el
// manifiesto generado desde ese mismo registro (`npm run tarifas:manifest`) — no hay dos listas de
// nombres que mantener. Las entidades externas se leen igual que las propias (pasan por esta capa);
// las escrituras sobre ellas se rechazan acá mismo, antes de llegar a la red.
//
// Las credenciales de Postgres viven SOLO en el servidor. El frontend únicamente conoce la URL
// base y el token de sesión.

export type { HttpDataSourceOptions } from './http/transport';
export { HttpDataSource } from './http/driver';
export { ApiError, resetHttpFeatureFlags } from './http/errors';
