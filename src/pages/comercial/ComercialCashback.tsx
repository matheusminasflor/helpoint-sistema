// A visão "Cashback" do Insights do Comercial (L6c): a apuração mês a mês,
// por cliente. Ver `docs/instrucoes-painel-comercial.md` (INSTRUCOES v7)
// §12 — a especificação desta tela.
//
// A conta mora no banco (regra do CLAUDE.md): esta tela nunca soma
// apuração, nunca escolhe faixa e nunca classifica cliente em TypeScript —
// `com_cashback_mensal`, `com_cashback_resumo` e `com_cashback_indicadores`
// já devolvem tudo pronto.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import {
  useCashbackIndicadores, useCashbackMensal, useCashbackResumo, useFaixasCashback,
} from '@/hooks/useComercialCashback';
import { useAnoComVenda } from '@/hooks/useComercialPainel';
import { formatBRL } from '@/types/financeiro';
import type { Filial } from '@/types/comercial';

const MESES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** "sem tabela" (§8, anomalia) na coluna, nunca um traço genérico — achado 3 da auditoria. */
function rotuloTabela(c: { tabela_base: string | null; sem_tabela: boolean }): string {
  return c.sem_tabela ? 'sem tabela' : (c.tabela_base ?? '—');
}

export default function ComercialCashback() {
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);

  const { data: indicadores } = useCashbackIndicadores(ano, filial);
  const { data: resumo, isLoading: carregandoResumo } = useCashbackResumo(ano, filial);
  const { data: mensal, isLoading: carregandoMensal } = useCashbackMensal(ano, filial);
  const { data: faixas } = useFaixasCashback();

  const linhasResumo = resumo?.linhas ?? [];
  const comDireito = linhasResumo.filter((l) => (l.meses_com_direito ?? 0) > 0);
  const naoAtingiram = linhasResumo
    .filter((l) => !l.sem_programa && (l.cashback ?? 0) === 0 && l.comprado > 0)
    .sort((a, b) => (a.menor_distancia ?? Infinity) - (b.menor_distancia ?? Infinity));

  const faixasPorTabela = useMemo(() => {
    const grupos = new Map<string, typeof faixas>();
    for (const f of faixas ?? []) {
      const lista = grupos.get(f.tabela_base) ?? [];
      lista.push(f);
      grupos.set(f.tabela_base, lista);
    }
    return grupos;
  }, [faixas]);

  // Pivô cliente × mês para a "evolução mês a mês" — só os clientes com
  // pelo menos um mês de cashback (mesmo conjunto de "com direito").
  const evolucao = useMemo(() => {
    const porCliente = new Map<string, { nome: string; meses: Record<string, number | null> }>();
    for (const m of mensal?.linhas ?? []) {
      if (!porCliente.has(m.cliente_codigo)) porCliente.set(m.cliente_codigo, { nome: m.nome, meses: {} });
      const chave = m.competencia.slice(5, 7);
      porCliente.get(m.cliente_codigo)!.meses[chave] = m.cashback;
    }
    return Array.from(porCliente.entries())
      .filter(([codigo]) => comDireito.some((c) => c.cliente_codigo === codigo))
      .map(([codigo, v]) => ({ cliente_codigo: codigo, ...v }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [mensal, comDireito]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Cashback</h1>
        <p className="text-[13px] text-muted-foreground">A apuração mês a mês, por cliente — nunca o percentual sobre o acumulado do período.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FiltrosComerciais ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial} />
      </div>

      {/* Indicadores — os cinco números do topo (§12), somados no banco.
          Achado 3 da auditoria: "sem tabela" (cliente sem correspondência
          no CLIENTESXTABELA, §8) ganhou cartão próprio — antes saía
          escondido dentro de "sem programa" (REVENDA/SALÃO REF/DIRETORIA,
          que TÊM tabela, só não têm grade), e ninguém via a diferença. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] text-muted-foreground">Cashback do período</div>
          <div className="mt-1 text-xl font-semibold font-mono">{formatBRL(indicadores?.cashback_total ?? 0)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] text-muted-foreground">Percentual sobre a compra</div>
          <div className="mt-1 text-xl font-semibold font-mono">
            {indicadores?.percentual !== null && indicadores?.percentual !== undefined ? `${indicadores.percentual.toFixed(1)}%` : '—'}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] text-muted-foreground">Não atingiram o mínimo</div>
          <div className="mt-1 text-xl font-semibold font-mono">{indicadores?.clientes_nao_atingiram ?? 0}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] text-muted-foreground">Sem programa</div>
          <div className="mt-1 text-xl font-semibold font-mono">{indicadores?.clientes_sem_programa ?? 0}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] text-muted-foreground">Sem tabela</div>
          <div className="mt-1 text-xl font-semibold font-mono">{indicadores?.clientes_sem_tabela ?? 0}</div>
        </div>
      </div>

      {(indicadores?.clientes_sem_tabela ?? 0) > 0 && (
        <p className="text-[12px] text-muted-foreground rounded-md border border-dashed border-border px-3 py-2">
          {indicadores!.clientes_sem_tabela} clientes não estão no cadastro de tabela de preço — confira o CLIENTESXTABELA mais recente.
        </p>
      )}

      {/* Legenda das faixas — as grades visíveis, ou o aviso de que não há nenhuma cadastrada. */}
      <div className="rounded-lg border border-border p-4">
        <div className="text-[13px] font-semibold mb-3">Grades de cashback</div>
        {faixasPorTabela.size === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Nenhuma grade de cashback cadastrada. Cadastre em{' '}
            <Link to="/comercial/configuracoes" className="text-primary underline underline-offset-2">Comercial → Configurações → Cashback</Link>.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(faixasPorTabela.entries()).map(([tabela, degraus]) => (
              <div key={tabela} className="rounded-md border border-dashed border-border p-3">
                <div className="text-[12px] font-semibold mb-2">{tabela}</div>
                <ul className="space-y-1 text-[12px] text-muted-foreground">
                  {degraus!.map((d) => (
                    <li key={d.id} className="flex justify-between font-mono">
                      <span>{formatBRL(d.valor_minimo)}</span>
                      <span>{d.percentual}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Com direito — cliente, tabela, compra, meses com direito, última faixa, cashback, meta e o que falta. */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[13px] font-semibold flex items-center gap-2">
          <Wallet className="w-4 h-4" aria-hidden="true" />
          Com direito a cashback em {ano}
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Cliente</th>
              <th className="px-3 py-1.5 font-semibold">Tabela</th>
              <th className="px-3 py-1.5 font-semibold text-right">Compra no período</th>
              <th className="px-3 py-1.5 font-semibold text-right">Meses com direito</th>
              <th className="px-3 py-1.5 font-semibold text-right">Última faixa</th>
              <th className="px-3 py-1.5 font-semibold text-right">Cashback</th>
              <th className="px-3 py-1.5 font-semibold text-right">Meta para ativar</th>
              <th className="px-3 py-1.5 font-semibold text-right">Falta p/ próxima faixa</th>
            </tr>
          </thead>
          <tbody>
            {comDireito.map((c) => (
              <tr key={c.cliente_codigo} className="border-t border-border">
                <td className="px-3 py-1.5">{c.nome}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{rotuloTabela(c)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.comprado)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{c.meses_com_direito}</td>
                <td className="px-3 py-1.5 text-right font-mono">{c.ultima_faixa !== null ? `${c.ultima_faixa}%` : '—'}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.cashback ?? 0)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{c.meta_para_ativar !== null ? formatBRL(c.meta_para_ativar) : '—'}</td>
                <td className="px-3 py-1.5 text-right font-mono">{c.falta_proxima_faixa !== null ? formatBRL(c.falta_proxima_faixa) : '—'}</td>
              </tr>
            ))}
            {!carregandoResumo && comDireito.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">Nenhum cliente com direito a cashback em {ano}.</td></tr>
            )}
          </tbody>
        </table>
        {resumo?.cortou && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
            Lista maior que o mostrado aqui — estreite a filial para ver o restante.
          </p>
        )}
      </div>

      {/* Não atingiram — quem comprou e nunca chegou ao mínimo, mais perto primeiro. */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Não atingiram o mínimo</div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Cliente</th>
              <th className="px-3 py-1.5 font-semibold">Tabela</th>
              <th className="px-3 py-1.5 font-semibold text-right">Compra no período</th>
              <th className="px-3 py-1.5 font-semibold text-right">Faltou (menor distância)</th>
            </tr>
          </thead>
          <tbody>
            {naoAtingiram.map((c) => (
              <tr key={c.cliente_codigo} className="border-t border-border">
                <td className="px-3 py-1.5">{c.nome}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{rotuloTabela(c)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.comprado)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{c.menor_distancia !== null ? formatBRL(c.menor_distancia) : '—'}</td>
              </tr>
            ))}
            {!carregandoResumo && naoAtingiram.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Ninguém comprou sem atingir o mínimo em {ano}.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Evolução mês a mês — cashback de cada cliente em cada mês do ano. Traço para "sem dado" (nenhuma venda no mês), nunca confundido com R$ 0,00 (tem programa, não atingiu). */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Evolução mês a mês em {ano}</div>
        <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
          Traço: sem venda naquele mês. R$ 0,00: comprou, mas não atingiu o mínimo daquele mês.
        </p>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Cliente</th>
              {MES_LABEL.map((m) => <th key={m} className="px-3 py-1.5 font-semibold text-right">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {evolucao.map((c) => (
              <tr key={c.cliente_codigo} className="border-t border-border">
                <td className="px-3 py-1.5">{c.nome}</td>
                {MESES.map((mm) => (
                  <td key={mm} className="px-3 py-1.5 text-right font-mono">
                    {c.meses[mm] !== undefined ? formatBRL(c.meses[mm] ?? 0) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            {!carregandoMensal && evolucao.length === 0 && (
              <tr><td colSpan={13} className="px-3 py-4 text-center text-muted-foreground">Nenhum cliente com cashback em {ano}.</td></tr>
            )}
          </tbody>
        </table>
        {mensal?.cortou && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
            Lista maior que o mostrado aqui — estreite a filial para ver o restante.
          </p>
        )}
      </div>
    </div>
  );
}
