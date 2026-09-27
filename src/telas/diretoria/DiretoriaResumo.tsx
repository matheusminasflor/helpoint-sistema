// Visão "Resumo" da Diretoria (Frente 3, item 4.1 do plano) — abertura do
// painel do diretor. Só os cinco indicadores do ano (§15) e o gráfico meta
// × realizado, nada mais: é recorte do que já existia numa aba só ("Meta ×
// realizado") que empilhava isto, mais duas tabelas por carteira e o
// simulador — as tabelas foram para "Metas e carteiras".
//
// A conta mora em `useMetaXRealizadoAno` (extraída para não duplicar entre
// esta tela e as tabelas por carteira — mesmo dado, dois recortes).
//
// ── Etapa 4 (2026-09-25) ────────────────────────────────────────────────
// O Resumo absorveu a aba "Setores" e virou o painel do diretor de verdade:
// além dos cinco indicadores e do gráfico, os OBJETIVOS DA EMPRESA e os
// CHAMADOS POR SETOR. O dono perguntou "o que o diretor faz ali?" sobre
// Setores — a resposta é esta: ele vê, sem procurar, o que está atrasado.
//
// Simplificado mostra os dois como FAROL (uma linha por item, só o que pede
// ação hoje); analítico traz a tabela completa de chamados, com o seletor de
// período, e os objetivos em cartão. Nada da aba antiga foi apagado.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import { useMetaXRealizadoAno } from '@/hooks/useDiretoriaMetaXRealizado';
import { useConciliacao } from '@/hooks/useComercialCarteirasMetas';
import { useTenantPath } from '@/hooks/useTenantPath';
import { rotaDaVisaoDiretoria } from '@/config/diretoria-insights';
import { formatBRL } from '@/types/financeiro';
import type { PeriodoDiretoria } from '@/hooks/useDiretoria';
import {
  CartoesObjetivos, FarolChamadosPorSetor, FarolObjetivos, TabelaChamadosPorSetor,
} from './ObjetivosEChamados';

