import DataTable from '../../base/DataTable';
import { allocationColumns } from './allocationColumns';
import { BASIS_LABEL } from './breakdownLabels';
import type { Allocation } from '../../../lib/tarifas/types';

/**
 * Reparto del total entre casas comerciales (lo que se factura por casa). Visible para todos.
 * `allocation` null = el viaje no tiene pedidos cargados: línea informativa, no bloquea.
 */
export function AllocationBlock({ allocation, criterion }: { allocation: Allocation | null; criterion?: string }) {
  const columns = allocationColumns(allocation?.currency ?? '');

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">Reparto por casa comercial</h3>
      {!allocation ? (
        <p className="text-xs text-slate-500">
          <i className="ri-information-line mr-1"></i>
          El viaje no tiene pedidos cargados: no se puede repartir por casa comercial.
        </p>
      ) : (
        <>
          {(criterion ?? allocation.criterion) !== allocation.basis && (
            <p className="text-xs text-amber-700">
              <i className="ri-information-line mr-1"></i>
              Se repartió por {BASIS_LABEL[allocation.basis]} porque los pedidos no traen{' '}
              {allocation.criterion === 'VALUE' ? 'valor' : allocation.criterion === 'WEIGHT' ? 'peso' : 'volumen'}.
            </p>
          )}
          <DataTable
            maxVisibleRows={5}
            data={allocation.shares}
            columns={columns}
            getRowId={(r) => r.customerId ?? r.code ?? r.name}
            columnsKey="liquidaciones.reparto"
            searchPlaceholder="Buscar casa comercial"
            exportFileName="reparto_casas_comerciales"
            emptyMessage="Sin casas comerciales"
          />
        </>
      )}
    </section>
  );
}
