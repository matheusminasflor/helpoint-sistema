import { sanitizeFileName } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useQueryState } from '@/hooks/useQueryState';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useSetBreadcrumbLeaf } from '@/contexts/BreadcrumbContext';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Send, Lock, Sparkles, FileSearch, CheckCircle2, Loader2, Paperclip, X, Star } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AttachmentsList } from '@/components/sac/AttachmentsList';
import { CommentAttachments } from '@/components/sac/CommentAttachments';
import { ProductComplaintsList } from '@/components/sac/ProductComplaintsList';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open: { label: 'Aberto', color: 'bg-blue-100 text-blue-800' },
  in_analysis: { label: 'Em análise', color: 'bg-yellow-100 text-yellow-800' },
  awaiting_customer: { label: 'Aguardando cliente', color: 'bg-orange-100 text-orange-800' },
  resolved: { label: 'Resolvido', color: 'bg-green-100 text-green-800' },
  closed: { label: 'Encerrado', color: 'bg-gray-100 text-gray-800' },
};
const STATUSES = Object.keys(STATUS_LABEL);
const fmt = (d: string) => { try { return format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return ''; } };

export function QualidadeSACList() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [tickets, setTickets] = useState<any[]>([]);
  const [filter, setFilter] = useQueryState<string>('status', 'all');

  useEffect(() => {
    supabase.from('sac_tickets').select('*').order('created_at', { ascending: false }).then(({ data }) => setTickets(data || []));
  }, []);

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="SAC — Atendimento ao Cliente"
        description="Gerencie todos os chamados abertos pelos clientes."
        className="bg-transparent border-0 px-0 py-0 mb-6"
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>Todos ({tickets.length})</Button>
        {STATUSES.map(s => {
          const count = tickets.filter(t => t.status === s).length;
          return <Button key={s} size="sm" variant={filter === s ? 'default' : 'outline'} onClick={() => setFilter(s)}>{STATUS_LABEL[s].label} ({count})</Button>;
        })}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 border-b">
              <tr>
                <th className="text-left p-3">Protocolo</th>
                <th className="text-left p-3">Cliente</th>
                <th className="text-left p-3">Produto</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Aberto em</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum chamado.</td></tr>}
              {filtered.map(t => {
                const s = STATUS_LABEL[t.status] || STATUS_LABEL.open;
                const extra = parseInt(((t.subject || '').match(/\+\s*(\d+)\s*produto/i) || [])[1] || '0', 10);
                const totalProducts = extra > 0 ? extra + 1 : 1;
                return (
                  <tr key={t.id} onClick={() => navigate(tenantPath(`/qualidade/sacs/${t.id}`))} className="border-b hover:bg-surface-2 cursor-pointer">
                    <td className="p-3 font-mono text-xs">SAC-{String(t.ticket_number).padStart(5, '0')}</td>
                    <td className="p-3">{t.customer_name}<br /><span className="text-xs text-muted-foreground">{t.customer_email}</span></td>
                    <td className="p-3">
                      {t.product_name || '—'}
                      {t.product_batch && <span className="text-xs text-muted-foreground"> · Lote {t.product_batch}</span>}
                      {totalProducts > 1 && (
                        <Badge variant="outline" className="ml-2 border-primary/40 text-primary">
                          +{totalProducts - 1}
                        </Badge>
                      )}
                    </td>
                    <td className="p-3"><Badge className={s.color}>{s.label}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground">{fmt(t.created_at)}</td>
                  </tr>
                );
              })}

            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function QualidadeSACDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [ticket, setTicket] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  useSetBreadcrumbLeaf(
    ticket
      ? `#${ticket.ticket_number} — ${String(ticket.subject || ticket.title || '').slice(0, 40)}`
      : null,
  );

  const load = async () => {
    if (!id) return;
    const { data: t, error: tErr } = await supabase.from('sac_tickets').select('*, sac_categories(name, color)').eq('id', id).maybeSingle();
    if (tErr) { console.error(tErr); return; }
    setTicket(t);
    const { data: c, error: cErr } = await supabase.from('sac_ticket_comments').select('*').eq('ticket_id', id).order('created_at');
    if (cErr) { console.error(cErr); return; }
    setComments(c || []);
    const { data: r, error: rErr } = await supabase.from('sac_technical_reports').select('*').eq('ticket_id', id);
    if (rErr) { console.error(rErr); return; }
    setReports(r || []);
    const { data: p, error: pErr } = await supabase.from('sac_ticket_products').select('*').eq('ticket_id', id).order('sort_order');
    if (pErr) { console.error(pErr); return; }
    setProducts(p || []);
  };
  useEffect(() => { load(); }, [id]);

  const updateStatus = async (status: string) => {
    if (!id) return;
    const payload: any = { status };
    if (status === 'resolved') payload.resolved_at = new Date().toISOString();
    if (status === 'closed') payload.closed_at = new Date().toISOString();
    const { data, error } = await supabase.from('sac_tickets').update(payload).eq('id', id).select('id');
    if (error) {
      const msg = error.message || '';
      if (msg.toLowerCase().includes('laudo')) {
        toast.error('Laudo Técnico obrigatório. Clique em "Laudo Técnico" antes de finalizar.');
      } else {
        toast.error(`Falha ao alterar status: ${msg}`);
      }
      return;
    }
    if (!data || data.length === 0) {
      toast.error('Sem permissão para alterar o status deste SAC.');
      return;
    }
    toast.success('Status atualizado');
    load();
  };

  const send = async () => {
    if ((!reply.trim() && files.length === 0) || !id) return;
    setSending(true);
    const { user } = unwrap(await supabase.auth.getUser());
    const { data: p, error: pErr } = await supabase.from('profiles').select('full_name').eq('id', user?.id).maybeSingle();
    if (pErr) { toast.error(pErr.message); setSending(false); return; }

    // upload attachments
    const uploaded: any[] = [];
    for (const f of files) {
      const path = `${ticket.tenant_id}/${id}/replies/${Date.now()}-${sanitizeFileName(f.name)}`;
      const { error: upErr } = await supabase.storage.from('sac-attachments').upload(path, f);
      if (upErr) { toast.error(`Falha ao enviar ${f.name}: ${upErr.message}`); continue; }
      uploaded.push({ file_name: f.name, file_path: path, mime_type: f.type, file_size: f.size });
    }

    const { error } = await supabase.from('sac_ticket_comments').insert({
      tenant_id: ticket.tenant_id, ticket_id: id, author_id: user?.id,
      author_type: 'staff', author_name: p?.full_name || 'Atendimento',
      content: reply || '(anexo enviado)', is_internal: internal,
      attachments: uploaded,
    });
    if (!error && !ticket.first_response_at && !internal) {
      await supabase.from('sac_tickets').update({ first_response_at: new Date().toISOString() }).eq('id', id);
    }
    if (error) toast.error(error.message);
    setReply(''); setFiles([]); setSending(false); load();
  };

  const suggestAI = async () => {
    if (!ticket) return;
    setAiLoading(true);
    try {
      const conversation = comments.map((c: any) => `${c.author_name || c.author_type}: ${c.content}`).join('\n');
      const productList = products.length > 0
        ? products.map((p: any, i: number) => `Produto ${i + 1}: ${p.product_name}${p.product_batch ? ` (lote ${p.product_batch})` : ''}${p.quantity ? ` — qtd ${p.quantity}` : ''}`).join('\n')
        : `Produto: ${ticket.product_name || '-'} (lote ${ticket.product_batch || '-'})`;
      const { data, error } = await supabase.functions.invoke('ai-suggest-reply', {
        body: {
          context: `SAC do cliente ${ticket.customer_name}.\n${productList}\n\nReclamação: ${ticket.description}\n\nHistórico:\n${conversation}`,
          tone: 'cliente externo, cordial e profissional, foco em qualidade do produto',
        },
      });
      if (error) throw error;
      if (data?.reply) setReply(data.reply);
    } catch (e: any) {
      toast.error('Falha ao sugerir resposta.');
    } finally {
      setAiLoading(false);
    }
  };

  if (!ticket) return <div className="p-8">Carregando...</div>;
  const s = STATUS_LABEL[ticket.status] || STATUS_LABEL.open;
  const productCount = products.length;
  const completedReports = reports.filter(r => r.status === 'completed').length;
  const requiredReports = Math.max(productCount, 1);
  const allReportsDone = completedReports >= requiredReports;
  const labReportLabel = allReportsDone
    ? (productCount > 1 ? `Laudos concluídos (${completedReports}/${requiredReports})` : 'Laudo concluído')
    : (productCount > 1 ? `Laudos (${completedReports}/${requiredReports})` : (reports.length > 0 ? 'Continuar laudo' : 'Laudo Técnico'));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Button size="sm" variant="ghost" onClick={() => navigate(tenantPath('/qualidade/sacs'))}><ArrowLeft className="w-4 h-4 mr-1" />Voltar</Button>
        <Link to={`/qualidade/sacs/${id}/laudo`}>
          <Button size="sm" variant={allReportsDone ? 'outline' : 'default'}>
            {allReportsDone ? <CheckCircle2 className="w-4 h-4 mr-1 text-green-600" /> : <FileSearch className="w-4 h-4 mr-1" />}
            {labReportLabel}
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-3 lg:col-span-2 space-y-4">
          <Card className="p-5">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-xs font-mono text-muted-foreground">SAC-{String(ticket.ticket_number).padStart(5, '0')}</p>
                <h2 className="text-xl font-bold">{ticket.subject || ticket.product_name || 'Solicitação'}</h2>
                <p className="text-xs text-muted-foreground mt-1">Aberto em {fmt(ticket.created_at)}</p>
              </div>
              <Badge className={s.color}>{s.label}</Badge>
            </div>
            <p className="whitespace-pre-wrap text-sm border-t pt-3 mt-2">{ticket.description}</p>
          </Card>

          {products.length > 0 && (
            <Card className="p-5">
              <ProductComplaintsList items={products} variant="staff" />
            </Card>
          )}

          <Card className="p-4">
            <AttachmentsList ticketId={id!} />
          </Card>

          <Card className="p-4 space-y-2">
            <h3 className="font-semibold text-sm mb-2">Conversa</h3>
            {comments.length === 0 && <p className="text-xs text-muted-foreground">Sem mensagens ainda.</p>}
            {comments.map(c => (
              <div key={c.id} className={`p-3 rounded-lg ${c.is_internal ? 'bg-yellow-50 border border-yellow-200' : c.author_type === 'staff' ? 'bg-blue-50' : 'bg-surface-2'}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold flex items-center gap-1">
                    {c.is_internal && <Lock className="w-3 h-3" />}
                    {c.author_name} {c.is_internal && <span className="text-yellow-800">(nota interna)</span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{fmt(c.created_at)}</p>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                <CommentAttachments attachments={c.attachments} />
              </div>
            ))}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Responder</span>
              <Button size="sm" variant="outline" onClick={suggestAI} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                Sugerir com IA
              </Button>
            </div>
            <Textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Escreva uma resposta..." rows={4} />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {files.map((f, i) => (
                  <span key={i} className="text-xs bg-surface-2 border rounded px-2 py-1 flex items-center gap-1">
                    {f.name}
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs cursor-pointer hover:text-primary">
                  <Paperclip className="w-3.5 h-3.5" /> Anexar
                  <input type="file" multiple className="hidden" onChange={e => setFiles([...files, ...Array.from(e.target.files || [])])} />
                </label>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />Nota interna (cliente não vê)</label>
              </div>
              <Button onClick={send} disabled={sending || (!reply.trim() && files.length === 0)}><Send className="w-4 h-4 mr-2" />Enviar</Button>
            </div>
          </Card>
        </div>

        <div className="col-span-3 lg:col-span-1 space-y-4">
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">Cliente</h3>
            <div className="space-y-1 text-sm">
              <p><strong>{ticket.customer_name}</strong></p>
              <p className="text-muted-foreground">{ticket.customer_email}</p>
              <p className="text-muted-foreground">{ticket.customer_phone}</p>
              <p className="text-muted-foreground">{ticket.customer_document}</p>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">
              {productCount > 1 ? `Produtos (${productCount})` : 'Produto'}
            </h3>
            {productCount > 0 ? (
              <div className="space-y-2 text-sm">
                {products.map((pr: any, i: number) => (
                  <div key={pr.id} className={`${i > 0 ? 'border-t pt-2' : ''}`}>
                    {productCount > 1 && <p className="text-[11px] text-muted-foreground">Produto {i + 1}</p>}
                    <p className="font-semibold truncate" title={pr.product_name || ''}>{pr.product_name || '—'}</p>
                    {pr.product_batch && <p className="text-xs text-muted-foreground">Lote {pr.product_batch}</p>}
                  </div>
                ))}
                {productCount > 1 && (
                  <p className="text-[11px] text-muted-foreground border-t pt-2">
                    Veja o relato e as fotos de cada produto ao lado.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <p><strong>{ticket.product_name || '—'}</strong></p>
                {ticket.product_batch && <p>Lote: {ticket.product_batch}</p>}
                {ticket.quantity && <p>Quantidade: {ticket.quantity}</p>}
                {ticket.purchase_date && <p>Compra: {new Date(ticket.purchase_date).toLocaleDateString('pt-BR')}</p>}
                {ticket.order_number && <p>Pedido: {ticket.order_number}</p>}
              </div>
            )}
          </Card>


          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">Status</h3>
            <select value={ticket.status} onChange={e => updateStatus(e.target.value)} className="w-full h-9 rounded-md border px-2 text-sm">
              {STATUSES.map(st => <option key={st} value={st}>{STATUS_LABEL[st].label}</option>)}
            </select>
            <div className="flex gap-2 mt-3">
              {!['resolved','closed'].includes(ticket.status) ? (
                <Button size="sm" className="flex-1" onClick={() => updateStatus('closed')} disabled={!allReportsDone}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Encerrar SAC
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="flex-1" onClick={() => updateStatus('in_analysis')}>
                  Reabrir SAC
                </Button>
              )}
            </div>
            {!allReportsDone && !['resolved','closed'].includes(ticket.status) && (
              <p className="text-xs text-orange-600 mt-2">
                {productCount > 1
                  ? `Conclua o laudo de cada produto antes de encerrar (${completedReports} de ${requiredReports} prontos).`
                  : 'Para finalizar, é preciso concluir o Laudo Técnico.'}
              </p>
            )}
          </Card>

          {ticket.satisfaction_rating && (
            <Card className="p-4 bg-yellow-50/40 border-yellow-200">
              <h3 className="font-semibold text-sm mb-2">Avaliação do cliente</h3>
              <div className="flex items-center gap-1 mb-1" aria-label={`Avaliação ${ticket.satisfaction_rating} de 5`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={i < ticket.satisfaction_rating ? 'w-4 h-4 fill-status-warning text-status-warning' : 'w-4 h-4 text-muted-foreground'}
                    aria-hidden="true"
                  />
                ))}
                <span className="text-xs text-foreground ml-2">{ticket.satisfaction_rating}/5</span>
              </div>
              {ticket.satisfaction_resolved && (
                <p className="text-xs text-muted-foreground">
                  Resolvido: <strong className="text-foreground">
                    {ticket.satisfaction_resolved === 'yes' ? 'Sim' : ticket.satisfaction_resolved === 'partial' ? 'Parcialmente' : 'Não'}
                  </strong>
                </p>
              )}
              {ticket.satisfaction_comment && (
                <p className="text-sm mt-2 whitespace-pre-wrap">"{ticket.satisfaction_comment}"</p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
