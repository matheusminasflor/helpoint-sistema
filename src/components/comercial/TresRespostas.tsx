// As três respostas no Simplificado dos Indicadores (tópico 4, dono, 2026-11-05). Nenhuma conta de venda nova: o vendido e
// a meta vêm do painel, a composição e o A faturar das consultas da Carteira. Verde é faturado, roxo é condição e laranja é
// o que ainda pode entrar.
import { useComposicaoDaVenda } from '@/components/comercial/ComposicaoDaVenda';
import { useAcompanhamentoDasCarteiras } from '@/hooks/useRaioX';
import { tresRespostas } from '@/lib/tres-respostas';
import { formatBRL } from '@/types/financeiro';

export function TresRespostas({ carteiras, competencia, intervalo, de, ate, vendido, meta, foraDoAlvo }: {
  carteiras: string[]; competencia: string; intervalo: { de: string; ate: string } | null | undefined;
  de: string; ate: string; vendido: number; meta: number | null; foraDoAlvo: number;
}) {
  const { data: composicao } = useComposicaoDaVenda({ de, ate, carteira: carteiras.join(', ') });
  const consultas = useAcompanhamentoDasCarteiras(carteiras, competencia, intervalo);
  const aFaturar = consultas.flatMap((c) => c.data ?? []).reduce((s, l) => s + l.a_faturar, 0);
  const r = tresRespostas({
    vendido, meta, faturado: composicao?.faturado ?? vendido, condicao: composicao?.condicao ?? 0, aFaturar,
  });
  return (
    <section className="space-y-3" aria-label="Quanto vendi, quanto falta e o que pode entrar">
      <div>
        <p className="text-[13px] text-muted-foreground">Vendi até agora</p>
        <p className="text-[26px] font-bold font-mono leading-tight">
          {formatBRL(vendido)}
          {r.percentual !== null && <span className="ml-2 align-middle text-[13px] font-semibold rounded px-1.5 py-0.5 badge-info">{r.percentual}% da meta</span>}
        </p>
      </div>
      {r.temMeta && (
        <div>
          <div className="flex h-3 rounded bg-muted overflow-hidden" role="img"
            aria-label={`Faturado, condição e a faturar em relação à meta de ${formatBRL(meta ?? 0)}`}>
            <span className="bg-status-success" style={{ width: `${r.larguraFaturado}%` }} />
            <span className="bg-[hsl(var(--badge-purple-text))]" style={{ width: `${r.larguraCondicao}%` }} />
            <span className="bg-status-warning" style={{ width: `${r.larguraAFaturar}%` }} />
          </div>
          <p className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-muted-foreground">
            <Legenda cor="bg-status-success" texto="Faturado" />
            {(composicao?.condicao ?? 0) > 0 && <Legenda cor="bg-[hsl(var(--badge-purple-text))]" texto="Condição" />}
            <Legenda cor="bg-status-warning" texto="A faturar" />
          </p>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <Resposta rotulo="Falta para a meta" valor={r.falta === null ? 'Sem meta' : formatBRL(r.falta)} />
        <Resposta rotulo="A faturar" valor={formatBRL(aFaturar)} nota="Não conta na meta" />
        <Resposta rotulo="Indicadores fora do alvo" valor={String(foraDoAlvo)} alerta={foraDoAlvo > 0} />
      </div>
    </section>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-sm ${cor}`} aria-hidden="true" />{texto}</span>;
}

function Resposta({ rotulo, valor, nota, alerta }: { rotulo: string; valor: string; nota?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${alerta ? 'border-status-danger' : 'border-border'}`}>
      <p className="text-[12px] text-muted-foreground">{rotulo}</p>
      <p className="text-[16px] font-semibold font-mono">{valor}</p>
      {nota && <p className="text-[12px] text-muted-foreground">{nota}</p>}
    </div>
  );
}
