// Visão "Clientes" da Diretoria (§14 itens 4 e 5 do documento do dono,
// item 3 do plano da Frente 3): faturamento por cliente (todos, sem filtro
// de faixa) e evolução por faixa A/B/C mês a mês — as duas são "todos os
// clientes", e por isso vivem juntas aqui. Clicar num cliente abre a ficha
// AQUI DENTRO (`?cliente=CODIGO`), não no Comercial — achado da correção da
// auditoria: um diretor puro não tem "Insights do Comercial" no menu, então
// a porta única não pode jogar a navegação para um módulo que ele não vê.
// `FichaClienteSecao` é o mesmo componente que `ComercialClientes.tsx`
// usa, extraído para `@/components/comercial/FichaCliente` — mesma ficha
// dos dois lados, nunca uma cópia.
//
// Backend já existia (`com_faturamento_por_cliente`, `com_evolucao_por_
// faixa`) — esta leva constrói a tela. Cor/intensidade e o layout de barra
// empilhada da evolução são a Frente 4; aqui a tabela é texto, funcional.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { FichaClienteSecao } from '@/components/comercial/FichaCliente';
// §3 do plano da Frente 4: a mesma correspondência faixa → cor que o
// Comercial já usa, importada em vez de duplicada — duas cópias da mesma
// tabela é como A e B viraram a mesma cor da primeira vez.
import { FAIXA_BADGE } from '@/config/comercial-insights';
import { useAnoComVenda, useEvolucaoPorFaixa, useFaturamentoPorCliente, usePeriodoComercial } from '@/hooks/useComercialPainel';
import { limparNomeCliente } from '@/lib/nome-cliente';
import { formatBRL } from '@/types/financeiro';
import type { CriterioCurva, EvolucaoPorFaixaMes, Filial } from '@/types/comercial';

