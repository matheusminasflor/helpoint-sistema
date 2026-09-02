import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Trash2, Upload, Download, FolderLock, AlertTriangle } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const DOC_TYPE_OPTIONS = [
  { value: 'contrato', label: 'Contrato de trabalho' },
  { value: 'aditivo', label: 'Aditivo contratual' },
  { value: 'aso', label: 'ASO' },
  { value: 'epi', label: 'Ficha de EPI' },
  { value: 'rg_cpf', label: 'RG / CPF' },
  { value: 'ctps', label: 'CTPS' },
  { value: 'comprovante_residencia', label: 'Comprovante de residência' },
  { value: 'diploma', label: 'Diploma' },
  { value: 'curso', label: 'Certificado de curso' },
  { value: 'advertencia', label: 'Advertência' },
  { value: 'suspensao', label: 'Suspensão' },
  { value: 'outros', label: 'Outros' },
];

export default function RHDocumentos() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const { data: docs = [] } = useQuery({
    queryKey: ['rh-documents-all', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from('rh_documents')
        .select('*, profile:user_id(full_name, email)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200);
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: usersList = [] } = useQuery({
    queryKey: ['tenant-users-for-docs', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase.from('profiles').select('id, full_name, email').eq('tenant_id', tenantId).order('full_name');
      return data || [];
    },
    enabled: !!tenantId,
  });

  const del = useMutation({
    mutationFn: async (d: any) => {
      await supabase.storage.from('rh-documents').remove([d.file_path]).catch(() => {});
      const { error } = await supabase.from('rh_documents').delete().eq('id', d.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Documento removido.'); qc.invalidateQueries({ queryKey: ['rh-documents-all'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const openFile = async (path: string) => {
    const { data } = await supabase.storage.from('rh-documents').createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const expiringSoon = docs.filter((d: any) => {
    if (!d.expires_at) return false;
    const diff = differenceInDays(new Date(d.expires_at), new Date());
    return diff >= 0 && diff <= 30;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FolderLock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
          <p className="text-sm text-muted-foreground">Cofre seguro com contratos, ASOs, fichas de EPI e demais documentos por colaborador.</p>
        </div>
      </div>

      {expiringSoon.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700" />
            <div className="text-sm">
              <strong>{expiringSoon.length} documento(s)</strong> vencem nos próximos 30 dias. Considere renovar.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Cofre de documentos</CardTitle>
            <CardDescription>Arquive contratos, ASOs, fichas de EPI e demais documentos por colaborador.</CardDescription>
          </div>
          <UploadDocDialog users={usersList} onSaved={() => qc.invalidateQueries({ queryKey: ['rh-documents-all'] })} />
        </CardHeader>
        <CardContent className="space-y-2">
          {docs.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Cofre vazio.</div>
          ) : docs.map((d: any) => {
            const diff = d.expires_at ? differenceInDays(new Date(d.expires_at), new Date()) : null;
            const expired = diff !== null && diff < 0;
            const expiring = diff !== null && diff >= 0 && diff <= 30;
            return (
              <div key={d.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {d.title}
                    {d.version > 1 && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">v{d.version}</Badge>}
                    {expired && <Badge className="h-4 px-1.5 text-[10px] bg-rose-100 text-rose-700 border-0">Vencido</Badge>}
                    {expiring && <Badge className="h-4 px-1.5 text-[10px] bg-amber-100 text-amber-800 border-0">Vence em {diff}d</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.profile?.full_name || d.profile?.email} · {DOC_TYPE_OPTIONS.find(o => o.value === d.document_type)?.label}
                    {d.expires_at && ` · válido até ${format(new Date(d.expires_at), 'dd/MM/yyyy')}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => openFile(d.file_path)}><Download className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm(`Remover "${d.title}"?`) && del.mutate(d)}>
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function UploadDocDialog({ users, onSaved }: { users: any[]; onSaved: () => void }) {
  const { tenantId, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [docType, setDocType] = useState('contrato');
  const [title, setTitle] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!tenantId || !userId || !file || !title) return;
    setBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024) { toast.error('Arquivo > 20 MB'); return; }
      const year = new Date().getFullYear();
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${tenantId}/${userId}/${year}/cofre/${docType}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('rh-documents').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from('rh_documents').insert({
        tenant_id: tenantId, user_id: userId, document_type: docType, title,
        file_path: path, issue_date: issueDate || null, expires_at: expiresAt || null,
        uploaded_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success('Documento arquivado.');
      setOpen(false); setUserId(''); setTitle(''); setIssueDate(''); setExpiresAt(''); setFile(null);
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Upload className="w-3.5 h-3.5 mr-1" />Arquivar</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Arquivar documento no cofre</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Colaborador</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Escolher..." /></SelectTrigger>
              <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Título</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Contrato 2025" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Emitido em</Label><Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></div>
            <div><Label>Vence em (opcional)</Label><Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></div>
          </div>
          <div><Label>Arquivo (PDF/JPG/PNG, máx 20 MB)</Label><Input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!userId || !title || !file || busy}>{busy ? 'Enviando...' : 'Arquivar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
