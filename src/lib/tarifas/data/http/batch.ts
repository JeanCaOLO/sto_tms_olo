// Lecturas agrupadas del driver HTTP (`POST /tarifas/batch`).

import { recordBatch } from '../metrics';
import { entityDef } from '../schema';
import type { FindRequest, Row } from '../datasource';

/** Lecturas por llamada de `/batch`; el backend rechaza más. */
const MAX_BATCH = 25;

/** Manda las lecturas en tandas de `MAX_BATCH`; `post` hace la llamada de una tanda. */
export async function postBatches(
  requests: FindRequest[],
  post: (body: string, first: FindRequest) => Promise<Row[][]>,
): Promise<Row[][]> {
  const groups: FindRequest[][] = [];
  for (let i = 0; i < requests.length; i += MAX_BATCH) groups.push(requests.slice(i, i + MAX_BATCH));
  const results = await Promise.all(
    groups.map(async (group) => {
      const body = JSON.stringify({
        queries: group.map((r) => ({ table: entityDef(r.entity).table, q: r.options ?? {} })),
      });
      const rows = await post(body, group[0]);
      recordBatch(group.length);
      return rows;
    }),
  );
  return results.flat();
}
