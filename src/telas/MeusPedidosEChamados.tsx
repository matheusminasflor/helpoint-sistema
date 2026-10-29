// "Meus pedidos e chamados" (rodada 3, etapa B; docs/proposta-rodada-3.md e o desenho aprovado): um lugar só para
// acompanhar o que eu pedi. Cada linha diz com quem está e, quando é a minha vez, o que falta (Zeigarnik); a faixa
// lateral e a pílula levam a cor do estado, o chip a do setor. Substitui "Meus chamados" e "Pedidos" no menu.
import { Link } from 'react-router-dom';
import { ClipboardCheck, ListChecks, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { ChipDoSetor } from '@/components/ui/ChipDoSetor';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useQueryState } from '@/hooks/useQueryState';
import { useMeusPedidosEChamados, type MeuItem } from '@/hooks/useMeusPedidosEChamados';
import { useParaEuAprovar } from '@/hooks/useSolicitacoes';
import { mensagemDeErro } from '@/lib/supabase-result';
import { cn } from '@/lib/utils';

type Filtro = 'abertos' | 'comigo' | 'concluidos';
const FILTROS: { valor: Filtro; rotulo: string; passa: (i: MeuItem) => boolean }[] = [
  { valor: 'abertos', rotulo: 'Abertos', passa: (i) => i.estado.etapa < 2 },
  { valor: 'comigo', rotulo: 'Com você', passa: (i) => i.estado.familia === 'espera' },
  { valor: 'concluidos', rotulo: 'Concluídos', passa: (i) => i.estado.etapa === 2 },
];

function quando(item: MeuItem) {
  if (item.prazo) {
    const d = new Date(item.prazo);
    const hoje = new Date();
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === hoje.toDateString()) return d < hoje ? `venceu hoje ${hora}` : `vence hoje ${hora}`;
    // O ano só quando não é o deste ano (vídeo do dono, 2026-10-28: "vence 27/10/2026" em todo cartão).
    const dia = d.toLocaleDateString('pt-BR', d.getFullYear() === hoje.getFullYear()
      ? { day: '2-digit', month: '2-digit' } : undefined);
    return d < hoje ? `venceu ${dia}` : `vence ${dia}`;
  }
  const dias = Math.floor((Date.now() - new Date(item.criadoEm).getTime()) / 86_400_000);
  return dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`;
}

export default function MeusPedidosEChamados() {
  const tp = useTenantPath();
  const lista = useMeusPedidosEChamados();
  const paraAprovar = useParaEuAprovar();
  const [filtroNaUrl, setFiltro] = useQueryState<string>('ver', 'abertos');
  const filtro = (FILTROS.find((f) => f.valor === filtroNaUrl) ?? FILTROS[0]);
  const itens = lista.data ?? [];
  const visiveis = itens.filter(filtro.passa);
  const aprovar = paraAprovar.data?.length ?? 0;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Minhas solicitações" icon={ListChecks}
        description="Tudo o que você pediu, com quem está e o que falta."
        actions={<Button asChild><Link to={tp('/nova-solicitacao')}><Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />Novo</Link></Button>} />
      <div className="px-4 lg:px-8 pb-6 space-y-4 w-full max-w-3xl">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar">
          {FILTROS.map((f) => {
            const n = itens.filter(f.passa).length;
            return (
              <button key={f.valor} type="button" aria-pressed={filtro.valor === f.valor} onClick={() => setFiltro(f.valor)}
                className={cn('min-h-9 px-3.5 rounded-full border text-[13px] font-semibold',
                  filtro.valor === f.valor ? 'bg-foreground text-background border-foreground' : 'bg-card border-border text-foreground')}>
                {f.rotulo}{f.valor !== 'concluidos' && n ? ` ${n}` : ''}
              </button>
            );
          })}
          {/* Quem é gestor também aprova daqui (antes era a aba "Para eu aprovar" de Pedidos). */}
          {aprovar > 0 && (
            <Link to={tp('/solicitacoes?aba=aprovar')}
              className="min-h-9 px-3.5 rounded-full border border-primary text-primary text-[13px] font-semibold inline-flex items-center gap-1.5">
              <ClipboardCheck className="w-4 h-4" aria-hidden="true" />Para eu aprovar {aprovar}
            </Link>
          )}
        </div>

        {lista.error && <p className="text-[14px] text-status-danger">{mensagemDeErro(lista.error)}</p>}
        {lista.isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>}
        {!lista.isLoading && visiveis.length === 0 && (
          <p className="text-[14px] text-muted-foreground py-6">
            {filtro.valor === 'comigo' ? 'Nada esperando você.' : filtro.valor === 'concluidos' ? 'Nada concluído ainda.' : 'Nada em aberto. Para pedir algo, toque em Novo.'}
          </p>
        )}

        <ul className="space-y-2">
          {visiveis.map((item) => (
            <li key={item.chave}>
              <Link to={tp(item.rota)}
                className="relative block overflow-hidden rounded-xl border border-border bg-card px-5 py-4 hover:bg-primary-soft transition-colors focus-visible:outline-2">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <ChipDoSetor setor={item.setor} />
                  <span className={cn('estado', `estado-${item.estado.familia}`)}>{item.estado.rotulo}</span>
                </span>
                <span className="block mt-1.5 text-[15px] font-semibold text-foreground leading-snug">{item.titulo}</span>
                {item.falta
                  ? <span className="block mt-0.5 text-[13px] font-bold text-[hsl(var(--estado-espera-fg))]">{item.falta}</span>
                  : <span className="block mt-0.5 text-[13px] text-muted-foreground">
                      {item.tipo === 'pedido' ? 'Pedido' : 'Chamado'} #{item.numero} · {quando(item)}
                    </span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