export default function DiretoriaResumo() {
  const [visao, setVisao] = useVisaoRelatorio('diretoria-resumo');
  const [periodo, setPeriodo] = useState<PeriodoDiretoria>('30d');
  const {
    ano, setAno, anosDisponiveis, isLoading, dadosGrafico,
    realizadoDoPeriodo, metaDoPeriodo, metaDoAno, mesmoPeriodoAnoAnterior, fechamentoAnoAnterior,
  } = useMetaXRealizadoAno();

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={BarChart3}
        title="Resumo"
        description="O ano até aqui, os objetivos da empresa e quais setores estão atrasados."
      />
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
        <div className="flex items-center justify-end gap-2">
          <SeletorVisao visao={visao} onChange={setVisao} />
          {/* Não há seletor de filial de propósito — a meta é consolidada
              (confirmado com o dono, 2026-09-22): filtrar o realizado por
              INBRAS ou MF contra uma meta que vale pelas duas faria a
              cobertura mentir. Ver docs/nao-funciona.md. */}
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? <Skeleton className="h-72 w-full" /> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Indicador titulo="Realizado no período" valor={realizadoDoPeriodo} />
              <Indicador titulo="Meta do período" valor={metaDoPeriodo} />
              <Indicador titulo="Meta do ano" valor={metaDoAno} />
              <Indicador titulo={`Mesmo período em ${ano - 1}`} valor={mesmoPeriodoAnoAnterior} />
              <Indicador titulo={`Fechamento de ${ano - 1}`} valor={fechamentoAnoAnterior} />
            </div>

            <OQueOErpDiz ano={ano} />

            <div className="rounded-lg border border-border p-3">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={dadosGrafico} margin={{ left: 8, right: 16, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => formatBRL(v)} width={70} />
                  <Tooltip formatter={(v: number | null) => (v == null ? 'sem dado' : formatBRL(v))} />
                  <Bar dataKey="realizado" name="Realizado" radius={[3, 3, 0, 0]}>
                    {dadosGrafico.map((d) => (
                      <Cell key={d.mes} fill={d.bate == null ? 'hsl(var(--muted-foreground))' : d.bate ? 'hsl(var(--status-success))' : 'hsl(var(--status-danger))'} />
                    ))}
                  </Bar>
                  <Line dataKey="meta" name="Meta" stroke="hsl(var(--foreground))" strokeDasharray="5 5" dot={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* O conteúdo da antiga aba "Setores". Fica FORA do `isLoading` do
            meta × realizado de propósito: são outras consultas (`goals` e
            `tickets`), e esperar o carregamento das metas para mostrar quais
            chamados estão atrasados atrasaria justamente o número que pede
            ação hoje. */}
        {visao === 'simplificado' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <FarolObjetivos />
            <FarolChamadosPorSetor />
          </div>
        ) : (
          <>
            <CartoesObjetivos />
            <TabelaChamadosPorSetor periodo={periodo} onPeriodoChange={setPeriodo} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * O QUE O ERP DIZ — a leva dos insights (2026-09-25), pedida pelo dono:
 * "preciso que esteja 100% preciso e funcional. Me preocupo com os dados
 * fugirem da realidade."
 *
 * O DEFEITO QUE ESTE BLOCO CONSERTA não é uma conta errada: é um número certo
 * no lugar errado. "Realizado no período", nos cinco cartões acima, vem de
 * `metas_ano.total_realizado` — a PLANILHA que o diretor mantém à mão, não a
 * venda importada do Forteplus. O diretor abria o Resumo, via o número dele, e
 * não tinha nada na tela dizendo que o ERP diz outra coisa. Em 2026 a diferença
 * medida é de R$ 401.302,64 — venda da série 75, sem nota fiscal, que ele cobra
 * e não registra.
 *
 * Nenhuma conta nova aqui: `com_conciliacao` já fazia exatamente esta
 * comparação, e já compara SÓ os meses informados (nunca o ano inteiro contra
 * meses pela metade). O que faltava era ela aparecer onde o diretor olha
 * primeiro, em vez de só numa tela que ele precisava saber que existia. As duas
 * fontes continuam separadas, como manda
 * docs/metas-e-carteiras-fonte-da-verdade.md — o que este bloco faz é impedir
 * que uma seja lida como se fosse a outra.
 */
function OQueOErpDiz({ ano }: { ano: number }) {
  const { data: c, isLoading, isError } = useConciliacao(ano);
  const tenantPath = useTenantPath();

  if (isLoading) return <Skeleton className="h-16 w-full" />;
  // FALHA DE LEITURA NÃO É AUSÊNCIA, e aqui o silêncio é pior que em qualquer
  // outra tela: calar deixa o diretor com o número da planilha dele sozinho na
  // tela — exatamente a situação que este bloco existe para evitar. Mesma
  // correção que `ResumoConciliacao` já tinha (auditoria de 2026-09-25), e a
  // mesma razão: `QueryClient` não tem `onError` global (`App.tsx`), então quem
  // olha a tela só vê o que este componente escrever.
  if (isError) {
    return (
      <p className="text-[12px] rounded-lg border border-status-danger/40 text-status-danger px-3 py-2">
        <strong>Não consegui ler o que o ERP importou em {ano}.</strong> O "Realizado no período" acima é a sua
        planilha, não a venda do sistema — recarregue a página antes de comparar os dois.
      </p>
    );
  }
  // `informado` nulo = nenhum mês do ano tem realizado digitado. Sem os dois
  // lados não há comparação, e inventar "diferença zero" seria pior que calar
  // (a regra da Frente 2: "sem dado" não é zero).
  if (!c || c.informado == null) return null;

  const sobra = c.venda_sem_nota;
  return (
    <div className="rounded-lg border border-border p-3 space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-foreground">
          O que o ERP importou nos mesmos {c.meses_comparados} {c.meses_comparados === 1 ? 'mês' : 'meses'}
        </p>
        <Link to={tenantPath(rotaDaVisaoDiretoria('metas'))} className="text-[11px] font-medium text-primary hover:underline">
          Abrir a conciliação mês a mês
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Indicador titulo="Venda com nota (série 1)" valor={c.venda_com_nota} />
        <Indicador titulo="Venda sem nota (série 75)" valor={c.venda_sem_nota} />
        <Indicador titulo="Venda total no ERP" valor={c.venda_total} />
        <Indicador titulo="Realizado informado" valor={c.informado} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        A planilha registra a venda <strong>com</strong> nota fiscal
        {c.diferenca_com_nota != null && (
          <> — a diferença contra ela é <span className="font-mono">{formatBRL(c.diferenca_com_nota)}</span></>
        )}
        .{' '}
        {sobra > 0 ? (
          <>
            Além dela saíram <span className="font-mono">{formatBRL(sobra)}</span> de venda <strong>sem</strong> nota, na
            série 75, que é cobrada do mesmo jeito e não entra no número informado.
          </>
        ) : (
          <>Não houve venda na série 75 neste recorte.</>
        )}
      </p>
    </div>
  );
}

function Indicador({ titulo, valor }: { titulo: string; valor: number | null }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{titulo}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5">
        {valor == null ? <span className="text-muted-foreground font-normal">sem dado</span> : formatBRL(valor)}
      </p>
    </div>
  );
}
