import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

// Recusar pede o motivo antes de valer (proposta "Helpoint no dia a dia", defeito 20, 2026-10-24): era um clique, sem
// confirmar, e a pessoa recebia "foi recusada" sem saber por quê. O banco também exige o motivo (20270129160000).
function MotivoDaRecusa({ titulo, quem, aberto, enviando, onCancelar, onConfirmar }: {
  titulo: string; quem: string; aberto: boolean; enviando: boolean;
  onCancelar: () => void; onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const pronto = motivo.trim().length > 0;
  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) { setMotivo(''); onCancelar(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{quem} recebe o aviso com o motivo que você escrever.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="motivo-recusa">Motivo</Label>
          <Textarea id="motivo-recusa" name="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: coincide com o inventário de novembro…" rows={3} />
          {!pronto && <p className="text-xs text-muted-foreground">Escreva o motivo para poder recusar.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setMotivo(''); onCancelar(); }}>Voltar</Button>
          <Button variant="destructive" disabled={!pronto || enviando} onClick={() => onConfirmar(motivo.trim())}>
            {enviando ? 'Recusando…' : 'Recusar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RHAprovacoes() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Aprovações"
        description="Pedidos de férias, abonos e atestados enviados pelos colaboradores."
        icon={CheckCircle}
      />

      <div className="px-4 lg:px-8 pb-6 w-full space-y-4">
        <Tabs defaultValue="ferias">
          <TabsList>
            <TabsTrigger value="ferias"><Plane className="w-3.5 h-3.5 mr-1.5" />Férias e folgas</TabsTrigger>
            <TabsTrigger value="atestados"><Stethoscope className="w-3.5 h-3.5 mr-1.5" />Atestados</TabsTrigger>
          </TabsList>
          <TabsContent value="ferias"><VacationApprovals /></TabsContent>
          <TabsContent value="atestados"><CertificateValidations /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function VacationApprovals() {
  const { tenantId } = useAuth();
  // Aprovar e recusar é caixinha do perfil do RH (2026-10-01), como no banco.
  const { pode } = usePodeNoRH();
  const qc = useQueryClient();
  const [registrarAberto, setRegistrarAberto] = useState(false);
  const [recusando, setRecusando] = useState<{ id: string; quem: string } | null>(null);

  const { data: requests = [] } = useQuery({
    queryKey: ['rh-all-vacation-requests', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const data = unwrap(await supabase
        .from('rh_vacation_requests')
        .select('*, employee:rh_employee_profiles!rh_vacation_requests_employee_id_fkey(id, full_name, department)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100));
      return data || [];
    },
    enabled: !!tenantId,
  });

  const decide = useMutation({
    mutationFn: async ({ id, status, motivo }: { id: string; status: 'aprovada' | 'recusada'; motivo?: string }) => {
      // Quem decidiu, o banco grava (20270129160000); a tela manda só a decisão e o motivo.
      const { data, error } = await supabase
        .from('rh_vacation_requests')
        .update({ status, decided_at: new Date().toISOString(), ...(motivo ? { decision_notes: motivo } : {}) })
        .eq('id', id)
        .select('user_id, ticket_id, type, start_date, end_date')
        .single();
      if (error) throw error;

      const typeLabel = data.type === 'ferias' ? 'Férias' : data.type === 'abono' ? 'Abono' : 'Banco de horas';
      // parseISO, não `new Date('AAAA-MM-DD')`: este último é UTC e, no Brasil, mostra o dia anterior (regra 4).
      const period = `${format(parseISO(data.start_date), 'dd/MM')} a ${format(parseISO(data.end_date), 'dd/MM/yyyy')}`;
      // Colaborador sem login no Helpoint (rodada 2, R4) não tem onde receber o aviso: o RH avisa por fora.
      if (!data.user_id) return;
      const { error: notifyError } = await supabase.from('notifications').insert({
        tenant_id: tenantId,
        user_id: data.user_id,
        type: 'request_decided',
        reference_type: data.ticket_id ? 'ticket' : 'rh_request',
        reference_id: data.ticket_id || id,
        title: status === 'aprovada' ? 'Pedido aprovado' : 'Pedido recusado',
        message: `Seu pedido de ${typeLabel.toLowerCase()} (${period}) foi ${status === 'aprovada' ? 'aprovado' : `recusado. Motivo: ${motivo}`}.`,
      });
      if (notifyError) console.error(notifyError);
    },
    onSuccess: () => {
      toast.success('Decisão registrada.');
      setRecusando(null);
      qc.invalidateQueries({ queryKey: ['rh-all-vacation-requests'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pending = requests.filter((r: any) => r.status === 'pendente');

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Pedidos de férias e folgas</CardTitle>
          <CardDescription>{pending.length} aguardando decisão.</CardDescription>
        </div>
        {pode('vacations', 'approve') && (
          <Button size="sm" variant="outline" onClick={() => setRegistrarAberto(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Registrar ausência
          </Button>
        )}
        <RegistrarFeriasDialog open={registrarAberto} onOpenChange={setRegistrarAberto} />
        <MotivoDaRecusa titulo="Recusar as férias" quem={recusando?.quem ?? 'A pessoa'} aberto={!!recusando}
          enviando={decide.isPending} onCancelar={() => setRecusando(null)}
          onConfirmar={(motivo) => recusando && decide.mutate({ id: recusando.id, status: 'recusada', motivo })} />
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Nenhum pedido ainda.</div>
        ) : requests.map((r: any) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">
                {r.employee?.full_name || 'Colaborador'}
                <span className="text-muted-foreground font-normal"> · {r.employee?.department || '—'}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {r.type === 'ferias' ? 'Férias' : r.type === 'abono' ? 'Abono' : 'Banco de horas'} ·{' '}
                {/* parseISO: `new Date('AAAA-MM-DD')` é UTC e no Brasil mostrava o dia anterior (defeito 1, regra 4). */}
                {format(parseISO(r.start_date), 'dd/MM')} a {format(parseISO(r.end_date), 'dd/MM/yyyy')} ({r.days_requested} dias)
                {r.notes && ` · “${r.notes}”`}
                {r.status === 'recusada' && r.decision_notes && ` · Motivo da recusa: ${r.decision_notes}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {r.status === 'pendente' && pode('vacations', 'approve') ? (
                <>
                  <Button size="sm" variant="outline" className="text-status-danger" disabled={decide.isPending}
                    onClick={() => setRecusando({ id: r.id, quem: r.employee?.full_name || 'A pessoa' })}>
                    <XCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Recusar…
                  </Button>
                  <Button size="sm" disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, status: 'aprovada' })}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Aprovar
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
  const [rejeitando, setRejeitando] = useState<{ id: string; quem: string } | null>(null);

  const { data: items = [] } = useQuery({
    queryKey: ['rh-all-certificates', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const data = unwrap(await supabase
        .from('rh_medical_certificates')
        .select('*, employee:rh_employee_profiles!rh_medical_certificates_employee_id_fkey(id, full_name, department)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100));
      return data || [];
    },
    enabled: !!tenantId,
  });

  const decide = useMutation({
    mutationFn: async ({ id, status, motivo }: { id: string; status: 'validado' | 'rejeitado'; motivo?: string }) => {
      const { data, error } = await supabase
        .from('rh_medical_certificates')
        .update({ status, validated_at: new Date().toISOString(), ...(motivo ? { validation_notes: motivo } : {}) })
        .eq('id', id)
        .select('user_id, ticket_id, issue_date')
        .single();
      if (error) throw error;

      if (!data.user_id) return;
      const { error: notifyError } = await supabase.from('notifications').insert({
        tenant_id: tenantId,
        user_id: data.user_id,
        type: 'request_decided',
        reference_type: data.ticket_id ? 'ticket' : 'rh_request',
        reference_id: data.ticket_id || id,
        title: status === 'validado' ? 'Atestado validado' : 'Atestado recusado',
        message: `Seu atestado de ${format(parseISO(data.issue_date), 'dd/MM/yyyy')} foi ${status === 'validado' ? 'validado' : `recusado. Motivo: ${motivo}`}.`,
      });
      if (notifyError) console.error(notifyError);
    },
    onSuccess: () => {
      toast.success('Atestado atualizado.');
      setRejeitando(null);
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
        <MotivoDaRecusa titulo="Rejeitar o atestado" quem={rejeitando?.quem ?? 'A pessoa'} aberto={!!rejeitando}
          enviando={decide.isPending} onCancelar={() => setRejeitando(null)}
          onConfirmar={(motivo) => rejeitando && decide.mutate({ id: rejeitando.id, status: 'rejeitado', motivo })} />
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Nenhum atestado recebido.</div>
        ) : items.map((c: any) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">
                {c.employee?.full_name || 'Colaborador'} · {c.days_off} dia(s)
              </div>
              <div className="text-xs text-muted-foreground">
                Início {format(parseISO(c.issue_date), 'dd/MM/yyyy')}
                {c.doctor_name && ` · Dr(a). ${c.doctor_name}`}
                {c.cid_code && ` · CID ${c.cid_code}`}
                {c.status === 'rejeitado' && c.validation_notes && ` · Motivo: ${c.validation_notes}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => openFile(c.file_path)}>Ver arquivo</Button>
              {c.status === 'recebido' && pode('certificates', 'approve') ? (
                <>
                  <Button size="sm" variant="outline" className="text-status-danger" disabled={decide.isPending}
                    onClick={() => setRejeitando({ id: c.id, quem: c.employee?.full_name || 'A pessoa' })}>Rejeitar…</Button>
                  <Button size="sm" disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: c.id, status: 'validado' })}>Validar</Button>
                </>
              ) : (
                // Três estados, não dois (defeito 1): o "recebido" de quem só acompanha aparecia como "Rejeitado".
                <Badge variant="outline" className={
                  c.status === 'validado' ? 'badge-success text-status-success border-border'
                    : c.status === 'rejeitado' ? 'badge-danger text-status-danger border-status-danger'
                    : 'bg-muted text-muted-foreground border-border'
                }>
                  {c.status === 'validado' ? 'Validado' : c.status === 'rejeitado' ? 'Rejeitado' : 'Recebido, aguardando o RH'}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
