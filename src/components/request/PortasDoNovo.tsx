import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, LifeBuoy } from 'lucide-react';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useMeuRHLigado } from '@/hooks/useMeuRHLigado';
import { TIPOS, TIPOS_DA_PORTA, type TipoDeSolicitacao } from '@/config/solicitacoes';

// "Novo" (rodada 2, decisão 1 do dono, 2026-10-25): duas palavras só. CHAMADO é um problema — algo quebrou, preciso de
// ajuda de um setor. PEDIDO é algo que alguém aprova e entrega. Um botão "Novo" em todo lugar leva a estas duas portas;
// uma decisão por tela (Hick): primeiro a porta, depois o setor ou o tipo. `?porta=chamado|pedido` abre direto.

const cartao = 'group w-full min-h-11 p-4 rounded-lg border border-border bg-card text-left flex items-center gap-3 hover:border-foreground transition-colors';

export function EscolhaDaPorta() {
  const tp = useTenantPath();
  // "Pedidos ao RH" só quando o Meu RH está ligado; desligado, o RH ainda é chamado.
  const { data: meuRHLigado = false } = useMeuRHLigado();
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">Novo</h1>
      <p className="text-sm text-muted-foreground mb-5">O que você precisa?</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link to={tp('/nova-solicitacao?porta=chamado')} className={`${cartao} sm:items-start sm:p-5`}>
          <span className="w-10 h-10 shrink-0 flex items-center justify-center rounded-md bg-secondary text-foreground">
            <LifeBuoy strokeWidth={1.5} className="w-6 h-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-base font-semibold block text-foreground">Chamado</span>
            <span className="text-sm text-muted-foreground block">Algo quebrou ou você precisa de ajuda de um setor</span>
          </span>
          <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
        <Link to={tp('/nova-solicitacao?porta=pedido')} className={`${cartao} sm:items-start sm:p-5`}>
          <span className="w-10 h-10 shrink-0 flex items-center justify-center rounded-md bg-secondary text-foreground">
            <ClipboardList strokeWidth={1.5} className="w-6 h-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-base font-semibold block text-foreground">Pedido</span>
            <span className="text-sm text-muted-foreground block">
              Algo que alguém aprova e entrega: compra, arte, acesso, reembolso, adiantamento{meuRHLigado ? ', pedidos ao RH' : ''}
            </span>
          </span>
          <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/** A porta do pedido: cada tipo abre o formulário dele em Pedidos (`?novo=<tipo>`). */
export function PortaDoPedido() {
  const tp = useTenantPath();
  const { data: meuRHLigado = false } = useMeuRHLigado();
  const tipos = [
    ...(['compra', ...TIPOS_DA_PORTA] as TipoDeSolicitacao[]).map((t) => ({ chave: t, rotulo: TIPOS[t].rotulo, descricao: TIPOS[t].descricao, to: tp(`/solicitacoes?novo=${t}`) })),
    // Os pedidos ao RH moram no Meu RH; com ele desligado, o RH ainda recebe chamado (porta do chamado).
    ...(meuRHLigado ? [{ chave: 'rh', rotulo: 'Pedidos ao RH', descricao: 'Férias, atestado, benefício, documento, dúvida de folha', to: tp('/meu-rh') }] : []),
  ];
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">Novo pedido</h1>
      <p className="text-sm text-muted-foreground mb-5">Cada pedido mostra em que etapa está e com quem.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tipos.map((t) => (
          <Link key={t.chave} to={t.to} className={cartao}>
            <span className="min-w-0 flex-1">
              <span className="text-sm font-semibold block text-foreground">{t.rotulo}</span>
              <span className="text-xs text-muted-foreground block">{t.descricao}</span>
            </span>
            <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
