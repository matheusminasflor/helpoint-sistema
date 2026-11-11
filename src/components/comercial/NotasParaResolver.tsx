// Aguardando a nota (tópicos 2 e 3, dono, 2026-11-05): o pedido aprovado fica aqui até a nota chegar. Desde 2026-11-11
// (migration 20270212721100) quem sobe a nota é o Financeiro, pelo XML: a vendedora acompanha, o Financeiro abre a
// conferência. Volta para a lista a nota digitada antes que não bateu com a importação do Forteplus.
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SeloCondicao } from '@/components/comercial/SeloCondicao';
import { useClientesEmCondicao } from '@/hooks/useComercialCliente';
import { useNotasDoComercial, usePodeInformarNotaDeOutro } from '@/hooks/usePedidosChecklist';
import { useTenantPath } from '@/hooks/useTenantPath';
import { TITULOS, diasDesde, esperaDaNota } from '@/lib/notas-para-resolver';
import { todayISO } from '@/lib/dates';
import { formatBRL } from '@/types/financeiro';

const CONFERENCIA = '/financeiro/conferencia-de-pedidos';

export function NotasParaResolver() {
  const { data: notas = [], isError } = useNotasDoComercial();
  const { data: emCondicao } = useClientesEmCondicao();
  const { data: doFinanceiro = false } = usePodeInformarNotaDeOutro();
  const tenantPath = useTenantPath();
  if (isError) return <p className="text-[13px] text-status-danger">Não consegui carregar as notas pendentes.</p>;
  if (notas.length === 0) return null;
  const pendentes = notas.filter((n) => n.situacao !== 'valor_diferente').length;
  return (
    <Card className="p-3 space-y-2">
      <h2 className="text-[14px] font-semibold">{pendentes ? `Aguardando a nota (${pendentes})` : 'Notas corrigidas pelo Forteplus'}</h2>
      <p className="text-[13px] text-muted-foreground">O pedido conta na venda quando o Financeiro sobe a nota. Você é avisada quando ela chega.</p>
      <ul className="divide-y divide-border">
        {notas.map((n) => {
          const t = TITULOS[n.situacao];
          const espera = n.situacao === 'falta_nota' && n.aprovado_em ? esperaDaNota(diasDesde(n.aprovado_em, todayISO())) : null;
          return (
            <li key={n.pedido_id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span>
                <strong>{n.cliente}</strong>{emCondicao?.has(n.cliente_codigo) && <SeloCondicao />} · pedido {n.numero} · {n.filial} · {formatBRL(n.valor_pedido)}
                {n.vendedor && <span className="text-muted-foreground"> · {n.vendedor}</span>}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`text-[12px] ${espera?.atrasada ? 'badge-danger' : t.classe}`}>
                  {espera?.rotulo ?? t.rotulo}
                </Badge>
                {n.situacao === 'valor_diferente'
                  ? <span className="text-muted-foreground">Digitado {formatBRL(n.nota_valor ?? 0)}, Forteplus {formatBRL(n.forteplus_valor ?? 0)}</span>
                  : doFinanceiro
                    ? <Button size="sm" asChild><Link to={tenantPath(CONFERENCIA)}>Subir a nota</Link></Button>
                    : <span className="text-muted-foreground">Com o Financeiro</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** No Início: o Financeiro vê quantos pedidos aprovados esperam a nota e vai direto para a conferência. */
export function AvisoDeNotasNoInicio() {
  const tenantPath = useTenantPath();
  const { data: doFinanceiro = false } = usePodeInformarNotaDeOutro();
  const { data: notas = [] } = useNotasDoComercial();
  const pendentes = doFinanceiro ? notas.filter((n) => n.situacao !== 'valor_diferente').length : 0;
  if (pendentes === 0) return null;
  return (
    <Link to={tenantPath(CONFERENCIA)} className="block rounded-lg border border-status-warning bg-status-warning/5 px-3 py-2 text-[14px] font-medium">
      {pendentes} {pendentes === 1 ? 'pedido aprovado espera a nota' : 'pedidos aprovados esperam a nota'}. Abrir a conferência
    </Link>
  );
}
