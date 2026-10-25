import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, Users, HardDrive, Lightbulb, Search, Newspaper, BookMarked, Zap } from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { abreATela, telaDoPerfil } from '@/config/telas-do-perfil';
import { toast } from 'sonner';

// O Ctrl+K também FAZ (etapa 3, 2026-10-24): as ações mais usadas, filtradas pelo que se digita e pelo perfil.
const ACOES: { id: string; label: string; to: string }[] = [
  { id: 'abrir', label: 'Abrir um chamado', to: '/nova-solicitacao' },
  { id: 'meus', label: 'Ver meus chamados', to: '/helpdesk' },
  { id: 'pedidos', label: 'Ver meus pedidos', to: '/solicitacoes' },
  { id: 'pedir-compra', label: 'Pedir compra', to: '/solicitacoes?novo=compra' },
  { id: 'pedir-arte', label: 'Pedir arte ao Marketing', to: '/solicitacoes?novo=arte' },
  { id: 'pedir-acesso', label: 'Pedir acesso à TI', to: '/solicitacoes?novo=acesso' },
  { id: 'pedir-reembolso', label: 'Pedir reembolso', to: '/solicitacoes?novo=reembolso' },
  { id: 'pedir-adiantamento', label: 'Pedir adiantamento', to: '/solicitacoes?novo=adiantamento' },
  { id: 'aprovar', label: 'Aprovar compras', to: '/compras/aprovacoes' },
  { id: 'agenda', label: 'Abrir a agenda', to: '/agenda' },
  { id: 'chat', label: 'Abrir o chat', to: '/chat' },
  { id: 'jornal', label: 'Ler o Jornal', to: '/jornal' },
  { id: 'diretrizes', label: 'Consultar as diretrizes', to: '/diretrizes' },
];

type Result = {
  id: string;
  label: string;
  hint?: string;
  to: string;
};

type Buckets = {
  tickets: Result[];
  people: Result[];
  assets: Result[];
  pops: Result[];
  jornal: Result[];
  diretrizes: Result[];
};

