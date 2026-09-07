import { sanitizeFileName } from '@/lib/utils';
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  LogOut, Plus, Send, ArrowLeft, BookOpen, MessageSquare, Paperclip, X,
  HelpCircle, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AttachmentsList } from '@/components/sac/AttachmentsList';
import { CommentAttachments } from '@/components/sac/CommentAttachments';
import { ProductComplaintsList } from '@/components/sac/ProductComplaintsList';
import {
  SACOnboardingDialog,
  hasSeenOnboarding,
} from '@/components/sac/SACOnboardingDialog';
import { RatingDialog } from '@/components/sac/RatingDialog';
import { ImproveTextButton } from '@/components/ai/ImproveTextButton';
import { useSacTenantSlug } from '@/hooks/useSacTenantSlug';

/** Preserva o ?tenant=<slug> nos links do painel do cliente (acesso whitelabel). */
const withTenant = (path: string, slug: string | null) => (slug ? `${path}?tenant=${slug}` : path);

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open: { label: 'Aberto', color: 'bg-blue-100 text-blue-700' },
  in_analysis: { label: 'Em análise', color: 'bg-yellow-100 text-yellow-800' },
  awaiting_customer: { label: 'Aguardando você', color: 'bg-orange-100 text-orange-800' },
  resolved: { label: 'Resolvido', color: 'bg-green-100 text-green-700' },
  closed: { label: 'Encerrado', color: 'bg-gray-100 text-gray-700' },
};

const fmt = (d: string) => {
  try { return format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return ''; }
};

