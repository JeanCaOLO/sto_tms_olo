// Armar una proforma: se elige un transportista y, de sus liquidaciones en Borrador, las que entran.

import Modal from '../../../components/base/Modal';
import Button from '../../../components/base/Button';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import { formatMoney } from '../../../lib/tarifas/format';
import type { GroupableSettlement, ProformaRecord } from '../../../lib/tarifas/proformas';
import { useGenerarProforma } from '../hooks/useGenerarProforma';

interface Props {
  countryId: string;
  onClose: () => void;
  onCreated: (proforma: ProformaRecord) => void;
}

export default function GenerarProformaModal({ countryId, onClose, onCreated }: Props) {
  const { groups, group, carrierId, selected, loading, saving, error, pickCarrier, toggle, submit } = useGenerarProforma(countryId, onCreated);
  const currency = group?.currency ?? '';
  const total = (group?.settlements ?? []).filter((s) => selected.has(s.id)).reduce((sum, s) => sum + Math.round(s.totalAmount * 100), 0) / 100;

  const columns: DataTableColumn<GroupableSettlement>[] = [
    {
      key: 'pick', header: '', accessor: (s) => (selected.has(s.id) ? 1 : 0),
      render: (s) => (
        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Incluir ${s.number}`} />
      ),
    },
    { key: 'number', header: 'Liquidación', sortable: true, accessor: (s) => s.number },
    { key: 'total', header: 'Total', sortable: true, align: 'right', accessor: (s) => s.totalAmount, render: (s) => formatMoney(String(s.totalAmount), s.currency) },
  ];

  return (
    <Modal isOpen title="Nueva proforma" onClose={onClose} widthClass="max-w-3xl" closeOnBackdrop={false}>
      <div className="space-y-4 p-6">
        <h2 className="text-xl font-semibold text-slate-800">Nueva proforma</h2>
        <p className="text-sm text-slate-500">
          Una proforma agrupa liquidaciones de un solo transportista. Quedan en revisión según las fases configuradas del país.
        </p>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading ? (
          <div className="py-8 text-center text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl" /></div>
        ) : groups.length === 0 ? (
          <div className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No hay liquidaciones en Borrador sin proforma.
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium text-slate-700">
              Transportista
              <select
                value={carrierId} onChange={(e) => pickCarrier(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Elige un transportista…</option>
                {groups.map((g) => (
                  <option key={g.carrierId} value={g.carrierId}>{g.carrierName} — {g.settlements.length} liquidaciones</option>
                ))}
              </select>
            </label>
            {group && (
              <DataTable
                data={group.settlements} columns={columns} getRowId={(s) => s.id}
                maxVisibleRows={6} pageSize={10} emptyMessage="Sin liquidaciones" exportFileName="proforma_nueva"
              />
            )}
          </>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-sm text-slate-600">
            {group ? `${selected.size} seleccionadas · ${formatMoney(String(total), currency)}` : ''}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button disabled={!group || selected.size === 0 || saving} onClick={() => void submit()}>
              {saving ? 'Generando…' : 'Generar proforma'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
