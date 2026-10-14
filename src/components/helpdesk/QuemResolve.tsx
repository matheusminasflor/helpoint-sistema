// Resolver o chamado de outra pessoa (dono, 2026-10-13; caso #85: era do Yuri, o dono resolveu e contou para
// o Yuri). Pergunta antes de resolver: "Assumir e resolver" (passa a ser seu, conta só para você) ou
// "Resolver junto" (conta para os dois). Não aparece para quem já é o atendente ou já atende junto.
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { useEuAtendoJunto } from '@/hooks/useAtenderJunto';
import { cn } from '@/lib/utils';

export type ModoDeResolver = 'assumir' | 'junto';

/** Precisa perguntar? Só quando o chamado é de outra pessoa e eu não atendo junto. */
export function usePrecisaPerguntarQuemResolve(ticket: { id: string; assigned_to: string | null }) {
  const { user } = useAuth();
  const junto = useEuAtendoJunto(ticket.id);
  return !!user?.id && !!ticket.assigned_to && ticket.assigned_to !== user.id && !junto;
}

/** Antes de resolver: "junto" põe a pessoa em "atende junto" (o banco confere se ela pode resolver no setor). */
export async function prepararParaResolver(ticketId: string, modo: ModoDeResolver) {
  if (modo === 'junto') unwrap(await supabase.rpc('entrar_para_resolver_junto' as never, { p_ticket: ticketId } as never));
}

export function QuemResolve({ dono, modo, onChange }: { dono: string; modo: ModoDeResolver; onChange: (m: ModoDeResolver) => void }) {
  const opcoes: { valor: ModoDeResolver; titulo: string; texto: string }[] = [
    { valor: 'assumir', titulo: 'Assumir e resolver', texto: `Passa a ser seu e conta só para você nos indicadores.` },
    { valor: 'junto', titulo: 'Resolver junto', texto: `Continua com ${dono} e conta para os dois.` },
  ];
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">Este chamado é de {dono}. Como você vai resolver?</p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Como resolver">
        {opcoes.map((o) => (
          <button key={o.valor} type="button" role="radio" aria-checked={modo === o.valor} onClick={() => onChange(o.valor)}
            className={cn('rounded-md border p-2.5 text-left text-sm transition-colors',
              modo === o.valor ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:bg-muted/40')}>
            <span className="block font-medium">{o.titulo}</span>
            <span className="block text-[13px] text-muted-foreground">{o.texto}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
