import Button from '../../../components/base/Button';
import Card from '../../../components/base/Card';
import DataTable from '../../../components/base/DataTable';
import { getRuleTableColumns } from './ruleTableColumns';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
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
}

export function RulesSection({
  rules, parties, loading, canCreate, canEdit, canDelete, onNew, onEdit, onDelete,
}: RulesSectionProps) {
  const columns = getRuleTableColumns(parties, rules);

  return (
    <Card>
      <DataTable
        maxVisibleRows={5}
        data={rules}
        columns={columns}
        getRowId={(r) => String(r.id)}
        loading={loading}
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
