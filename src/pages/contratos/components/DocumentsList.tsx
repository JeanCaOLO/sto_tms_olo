import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/base/Button';
import Badge from '@/components/base/Badge';
import Input from '@/components/base/Input';
import Select from '@/components/base/Select';
import type { Contract } from '../page';

interface ContractDocument {
  id: string;
  contract_id: string;
  organization_id: string;
  name: string;
  document_type: string;
  file_url: string | null;
  file_name: string | null;
  file_size_kb: number | null;
  notes: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
}

interface Props {
  contract: Contract;
  organizationId: string;
  onClose: () => void;
}

const docTypeConfig: Record<string, { label: string; variant: 'info' | 'success' | 'warning' | 'default' }> = {
  contract: { label: 'Contrato', variant: 'info' },
  annex: { label: 'Anexo', variant: 'default' },
  amendment: { label: 'Modificación', variant: 'warning' },
  certificate: { label: 'Certificado', variant: 'success' },
  other: { label: 'Otro', variant: 'default' },
};

export default function DocumentsList({ contract, organizationId, onClose }: Props) {
  const [documents, setDocuments] = useState<ContractDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [newDoc, setNewDoc] = useState({
    name: '',
    document_type: 'contract',
    file_url: '',
    file_name: '',
    notes: '',
    uploaded_by: '',
  });

  useEffect(() => {
    fetchDocuments();
  }, [contract.id]);

  const fetchDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('contract_documents')
      .select('*')
      .eq('contract_id', contract.id)
      .order('uploaded_at', { ascending: false });
    if (!error) setDocuments(data || []);
    setLoading(false);
  };

  const handleAddDocument = async () => {
    if (!newDoc.name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('contract_documents').insert({
      contract_id: contract.id,
      organization_id: organizationId,
      name: newDoc.name.trim(),
      document_type: newDoc.document_type,
      file_url: newDoc.file_url.trim() || null,
      file_name: newDoc.file_name.trim() || null,
      notes: newDoc.notes.trim() || null,
      uploaded_by: newDoc.uploaded_by.trim() || null,
    });
    if (!error) {
      setNewDoc({ name: '', document_type: 'contract', file_url: '', file_name: '', notes: '', uploaded_by: '' });
      setShowAddForm(false);
      fetchDocuments();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await supabase.from('contract_documents').delete().eq('id', id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setDeletingId(null);
  };

  const set = (field: string, value: string) =>
    setNewDoc((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-800">Documentos del Contrato</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="font-mono text-teal-700">{contract.contract_number}</span>
              {' · '}
              {contract.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <i className="ri-close-line text-lg text-slate-600"></i>
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm text-slate-500">
            {documents.length} documento{documents.length !== 1 ? 's' : ''}
          </span>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <i className={`ri-${showAddForm ? 'close' : 'add'}-line mr-2`}></i>
            {showAddForm ? 'Cancelar' : 'Agregar Documento'}
          </Button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="px-6 py-4 bg-teal-50/50 border-b border-teal-100">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <i className="ri-file-add-line text-teal-600"></i>
              Registrar nuevo documento
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre del documento *</label>
                  <Input
                    value={newDoc.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="Ej: Contrato principal firmado"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                  <Select value={newDoc.document_type} onChange={(e) => set('document_type', e.target.value)}>
                    <option value="contract">Contrato</option>
                    <option value="annex">Anexo</option>
                    <option value="amendment">Modificación</option>
                    <option value="certificate">Certificado</option>
                    <option value="other">Otro</option>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">URL del archivo (opcional)</label>
                  <Input
                    value={newDoc.file_url}
                    onChange={(e) => set('file_url', e.target.value)}
                    placeholder="https://drive.google.com/..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Subido por</label>
                  <Input
                    value={newDoc.uploaded_by}
                    onChange={(e) => set('uploaded_by', e.target.value)}
                    placeholder="Nombre"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
                <textarea
                  value={newDoc.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={2}
                  placeholder="Observaciones adicionales..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleAddDocument} disabled={saving || !newDoc.name.trim()}>
                  {saving ? <i className="ri-loader-4-line animate-spin mr-2"></i> : <i className="ri-save-line mr-2"></i>}
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <i className="ri-loader-4-line animate-spin text-teal-600 text-xl"></i>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 flex items-center justify-center bg-slate-100 rounded-full mx-auto mb-3">
                <i className="ri-folder-open-line text-xl text-slate-400"></i>
              </div>
              <p className="text-sm font-medium text-slate-600">No hay documentos aún</p>
              <p className="text-xs text-slate-400 mt-1">Agrega documentos relacionados a este contrato</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => {
                const cfg = docTypeConfig[doc.document_type] || docTypeConfig.other;
                return (
                  <div
                    key={doc.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 transition-colors group"
                  >
                    <div className="w-9 h-9 flex items-center justify-center bg-teal-50 rounded-lg shrink-0 mt-0.5">
                      <i className="ri-file-text-line text-teal-600 text-base"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{doc.name}</span>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </div>
                      {doc.notes && (
                        <p className="text-xs text-slate-500 mt-0.5">{doc.notes}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-slate-400">
                          {new Date(doc.uploaded_at).toLocaleDateString('es-ES')}
                        </span>
                        {doc.uploaded_by && (
                          <span className="text-xs text-slate-400">por {doc.uploaded_by}</span>
                        )}
                        {doc.file_url && (
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="nofollow noreferrer"
                            className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                          >
                            <i className="ri-external-link-line"></i>
                            Ver archivo
                          </a>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      title="Eliminar"
                    >
                      {deletingId === doc.id ? (
                        <i className="ri-loader-4-line animate-spin text-sm"></i>
                      ) : (
                        <i className="ri-delete-bin-line text-sm"></i>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}