// Tarjeta con las filas de un tarifario y su formulario de entrada.

import Card from '../../../../components/base/Card';
import Button from '../../../../components/base/Button';
import { RATE_TABLE_WILDCARD, type RateTable, type RateTableRow } from '../../../../lib/tarifas/types';
import RateRowForm from './RateRowForm';
import RateRowsTable from './RateRowsTable';

interface Props {
  selected: RateTable | null;
  rows: RateTableRow[];
  loadingRows: boolean;
  generalError: string;
  editingRowId: string | null;
  draftKey: string[];
  draftAmount: string;
  draftValues: Record<string, string>;
  rowErrors: { key?: string; amount?: string; values?: string };
  zones: { id: string; code: string; name: string }[];
  truckCodes: string[];
  carrierId: string[];
  canEdit: boolean;
  canDelete: boolean;
  onKeyChange: (index: number, value: string) => void;
  onAmountChange: (value: string) => void;
  onValuesChange: (name: string, value: string) => void;
  onSaveRow: () => void;
  onCancelEdit: () => void;
  onEditRow: (row: RateTableRow) => void;
  onDeleteRow: (row: RateTableRow) => void;
  onClose: () => void;
  onImportOpen: () => void;
  customLabels?: Record<string, string>;
}

export default function RateRowsCard({
  selected,
  rows,
  loadingRows,
  generalError,
  editingRowId,
  draftKey,
  draftAmount,
  draftValues,
  rowErrors,
  zones,
  truckCodes,
  carrierId,
  canEdit,
  canDelete,
  onKeyChange,
  onAmountChange,
  onValuesChange,
  onSaveRow,
  onCancelEdit,
  onEditRow,
  onDeleteRow,
  onClose,
  onImportOpen,
  customLabels,
}: Props) {
  if (!selected) return null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-slate-700">
          Filas de <span className="font-mono text-teal-700">{selected.code}</span>
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onImportOpen} disabled={!canEdit} title={!canEdit ? 'Tu rol no puede editar tarifarios' : undefined}>
            <i className="ri-file-excel-2-line mr-1"></i>Importar planilla
          </Button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer w-8 h-8 flex items-center justify-center"
            title="Cerrar"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-4">
        Dejá una celda <strong>vacía</strong> para que acepte cualquier valor — se guarda como{' '}
        <code className="font-mono">*</code>. Gana la fila que resuelva más columnas con un valor exacto.
      </p>

      {generalError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {generalError}
        </div>
      )}

      <RateRowForm
        selected={selected}
        zones={zones}
        truckCodes={truckCodes}
        carrierId={carrierId}
        draftKey={draftKey}
        draftAmount={draftAmount}
        draftValues={draftValues}
        rowErrors={rowErrors}
        onKeyChange={onKeyChange}
        onAmountChange={onAmountChange}
        onValuesChange={onValuesChange}
        onSave={onSaveRow}
        onCancel={onCancelEdit}
        isEditing={editingRowId !== null}
        canEdit={canEdit}
        customLabels={customLabels}
      />

      <RateRowsTable
        table={selected}
        rows={rows}
        loading={loadingRows}
        selectedRowId={editingRowId}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={onEditRow}
        onDelete={onDeleteRow}
        customLabels={customLabels}
      />
    </Card>
  );
}
