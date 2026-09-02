import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, Users, HardDrive, Lightbulb, Search } from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { useTenantPath } from '@/hooks/useTenantPath';

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
};

const EMPTY: Buckets = { tickets: [], people: [], assets: [], pops: [] };

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Buckets>(EMPTY);
  const navigate = useNavigate();
  const tenantPath = useTenantPath();

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

      const [tk, pf, as, pp] = await Promise.all([
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
      ]);

      if (cancelled) return;
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
          to: '/configuracoes/sistema',
        })),
        assets: (as.data || []).map((a: any) => ({
          id: a.id,
          label: a.name,
          hint: a.asset_tag || undefined,
          to: '/inventario',
        })),
        pops: (pp.data || []).map((p: any) => ({
          id: p.id,
          label: p.title,
          hint: p.category || undefined,
          to: `/base-conhecimento/${p.id}`,
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
    () => results.tickets.length + results.people.length + results.assets.length + results.pops.length,
    [results]
  );

  const groups: { key: keyof Buckets; heading: string; icon: any }[] = [
    { key: 'tickets', heading: 'Chamados', icon: Ticket },
    { key: 'people', heading: 'Colaboradores', icon: Users },
    { key: 'assets', heading: 'Equipamentos', icon: HardDrive },
    { key: 'pops', heading: 'Tutoriais', icon: Lightbulb },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Pesquisar no sistema (Ctrl+K)"
        className="w-full max-w-md h-9 flex items-center gap-2 pl-3 pr-2 rounded-lg text-[13px] bg-secondary border border-transparent text-muted-foreground hover:bg-card hover:border-border transition-colors"
      >
        <Search className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className="flex-1 text-left">Pesquisar chamados, pessoas, equipamentos...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border bg-card text-[10px] font-mono font-semibold">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={term}
          onValueChange={setTerm}
          placeholder="Buscar chamado, colaborador, equipamento ou tutorial..."
        />
        <CommandList>
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
                        <span className="ml-auto text-[11px] text-muted-foreground truncate max-w-[40%]">
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
