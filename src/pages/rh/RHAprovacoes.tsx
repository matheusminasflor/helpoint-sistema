import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plane, Stethoscope, CheckCircle2, XCircle, CheckCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function RHAprovacoes() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <CheckCircle className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aprovações</h1>
          <p className="text-sm text-muted-foreground">Solicitações de férias, abonos e atestados enviadas pelos colaboradores.</p>
        </div>
      </div>

      <Tabs defaultValue="ferias">
        <TabsList>
          <TabsTrigger value="ferias"><Plane className="w-3.5 h-3.5 mr-1.5" />Férias e folgas</TabsTrigger>
          <TabsTrigger value="atestados"><Stethoscope className="w-3.5 h-3.5 mr-1.5" />Atestados</TabsTrigger>
        </TabsList>
        <TabsContent value="ferias"><VacationApprovals /></TabsContent>
        <TabsContent value="atestados"><CertificateValidations /></TabsContent>
      </Tabs>
    </div>
  );
}

function VacationApprovals() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const { data: requests = [] } = useQuery({
    queryKey: ['rh-all-vacation-requests', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from('rh_vacation_requests')
        .select('*, profile:user_id(id, full_name, email, department)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!tenantId,
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'aprovada' | 'recusada' }) => {
      const { error } = await supabase
        .from('rh_vacation_requests')
        .update({ status, decided_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Decisão registrada.');
      qc.invalidateQueries({ queryKey: ['rh-all-vacation-requests'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pending = requests.filter((r: any) => r.status === 'pendente');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Solicitações de férias e folgas</CardTitle>
        <CardDescription>{pending.length} aguardando decisão.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma solicitação ainda.</div>
        ) : requests.map((r: any) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">
                {r.profile?.full_name || r.profile?.email || 'Colaborador'}
                <span className="text-muted-foreground font-normal"> · {r.profile?.department || '—'}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {r.type === 'ferias' ? 'Férias' : r.type === 'abono' ? 'Abono' : 'Banco de horas'} ·{' '}
                {format(new Date(r.start_date), 'dd/MM')} a {format(new Date(r.end_date), 'dd/MM/yyyy')} ({r.days_requested} dias)
                {r.notes && ` · "${r.notes}"`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {r.status === 'pendente' ? (
                <>
                  <Button size="sm" variant="outline" className="text-rose-600" onClick={() => decide.mutate({ id: r.id, status: 'recusada' })}>
                    <XCircle className="w-3.5 h-3.5 mr-1" /> Recusar
                  </Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => decide.mutate({ id: r.id, status: 'aprovada' })}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar
                  </Button>
                </>
              ) : (
                <Badge variant="outline" className={
                  r.status === 'aprovada' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                  r.status === 'recusada' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                  'bg-slate-100 text-slate-700 border-slate-200'
                }>
                  {r.status === 'aprovada' ? 'Aprovada' : r.status === 'recusada' ? 'Recusada' : 'Cancelada'}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CertificateValidations() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ['rh-all-certificates', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from('rh_medical_certificates')
        .select('*, profile:user_id(id, full_name, email, department)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!tenantId,
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'validado' | 'rejeitado' }) => {
      const { error } = await supabase
        .from('rh_medical_certificates')
        .update({ status, validated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Atestado atualizado.');
      qc.invalidateQueries({ queryKey: ['rh-all-certificates'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openFile = async (path: string) => {
    const { data } = await supabase.storage.from('rh-documents').createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Atestados enviados</CardTitle>
        <CardDescription>Abra o arquivo para conferir antes de validar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Nenhum atestado recebido.</div>
        ) : items.map((c: any) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">
                {c.profile?.full_name || c.profile?.email} · {c.days_off} dia(s)
              </div>
              <div className="text-xs text-muted-foreground">
                Início {format(new Date(c.issue_date), 'dd/MM/yyyy')}
                {c.doctor_name && ` · Dr(a). ${c.doctor_name}`}
                {c.cid_code && ` · CID ${c.cid_code}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => openFile(c.file_path)}>Ver arquivo</Button>
              {c.status === 'recebido' ? (
                <>
                  <Button size="sm" variant="outline" className="text-rose-600" onClick={() => decide.mutate({ id: c.id, status: 'rejeitado' })}>Rejeitar</Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => decide.mutate({ id: c.id, status: 'validado' })}>Validar</Button>
                </>
              ) : (
                <Badge variant="outline" className={
                  c.status === 'validado' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-rose-100 text-rose-800 border-rose-200'
                }>
                  {c.status === 'validado' ? 'Validado' : 'Rejeitado'}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
