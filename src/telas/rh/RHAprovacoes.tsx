import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plane, Stethoscope, CheckCircle2, XCircle, CheckCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { usePodeNoRH } from '@/hooks/useAccessProfiles';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { RegistrarFeriasDialog } from '@/components/rh/RegistrarFeriasDialog';

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
  // Aprovar e recusar é caixinha do perfil do RH (2026-10-01), como no banco.
  const { pode } = usePodeNoRH();
  const qc = useQueryClient();
  const [registrarAberto, setRegistrarAberto] = useState(false);

  const { data: requests = [] } = useQuery({
    queryKey: ['rh-all-vacation-requests', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const data = unwrap(await supabase
        .from('rh_vacation_requests')
        .select('*, profile:user_id(id, full_name, email, department)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100));
      return data || [];
    },
    enabled: !!tenantId,
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'aprovada' | 'recusada' }) => {
      const { data, error } = await supabase
        .from('rh_vacation_requests')
        .update({ status, decided_at: new Date().toISOString() })
        .eq('id', id)
        .select('user_id, ticket_id, type, start_date, end_date')
        .single();
      if (error) throw error;

      const typeLabel = data.type === 'ferias' ? 'Férias' : data.type === 'abono' ? 'Abono' : 'Banco de horas';
      // parseISO, não `new Date('AAAA-MM-DD')`: este último é UTC e, no Brasil, mostra o dia anterior (regra 4).
      const period = `${format(parseISO(data.start_date), 'dd/MM')} a ${format(parseISO(data.end_date), 'dd/MM/yyyy')}`;
      const { error: notifyError } = await supabase.from('notifications').insert({
        tenant_id: tenantId,
        user_id: data.user_id,
        type: 'request_decided',
        reference_type: data.ticket_id ? 'ticket' : 'rh_request',
        reference_id: data.ticket_id || id,
        title: status === 'aprovada' ? 'Solicitação aprovada' : 'Solicitação recusada',
        message: `Sua solicitação de ${typeLabel.toLowerCase()} (${period}) foi ${status === 'aprovada' ? 'aprovada' : 'recusada'}.`,
      });
      if (notifyError) console.error(notifyError);
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
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Solicitações de férias e folgas</CardTitle>
          <CardDescription>{pending.length} aguardando decisão.</CardDescription>
        </div>
        {pode('vacations', 'approve') && (
          <Button size="sm" variant="outline" onClick={() => setRegistrarAberto(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Registrar férias
          </Button>
        )}
        <RegistrarFeriasDialog open={registrarAberto} onOpenChange={setRegistrarAberto} />
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
              {r.status === 'pendente' && pode('vacations', 'approve') ? (
                <>
                  <Button size="sm" variant="outline" className="text-status-danger" onClick={() => decide.mutate({ id: r.id, status: 'recusada' })}>
                    <XCircle className="w-3.5 h-3.5 mr-1" /> Recusar
                  </Button>
                  <Button size="sm" className="bg-status-success hover:bg-status-success" onClick={() => decide.mutate({ id: r.id, status: 'aprovada' })}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar
                  </Button>
                </>
              ) : (
                <Badge variant="outline" className={
                  r.status === 'aprovada' ? 'badge-success text-status-success border-border' :
                  r.status === 'recusada' ? 'badge-danger text-status-danger border-status-danger' :
                  'bg-muted text-muted-foreground border-border'
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
  // Aprovar e recusar é caixinha do perfil do RH (2026-10-01), como no banco.
  const { pode } = usePodeNoRH();
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ['rh-all-certificates', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const data = unwrap(await supabase
        .from('rh_medical_certificates')
        .select('*, profile:user_id(id, full_name, email, department)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100));
      return data || [];
    },
    enabled: !!tenantId,
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'validado' | 'rejeitado' }) => {
      const { data, error } = await supabase
        .from('rh_medical_certificates')
        .update({ status, validated_at: new Date().toISOString() })
        .eq('id', id)
        .select('user_id, ticket_id, issue_date')
        .single();
      if (error) throw error;

      const { error: notifyError } = await supabase.from('notifications').insert({
        tenant_id: tenantId,
        user_id: data.user_id,
        type: 'request_decided',
        reference_type: data.ticket_id ? 'ticket' : 'rh_request',
        reference_id: data.ticket_id || id,
        title: status === 'validado' ? 'Atestado validado' : 'Atestado recusado',
        message: `Seu atestado de ${format(parseISO(data.issue_date), 'dd/MM/yyyy')} foi ${status === 'validado' ? 'validado' : 'recusado'}.`,
      });
      if (notifyError) console.error(notifyError);
    },
    onSuccess: () => {
      toast.success('Atestado atualizado.');
      qc.invalidateQueries({ queryKey: ['rh-all-certificates'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from('rh-documents').createSignedUrl(path, 60);
    if (error) { toast.error(error.message); return; }
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
              {c.status === 'recebido' && pode('certificates', 'approve') ? (
                <>
                  <Button size="sm" variant="outline" className="text-status-danger" onClick={() => decide.mutate({ id: c.id, status: 'rejeitado' })}>Rejeitar</Button>
                  <Button size="sm" className="bg-status-success hover:bg-status-success" onClick={() => decide.mutate({ id: c.id, status: 'validado' })}>Validar</Button>
                </>
              ) : (
                <Badge variant="outline" className={
                  c.status === 'validado' ? 'badge-success text-status-success border-border' : 'badge-danger text-status-danger border-status-danger'
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