export default function DiretoriaClientes() {
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  const [criterio, setCriterio] = useState<CriterioCurva>('valor');
  // §6 do plano da Frente 4: barra é o padrão, números é a alternativa —
  // nunca o contrário, e a coluna Total continua nos dois modos.
  const [modoEvolucao, setModoEvolucao] = useState<'barras' | 'numeros'>('barras');
  const { periodo, setPeriodo, mes, setMes, de, ate } = usePeriodoComercial(ano);
  const [params, setParams] = useSearchParams();
  const clienteSelecionado = params.get('cliente');

  const { data: faturamento, isLoading: carregandoFaturamento } = useFaturamentoPorCliente(de, ate, filial, criterio);
  const { data: evolucao, isLoading: carregandoEvolucao } = useEvolucaoPorFaixa(de, ate, filial, criterio);

  const linhasFaturamento = faturamento?.linhas ?? [];
  const linhasEvolucao = evolucao?.linhas ?? [];

  const escolherCliente = (codigo: string) => {
    const proximos = new URLSearchParams(params);
    proximos.set('cliente', codigo);
    setParams(proximos, { replace: true });
  };
  const limparCliente = () => {
    const proximos = new URLSearchParams(params);
    proximos.delete('cliente');
    setParams(proximos, { replace: true });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={Users}
        title="Clientes"
        description="Faturamento por cliente e evolução por faixa A/B/C — todos os clientes, sem filtro de faixa."
      />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <FiltrosComerciais
            ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial}
            periodo={periodo} onPeriodoChange={setPeriodo} mes={mes} onMesChange={setMes}
          />
          <Select value={criterio} onValueChange={(v) => setCriterio(v as CriterioCurva)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="valor">Por valor</SelectItem>
              <SelectItem value="quantidade">Por quantidade</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {clienteSelecionado ? (
          <FichaClienteSecao
            codigo={clienteSelecionado}
            de={de}
            ate={ate}
            filial={filial}
            titulo={`Ficha do cliente ${clienteSelecionado} em ${ano}`}
            onFechar={limparCliente}
          />
        ) : (
          <>
        {/* §14 item 4. */}
        <div className="rounded-lg border border-border overflow-x-auto">
          <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Faturamento por cliente</div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-secondary/60 text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-semibold">Cliente</th>
                <th className="px-3 py-1.5 font-semibold">Tabela</th>
                <th className="px-3 py-1.5 font-semibold text-right">Faturamento</th>
                <th className="px-3 py-1.5 font-semibold text-right">Bonificação</th>
                <th className="px-3 py-1.5 font-semibold text-right">SKUs</th>
                <th className="px-3 py-1.5 font-semibold text-right">Meses ativos</th>
              </tr>
            </thead>
            <tbody>
              {linhasFaturamento.map((c) => (
                <tr key={c.cliente_codigo} className="border-t border-border">
                  <td className="px-3 py-1.5">
                    <button type="button" onClick={() => escolherCliente(c.cliente_codigo)} className="text-primary hover:underline text-left" title={c.nome}>{limparNomeCliente(c.nome)}</button>
                    {c.em_condicao && <span className="ml-1.5 text-[10px] text-muted-foreground">(condição)</span>}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{c.tabela_preco ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.faturamento)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.bonificacao)}</td>
                  <td className="px-3 py-1.5 text-right">{c.skus}</td>
                  <td className="px-3 py-1.5 text-right">{c.meses_ativos}</td>
                </tr>
              ))}
              {!carregandoFaturamento && linhasFaturamento.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Sem venda no período selecionado.</td></tr>
              )}
            </tbody>
          </table>
          {faturamento?.cortou && (
            <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
              Lista maior que o mostrado aqui — estreite o período ou a filial para ver o restante.
            </p>
          )}
        </div>

        {/* §14 item 5 — barra empilhada A/B/C/fora da curva por mês, com
            alternância para números (Frente 4, §6 do plano). */}
        <div className="rounded-lg border border-border overflow-x-auto">
          <div className="px-4 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-semibold">Evolução por faixa, mês a mês</span>
            <div className="flex rounded-md border border-border overflow-hidden">
              <Button
                type="button"
                variant={modoEvolucao === 'barras' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none h-7 px-3 text-[11px]"
                onClick={() => setModoEvolucao('barras')}
              >
                Barras
              </Button>
              <Button
                type="button"
                variant={modoEvolucao === 'numeros' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none h-7 px-3 text-[11px]"
                onClick={() => setModoEvolucao('numeros')}
              >
                Números
              </Button>
            </div>
          </div>
          {/* §3 do plano: as cores das faixas nunca são primary/accent
              (o mesmo HSL nos dois — ver docs/nao-funciona.md) — são os
              pares de badge do Comercial, para A e B ficarem distinguíveis
              e para a mesma faixa ter a mesma cor nas duas telas. */}
          <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
            Cores: A (verde), B (âmbar), C (cinza), fora da curva (vermelho) — as mesmas da tela Vendas. Passe o mouse na barra para os valores do mês.
          </p>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-secondary/60 text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-semibold">Cliente</th>
                <th className="px-3 py-1.5 font-semibold text-right">Total</th>
                <th className="px-3 py-1.5 font-semibold">Por mês (A / B / C / fora da curva)</th>
              </tr>
            </thead>
            <tbody>
              {linhasEvolucao.map((c) => (
                <tr key={c.cliente_codigo} className="border-t border-border align-top">
                  <td className="px-3 py-1.5">
                    <button type="button" onClick={() => escolherCliente(c.cliente_codigo)} className="text-primary hover:underline text-left" title={c.nome}>{limparNomeCliente(c.nome)}</button>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.total)}</td>
                  <td className="px-3 py-1.5 text-[11px] text-muted-foreground">
                    {modoEvolucao === 'barras' ? (
                      <div className="flex flex-wrap gap-1">
                        {c.meses.map((m) => <BarraFaixaMes key={m.competencia} mes={m} />)}
                      </div>
                    ) : (
                      c.meses.map((m) => (
                        <span key={m.competencia} className="inline-block mr-3 whitespace-nowrap">
                          {m.competencia.slice(0, 7)}: {formatBRL(m.valor_a)} / {formatBRL(m.valor_b)} / {formatBRL(m.valor_c)}
                          {m.valor_outros !== 0 && ` / ${formatBRL(m.valor_outros)}`}
                        </span>
                      ))
                    )}
                  </td>
                </tr>
              ))}
              {!carregandoEvolucao && linhasEvolucao.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Sem venda no período selecionado.</td></tr>
              )}
            </tbody>
          </table>
          {evolucao?.cortou && (
            <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
              Lista maior que o mostrado aqui — estreite o período ou a filial para ver o restante.
            </p>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Uma barra empilhada A/B/C/fora da curva de um único mês (§14 item 5;
 * Frente 4, §6 do plano). `div` com filhos em porcentagem — sem Recharts,
 * mesmo motivo do `MiniSparkline` de `DiretoriaProdutos.tsx`: doze meses
 * não precisam de lib de gráfico. Mês sem nenhum valor (`total <= 0`) vira
 * um bloco neutro em vez de dividir por zero.
 */
function BarraFaixaMes({ mes }: { mes: EvolucaoPorFaixaMes }) {
  const total = mes.valor_a + mes.valor_b + mes.valor_c + mes.valor_outros;
  const titulo = `${mes.competencia.slice(0, 7)} — A: ${formatBRL(mes.valor_a)} · B: ${formatBRL(mes.valor_b)} · C: ${formatBRL(mes.valor_c)} · Fora da curva: ${formatBRL(mes.valor_outros)}`;

  if (total <= 0) {
    return <div className="w-6 h-4 rounded-sm bg-secondary/60" title={titulo} />;
  }

  const segmentos: { faixa: 'A' | 'B' | 'C' | '-'; valor: number }[] = [
    { faixa: 'A', valor: mes.valor_a },
    { faixa: 'B', valor: mes.valor_b },
    { faixa: 'C', valor: mes.valor_c },
    { faixa: '-', valor: mes.valor_outros },
  ];

  return (
    <div className="flex w-6 h-4 rounded-sm overflow-hidden border border-border" title={titulo}>
      {segmentos.filter((s) => s.valor > 0).map((s) => (
        <div key={s.faixa} className={FAIXA_BADGE[s.faixa]} style={{ width: `${(s.valor / total) * 100}%` }} />
      ))}
    </div>
  );
}
