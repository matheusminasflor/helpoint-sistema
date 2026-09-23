// A ficha do cliente completa (Frente 5a, §11 do documento do dono —
// docs/instrucoes-painel-comercial.md linhas 292-326). Extraída de
// `ComercialClientes.tsx` desde a Frente 3: a Diretoria (`DiretoriaClientes.
// tsx`) também precisa dela, e a porta única não pode jogar quem está lá
// para fora do módulo — mesmo componente nos dois lados, nunca uma cópia.
//
// Quem chama decide o período (`de`/`ate`), o critério (`criterio` — o
// seletor do TOPO da página, não um segundo aqui) e o texto do título: o
// Comercial usa o ano inteiro (não tem seletor de período nesta visão), a
// Diretoria usa o período escolhido em `usePeriodoComercial`.
//
// Nove blocos, na ordem do §11. Nunca mexe em cor, nome ou layout de
// matriz — isso é da Frente 4. `com_ficha_cliente` já devolve uma faixa
// por bloco relativa ao período/filial selecionados (nunca gravada); esta
// tela só exibe o que veio.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useFichaCliente } from '@/hooks/useComercialCashback';
import { formatBRL } from '@/types/financeiro';
import { MESES } from '@/lib/comparativoAnos';
import type {
  CriterioCurva, Filial, FichaClienteComprou, FichaClienteEvolucaoFaixa, FichaClienteEvolucaoProdutoItem,
  FichaClienteEvolucaoProdutos, FichaClienteIndicadores, FichaClienteMixFaixa, FichaClienteNuncaComprou,
  FichaClienteParouDeComprar, FichaClienteProduto,
} from '@/types/comercial';

