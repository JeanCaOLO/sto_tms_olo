// Estructura de costos de una compañía: la tabla editable, fila por fila, con importación.
//
// Reemplaza al modelo de tres campos que había en la pestaña Costos que tenía Reglas de Tarifa. Una estructura real
// tiene decenas de conceptos y cada uno se prorratea distinto; eso es una tabla, no tres casillas.

import { useEffect, useState } from 'react';
import Button from '../../../components/base/Button';
import ImportSheetWizard from './ImportSheetWizard';
import CostTemplateModal from '../../../components/tarifas/CostTemplateModal';
import { CostRowsTable, TruckSummaryTable } from '../../../components/tarifas/CostStructureParts';
import { listTruckTypes } from '../../../lib/tarifas/vehiclesDataSource';
import { deleteRow, updateRow } from '../../../lib/tarifas/costStructureDataSource';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import { useModulePermissions } from '../../../hooks/use-module-permissions';
import { useAuth } from '../../../hooks/useAuth';
import { useStructureData } from '../hooks/useStructureData';
import { useCostMeta } from '../hooks/useCostMeta';
import { useRowEdit } from '../hooks/useRowEdit';
import { useStructureTarget } from '../hooks/useStructureTarget';
import { useCopyFromCountry } from '../hooks/useCopyFromCountry';
import { useRowSubmit } from '../hooks/useRowSubmit';
import { useCostActions } from '../hooks/useCostActions';
import { useStructureView } from '../hooks/useStructureView';
import type { StructureCtx } from '../hooks/costStructureContext';
import { CostStructureHeader } from './cost-structure/CostStructureHeader';
import { InheritedNotice } from './cost-structure/InheritedNotice';
import { StructureMetaForm } from './cost-structure/StructureMetaForm';
import { ParamsLine } from './cost-structure/ParamsLine';
import { TemplateToolbar } from './cost-structure/TemplateToolbar';
import { RowForm } from './cost-structure/RowForm';
import { RowActions } from './cost-structure/RowActions';

interface Props {
  isOpen: boolean;
  party: CarrierProfile | null;
  currency: string;
  onClose: () => void;
  onProfileCreated?: () => void;
}

export default function CostStructureModal({
  isOpen, party, currency, onClose, onProfileCreated,
}: Props) {
  const { canCreate, canEdit, canDelete } = useModulePermissions('tarifas.config');
  const { appUser } = useAuth();
  // Mismo criterio que el resto de la bitácora: el usuario real, no un texto fijo.
  const usuarioActivo = appUser?.full_name || appUser?.email || 'Usuario';
  const [partyId, setPartyId] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [truckTypes, setTruckTypes] = useState<string[]>([]);

  const { structure, rows, loading, error, setError, variables, inherited, load } = useStructureData(party, partyId, isOpen);
  const [meta, setMeta] = useCostMeta(structure);
  const { editing, newRow, setNewRow, startEdit, cancelEdit, emptyRow } = useRowEdit();

  useEffect(() => {
    if (!isOpen || !party) return;
    setNewRow(emptyRow());
    setPartyId(party.partyId);
  }, [isOpen, party, setNewRow, emptyRow]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    listTruckTypes()
      .then((t) => { if (!cancelled) setTruckTypes(t.map((x) => x.code)); })
      .catch(() => { if (!cancelled) setTruckTypes([]); });
    return () => { cancelled = true; };
  }, [isOpen]);

  const { driverOptions, customLabels, summary } = useStructureView(variables, structure, rows, inherited);

  const ctx: StructureCtx = { party, partyId, setPartyId, structure, inherited, meta, setError, load, onProfileCreated };
  const { ensureParty, ensureStructure } = useStructureTarget(ctx);
  const { copying, handleCopyFromCountry } = useCopyFromCountry(ctx, ensureParty);
  const blockedByInherited = !structure && !!inherited && party?.classification === 'OWN';
  const { handleSubmitRow, handleRowAction } = useRowSubmit({
    editing, newRow, setNewRow, emptyRow, cancelEdit, blockedByInherited, ensureStructure, setError, load,
  });
  const { handleSaveMeta, handleOpenTemplate, handleImport } = useCostActions({
    ctx, usuarioActivo, blockedByInherited, ensureParty, ensureStructure, openTemplate: () => setIsTemplateOpen(true),
  });

  if (!isOpen || !party) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto">
        <CostStructureHeader party={party} onClose={onClose} />

        <div className="px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
          )}

          {!structure && !loading && (
            <InheritedNotice
              party={party} inherited={inherited} canEdit={canEdit} copying={copying}
              onCopy={() => void handleCopyFromCountry()}
            />
          )}

          <StructureMetaForm canEdit={canEdit} meta={meta} setMeta={setMeta} onSave={() => void handleSaveMeta()} />
          <ParamsLine structure={structure ?? inherited?.structure} currency={currency} />

          <TemplateToolbar
            canEdit={canEdit} onOpenTemplate={() => void handleOpenTemplate()} onOpenImport={() => setIsImportOpen(true)}
          />

          <RowForm
            editing={editing} newRow={newRow} setNewRow={setNewRow} driverOptions={driverOptions}
            truckTypes={truckTypes} currency={currency} canEdit={canEdit} canCreate={canCreate}
            onSubmit={() => void handleSubmitRow()} onCancel={cancelEdit}
          />

          <CostRowsTable
            rows={structure ? rows : inherited?.rows ?? []}
            loading={loading}
            customLabels={customLabels}
            exportFileName="estructura_costos_compania"
            emptyMessage="Todavía no hay conceptos cargados: subí la plantilla o cargalos a mano."
            actions={!structure ? undefined : (row) => (
              <RowActions
                row={row} canEdit={canEdit} canDelete={canDelete} onEdit={startEdit}
                onToggleActive={(r) => void handleRowAction(() => updateRow(r.id, { active: !r.active }))}
                onDelete={(r) => void handleRowAction(() => deleteRow(r.id))}
              />
            )}
          />

          {summary.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Resumen por tipo de camión ({currency})</h3>
              <TruckSummaryTable summary={summary} exportFileName="resumen_costos_por_camion" />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>

      <CostTemplateModal
        isOpen={isTemplateOpen}
        partyId={partyId}
        countryId={party.countryId ?? ''}
        structureName={structure?.name ?? meta.name}
        scopeLabel={`la estructura de costos de ${party.name}`}
        currency={currency}
        onClose={() => setIsTemplateOpen(false)}
        onApplied={() => { void load(); }}
      />

      <ImportSheetWizard
        isOpen={isImportOpen}
        structureName={meta.name}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImport}
      />
    </div>
  );
}