const EMPTY: Buckets = { tickets: [], people: [], assets: [], pops: [], jornal: [], diretrizes: [] };

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Buckets>(EMPTY);
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const perfil = useConfiguracaoDosSetores();
  const acoes = useMemo(() => ACOES.filter((a) => {
    const tela = telaDoPerfil(a.to);
    return !tela || perfil.isLoading || perfil.isError || abreATela(tela, perfil.pode);
  }), [perfil]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (!open) return;
    const q = debounced;
    if (q.length < 2) { setResults(EMPTY); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const like = `%${q}%`;
      const asNumber = Number(q.replace(/\D/g, ''));
      const ticketFilters = [`title.ilike.${like}`, `description.ilike.${like}`];
      if (!Number.isNaN(asNumber) && asNumber > 0) ticketFilters.push(`ticket_number.eq.${asNumber}`);

      const respostas = await Promise.all([
        supabase.from('tickets')
          .select('id, ticket_number, title, module, requester:profiles!tickets_requester_id_fkey(full_name)')
          .or(ticketFilters.join(','))
          .order('created_at', { ascending: false })
          .limit(6),
        supabase.from('profiles')
          .select('id, full_name, email, department')
          .or(`full_name.ilike.${like},email.ilike.${like}`)
          .limit(5),
        supabase.from('assets')
          .select('id, name, asset_tag')
          .or(`name.ilike.${like},asset_tag.ilike.${like}`)
          .limit(5),
        supabase.from('pops')
          .select('id, title, category')
          .ilike('title', like)
          .limit(5),
        supabase.from('jornal_noticias')
          .select('id, titulo, data_noticia')
          .eq('status', 'publicada')
          .ilike('titulo', like)
          .order('data_noticia', { ascending: false })
          .limit(5),
        supabase.from('diretrizes')
          .select('id, titulo, setor')
          .eq('status', 'publicada')
          .ilike('titulo', like)
          .limit(5),
      ]);

      if (cancelled) return;
      // Erro do banco não se engole (regra 1): uma busca que falhou não vira "nada encontrado" em silêncio.
      const falhou = respostas.find((r) => r.error);
      if (falhou?.error) toast.error(`A busca falhou: ${falhou.error.message}`);
      const [tk, pf, as, pp, jn, dr] = respostas;
      setResults({
        tickets: (tk.data || []).map((t: any) => ({
          id: t.id,
          label: `#${t.ticket_number} · ${t.title}`,
          hint: t.requester?.full_name || undefined,
          to: `/helpdesk/${t.id}`,
        })),
        people: (pf.data || []).map((p: any) => ({
          id: p.id,
          label: p.full_name || p.email,
          hint: p.department || undefined,
          to: `/configuracoes/sistema?q=${encodeURIComponent(p.full_name || p.email)}`,
        })),
        assets: (as.data || []).map((a: any) => ({
          id: a.id,
          label: a.name,
          hint: a.asset_tag || undefined,
          to: `/inventario?ativo=${a.id}`,
        })),
        pops: (pp.data || []).map((p: any) => ({
          id: p.id,
          label: p.title,
          hint: p.category || undefined,
          to: `/base-conhecimento/${p.id}`,
        })),
        jornal: ((jn.data || []) as { id: string; titulo: string; data_noticia: string | null }[]).map((n) => ({
          id: n.id,
          label: n.titulo,
          hint: n.data_noticia ? n.data_noticia.split('-').reverse().join('/') : undefined,
          to: `/jornal?noticia=${n.id}`,
        })),
        diretrizes: ((dr.data || []) as { id: string; titulo: string; setor: string | null }[]).map((d) => ({
          id: d.id,
          label: d.titulo,
          hint: d.setor || undefined,
          to: `/diretrizes?q=${encodeURIComponent(d.titulo)}`,
        })),
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [debounced, open]);

  const go = (to: string) => {
    setOpen(false);
    setTerm('');
    navigate(tenantPath(to));
  };

  const total = useMemo(
    () => Object.values(results).reduce((s, l) => s + l.length, 0),
    [results]
  );

  const groups: { key: keyof Buckets; heading: string; icon: any }[] = [
    { key: 'tickets', heading: 'Chamados', icon: Ticket },
    { key: 'people', heading: 'Colaboradores', icon: Users },
    { key: 'assets', heading: 'Equipamentos', icon: HardDrive },
    { key: 'pops', heading: 'Tutoriais', icon: Lightbulb },
    { key: 'jornal', heading: 'Jornal', icon: Newspaper },
    { key: 'diretrizes', heading: 'Diretrizes', icon: BookMarked },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Pesquisar no sistema (Ctrl+K)"
        className="w-full max-w-md h-9 flex items-center gap-2 pl-3 pr-2 rounded-lg text-[14px] bg-secondary border border-transparent text-muted-foreground hover:bg-card hover:border-border transition-colors"
      >
        <Search className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className="flex-1 text-left">Pesquisar chamados, pessoas, equipamentos...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border bg-card text-[12px] font-mono font-semibold">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={term}
          onValueChange={setTerm}
          placeholder="Buscar ou fazer: chamado, pessoa, equipamento, Jornal, diretriz..."
        />
        <CommandList>
          <CommandGroup heading="Ações">
            {acoes.map((a) => (
              <CommandItem key={a.id} value={`acao-${a.label}`} onSelect={() => go(a.to)} className="gap-2">
                <Zap className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                <span className="truncate">{a.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          {term.trim().length < 2 ? (
            <CommandEmpty>Digite ao menos 2 caracteres para buscar.</CommandEmpty>
          ) : loading ? (
            <CommandEmpty>Buscando...</CommandEmpty>
          ) : total === 0 ? (
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          ) : (
            groups.map(g => {
              const items = results[g.key];
              if (!items.length) return null;
              const Icon = g.icon;
              return (
                <CommandGroup key={g.key} heading={g.heading}>
                  {items.map(item => (
                    <CommandItem
                      key={`${g.key}-${item.id}`}
                      value={`${g.key}-${item.id}-${item.label}`}
                      onSelect={() => go(item.to)}
                      className="gap-2"
                    >
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                      {item.hint && (
                        <span className="ml-auto text-[12px] text-muted-foreground truncate max-w-[40%]">
                          {item.hint}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
