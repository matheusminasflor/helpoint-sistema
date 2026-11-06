// As três respostas no Simplificado dos Indicadores (tópico 4, dono, 2026-11-05). Nenhuma conta de venda nova: o vendido e
// a meta vêm do painel, a composição e o A faturar das consultas da Carteira. Verde é faturado, roxo é condição e laranja é
// o que ainda pode entrar.
import { Link } from 'react-router-dom';
import { useComposicaoDaVenda } from '@/components/comercial/ComposicaoDaVenda';
import { useAcompanhamentoDasCarteiras } from '@/hooks/useRaioX';
import { useTenantPath } from '@/hooks/useTenantPath';
import { tresRespostas } from '@/lib/tres-respostas';
import { formatBRL } from '@/types/financeiro';

interface Recorte { carteiras: string[]; competencia: string; intervalo: { de: string; ate: string } | null | undefined; de: string; ate: string }

function useAFaturar(carteiras: string[], competencia: string, intervalo: Recorte['intervalo']) {
  const linhas = useAcompanhamentoDasCarteiras(carteiras, competencia, intervalo).flatMap((c) => c.data ?? []);
  return {
    valor: linhas.reduce((s, l) => s + l.a_faturar, 0),
    pedidos: linhas.reduce((s, l) => s + l.pedidos_a_faturar, 0),
  };
}

const rotuloDosPedidos = (n: number) => `${n} ${n === 1 ? 'pedido' : 'pedidos'}`;

export function TresRespostas({ carteiras, competencia, intervalo, de, ate, vendido, meta, abaixoDaMeta, indicadores }: Recorte & {
  vendido: number; meta: number | null; abaixoDaMeta: number; indicadores: number;
}) {
  const tenantPath = useTenantPath();
  const { data: composicao } = useComposicaoDaVenda({ de, ate, carteira: carteiras.join(', ') });
  const aFaturar = useAFaturar(carteiras, competencia, intervalo);
  const r = tresRespostas({
    vendido, meta, faturado: composicao?.faturado ?? vendido, condicao: composicao?.condicao ?? 0, aFaturar: aFaturar.valor,
  });
  const aConfirmar = composicao?.a_confirmar ?? 0;
  return (
    <section className="space-y-3" aria-label="Quanto vendi, quanto falta e o que pode entrar">
      <div>
        <p className="text-[13px] text-muted-foreground">Venda total até agora</p>
        <p className="text-[26px] font-bold font-mono leading-tight">
          {formatBRL(vendido)}
          {r.percentual !== null && (
            <span className={`ml-2 align-middle text-[13px] font-semibold rounded px-1.5 py-0.5 ${r.percentual >= 100 ? 'badge-success' : 'badge-warning'}`}>{r.percentual}% da meta</span>
          )}
        </p>
        {aConfirmar > 0 && <p className="text-[13px] text-muted-foreground"><strong className="font-mono">{formatBRL(aConfirmar)}</strong> a confirmar na importação de sexta</p>}
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
        <Link to={tenantPath('/comercial/pedidos')} className="block rounded-md hover:bg-muted/50">
          <Resposta rotulo={aFaturar.pedidos ? `A faturar · ${rotuloDosPedidos(aFaturar.pedidos)}` : 'A faturar'} valor={formatBRL(aFaturar.valor)}
            nota="Não conta na meta · ver pedidos" />
        </Link>
        <Resposta rotulo="Indicadores abaixo da meta" valor={`${abaixoDaMeta} de ${indicadores}`} alerta={abaixoDaMeta > 0} />
      </div>
    </section>
  );
}

/** As partes da venda como linhas da tabela do Analítico: vêm antes da Venda total. */
export function PartesDaVenda({ carteiras, de, ate }: Pick<Recorte, 'carteiras' | 'de' | 'ate'>) {
  const { data } = useComposicaoDaVenda({ de, ate, carteira: carteiras.join(', ') });
  if (!data || (data.condicao === 0 && data.a_confirmar === 0)) return null;
  return (
    <>
      <LinhaDaParte rotulo="Faturado" valor={data.faturado} />
      {data.condicao !== 0 && <LinhaDaParte rotulo="Condição" valor={data.condicao} classe="text-[hsl(var(--badge-purple-text))]" />}
      {data.a_confirmar > 0 && <LinhaDaParte rotulo="Dentro da venda: a confirmar" valor={data.a_confirmar} />}
    </>
  );
}

/** O que ainda pode entrar, logo depois da Venda total. Não tem meta nem farol: não conta. */
export function LinhaDoAFaturar({ carteiras, competencia, intervalo }: Pick<Recorte, 'carteiras' | 'competencia' | 'intervalo'>) {
  const aFaturar = useAFaturar(carteiras, competencia, intervalo);
  return <LinhaDaParte rotulo={`A faturar · ${rotuloDosPedidos(aFaturar.pedidos)}`} valor={aFaturar.valor} nota="não conta" />;
}

function LinhaDaParte({ rotulo, valor, classe = '', nota = '—' }: { rotulo: string; valor: number; classe?: string; nota?: string }) {
  return (
    <tr className="border-t border-border">
      <td className={`py-1.5 pr-2 ${classe}`}>{rotulo}</td>
      <td className="py-1.5 text-right text-muted-foreground">{nota}</td>
      <td className="py-1.5 text-right font-mono">{formatBRL(valor)}</td>
      <td />
    </tr>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-sm ${cor}`} aria-hidden="true" />{texto}</span>;
}

function Resposta({ rotulo, valor, nota, alerta }: { rotulo: string; valor: string; nota?: string; alerta?: boolean }) {
  return (
    <div className={`h-full rounded-md border p-2 ${alerta ? 'border-status-danger' : 'border-border'}`}>
      <p className="text-[12px] text-muted-foreground">{rotulo}</p>
      <p className="text-[16px] font-semibold font-mono">{valor}</p>
      {nota && <p className="text-[12px] text-muted-foreground">{nota}</p>}
    </div>
  );
}
