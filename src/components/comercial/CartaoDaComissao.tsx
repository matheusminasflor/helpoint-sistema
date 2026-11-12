// A comissão de uma pessoa no período (dono, 2026-11-12; regra em docs/regra-comissao.md). Em destaque a comissão
// POSSÍVEL (o % sobre todas as vendas, lançadas e faturadas: "vou ganhar isso") e logo abaixo a REAL (só o faturado; na
// carteira, só com a meta do mês batida). Nas carteiras com meta, mostra o quanto da meta já veio e quanto falta.
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import { somaDaComissao, useComissao } from '@/hooks/useComissao';
import { formatBRL } from '@/types/financeiro';

const pct = (fracao: number) => `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}%`;

export function CartaoDaComissao({ pessoaId, de, ate }: { pessoaId: string | null | undefined; de: string; ate: string }) {
  const { data = [], isLoading, error } = useComissao(de, ate);
  const { linhas, garantida, a_confirmar } = somaDaComissao(data, pessoaId);
  if (error) return <p className="text-[13px] text-status-danger" role="alert">Não deu para ler a comissão.</p>;
  if (isLoading || linhas.length === 0) return null;
  const temCarteira = linhas.some((l) => l.tipo === 'carteira');
  const faltas = linhas.filter((l) => l.tipo === 'carteira' && l.meta && (l.falta ?? 0) > 0);
  return (
    <div className="rounded-md border-2 border-primary p-3 space-y-1">
      <p className="text-[13px] text-muted-foreground inline-flex items-center gap-1">Comissão possível no período <ExplicacaoDoIndicador id="com.comissao" /></p>
      <p className="text-[22px] font-bold font-mono leading-tight text-primary">{formatBRL(garantida + a_confirmar)}</p>
      <p className="text-[13px]">
        Real: <strong className="font-mono text-status-success">{formatBRL(garantida)}</strong>{' '}
        <span className="text-muted-foreground">(só o faturado{temCarteira ? ', e na carteira só com a meta batida' : ''})</span>
      </p>
      {faltas.map((l) => (
        <p key={l.origem} className="text-[12px] text-muted-foreground">
          {l.origem}: <strong>{Math.floor((1 - (l.falta ?? 0) / (l.meta ?? 1)) * 100)}% da meta</strong>. Faltam{' '}
          <strong className="font-mono">{formatBRL(l.falta ?? 0)}</strong> para bater a meta e o {pct(l.percentual)} virar real.
        </p>
      ))}
    </div>
  );
}