export function FichaClienteSecao({
  codigo, de, ate, filial, criterio, titulo, onFechar,
}: {
  codigo: string; de: string; ate: string; filial: Filial | null; criterio: CriterioCurva;
  titulo: string; onFechar: () => void;
}) {
  const { data: ficha, isLoading } = useFichaCliente(codigo, de, ate, filial, criterio);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">
          {titulo}
          {/* Mesmo indicador que DiretoriaClientes.tsx já usa na lista — a
              mesma marca nos dois lugares (§11 linha 325). */}
          {ficha?.identificacao.em_condicao && (
            <span className="ml-1.5 text-[10px] text-muted-foreground">(condição)</span>
          )}
        </h2>
        <Button variant="ghost" size="sm" onClick={onFechar}>
          <X className="w-3.5 h-3.5 mr-1" /> Fechar ficha
        </Button>
      </div>

      {isLoading && <p className="text-[12px] text-muted-foreground">Carregando…</p>}

      {ficha && (
        <>
          <BlocoIndicadores indicadores={ficha.indicadores} />
          <BlocoMensal mensal={ficha.mensal_do_ano} de={de} ate={ate} />
          <BlocoMix mix={ficha.mix_por_faixa} criterio={criterio} />
          <BlocoEvolucaoFaixa evolucao={ficha.evolucao_faixa} />
          <BlocoEvolucaoProdutos evolucao={ficha.evolucao_produtos} />
          <BlocoComprou linhas={ficha.comprou} />
          <FichaTabela titulo="Produtos bonificados" linhas={ficha.bonificado} vazio="Nenhuma bonificação no período." />
          <BlocoParouDeComprar linhas={ficha.parou_de_comprar} />
          <BlocoNuncaComprou linhas={ficha.nunca_comprou} />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 1 (indicadores) — faturamento/bonificação/SKUs/meses ativos no
// período, mais a variação do último mês contra a média dos 3 anteriores.
// `variacao`/`media_3_anteriores` NULL vira "—", nunca "0%" (regra 0.0/null
// da Frente 2, na dimensão do tempo).
// ═══════════════════════════════════════════════════════════════════════════
function BlocoIndicadores({ indicadores }: { indicadores: FichaClienteIndicadores }) {
  const variacaoTexto = indicadores.variacao === null ? '—' : `${(indicadores.variacao * 100).toFixed(1)}%`;
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Indicadores do período</div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-4 py-3 text-[12px]">
        <Indicador rotulo="Faturamento" valor={formatBRL(indicadores.faturamento)} />
        <Indicador rotulo="Bonificação" valor={formatBRL(indicadores.bonificacao)} />
        <Indicador rotulo="SKUs" valor={String(indicadores.skus)} />
        <Indicador rotulo="Meses ativos" valor={String(indicadores.meses_ativos)} />
        <Indicador
          rotulo="Var. último mês vs. média 3 anteriores"
          valor={variacaoTexto}
          titulo={
            indicadores.media_3_anteriores === null
              ? 'Menos de 3 meses anteriores com dado — sem base para comparar.'
              : `Média dos 3 meses anteriores: ${formatBRL(indicadores.media_3_anteriores)}`
          }
        />
      </div>
    </div>
  );
}

function Indicador({ rotulo, valor, titulo }: { rotulo: string; valor: string; titulo?: string }) {
  return (
    <div title={titulo}>
      <div className="text-muted-foreground">{rotulo}</div>
      <div className="font-mono font-semibold">{valor}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 2 (faturamento mensal) — 12 meses do ano de `ate`, com o período
// selecionado ([de, ate]) em destaque. `valor` NULL (sem venda) some como
// "—", nunca "R$ 0,00".
// ═══════════════════════════════════════════════════════════════════════════
function BlocoMensal({ mensal, de, ate }: { mensal: { mes: string; valor: number | null }[]; de: string; ate: string }) {
  const dentroDoPeriodo = (mes: string) => mes >= de.slice(0, 8) + '01' && mes <= ate;
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Faturamento mês a mês no ano</div>
      <div className="flex gap-2 px-4 py-3 text-[11px] overflow-x-auto">
        {mensal.map((m) => {
          const destacado = dentroDoPeriodo(m.mes);
          const numeroMes = Number(m.mes.slice(5, 7));
          return (
            <div
              key={m.mes}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-md ${destacado ? 'bg-secondary' : ''}`}
            >
              <span className="text-muted-foreground">{MESES[numeroMes - 1]}</span>
              <span className="font-mono">{m.valor === null ? '—' : formatBRL(m.valor)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 3 (mix por faixa) — valor/quantidade/participação por A/B/C/fora
// da curva. A nota do critério por quantidade é a MESMA texto de
// ComercialPainel.tsx — reusada, nunca escrita de novo.
// ═══════════════════════════════════════════════════════════════════════════
function BlocoMix({ mix, criterio }: { mix: FichaClienteMixFaixa[]; criterio: CriterioCurva }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Mix por faixa</div>
      {criterio === 'quantidade' && (
        <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
          Unidades misturam sachê de 12 ml com máscara de 1 kg — a curva por quantidade não pesa o tamanho do produto.
        </p>
      )}
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Faixa</th>
            <th className="px-3 py-1.5 font-semibold text-right">Valor</th>
            <th className="px-3 py-1.5 font-semibold text-right">Quantidade</th>
            <th className="px-3 py-1.5 font-semibold text-right">Participação</th>
          </tr>
        </thead>
        <tbody>
          {mix.map((m) => (
            <tr key={m.faixa} className="border-t border-border">
              <td className="px-3 py-1.5">{m.faixa === '-' ? 'Fora da curva' : m.faixa}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{m.quantidade}</td>
              <td className="px-3 py-1.5 text-right font-mono">{m.participacao === null ? '—' : `${m.participacao}%`}</td>
            </tr>
          ))}
          {mix.length === 0 && (
            <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Nada comprado no período.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 4 (evolução por faixa) — meses do período atual, com o período
// anterior (mesmo tamanho) em cinza, e o total do período atual.
// ═══════════════════════════════════════════════════════════════════════════
function BlocoEvolucaoFaixa({ evolucao }: { evolucao: FichaClienteEvolucaoFaixa }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold flex items-center justify-between">
        <span>Evolução por faixa</span>
        <span className="text-[12px] font-mono text-muted-foreground">Total do período: {formatBRL(evolucao.total)}</span>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Mês</th>
            <th className="px-3 py-1.5 font-semibold text-right">A</th>
            <th className="px-3 py-1.5 font-semibold text-right">B</th>
            <th className="px-3 py-1.5 font-semibold text-right">C</th>
            <th className="px-3 py-1.5 font-semibold text-right">Fora da curva</th>
          </tr>
        </thead>
        <tbody>
          {evolucao.anterior.map((m) => (
            <tr key={`ant-${m.competencia}`} className="border-t border-border text-muted-foreground">
              <td className="px-3 py-1.5">{m.competencia.slice(0, 7)} (anterior)</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_a)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_b)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_c)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_outros)}</td>
            </tr>
          ))}
          {evolucao.atual.map((m) => (
            <tr key={`atu-${m.competencia}`} className="border-t border-border">
              <td className="px-3 py-1.5">{m.competencia.slice(0, 7)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_a)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_b)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_c)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.valor_outros)}</td>
            </tr>
          ))}
          {evolucao.atual.length === 0 && evolucao.anterior.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Nada comprado nos dois períodos.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 5 (evolução produto a produto) — período atual contra o anterior
// de mesmo tamanho. Avisa no cabeçalho quando o anterior não existe ou
// está incompleto (§11 linha 319) — resolvido contra o que foi IMPORTADO,
// nunca contra o calendário.
// ═══════════════════════════════════════════════════════════════════════════
function BlocoEvolucaoProdutos({ evolucao }: { evolucao: FichaClienteEvolucaoProdutos }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Evolução produto a produto vs. período anterior</div>
      {!evolucao.anterior_existe && (
        <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
          O período anterior de mesmo tamanho não tem nada importado — a comparação abaixo é só o período atual.
        </p>
      )}
      {evolucao.anterior_existe && !evolucao.anterior_completo && (
        <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
          O período anterior de mesmo tamanho está incompleto no que foi importado — a comparação pode estar cobrindo menos tempo do que parece.
        </p>
      )}
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Produto</th>
            <th className="px-3 py-1.5 font-semibold text-right">Atual</th>
            <th className="px-3 py-1.5 font-semibold text-right">Anterior</th>
            <th className="px-3 py-1.5 font-semibold text-right">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {evolucao.produtos.map((p: FichaClienteEvolucaoProdutoItem) => (
            <tr key={p.produto_codigo} className="border-t border-border">
              <td className="px-3 py-1.5">
                {p.nome}
                {p.marca && <span className="ml-1.5 text-[10px] text-muted-foreground">({p.marca})</span>}
              </td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(p.valor_atual)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(p.valor_anterior)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(p.delta)}</td>
            </tr>
          ))}
          {evolucao.produtos.length === 0 && (
            <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Nada nos dois períodos.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 6 (comprou) — com as DUAS faixas: a dele e a geral da empresa.
// ═══════════════════════════════════════════════════════════════════════════
function BlocoComprou({ linhas }: { linhas: FichaClienteComprou[] }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Comprou</div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Produto</th>
            <th className="px-3 py-1.5 font-semibold text-right">Valor</th>
            <th className="px-3 py-1.5 font-semibold text-right">Quantidade</th>
            <th className="px-3 py-1.5 font-semibold text-right">Faixa dele</th>
            <th className="px-3 py-1.5 font-semibold text-right">Faixa geral</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.produto_codigo} className="border-t border-border">
              <td className="px-3 py-1.5">{l.nome}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(l.valor)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{l.quantidade}</td>
              <td className="px-3 py-1.5 text-right font-mono">{l.faixa_cliente === '-' ? 'Fora' : l.faixa_cliente}</td>
              <td className="px-3 py-1.5 text-right font-mono">{l.faixa_geral === '-' ? 'Fora' : l.faixa_geral}</td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Nada comprado no período.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 7 (parou de comprar) — sem mudança de regra.
// ═══════════════════════════════════════════════════════════════════════════
function BlocoParouDeComprar({ linhas }: { linhas: FichaClienteParouDeComprar[] }) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Parou de comprar</div>
      <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
        Comprou em pelo menos 2 dos 3 meses anteriores ao último mês com movimento dele, e não comprou nesse último mês.
      </p>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Produto</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((p) => (
            <tr key={p.produto_codigo} className="border-t border-border">
              <td className="px-3 py-1.5">{p.nome}</td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr><td className="px-3 py-4 text-center text-muted-foreground">Nenhum produto parou.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bloco 8 (nunca comprou) — das TRÊS faixas, com filtro NA TELA (o corte
// de até 100 por faixa já vem do banco). "Todas" mostra as três juntas.
// ═══════════════════════════════════════════════════════════════════════════
const FAIXAS_FILTRO = ['todas', 'A', 'B', 'C', '-'] as const;

function BlocoNuncaComprou({ linhas }: { linhas: FichaClienteNuncaComprou[] }) {
  const [filtro, setFiltro] = useState<typeof FAIXAS_FILTRO[number]>('todas');
  const filtradas = filtro === 'todas' ? linhas : linhas.filter((l) => l.faixa === filtro);
  const totalDaFaixaFiltrada = filtro === 'todas'
    ? linhas.reduce((soma, l, i) => (linhas.findIndex((x) => x.faixa === l.faixa) === i ? soma + l.total_da_faixa : soma), 0)
    : (linhas.find((l) => l.faixa === filtro)?.total_da_faixa ?? 0);

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">Nunca comprou</span>
        <div className="flex rounded-md border border-border overflow-hidden">
          {FAIXAS_FILTRO.map((f) => (
            <Button
              key={f}
              type="button"
              variant={filtro === f ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none h-7 px-2.5 text-[11px]"
              onClick={() => setFiltro(f)}
            >
              {f === 'todas' ? 'Todas' : f === '-' ? 'Fora' : f}
            </Button>
          ))}
        </div>
      </div>
      <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
        Ordenado pelo que o produto vendeu no período para os outros clientes — o que ele está deixando de comprar que mais gira.
      </p>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Produto</th>
            <th className="px-3 py-1.5 font-semibold">Faixa</th>
            <th className="px-3 py-1.5 font-semibold text-right">Vendido para outros no período</th>
          </tr>
        </thead>
        <tbody>
          {filtradas.map((p) => (
            <tr key={p.produto_codigo} className="border-t border-border">
              <td className="px-3 py-1.5">{p.nome}</td>
              <td className="px-3 py-1.5">{p.faixa === '-' ? 'Fora da curva' : p.faixa}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(p.valor_outros)}</td>
            </tr>
          ))}
          {filtradas.length === 0 && (
            <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Nada — comprou de tudo nesta faixa.</td></tr>
          )}
        </tbody>
      </table>
      {totalDaFaixaFiltrada > filtradas.length && (
        <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
          Mostrando {filtradas.length} de {totalDaFaixaFiltrada}.
        </p>
      )}
    </div>
  );
}

function FichaTabela({
  titulo, linhas, vazio,
}: {
  titulo: string;
  linhas: FichaClienteProduto[];
  vazio: string;
}) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">{titulo}</div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Produto</th>
            <th className="px-3 py-1.5 font-semibold text-right">Valor</th>
            <th className="px-3 py-1.5 font-semibold text-right">Quantidade</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.produto_codigo} className="border-t border-border">
              <td className="px-3 py-1.5">{l.nome}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(l.valor)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{l.quantidade}</td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">{vazio}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
