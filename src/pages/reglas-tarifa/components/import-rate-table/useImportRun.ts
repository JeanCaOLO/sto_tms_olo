import { bulkImportRows } from '../../api/tarifariosApi';
import type { RateTable } from '../../../../lib/tarifas/types';
import type { ImportState, SetImportState } from './importRateTableState';

type ParsedRows = { rows: { key: string[]; amount: string; values?: Record<string, string> }[] };

/** Envía las filas leídas al tarifario y deja el resultado (o el error) en el estado del asistente. */
export function useImportRun(
  table: RateTable | null,
  state: ImportState,
  setState: SetImportState,
  parsed: ParsedRows,
  usuarioActivo: string,
) {
  const handleImport = async (): Promise<boolean> => {
    if (!table) return false;
    setState((s) => ({ ...s, busy: true, error: '' }));
    try {
      const result = await bulkImportRows(
        table.id,
        parsed.rows.map((r) => ({ key: r.key, amount: r.amount, ...(r.values ? { values: r.values } : {}) })),
        state.mode,
        state.fileName,
        usuarioActivo,
      );

      if (result.error) {
        setState((s) => ({ ...s, error: result.error as string, busy: false }));
        return false;
      }

      setState((s) => ({
        ...s,
        done: { inserted: result.inserted, replaced: result.replaced },
        busy: false,
      }));
      return true;
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : 'No se pudo importar.', busy: false }));
      return false;
    }
  };

  return { handleImport };
}
