import Button from '../../../../components/base/Button';
import { downloadCostTemplate } from '../../../../components/tarifas/CostTemplateModal';

interface Props {
  canEdit: boolean;
  onOpenTemplate: () => void;
  onOpenImport: () => void;
}

/** Subir o descargar la plantilla completa, o importar una hoja suelta. */
export function TemplateToolbar({ canEdit, onOpenTemplate, onOpenImport }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-y border-slate-100 py-3">
      <Button onClick={onOpenTemplate} disabled={!canEdit} title={!canEdit ? 'Tu rol no puede editar costos' : undefined}>
        <i className="ri-file-upload-line mr-1"></i> Subir plantilla
      </Button>
      <Button variant="secondary" onClick={downloadCostTemplate}>
        <i className="ri-download-2-line mr-1"></i> Descargar plantilla
      </Button>
      <Button variant="secondary" onClick={onOpenImport} disabled={!canEdit} title={!canEdit ? 'Tu rol no puede editar costos' : undefined}>
        <i className="ri-file-excel-2-line mr-1"></i> Importar una hoja suelta
      </Button>
      <p className="text-xs text-slate-500 basis-full">
        La plantilla reemplaza toda la estructura de esta compañía. La hoja suelta agrega o reemplaza
        conceptos de un solo tipo de cobro (por ejemplo, una lista de importes fijos).
      </p>
    </div>
  );
}