function CustomerHeader({
  onOpenOnboarding,
  children,
}: {
  onOpenOnboarding?: () => void;
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const slug = useSacTenantSlug();
  const signOut = async () => { await supabase.auth.signOut(); navigate(withTenant('/sac/acesso', slug)); };
  return (
    <header className="bg-card border-b sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
        <Link to={withTenant('/sac/meus-chamados', slug)} className="font-bold text-primary">Painel do Cliente</Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link to={withTenant('/sac/meus-chamados', slug)}><Button size="sm" variant="ghost"><MessageSquare className="w-4 h-4 mr-1" />Meus SACs</Button></Link>
          <Link to={withTenant('/sac/base-conhecimento', slug)}><Button size="sm" variant="ghost"><BookOpen className="w-4 h-4 mr-1" />Tutoriais</Button></Link>
          {onOpenOnboarding && (
            <Button size="sm" variant="ghost" onClick={onOpenOnboarding} title="Como funciona o SAC">
              <HelpCircle className="w-4 h-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="w-4 h-4" /></Button>
        </nav>
      </div>
      {children}
    </header>
  );
}

const STATUS_FILTERS: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: 'all',       label: 'Todos',           match: () => true },
  { key: 'open',      label: 'Em aberto',       match: s => ['open', 'in_analysis', 'awaiting_customer'].includes(s) },
  { key: 'awaiting',  label: 'Aguardando você', match: s => s === 'awaiting_customer' },
  { key: 'closed',    label: 'Encerrados',      match: s => ['resolved', 'closed'].includes(s) },
];

export function MyTickets() {
  const navigate = useNavigate();
  const slug = useSacTenantSlug();
  const { user, isCustomer, customerProfile, isLoading, refreshProfile } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [pendingRating, setPendingRating] = useState<any | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate(withTenant('/sac/acesso', slug));
      return;
    }
    if (isCustomer && customerProfile) return;
    // Safety net: revalida; se não houver perfil, faz logout em vez de
    // empurrar para /sac/cadastro (cliente já está logado).
    (async () => {
      const { data, error } = await supabase
        .from('customer_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) { toast.error(error.message); return; }
      if (data) {
        await refreshProfile();
      } else {
        await supabase.auth.signOut();
        navigate(withTenant('/sac/acesso', slug));
      }
    })();
  }, [isLoading, user, isCustomer, customerProfile, navigate, refreshProfile]);

  const computeUnread = useCallback(async (list: any[]) => {
    if (!list.length) { setUnread({}); return; }
    const ids = list.map(t => t.id);
    const { data: comments, error } = await supabase
      .from('sac_ticket_comments')
      .select('ticket_id, created_at, author_type, is_internal')
      .in('ticket_id', ids)
      .eq('author_type', 'staff')
      .eq('is_internal', false);
    if (error) { toast.error(error.message); return; }
    const counts: Record<string, number> = {};
    for (const t of list) {
      const last = t.customer_last_seen_at ? new Date(t.customer_last_seen_at).getTime() : 0;
      counts[t.id] = (comments || []).filter(c =>
        c.ticket_id === t.id && new Date(c.created_at).getTime() > last
      ).length;
    }
    setUnread(counts);
  }, []);

  const load = useCallback(async () => {
    const { data: t, error } = await supabase
      .from('sac_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { toast.error(error.message); return; }
    setTickets(t || []);
    computeUnread(t || []);

    const needsRating = (t || []).find(
      (x: any) => ['resolved', 'closed'].includes(x.status) && !x.satisfaction_rating,
    );
    if (needsRating) setPendingRating(needsRating);
  }, [computeUnread]);

  useEffect(() => {
    if (!user || !isCustomer) return;
    load();
  }, [user, isCustomer, load]);

  useEffect(() => {
    if (!user || !isCustomer || !customerProfile) return;
    const seen = hasSeenOnboarding(user.id) || !!customerProfile.onboarded_at;
    if (!seen) {
      const t = setTimeout(() => setOnboardingOpen(true), 350);
      return () => clearTimeout(t);
    }
  }, [user, isCustomer, customerProfile]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('sac-customer-comments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sac_ticket_comments' }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  const counts = STATUS_FILTERS.reduce((acc, f) => {
    acc[f.key] = tickets.filter(t => f.match(t.status)).length;
    return acc;
  }, {} as Record<string, number>);
  const visible = tickets.filter(t => STATUS_FILTERS.find(f => f.key === filter)!.match(t.status));

  return (
    <div className="min-h-screen bg-surface-1">
      <CustomerHeader onOpenOnboarding={() => setOnboardingOpen(true)} />
      <div className="max-w-5xl mx-auto p-4 grid md:grid-cols-[220px_1fr] gap-4">
        <aside className="md:sticky md:top-20 md:self-start">
          <Card className="p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Filtros</p>
            <nav className="space-y-1">
              {STATUS_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`w-full flex items-center justify-between text-sm rounded px-2 py-1.5 transition ${
                    filter === f.key
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-surface-2 text-foreground'
                  }`}
                >
                  <span>{f.label}</span>
                  <span className={`text-xs ${filter === f.key ? 'opacity-90' : 'text-muted-foreground'}`}>
                    {counts[f.key] || 0}
                  </span>
                </button>
              ))}
            </nav>
            <Button size="sm" className="w-full mt-3" onClick={() => navigate(withTenant('/sac/novo', slug))}>
              <Plus className="w-4 h-4 mr-1" />Novo SAC
            </Button>
          </Card>
        </aside>

        <section className="space-y-3 min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Meus Chamados
              <span className="text-xs text-muted-foreground font-normal ml-2">
                ({visible.length}{filter !== 'all' && ` de ${tickets.length}`})
              </span>
            </h2>
          </div>
          {visible.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              {tickets.length === 0
                ? 'Você ainda não tem chamados.'
                : 'Nenhum chamado neste filtro.'}
            </Card>
          )}
          {visible.map(t => {
            const s = STATUS_LABEL[t.status] || STATUS_LABEL.open;
            const n = unread[t.id] || 0;
            const closedNoRating = ['resolved', 'closed'].includes(t.status) && !t.satisfaction_rating;
            return (
              <Link key={t.id} to={withTenant(`/sac/meus-chamados/${t.id}`, slug)}>
                <Card className={`p-4 hover:bg-surface-2 transition cursor-pointer ${n > 0 ? 'border-primary/60 bg-primary/5' : ''}`}>
                  <div className="flex justify-between items-start mb-2 gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-mono">SAC-{String(t.ticket_number).padStart(5, '0')}</p>
                      <h3 className="font-semibold truncate flex items-center gap-2 flex-wrap">
                        {t.subject || t.product_name || 'Solicitação'}
                        {/\+\s*(\d+)\s*produto/i.test(t.subject || '') && (
                          <Badge variant="outline" className="border-primary/40 text-primary">
                            {(parseInt((t.subject.match(/\+\s*(\d+)\s*produto/i) || [])[1] || '0', 10) + 1)} produtos
                          </Badge>
                        )}
                        {n > 0 && (
                          <Badge className="bg-primary text-primary-foreground animate-pulse">
                            {n} {n === 1 ? 'nova resposta' : 'novas respostas'}
                          </Badge>
                        )}
                        {closedNoRating && (
                          <Badge variant="outline" className="border-yellow-500 text-yellow-800">
                            <Star className="w-3 h-3 mr-1" /> avaliar
                          </Badge>
                        )}
                        {t.satisfaction_rating && (
                          <span className="inline-flex items-center text-yellow-500 text-xs">
                            <Star className="w-3 h-3 fill-current" /> {t.satisfaction_rating}
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">Aberto em {fmt(t.created_at)}</p>
                    </div>
                    <Badge className={s.color}>{s.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>

                </Card>
              </Link>
            );
          })}
        </section>
      </div>

      <SACOnboardingDialog
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        customerName={customerProfile?.full_name}
        tenantId={customerProfile?.tenant_id}
        userId={user?.id}
        persistSeen
      />

      {pendingRating && (
        <RatingDialog
          open={!!pendingRating}
          ticketId={pendingRating.id}
          protocol={`SAC-${String(pendingRating.ticket_number).padStart(5, '0')}`}
          onClose={() => setPendingRating(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

export function MyTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const slug = useSacTenantSlug();
  const { user, isCustomer, customerProfile, isLoading } = useAuth();
  const [ticket, setTicket] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [productItems, setProductItems] = useState<any[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [ratingOpen, setRatingOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { navigate(withTenant('/sac/acesso', slug)); return; }
    if (isCustomer) return;
    // safety net: sem perfil de cliente → logout, não cadastro de novo
    (async () => {
      const { data, error } = await supabase
        .from('customer_profiles').select('id').eq('user_id', user.id).maybeSingle();
      if (error) { toast.error(error.message); return; }
      if (!data) {
        await supabase.auth.signOut();
        navigate(withTenant('/sac/acesso', slug));
      }
    })();
  }, [isLoading, user, isCustomer, navigate]);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: t, error: tErr } = await supabase.from('sac_tickets').select('*').eq('id', id).maybeSingle();
    if (tErr) { toast.error(tErr.message); return; }
    setTicket(t);
    const { data: c, error: cErr } = await supabase.from('sac_ticket_comments').select('*').eq('ticket_id', id).order('created_at');
    if (cErr) { toast.error(cErr.message); return; }
    setComments((c || []).filter((x: any) => !x.is_internal));
    const { data: items, error: itemsErr } = await supabase.from('sac_ticket_products').select('*').eq('ticket_id', id).order('sort_order');
    if (itemsErr) { toast.error(itemsErr.message); return; }
    setProductItems(items || []);
    if (t) {
      try {
        expectRows(
          await supabase.from('sac_tickets').update({ customer_last_seen_at: new Date().toISOString() }).eq('id', id).select('id'),
          'a marcação de visto',
        );
      } catch (e) {
        console.error(e);
      }
    }
  }, [id]);

  useEffect(() => { if (user && isCustomer) load(); }, [user, isCustomer, load]);

  useEffect(() => {
    if (!id || !user) return;
    const ch = supabase
      .channel(`sac-ticket-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sac_ticket_comments', filter: `ticket_id=eq.${id}` }, () => {
        load();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sac_tickets', filter: `id=eq.${id}` }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, user, load]);

  const send = async () => {
    if ((!reply.trim() && files.length === 0) || !id || !user) return;
    setSending(true);

    const uploaded: any[] = [];
    for (const f of files) {
      const path = `${ticket.tenant_id}/customer/${user.id}/${id}/replies/${Date.now()}-${sanitizeFileName(f.name)}`;
      const { error: upErr } = await supabase.storage.from('sac-attachments').upload(path, f);
      if (upErr) { toast.error(`Falha ao enviar ${f.name}: ${upErr.message}`); continue; }
      uploaded.push({ file_name: f.name, file_path: path, mime_type: f.type, file_size: f.size });
    }

    const { error } = await supabase.from('sac_ticket_comments').insert({
      tenant_id: ticket.tenant_id,
      ticket_id: id,
      author_id: user.id,
      author_type: 'customer',
      author_name: ticket.customer_name,
      content: reply || '(anexo enviado)',
      is_internal: false,
      attachments: uploaded,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setReply(''); setFiles([]); load();
  };

  if (!ticket) return <div className="p-8 text-center">Carregando...</div>;
  const s = STATUS_LABEL[ticket.status] || STATUS_LABEL.open;
  const isClosed = ['resolved', 'closed'].includes(ticket.status);
  const invoices: any[] = Array.isArray(ticket.invoice_attachments) ? ticket.invoice_attachments : [];

  return (
    <div className="min-h-screen bg-surface-1">
      <CustomerHeader />
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <Button size="sm" variant="ghost" onClick={() => navigate(withTenant('/sac/meus-chamados', slug))}><ArrowLeft className="w-4 h-4 mr-1" />Voltar</Button>
        <Card className="p-5">
          <div className="flex justify-between items-start gap-3">
            <div>
              <p className="text-xs font-mono text-muted-foreground">SAC-{String(ticket.ticket_number).padStart(5, '0')}</p>
              <h1 className="text-xl font-bold">{ticket.subject || ticket.product_name}</h1>
              <p className="text-xs text-muted-foreground mt-1">Aberto em {fmt(ticket.created_at)}</p>
            </div>
            <Badge className={s.color}>{s.label}</Badge>
          </div>
          <p className="whitespace-pre-wrap text-sm border-t pt-3 mt-3">{ticket.description}</p>
          {productItems.length > 0 ? (
            <div className="mt-4 border-t pt-4">
              <ProductComplaintsList items={productItems} variant="customer" />
            </div>
          ) : (ticket.product_name || ticket.product_batch) && (
            <p className="text-xs text-muted-foreground mt-3">
              {ticket.product_name && <>Produto: <strong>{ticket.product_name}</strong></>}
              {ticket.product_batch && <> · Lote {ticket.product_batch}</>}
              {ticket.quantity && <> · Qtd {ticket.quantity}</>}
            </p>
          )}

          {invoices.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs font-semibold mb-1">Nota fiscal anexada</p>
              <ul className="text-xs space-y-1">
                {invoices.map((inv, i) => (
                  <li key={i} className="text-muted-foreground">{inv.file_name}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {isClosed && (
          <Card className="p-4 bg-yellow-50/60 border-yellow-200">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <Star className="w-4 h-4 text-yellow-500 fill-current" />
                {ticket.satisfaction_rating
                  ? <span>Você avaliou com <strong>{ticket.satisfaction_rating}/5</strong>. Obrigado!</span>
                  : <span>Este atendimento foi encerrado. <strong>Avalie sua experiência</strong>.</span>}
              </div>
              {!ticket.satisfaction_rating && (
                <Button size="sm" onClick={() => setRatingOpen(true)}>Avaliar agora</Button>
              )}
            </div>
          </Card>
        )}

        <AttachmentsList ticketId={id!} />

        <div className="space-y-2">
          {comments.map(c => (
            <div key={c.id} className={`flex ${c.author_type === 'customer' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg p-3 ${c.author_type === 'customer' ? 'bg-primary text-primary-foreground' : 'bg-card border'}`}>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <p className="text-xs opacity-75 font-semibold">{c.author_name || (c.author_type === 'staff' ? 'Atendimento' : 'Você')}</p>
                  <p className="text-[10px] opacity-60">{fmt(c.created_at)}</p>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                <CommentAttachments attachments={c.attachments} />
              </div>
            </div>
          ))}
        </div>

        {ticket.status !== 'closed' && (
          <Card className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Responder</span>
              <ImproveTextButton
                text={reply}
                onApply={setReply}
                tone="claro e educado, mantendo todos os fatos do cliente"
              />
            </div>
            <Textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Escreva uma resposta..." rows={3} />
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
            <div className="flex items-center justify-between mt-2 gap-2">
              <label className="flex items-center gap-1 text-xs cursor-pointer hover:text-primary">
                <Paperclip className="w-3.5 h-3.5" /> Anexar fotos
                <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={e => setFiles([...files, ...Array.from(e.target.files || [])])} />
              </label>
              <Button onClick={send} disabled={sending || (!reply.trim() && files.length === 0)}>
                <Send className="w-4 h-4 mr-2" />Enviar
              </Button>
            </div>
          </Card>
        )}
      </div>

      <RatingDialog
        open={ratingOpen}
        ticketId={ticket.id}
        protocol={`SAC-${String(ticket.ticket_number).padStart(5, '0')}`}
        onClose={() => setRatingOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
