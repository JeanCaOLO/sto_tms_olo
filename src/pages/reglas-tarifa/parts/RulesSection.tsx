import { useState } from 'react';
import Card from '../../../components/base/Card';
import DataTable from '../../../components/base/DataTable';
import { getRuleTableColumns } from './ruleTableColumns';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import type { BulkAction } from '../api/bulkRules';
import type { RuleRow } from '../types';

interface RulesSectionProps {
  rules: RuleRow[];
  parties: CarrierProfile[];
  loading: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onNew: () => void;
  onEdit: (rule: RuleRow) => void;
  onDelete: (rule: RuleRow) => void;
  /** Acción sobre las reglas marcadas (activar, desactivar o eliminar). */
  onBulk: (action: BulkAction, rules: RuleRow[]) => void;
}

const BAR_BUTTON = 'px-2.5 py-1 text-xs font-medium bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer';

export function RulesSection({
  rules, parties, loading, canEdit, canDelete, onEdit, onDelete, onBulk,
}: RulesSectionProps) {
  const columns = getRuleTableColumns(parties, rules);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const marcadas = (ids: string[]) => rules.filter((r) => ids.includes(String(r.id)));
  const puedeLote = canEdit || canDelete;

  return (
    <Card>
      <DataTable
        maxVisibleRows={5}
        initialColumnFilters={{ active: ['Activa'] }}
        data={rules}
        columns={columns}
        getRowId={(r) => String(r.id)}
        loading={loading}
        selection={puedeLote ? {
          selected,
          onChange: setSelected,
          bar: (ids) => (
            <>
              {canEdit && (
                <button type="button" onClick={() => onBulk('deactivate', marcadas(ids))} className={BAR_BUTTON}>
                  <i className="ri-toggle-line mr-1" />Desactivar
                </button>
              )}
              {canEdit && (
                <button type="button" onClick={() => onBulk('activate', marcadas(ids))} className={BAR_BUTTON}>
                  <i className="ri-check-double-line mr-1" />Activar
                </button>
              )}
              {canDelete && (
                <button type="button" onClick={() => onBulk('delete', marcadas(ids))} className={`${BAR_BUTTON} text-red-600 border-red-200 hover:bg-red-50`}>
                  <i className="ri-delete-bin-line mr-1" />Eliminar
                </button>
              )}
            </>
          ),
        } : undefined}
        searchPlaceholder="Buscar por código, nombre o compañía..."
        exportFileName="reglas_tarifa"
        columnsKey="tarifas.reglas_tarifa"
        emptyMessage="No hay reglas registradas. Creá tu primera regla para empezar a tarifar liquidaciones."
        actions={(rule) => (
          <>
            {!canEdit && (
              <button
                onClick={() => onEdit(rule)}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
                title="Ver"
              >
                <i className="ri-eye-line text-base"></i>
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => onEdit(rule)}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title="Editar"
              >
                <i className="ri-edit-line text-base"></i>
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => onDelete(rule)}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title="Eliminar"
              >
                <i className="ri-delete-bin-line text-base"></i>
              </button>
            )}
          </>
        )}
      />
    </Card>
  );
}
