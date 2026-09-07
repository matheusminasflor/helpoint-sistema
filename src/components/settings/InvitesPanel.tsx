import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Mail, RefreshCw, Trash2, AlertCircle, CheckCircle2, Clock, Search } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface InviteRow {
  id: string;
  email: string;
  role: string;
  department: string | null;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  send_status: string | null;
  send_attempts: number | null;
  last_sent_at: string | null;
  last_send_error: string | null;
}

function effectiveStatus(i: InviteRow): 'accepted' | 'failed' | 'expired' | 'sent' | 'pending' {
  if (i.used_at) return 'accepted';
  if (i.send_status === 'failed') return 'failed';
  if (new Date(i.expires_at).getTime() < Date.now()) return 'expired';
  if (i.send_status === 'sent') return 'sent';
  return 'pending';
}

const STATUS_LABEL: Record<string, string> = {
  accepted: 'Aceito',
  failed: 'Falha no envio',
  expired: 'Expirado',
  sent: 'Aguardando aceite',
  pending: 'Pendente',
};

const STATUS_CLASS: Record<string, string> = {
  accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  failed: 'bg-rose-100 text-rose-800 border-rose-200',
  expired: 'bg-slate-100 text-slate-700 border-slate-200',
  sent: 'bg-blue-100 text-blue-800 border-blue-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
};

export function InvitesPanel() {
  const qc = useQueryClient();
  const { tenantId } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ['tenant-invites', tenantId],
    queryFn: async (): Promise<InviteRow[]> => {
      const { data, error } = await supabase
        .from('tenant_invites')
        .select('id,email,role,department,invited_by,created_at,expires_at,used_at,send_status,send_attempts,last_sent_at,last_send_error')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any;
    },
  });

  const resend = useMutation({
    mutationFn: async (invite_id: string) => {
      const { data, error } = await supabase.functions.invoke('invite-signup', {
        body: { action: 'resend_invite', invite_id },
      });
      if (error) throw new Error(error.message);
      return data as any;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['tenant-invites'] });
      if (data?.email_sent) toast.success('Convite reenviado');
      else toast.warning('Não foi possível reenviar', { description: data?.error || 'Verifique o domínio de e-mail.', duration: 8000 });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (invite_id: string) => {
      const { data, error } = await supabase.functions.invoke('invite-signup', {
        body: { action: 'cancel_invite', invite_id },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-invites'] });
      toast.success('Convite removido');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = invites.filter(i => {
    if (statusFilter !== 'all' && effectiveStatus(i) !== statusFilter) return false;
    if (search && !i.email.toLowerCase().includes(search.toLowerCase()) && !(i.department || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const hasFailures = invites.some(i => effectiveStatus(i) === 'failed');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Convites enviados</CardTitle>
              <CardDescription>
                {invites.length} convite(s). Acompanhe o status do envio e reenvie quando necessário.
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar e-mail ou setor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="sent">Aguardando aceite</SelectItem>
                <SelectItem value="accepted">Aceitos</SelectItem>
                <SelectItem value="failed">Falha no envio</SelectItem>
                <SelectItem value="expired">Expirados</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {hasFailures && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <div>
              Alguns convites falharam ao enviar. O domínio <b>notify.helpoint.com.br</b> ainda está aguardando verificação DNS — enquanto isso, o sistema tenta automaticamente um remetente padrão. Para usar seu domínio próprio, conclua a verificação em Configurações do projeto → E-mails.
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Nenhum convite encontrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Enviado</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(i => {
                const st = effectiveStatus(i);
                const canResend = st === 'sent' || st === 'failed' || st === 'expired' || st === 'pending';
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.email}</TableCell>
                    <TableCell><Badge variant="outline">{i.role}</Badge></TableCell>
                    <TableCell>{i.department || '—'}</TableCell>
                    <TableCell className="text-xs">
                      {i.last_sent_at ? format(new Date(i.last_sent_at), 'dd/MM/yy HH:mm', { locale: ptBR }) : '—'}
                      {(i.send_attempts || 0) > 1 && <span className="text-muted-foreground"> ({i.send_attempts}x)</span>}
                    </TableCell>
                    <TableCell className="text-xs">{format(new Date(i.expires_at), 'dd/MM/yy', { locale: ptBR })}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={STATUS_CLASS[st]}>
                          {st === 'accepted' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                          {st === 'failed' && <AlertCircle className="w-3 h-3 mr-1" />}
                          {(st === 'sent' || st === 'pending') && <Clock className="w-3 h-3 mr-1" />}
                          {STATUS_LABEL[st]}
                        </Badge>
                        {st === 'failed' && i.last_send_error && (
                          <span className="text-[10px] text-rose-700 max-w-[200px] truncate" title={i.last_send_error}>
                            {i.last_send_error}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canResend && (
                          <Button size="sm" variant="ghost" disabled={resend.isPending} onClick={() => resend.mutate(i.id)}>
                            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reenviar
                          </Button>
                        )}
                        {st !== 'accepted' && (
                          <Button size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => {
                            if (confirm(`Remover convite de ${i.email}?`)) cancel.mutate(i.id);
                          }}>
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
