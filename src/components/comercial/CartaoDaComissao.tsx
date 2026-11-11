// A comissão de uma pessoa no período (dono, 2026-11-12; regra em docs/regra-comissao.md). Total em destaque, com as duas
// partes logo abaixo: "garantida" (com nota) e "a confirmar" (previsão). O "i" lembra que só o faturado é pago. Nas
// carteiras com meta, mostra quanto falta para ganhar o 0,5% (efeito do gradiente de meta).
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import { somaDaComissao, useComissao } from '@/hooks/useComissao';
import { formatBRL } from '@/types/financeiro';

export function CartaoDaComissao({ pessoaId, de, ate }: { pessoaId: string | null | undefined; de: string; ate: string }) {
  const { data = [], isLoading, error } = useComissao(de, ate);
  const { linhas, garantida, a_confirmar } = somaDaComissao(data, pessoaId);
  if (error) return <p className="text-[13px] text-status-danger" role="alert">Não deu para ler a comissão.</p>;
  if (isLoading || linhas.length === 0) return null;
  const faltas = linhas.filter((l) => l.tipo === 'carteira' && l.meta && (l.falta ?? 0) > 0);
  return (
    <div className="rounded-md border-2 border-primary p-3 space-y-1">
      <p className="text-[13px] text-muted-foreground inline-flex items-center gap-1">Comissão no período <ExplicacaoDoIndicador id="com.comissao" /></p>
      <p className="text-[22px] font-bold font-mono leading-tight text-primary">{formatBRL(garantida + a_confirmar)}</p>
      <p className="text-[12px] text-muted-foreground">
        <span className="text-status-success font-semibold">{formatBRL(garantida)} garantida</span> (com nota)
        {a_confirmar > 0 && <> · <span className="font-semibold">{formatBRL(a_confirmar)} a confirmar</span> (sem nota ainda)</>}
      </p>
      {faltas.map((l) => (
        <p key={l.origem} className="text-[12px] text-muted-foreground">
          {l.origem}: faltam <strong className="font-mono">{formatBRL(l.falta ?? 0)}</strong> para bater a meta e ganhar{' '}
          <strong className="font-mono">{formatBRL((l.meta ?? 0) * l.percentual)}</strong> ou mais
        </p>
      ))}
    </div>
  );
}
