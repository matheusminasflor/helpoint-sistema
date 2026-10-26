// A conferência de vendas fora do Financeiro (dono, 2026-10-15): completa só no Financeiro; no Comercial e na
// Diretoria, uma linha com o resumo, no mesmo período da tela, e o link para o painel inteiro.
import { Link } from 'react-router-dom';
import { useIndicadoresDaConferencia } from '@/hooks/usePedidosChecklist';
import { formatBRL } from '@/types/financeiro';

export function LinhaDaConferencia({ de, ate }: { de: string; ate: string }) {
  const { data, isError } = useIndicadoresDaConferencia(de, ate);
  return (
    <p className="text-[13px] text-muted-foreground">
      <strong className="text-foreground">Conferência de vendas no período: </strong>
      {isError ? 'não foi possível carregar. ' : !data ? 'carregando… ' : (
        <>
          {data.registrado.qtd} {data.registrado.qtd === 1 ? 'pedido registrado' : 'pedidos registrados'} ({formatBRL(Number(data.registrado.valor))}),{' '}
          {data.percentual_conciliacao === null ? '—' : `${Number(data.percentual_conciliacao).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} conciliado,{' '}
          <span className={data.pendente.qtd > 0 ? 'text-status-warning' : ''}>{data.pendente.qtd} pendentes</span>,{' '}
          <span className={data.divergente.qtd > 0 ? 'text-status-danger' : ''}>{data.divergente.qtd} com divergência</span>.{' '}
        </>
      )}
      <Link to="/financeiro/conferencia-de-pedidos" className="text-primary underline">Ver no Financeiro</Link>
    </p>
  );
}
