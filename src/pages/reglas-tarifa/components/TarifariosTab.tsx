// Tarifarios: orquesta la gestión de tarifarios y sus filas.

import { useRef, useState } from 'react';
import RateTableModal from './RateTableModal';
import ImportRateTableModal from './ImportRateTableModal';
import RateTablesListCard from './tarifarios/RateTablesListCard';
import RateRowsCard from './tarifarios/RateRowsCard';
import { useTarifariosController } from './tarifarios/useTarifariosController';
import { useRateRowFormState } from './tarifarios/useRateRowFormState';
import { useModulePermissions } from '../../../hooks/use-module-permissions';
import type { RateTable, RateTableRow } from '../../../lib/tarifas/types';

interface Props {
  countryId: string;
  currency?: string;
  zones: { id: string; code: string; name: string; zone_groups?: { name: string | null } | null }[];
  partyId?: string;
}

export default function TarifariosTab({ countryId, currency, zones, partyId }: Props) {
  const { canCreate, canEdit, canDelete } = useModulePermissions('tarifas.config');
  const controller = useTarifariosController(countryId, partyId);
  const form = useRateRowFormState(controller.selected);

  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RateTable | null>(null);

  const carrierId = controller.parties
    .filter((p) => p.partyId === controller.selected?.partyId)
    .map((p) => p.carrierId);

  // Guardado en curso: el ref cierra la ventana entre el clic y el re-render (un doble clic rápido
  // pasaba las dos veces); el estado deshabilita el botón y cambia su texto.
  const guardandoFila = useRef(false);
  const [savingRow, setSavingRow] = useState(false);

  const handleSaveRow = async () => {
    if (!controller.selected || guardandoFila.current) return;
    guardandoFila.current = true;
    setSavingRow(true);
    try {
      const result = await controller.saveRow({
        tableId: controller.selected.id,
        key: form.draftKey,
        amount: form.draftAmount,
        values: form.draftValues,
        active: true,
      }, form.editingRowId ?? undefined);
      if (result.status === 'invalid' && result.errors) {
        form.setRowErrors(result.errors);
      } else if (result.status !== 'invalid' && result.status !== 'failed') {
        // Guardada: el formulario vuelve a "Nueva fila" y sin el borrador anterior.
        form.reset();
      }
    } finally {
      guardandoFila.current = false;
      setSavingRow(false);
    }
  };

  const handleDeleteRow = async (row: RateTableRow) => {
    const eliminada = await controller.deleteRow(row);
    // Si era la fila que se estaba editando, el formulario no puede quedar apuntando a una fila que ya no existe.
    if (eliminada && form.editingRowId === row.id) form.reset();
  };

  return (
    <div className="space-y-6">
      <RateTablesListCard
        tables={controller.tables}
        parties={controller.parties}
        loading={controller.loading}
        error={controller.loadError}
        selectedId={controller.selectedId}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        onSelectTable={controller.selectTable}
        onNewTable={() => { setEditingTable(null); setIsTableModalOpen(true); }}
        onEditTable={(t) => { setEditingTable(t); setIsTableModalOpen(true); }}
        onToggle={controller.toggleTable}
        onDelete={controller.deleteTable}
      />

      {controller.selected && (
        <RateRowsCard
          selected={controller.selected}
          rows={controller.rows}
          loadingRows={controller.loadingRows}
          generalError={controller.generalError}
          editingRowId={form.editingRowId}
          saving={savingRow}
          draftKey={form.draftKey}
          draftAmount={form.draftAmount}
          draftValues={form.draftValues}
          rowErrors={form.rowErrors}
          zones={zones}
          truckCodes={controller.truckCodes}
          carrierId={carrierId}
          canEdit={canEdit}
          canDelete={canDelete}
          onKeyChange={form.updateKey}
          onAmountChange={form.updateAmount}
          onValuesChange={form.updateValues}
          onSaveRow={handleSaveRow}
          onCancelEdit={form.reset}
          onEditRow={form.startEdit}
          onDeleteRow={handleDeleteRow}
          onClose={() => controller.selectTable(null)}
          onImportOpen={() => setIsImportOpen(true)}
        />
      )}

      <RateTableModal
        isOpen={isTableModalOpen}
        countryId={countryId}
        table={editingTable}
        parties={controller.parties}
        currency={currency}
        onClose={() => setIsTableModalOpen(false)}
        onSaved={async () => {
          await controller.loadTables();
          if (controller.selected) await controller.loadRows(controller.selected.id);
        }}
      />

      {controller.selected && (
        <ImportRateTableModal
          isOpen={isImportOpen}
          table={controller.selected}
          onClose={() => setIsImportOpen(false)}
          onImported={async () => { await controller.loadRows(controller.selected!.id); }}
        />
      )}
    </div>
  );
}
